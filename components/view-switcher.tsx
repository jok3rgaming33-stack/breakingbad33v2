"use client"

import Link from "next/link"
import { Eye, ShieldCheck } from "lucide-react"

// Bascule flottante et discrète entre la Vue Client et le Panel Admin.
// Affichée uniquement pour un administrateur connecté.
export function ViewSwitcher({ current }: { current: "client" | "admin" }) {
  const toAdmin = current === "client"
  return (
    <Link
      href={toAdmin ? "/admin" : "/"}
      className="fixed left-1/2 top-3 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#3e6757]/50 bg-black/80 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-[#3e6757]"
    >
      {toAdmin ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      {toAdmin ? "Passer au Panel Admin" : "Voir la boutique (Vue Client)"}
    </Link>
  )
}
