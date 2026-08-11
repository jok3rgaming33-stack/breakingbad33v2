import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

// Upload CLIENT vers Blob : le navigateur envoie le fichier directement à
// Vercel Blob, cette route ne fait que délivrer un jeton signé après avoir
// vérifié la session admin. Ça évite la limite de 4.5 Mo imposée aux requêtes
// qui passent par une Vercel Function — indispensable pour les vidéos et les
// photos/gifs un peu lourds (l'ancienne route qui recevait le fichier en
// entier échouait silencieusement ("Failed to fetch") au-delà de cette taille).
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        if (!(await isAdminAuthenticated())) {
          throw new Error("Non autorisé.")
        }
        return {
          access: "private",
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/heic",
            "image/heif",
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "video/x-m4v",
          ],
          addRandomSuffix: true,
          // Vidéos incluses : jusqu'à 200 Mo par fichier.
          maximumSizeInBytes: 200 * 1024 * 1024,
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("[upload] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Échec de l'envoi." },
      { status: 400 },
    )
  }
}
