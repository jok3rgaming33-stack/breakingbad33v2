// Transforme une URL Blob brute en URL proxy /api/media si nécessaire.
// Les URLs qui ne viennent pas du store Blob (ex: /images/...) sont retournées telles quelles.
const BLOB_HOSTNAME = "blob.vercel-storage.com"

export function mediaUrl(url: string | null | undefined): string {
  if (!url) return ""
  // Déjà une URL proxy — ne pas double-encoder.
  if (url.startsWith("/api/media")) return url
  // URL Blob brute → proxy
  if (url.includes(BLOB_HOSTNAME)) {
    return `/api/media?url=${encodeURIComponent(url)}`
  }
  // URL locale ou autre → telle quelle
  return url
}
