import type { Metadata } from "next"
import { MachineScreen } from "@/components/machine-screen"

export const metadata: Metadata = {
  title: "Albuquerque Luck Spin — BreakingBad33",
  description: "Règles, lots et tirages Albuquerque Luck Spin. Aucune probabilité affichée.",
}

export default function MachinePage() {
  return <MachineScreen />
}
