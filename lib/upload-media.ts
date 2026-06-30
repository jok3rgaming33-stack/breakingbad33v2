import { upload } from "@vercel/blob/client"

export type UploadedMedia = { url: string; type: "image" | "video" }

// Upload d'un fichier directement du navigateur vers Vercel Blob.
// Contourne la limite de 4,5 Mo des routes serverless (gros fichiers, vidéos).
export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const isVideo = file.type.startsWith("video/")
  const isImage = file.type.startsWith("image/")
  if (!isVideo && !isImage) {
    throw new Error("Format non supporté (image ou vidéo).")
  }
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/products/upload",
  })
  return { url: blob.url, type: isVideo ? "video" : "image" }
}
