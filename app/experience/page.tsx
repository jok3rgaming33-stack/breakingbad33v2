import type { Metadata } from "next"
import Link from "next/link"
import { ExperienceLanding } from "@/components/experience-landing"

export const metadata: Metadata = {
  title: "L’expérience BB33 — Shop, suivi & fidélité",
  description:
    "Découvre l’expérience client BreakingBad33 : commande simple, suivi clair, messagerie, et programme fidélité Bronze → Platine avec bons jusqu’à -30€.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "L’expérience BB33",
    description: "Commande. Suis. Gagne. Le shop qui te récompense vraiment.",
    type: "website",
  },
}

export default function ExperiencePage() {
  return <ExperienceLanding />
}
