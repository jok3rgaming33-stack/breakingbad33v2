import { get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Proxy pour les médias Vercel Blob (store privé).
 * GET /api/media?url=<blobUrl>
 *
 * Les médias produits sont du contenu public (affiché à tous les visiteurs).
 * Aucune auth requise — on valide uniquement que l'URL appartient au store Blob.
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

  try {
    const result = await get(blobUrl, { access: "private" })

    if (!result) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 })
    }

    if (result.statusCode === 304) {
      return new Response(null, { status: 304 })
    }

    const headers = new Headers()
    headers.set("Content-Type", result.blob.contentType)
    headers.set("Content-Length", String(result.blob.size))
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")

    return new Response(result.stream, { headers })
  } catch (error) {
    console.error("[media proxy] error:", error)
    return NextResponse.json({ error: "Erreur lors de la récupération" }, { status: 500 })
  }
}
