import type { MouseEvent, PointerEvent } from "react"

/**
 * Ferme un overlay seulement si le pointerDOWN et le click
 * sont tous les deux sur le fond — pas si on sélectionne du texte
 * dans un champ et qu'on relâche hors de la boîte.
 */
export function backdropDismissProps(onClose: () => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.dataset.bd = e.target === e.currentTarget ? "1" : "0"
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.currentTarget.dataset.bd === "1" && e.target === e.currentTarget) onClose()
    },
  }
}
