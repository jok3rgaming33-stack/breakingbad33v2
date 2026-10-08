import type { Metadata } from "next"
import { MachineScreen } from "@/components/machine-screen"

export const metadata: Metadata = {
  title: "La machine — BreakingBad33",
  description: "Règles, lots et tirages de la machine BreakingBad33. Aucune probabilité affichée.",
}

export default function MachinePage() {
  return <MachineScreen />
}
