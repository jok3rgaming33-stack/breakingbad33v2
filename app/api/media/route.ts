import { presignUrl } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

// Proxy ouvert (sans auth) pour servir les médias Blob privés.
// Sécurité : on valide que l'URL appartient bien au store Vercel Blob
// avant de générer le token signé, pour éviter tout SSRF.
const BLOB_STORE_HOSTNAME = "private.blob.vercel-storage.com"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const blobUrl = searchParams.get("url")

  if (!blobUrl) {
    return new NextResponse("Paramètre url manquant.", { status: 400 })
  }

  // Validation : l'URL doit pointer vers notre store Blob privé.
  let parsed: URL
  try {
    parsed = new URL(blobUrl)
  } catch {
    return new NextResponse("URL invalide.", { status: 400 })
  }

  if (!parsed.hostname.endsWith(BLOB_STORE_HOSTNAME)) {
    return new NextResponse("URL non autorisée.", { status: 403 })
  }

  try {
    // Génère une URL signée valable 1 heure côté serveur.
    const signed = await presignUrl(blobUrl, { expiresIn: 3600 })
    // Redirige le navigateur vers l'URL signée directement (pas de proxy du contenu).
    return NextResponse.redirect(signed, { status: 302 })
  } catch (error) {
    console.error("[media proxy] presignUrl error:", error)
    return new NextResponse("Erreur lors de la génération du lien.", { status: 500 })
  }
}
