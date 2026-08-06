/**
 * Deep-links client / admin pour ouvrir le bon fil depuis une notification.
 */

export type ClientOpenSection = "messaging" | "orders" | "locker"

/** URL relative client (push + cloche). */
export function clientThreadUrl(
  section: ClientOpenSection,
  threadId: number,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams({ open: section, thread: String(threadId) })
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v)
    }
  }
  return `/?${params.toString()}`
}

export type AdminTabDeep =
  | "commandes-en-cours"
  | "locker"
  | "messagerie"
  | "verifications"
  | "recuperations"

export function adminThreadUrl(tab: AdminTabDeep, threadId?: number): string {
  const params = new URLSearchParams({ tab })
  if (threadId && Number.isFinite(threadId)) params.set("thread", String(threadId))
  return `/admin?${params.toString()}`
}

/** Déduit la section client à ouvrir selon le statut du fil. */
export function sectionForThreadStatus(status: string | null | undefined): ClientOpenSection {
  const s = (status || "").toLowerCase()
  if (s === "notification" || s === "discussion" || s === "pris_en_charge" || s === "ouvert" || s === "ferme") {
    return "messaging"
  }
  if (s === "trk_token") return "orders"
  return "orders"
}
