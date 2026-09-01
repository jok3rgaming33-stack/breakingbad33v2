"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { List, X } from "lucide-react"
import { getCategoriesWithProducts } from "@/app/actions/products"
import { isFeaturedProduct, sortProductsFeaturedFirst } from "@/lib/badges"
import type { Product } from "@/lib/db/schema"

export type NavEntry = {
  id: number
  title: string
  featured: boolean
  categoryName: string
}

function buildEntries(
  data: Awaited<ReturnType<typeof getCategoriesWithProducts>> | undefined,
): NavEntry[] {
  if (!data?.length) return []
  const out: NavEntry[] = []
  for (const { category, items } of data) {
    const ordered = sortProductsFeaturedFirst(items)
    for (const p of ordered) {
      out.push({
        id: p.id,
        title: p.title,
        featured: isFeaturedProduct(p.badges),
        categoryName: category.name,
      })
    }
  }
  return out
}

function scrollToProduct(id: number) {
  // Orbite 3D : demande au carousel de la section de centrer le produit
  window.dispatchEvent(new CustomEvent("bb33:focus-product", { detail: { id } }))
  const el = document.getElementById(`product-${id}`)
  if (!el) return
  // L'ancre est sr-only dans le carousel — remonte au bloc section
  const section = el.closest("section") ?? el
  section.scrollIntoView({ behavior: "smooth", block: "start" })
}

function CatalogList({
  entries,
  activeId,
  onPick,
  compact,
}: {
  entries: NavEntry[]
  activeId: number | null
  onPick: (id: number) => void
  compact?: boolean
}) {
  // Grouper par catégorie pour repères rapides
  let lastCat = ""
  return (
    <nav aria-label="Index catalogue" className="flex flex-col">
      <p
        className={`mb-3 px-1 font-semibold uppercase tracking-[0.25em] text-[#3e6757] ${
          compact ? "text-[9px]" : "text-[10px]"
        }`}
      >
        Catalogue
      </p>
      <ul className="flex flex-col gap-0.5">
        {entries.map((e) => {
          const active = e.id === activeId
          const showCat = e.categoryName !== lastCat
          if (showCat) lastCat = e.categoryName
          return (
            <li key={e.id}>
              {showCat && (
                <p
                  className={`mb-1 mt-2 px-2 font-medium uppercase tracking-wider text-zinc-600 first:mt-0 ${
                    compact ? "text-[8px]" : "text-[9px]"
                  }`}
                >
                  {e.categoryName}
                </p>
              )}
              <button
                type="button"
                onClick={() => onPick(e.id)}
                title={e.title}
                className={`group flex min-h-[44px] w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors sm:min-h-0 sm:py-1.5 ${
                  active
                    ? "bg-[#3e6757]/20 text-[#7fae9b]"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    e.featured
                      ? "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.85)]"
                      : active
                        ? "bg-[#3e6757]"
                        : "bg-zinc-600 group-hover:bg-zinc-400"
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate leading-snug ${
                      compact ? "text-[11px]" : "text-xs"
                    } ${active ? "font-semibold" : "font-normal"}`}
                  >
                    {e.title}
                  </span>
                  {e.featured && (
                    <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.15em] text-sky-400/90">
                      Arrivage / Nouveau
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Index catalogue :
 * - Desktop (xl+) : rail sticky à droite
 * - Mobile : FAB + tiroir
 */
export function ProductIndexNav({ mode = "all" }: { mode?: "rail" | "mobile" | "all" }) {
  const { data } = useSWR("catalog-with-products", () => getCategoriesWithProducts(), {
    revalidateOnFocus: false,
  })
  const entries = useMemo(() => buildEntries(data), [data])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!entries.length) return
    const nodes = entries
      .map((e) => document.getElementById(`product-${e.id}`))
      .filter((n): n is HTMLElement => !!n)
    if (!nodes.length) return

    const obs = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top),
          )
        const top = visible[0]
        if (top?.target?.id?.startsWith("product-")) {
          const id = Number(top.target.id.replace("product-", ""))
          if (!Number.isNaN(id)) setActiveId(id)
        }
      },
      {
        root: null,
        rootMargin: "-18% 0px -50% 0px",
        threshold: [0, 0.15, 0.4],
      },
    )
    nodes.forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [entries])

  const onPick = useCallback((id: number) => {
    scrollToProduct(id)
    setActiveId(id)
    setMobileOpen(false)
  }, [])

  if (!entries.length) return null

  const showRail = mode === "rail" || mode === "all"
  const showMobile = mode === "mobile" || mode === "all"

  return (
    <>
      {showRail && (
        <div className="hidden h-full xl:block">
          <div className="rounded-2xl border border-white/10 bg-[#0a0a0a]/90 py-3 pl-2 pr-1 backdrop-blur-md">
            <div className="max-h-[calc(100vh-6.5rem-env(safe-area-inset-bottom,0px))] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
              <CatalogList entries={entries} activeId={activeId} onPick={onPick} compact />
            </div>
          </div>
        </div>
      )}

      {showMobile && (
        <div className="xl:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="fixed z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[#3e6757]/50 bg-black/90 text-[#7fae9b] shadow-lg backdrop-blur-md"
            style={{
              right: "max(1rem, env(safe-area-inset-right, 0px))",
              bottom: "max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 4.75rem))",
            }}
            aria-label="Ouvrir l'index catalogue"
          >
            <List className="h-5 w-5" strokeWidth={1.5} />
          </button>

          {mobileOpen && (
            <div
              className="fixed inset-0 z-50 flex justify-end"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/75"
                aria-label="Fermer"
                onClick={() => setMobileOpen(false)}
              />
              <div
                className="relative flex h-full w-[min(100%,19rem)] flex-col border-l border-white/10 bg-[#0a0a0a] shadow-2xl"
                style={{
                  paddingLeft: "1rem",
                  paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
                  paddingTop: "1rem",
                  paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#3e6757]">
                    Catalogue
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white"
                    aria-label="Fermer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <CatalogList entries={entries} activeId={activeId} onPick={onPick} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export function productAnchorId(product: Product | { id: number }) {
  return `product-${product.id}`
}
