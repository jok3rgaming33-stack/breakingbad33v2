import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

// Upload SERVEUR vers Blob : le fichier transite par cette route API,
// ce qui évite tout problème CORS (pas d'appel direct du navigateur vers Blob).
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
    }

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

    const blob = await put(file.name, file, {
      access: "public",
      addRandomSuffix: true,
    })

    return NextResponse.json({ url: blob.url, type: isVideo ? "video" : "image" })
  } catch (error) {
    console.error("[upload] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Échec de l'envoi." },
      { status: 500 },
    )
  }
}
