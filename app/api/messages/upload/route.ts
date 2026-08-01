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
    const isAudio = file.type.startsWith("audio/")
    if (!isVideo && !isImage && !isAudio) {
      return NextResponse.json(
        { error: "Format non supporté (image, vidéo ou audio)." },
        { status: 400 },
      )
    }

    // ~10 Mo max (vocaux longs + photos)
    const MAX_BYTES = 10 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 })
    }

    const fromName = file.name.split(".").pop()?.toLowerCase()
    const ext =
      fromName && fromName.length <= 5
        ? fromName
        : isVideo
          ? "mp4"
          : isAudio
            ? file.type.includes("mp4") || file.type.includes("m4a")
              ? "m4a"
              : file.type.includes("ogg")
                ? "ogg"
                : "webm"
            : "jpg"

    const safeName = `messages/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(safeName, file, {
      access: "private",
      contentType: file.type || (isAudio ? "audio/webm" : isVideo ? "video/mp4" : "image/jpeg"),
    })

    const type = isVideo ? "video" : isAudio ? "audio" : "image"
    return NextResponse.json({ url: blob.url, type })
  } catch (error) {
    console.error("[messages/upload] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Echec de l'envoi." },
      { status: 500 },
    )
  }
}
