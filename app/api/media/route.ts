import { getDownloadUrl } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

// Proxy ouvert (sans auth) pour servir les médias Blob privés.
// Sécurité : on valide que l'URL appartient bien au store Vercel Blob
// avant de générer l'URL signée, pour éviter tout SSRF.
const BLOB_HOSTNAMES = ["private.blob.vercel-storage.com", "blob.vercel-storage.com"]

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const blobUrl = searchParams.get("url")

  // Passe-passe : si c'est déjà une URL locale (/api/media?url=...) ou relative, on retourne tel quel.
  if (!blobUrl) {
    return new NextResponse("Paramètre url manquant.", { status: 400 })
  }

  // Si l'URL ne commence pas par http, c'est une URL relative — pas de proxy nécessaire.
  if (!blobUrl.startsWith("http")) {
    return NextResponse.redirect(blobUrl, { status: 302 })
  }

  // Validation : l'URL doit pointer vers notre store Blob.
  let parsed: URL
  try {
    parsed = new URL(blobUrl)
  } catch {
    return new NextResponse("URL invalide.", { status: 400 })
  }

  const isBlob = BLOB_HOSTNAMES.some((h) => parsed.hostname.endsWith(h))
  if (!isBlob) {
    return new NextResponse("URL non autorisée.", { status: 403 })
  }

  try {
    // getDownloadUrl génère une URL signée synchronement depuis l'URL blob.
    const downloadUrl = getDownloadUrl(blobUrl)
    return NextResponse.redirect(downloadUrl, { status: 302 })
  } catch (error) {
    console.error("[media proxy] error:", error)
    return new NextResponse("Erreur lors de la génération du lien.", { status: 500 })
  }
}
