/**
 * Affichage des horodatages messagerie / commandes (fuseau navigateur).
 */

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

/** Date+heure complète (bulles de message). */
export function formatMessageTime(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return "—"
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Dernière activité d'un fil (liste) : plus lisible.
 * - aujourd'hui → « 14:32 »
 * - hier → « hier 14:32 »
 * - sinon → « 01/08 14:32 »
 */
export function formatThreadActivity(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return "—"

  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startToday.getTime() - startMsg.getTime()) / 86400000)

  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

  if (diffDays === 0) return time
  if (diffDays === 1) return `hier ${time}`
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" })
    return `${weekday} ${time}`
  }
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Instant le plus récent entre updatedAt et createdAt (filet de sécurité). */
export function threadActivityAt(t: {
  updatedAt?: Date | string | null
  createdAt?: Date | string | null
}): Date | string | null {
  const u = toDate(t.updatedAt)
  const c = toDate(t.createdAt)
  if (u && c) return u.getTime() >= c.getTime() ? (t.updatedAt ?? u) : (t.createdAt ?? c)
  return t.updatedAt ?? t.createdAt ?? null
}

/** Trie les fils : dernière activité en premier. */
export function sortByActivityDesc<T extends { updatedAt?: Date | string | null; createdAt?: Date | string | null }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const ta = toDate(threadActivityAt(a))?.getTime() ?? 0
    const tb = toDate(threadActivityAt(b))?.getTime() ?? 0
    return tb - ta
  })
}
