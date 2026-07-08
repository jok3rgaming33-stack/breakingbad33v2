export type UploadedMedia = { url: string; type: "image" | "video" }

// Upload via notre route serveur /api/products/upload.
// Le fichier transite par Next.js → Vercel Blob côté serveur,
// ce qui évite tout CORS (pas d'appel direct navigateur → Blob).
export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const isVideo = file.type.startsWith("video/")
  const isImage = file.type.startsWith("image/")
  if (!isVideo && !isImage) {
    throw new Error("Format non supporté (image ou vidéo).")
  }

  const formData = new FormData()
  formData.append("file", file)

  const res = await fetch("/api/products/upload", {
    method: "POST",
    body: formData,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error ?? "Échec de l'envoi.")
  }

  const data = await res.json()
  return { url: data.url, type: data.type }
}
