import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

// Route d'upload accessible aux clients (pas de vérification admin).
// Utilisée dans les commandes et discussions côté client.
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 })
    }

    const isVideo = file.type.startsWith("video/")
    const isImage = file.type.startsWith("image/")
    if (!isVideo && !isImage) {
      return NextResponse.json({ error: "Format non supporté (image ou vidéo)." }, { status: 400 })
    }

    const ext = file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg")
    const safeName = `messages/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(safeName, file, {
      access: "private",
      contentType: file.type,
    })

    return NextResponse.json({ url: blob.url, type: isVideo ? "video" : "image" })
  } catch (error) {
    console.error("[messages/upload] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Echec de l'envoi." },
      { status: 500 },
    )
  }
}
