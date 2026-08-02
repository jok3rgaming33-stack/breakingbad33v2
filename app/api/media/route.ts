import { get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Proxy pour les médias Vercel Blob (store privé).
 * GET /api/media?url=<blobUrl>
 *
 * Utilise le SDK `get()` (auth privée correcte) plutôt qu'un fetch Bearer brut.
 * Supporte les requêtes Range (indispensables pour <audio>/<video> sur Safari/iOS).
 * Normalise les Content-Type audio (retire les ;codecs=... qui cassent certains lecteurs).
 */

function isBlobHost(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host.endsWith(".blob.vercel-storage.com") || host === "blob.vercel-storage.com"
  } catch {
    return url.includes(".blob.vercel-storage.com")
  }
}

/** Retire ;codecs=... et paramètres parasites du Content-Type. */
function normalizeContentType(raw: string | null | undefined, blobUrl: string): string {
  const base = (raw ?? "").split(";")[0].trim().toLowerCase()
  if (base && base !== "application/octet-stream") return base

  // Fallback par extension si le blob n'a pas de type fiable
  const path = blobUrl.split("?")[0].toLowerCase()
  if (path.endsWith(".webm")) return "audio/webm"
  if (path.endsWith(".ogg") || path.endsWith(".opus")) return "audio/ogg"
  if (path.endsWith(".m4a") || path.endsWith(".mp4")) {
    // .mp4 peut être vidéo : on garde audio/mp4 pour m4a, video/mp4 pour mp4
    return path.endsWith(".m4a") ? "audio/mp4" : "video/mp4"
  }
  if (path.endsWith(".mp3") || path.endsWith(".mpeg")) return "audio/mpeg"
  if (path.endsWith(".wav")) return "audio/wav"
  if (path.endsWith(".aac")) return "audio/aac"
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg"
  if (path.endsWith(".png")) return "image/png"
  if (path.endsWith(".webp")) return "image/webp"
  if (path.endsWith(".gif")) return "image/gif"
  if (path.endsWith(".mov")) return "video/quicktime"
  return base || "application/octet-stream"
}

function parseRange(
  rangeHeader: string,
  size: number,
): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!m) return null
  let start = m[1] === "" ? NaN : Number(m[1])
  let end = m[2] === "" ? NaN : Number(m[2])
  if (Number.isNaN(start) && Number.isNaN(end)) return null
  if (Number.isNaN(start)) {
    // bytes=-N → les N derniers octets
    const suffix = end
    if (suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    if (Number.isNaN(end) || end >= size) end = size - 1
    if (start < 0 || start > end || start >= size) return null
  }
  return { start, end }
}

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const { searchParams } = new URL(request.url)
  const blobUrl = searchParams.get("url")

  if (!blobUrl) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 })
  }

  if (!isBlobHost(blobUrl)) {
    return NextResponse.json({ error: "URL non autorisée" }, { status: 403 })
  }

  try {
    const rangeHeader = request.headers.get("range")
    const ifNoneMatch = request.headers.get("if-none-match") ?? undefined

    // 1) Essaye de laisser le backend honorer le Range (via headers SDK)
    const result = await get(blobUrl, {
      access: "private",
      ifNoneMatch,
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
    })

    if (!result) {
      return NextResponse.json({ error: "Média introuvable" }, { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          "Accept-Ranges": "bytes",
        },
      })
    }

    const contentType = normalizeContentType(result.blob.contentType, blobUrl)
    const upstreamRange = result.headers.get("content-range")
    const upstreamLength = result.headers.get("content-length")

    // Range déjà honoré par le store → on retransmet tel quel
    if (rangeHeader && upstreamRange && result.stream) {
      const headers = new Headers()
      headers.set("Content-Type", contentType)
      headers.set("Content-Range", upstreamRange)
      headers.set("Accept-Ranges", "bytes")
      if (upstreamLength) headers.set("Content-Length", upstreamLength)
      headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
      if (result.blob.etag) headers.set("ETag", result.blob.etag)
      return new Response(result.stream, { status: 206, headers })
    }

    // 2) Range demandé mais non honoré par le store :
    // on bufferise UNIQUEMENT les petits fichiers / audio (vocaux ~<10 Mo).
    // Les grosses vidéos sont renvoyées en 200 stream pour éviter l'OOM serverless.
    const knownSize = result.blob.size ?? null
    const isSmallOrAudio =
      contentType.startsWith("audio/") ||
      (knownSize != null && knownSize <= 12 * 1024 * 1024)

    if (rangeHeader && result.stream && isSmallOrAudio) {
      const buffer = await streamToUint8Array(result.stream)
      const size = buffer.byteLength
      const parsed = parseRange(rangeHeader, size)
      if (!parsed) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size}`,
            "Accept-Ranges": "bytes",
          },
        })
      }
      const { start, end } = parsed
      const slice = buffer.subarray(start, end + 1)
      const headers = new Headers()
      headers.set("Content-Type", contentType)
      headers.set("Content-Length", String(slice.byteLength))
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`)
      headers.set("Accept-Ranges", "bytes")
      headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
      if (result.blob.etag) headers.set("ETag", result.blob.etag)
      return new Response(slice, { status: 206, headers })
    }

    // 3) Réponse complète
    const headers = new Headers()
    headers.set("Content-Type", contentType)
    headers.set("Accept-Ranges", "bytes")
    if (result.blob.size != null) {
      headers.set("Content-Length", String(result.blob.size))
    } else if (upstreamLength) {
      headers.set("Content-Length", upstreamLength)
    }
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
    if (result.blob.etag) headers.set("ETag", result.blob.etag)

    return new Response(result.stream, { status: 200, headers })
  } catch (error) {
    console.error("[media proxy] error:", error)
    return NextResponse.json({ error: "Erreur lors de la récupération" }, { status: 500 })
  }
}
