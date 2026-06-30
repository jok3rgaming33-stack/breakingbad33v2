import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { type NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

// Upload CLIENT direct vers Blob (images/vidéos produits & slides News).
// Le fichier est envoyé directement du navigateur vers Blob : cela contourne la
// limite de 4,5 Mo des fonctions serverless Vercel (photos de téléphone, vidéos...).
// Cette route ne fait que générer un token signé, après vérification admin.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Sécurité : seul un admin authentifié peut obtenir un token d'upload.
        if (!(await isAdminAuthenticated())) {
          throw new Error("Non autorisé.")
        }
        return {
          allowedContentTypes: ["image/*", "video/*"],
          addRandomSuffix: true,
          maximumSizeInBytes: 200 * 1024 * 1024, // 200 Mo (couvre les vidéos)
        }
      },
      // Callback côté serveur après upload (non utilisé : l'URL est gérée côté client).
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("[v0] blob client upload error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Échec de l'envoi." },
      { status: 400 },
    )
  }
}
