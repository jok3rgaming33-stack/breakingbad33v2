/**
 * Normalise une clé secrète collée depuis notes / SMS / WhatsApp.
 * - trim
 * - retire espaces / retours ligne / zero-width
 * - retire guillemets entourants
 */
export function normalizeSecretKey(raw: string | null | undefined): string {
  if (!raw) return ""
  return String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/\s+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
}
