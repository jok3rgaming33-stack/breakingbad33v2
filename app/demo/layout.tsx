import type { Metadata } from "next"
import { isDemoAuthorized } from "@/app/demo/actions"
import { DemoGate } from "@/app/demo/_components/demo-gate"

export const metadata: Metadata = {
  title: "Démo — BreakingBad33",
  description: "Démonstration privée de la plateforme BreakingBad33.",
  robots: { index: false, follow: false },
}

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const authorized = await isDemoAuthorized()

  if (!authorized) {
    return <DemoGate />
  }

  return (
    <div className="relative min-h-screen bg-background">
      {/* Bandeau démo fixe */}
      <div className="fixed left-0 right-0 top-0 z-[9999] flex items-center justify-center gap-2 bg-accent/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-accent-foreground backdrop-blur-sm">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent-foreground" />
        Mode Démo — Données fictives — Aucune commande réelle
      </div>
      <div className="pt-9">{children}</div>
    </div>
  )
}
