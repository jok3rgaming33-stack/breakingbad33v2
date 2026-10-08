/**
 * Normalise une clé secrète collée depuis notes / SMS / WhatsApp.
 * - trim
 * - retire espaces / retours ligne / zero-width
 * - retire guillemets entourants
 */
/**
 * Plancher de connexion. Les clés créées maintenant sont bien plus longues,
 * mais deux comptes déjà en base sont plus courts : les refuser les bloque
 * avant même l'appel serveur.
 */
export const MIN_LOGIN_KEY_LENGTH = 8

export function normalizeSecretKey(raw: string | null | undefined): string {
  if (!raw) return ""
  return String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/\s+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
}
