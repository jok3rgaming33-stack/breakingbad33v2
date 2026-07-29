import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Proxy pour les médias Vercel Blob (store privé).
 * GET /api/media?url=<blobUrl>
 *
 * @vercel/blob v2.5 a supprimé get() avec stream/blob.
 * On fetch directement l'URL privée avec le Bearer token serveur,
 * puis on restreame la réponse au client.
 */
export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const { searchParams } = new URL(request.url)
  const blobUrl = searchParams.get("url")

  if (!blobUrl) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 })
  }

  if (!blobUrl.includes(".blob.vercel-storage.com")) {
    return NextResponse.json({ error: "URL non autorisée" }, { status: 403 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ error: "Token Blob manquant côté serveur" }, { status: 500 })
  }

  try {
    const upstream = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Blob: ${upstream.status} ${upstream.statusText}` },
        { status: upstream.status },
      )
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream"
    const contentLength = upstream.headers.get("content-length")

    const headers = new Headers()
    headers.set("Content-Type", contentType)
    if (contentLength) headers.set("Content-Length", contentLength)
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")

    return new Response(upstream.body, { status: 200, headers })
  } catch (error) {
    console.error("[media proxy] error:", error)
    return NextResponse.json({ error: "Erreur lors de la récupération" }, { status: 500 })
  }
}
