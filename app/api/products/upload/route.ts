import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

// Upload public d'un média produit (image ou vidéo) depuis mobile/PC.
// Réservé à l'admin authentifié. Les médias produits sont publics (vitrine).
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 })

    const isVideo = file.type.startsWith("video/")
    const isImage = file.type.startsWith("image/")
    if (!isVideo && !isImage) {
      return NextResponse.json({ error: "Format non supporté (image ou vidéo)." }, { status: 415 })
    }

    // Limites : image 15 Mo, vidéo 100 Mo.
    const maxBytes = isVideo ? 100 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "Fichier trop volumineux." }, { status: 413 })
    }

    const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "")
    const pathname = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const blob = await put(pathname, file, { access: "public", addRandomSuffix: true })

    return NextResponse.json({ url: blob.url, type: isVideo ? "video" : "image" })
  } catch (error) {
    console.error("[v0] product media upload error:", error)
    return NextResponse.json({ error: "Échec de l'envoi." }, { status: 500 })
  }
}
