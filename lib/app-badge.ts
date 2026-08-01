/**
 * Badge d'icône PWA / app installée (API Badging).
 * Affiche un petit compteur rouge sur l'icône Android/desktop installée.
 * iOS Safari : support limité (souvent ignoré).
 */

export async function setAppBadgeCount(count: number): Promise<void> {
  if (typeof navigator === "undefined") return
  const n = Math.max(0, Math.floor(Number(count) || 0))
  try {
    if (n <= 0) {
      if ("clearAppBadge" in navigator) {
        await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge()
      }
      return
    }
    if ("setAppBadge" in navigator) {
      await (navigator as Navigator & { setAppBadge: (n?: number) => Promise<void> }).setAppBadge(n)
    }
  } catch {
    // Non supporté ou permission refusée — silencieux
  }
}

export async function clearAppBadgeCount(): Promise<void> {
  await setAppBadgeCount(0)
}
