import { get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Proxy pour les médias Vercel Blob (store privé).
 * GET /api/media?url=<blobUrl>
 *
 * - Stream le contenu directement (pas de redirect 302 qui casse les <video>)
 * - Transmet le header Range pour le support lecture vidéo sur mobile
 * - Répond 206 Partial Content si Blob répond 206
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const blobUrl = searchParams.get("url")

  if (!blobUrl) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 })
  }

  if (!blobUrl.includes(".blob.vercel-storage.com")) {
    return NextResponse.json({ error: "URL non autorisée" }, { status: 403 })
  }

  try {
    // Transmet le header Range si le navigateur en envoie un (obligatoire pour les vidéos).
    const rangeHeader = request.headers.get("range")
    const extraHeaders: HeadersInit = rangeHeader ? { Range: rangeHeader } : {}

    const result = await get(blobUrl, {
      access: "private",
      headers: extraHeaders,
    })

    if (!result) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 })
    }

    if (result.statusCode === 304) {
      return new Response(null, { status: 304, headers: result.headers })
    }

    const resHeaders = new Headers()
    resHeaders.set("Content-Type", result.blob.contentType)
    resHeaders.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
    resHeaders.set("Accept-Ranges", "bytes")

    // Propage les headers de réponse Blob utiles pour les vidéos.
    for (const key of ["content-range", "content-length", "etag", "last-modified"]) {
      const val = result.headers.get(key)
      if (val) resHeaders.set(key, val)
    }

    // Détermine le status (206 Partial si Blob a servi une plage, 200 sinon).
    const status = rangeHeader && result.headers.get("content-range") ? 206 : 200

    return new Response(result.stream, { status, headers: resHeaders })
  } catch (error) {
    console.error("[media proxy] error:", error)
    return NextResponse.json({ error: "Erreur lors de la récupération" }, { status: 500 })
  }
}
