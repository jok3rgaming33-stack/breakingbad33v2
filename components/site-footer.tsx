"use client"

import { usePathname } from "next/navigation"

/**
 * Pied de page global — crédit développeur HeisenWeb.
 * Discret, présent sur toutes les pages via app/layout.tsx.
 * Masqué sur /run (mode tournée plein écran / raccourci accueil).
 */
export function SiteFooter() {
  const pathname = usePathname()
  if (pathname === "/run" || pathname?.startsWith("/run/")) return null

  const year = new Date().getFullYear()

  return (
    <footer
      className="mt-auto border-t border-white/[0.06] bg-[#050505]/90"
      role="contentinfo"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-2 px-4 py-5 sm:flex-row sm:gap-3 sm:py-4">
        <a
          href="https://tatokdym.org/heisenwebdigit"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 transition-colors hover:border-[#3e6757]/50 hover:bg-[#3e6757]/10"
          title="HeisenWeb — conception & développement web"
          aria-label="HeisenWeb — ouvrir le site professionnel (nouvel onglet)"
        >
          {/* Monogramme HW */}
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#3e6757] to-[#2a4a3e] text-[10px] font-black tracking-tighter text-white shadow-[0_0_12px_rgba(62,103,87,0.35)]"
            aria-hidden="true"
          >
            HW
          </span>
          <span className="flex flex-col items-start leading-tight sm:flex-row sm:items-center sm:gap-1.5">
            <span className="text-[11px] text-zinc-500">
              © {year}
            </span>
            <span className="text-xs font-semibold tracking-wide text-zinc-300 transition-colors group-hover:text-white">
              HeisenWeb
            </span>
          </span>
          <svg
            className="h-3 w-3 shrink-0 text-zinc-600 transition-colors group-hover:text-[#3e6757]"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <span className="hidden text-[10px] text-zinc-600 sm:inline" aria-hidden="true">
          ·
        </span>
        <p className="text-center text-[10px] text-zinc-600 sm:text-left">
          Conception & développement web
        </p>
      </div>
    </footer>
  )
}
