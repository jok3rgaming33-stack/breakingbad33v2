import { upload } from "@vercel/blob/client"

export type UploadedMedia = { url: string; type: "image" | "video" }

// Upload direct navigateur → Vercel Blob (client upload).
// La route /api/products/upload ne fait que délivrer un jeton signé ;
// le fichier ne transite jamais par notre fonction serverless.
// Important : les fonctions Vercel plafonnent le corps des requêtes à 4.5 Mo,
// donc l'ancien flux (fetch avec FormData vers la route) échouait en silence
// ("Failed to fetch") pour toute photo un peu lourde, la plupart des GIF et
// quasiment toutes les vidéos. L'upload client n'a pas cette limite.
export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const isVideo = file.type.startsWith("video/")
  const isImage = file.type.startsWith("image/")
  if (!isVideo && !isImage) {
    throw new Error("Format non supporté (image ou vidéo).")
  }

  try {
    // Store privé (voir /api/media et /api/products/upload) : access doit
    // être "private" ici aussi, sinon Vercel Blob rejette le jeton avec un 403.
    const blob = await upload(file.name, file, {
      access: "private",
      handleUploadUrl: "/api/products/upload",
      contentType: file.type,
    })

    return { url: blob.url, type: isVideo ? "video" : "image" }
  } catch (e) {
    console.log("[v0] uploadMedia error:", e)
    const message = e instanceof Error ? e.message : "Échec de l'envoi."
    throw new Error(message)
  }
}
