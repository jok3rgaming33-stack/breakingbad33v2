"use client"

/**
 * Prototype dual-catalogue — miroir visuel de la boutique live.
 * Hero + Navbar + cartes produits identiques au site.
 * Seul ajout : sélecteur Laboratoire / Fumoir entre le hero et les articles.
 */

import { useCallback, useState, type MouseEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  FlaskConical,
  Sparkles,
  ShoppingCart,
  Menu,
  X,
  HelpCircle,
  LogOut,
  BellRing,
} from "lucide-react"
import { Hero } from "@/components/hero"
import { ProductBadges } from "@/components/product-badge"
import {
  resolveBadges,
  isFeaturedProduct,
  sortProductsFeaturedFirst,
} from "@/lib/badges"
import {
  DUAL_VENDORS,
  type DualProduct,
  type DualVendor,
} from "@/app/demo/_data/dual-mock"

type VendorId = DualVendor["id"]

const NAV_ITEMS = [
  { label: "Nos produits", action: "featured" as const },
  { label: "Messagerie", action: "noop" as const },
  { label: "Livraison/Meet-up", action: "noop" as const },
  { label: "Mes commandes", action: "noop" as const },
  { label: "Espace fidélité", action: "noop" as const },
  { label: "Comment ça marche", action: "howitworks" as const },
]

type Props = {
  backHref?: string
  backLabel?: string
  showBanner?: boolean
}

export function DualCatalogDemo({
  backHref = "/",
  backLabel = "Boutique",
  showBanner = true,
}: Props = {}) {
  const [active, setActive] = useState<VendorId>("labo")
  const [spinning, setSpinning] = useState(false)
  const [dir, setDir] = useState<1 | -1>(1)
  const [animKey, setAnimKey] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selected, setSelected] = useState<DualProduct | null>(null)
  const [variantIdx, setVariantIdx] = useState(0)
  const [cartCount, setCartCount] = useState(0)

  const labo = DUAL_VENDORS[0]!
  const fumoir = DUAL_VENDORS[1]!
  const current = active === "labo" ? labo : fumoir

  const switchTo = useCallback(
    (target: VendorId) => {
      if (target === active || spinning) return
      setSpinning(true)
      setDir(target === "fumoir" ? 1 : -1)
      setActive(target)
      setAnimKey((k) => k + 1)
      setSelected(null)
      window.setTimeout(() => setSpinning(false), 650)
    },
    [active, spinning],
  )

  const openProduct = (p: DualProduct, vIdx = 0) => {
    if (p.stock <= 0) return
    setSelected(p)
    setVariantIdx(vIdx)
  }

  const addToCart = () => {
    if (!selected) return
    setCartCount((c) => c + 1)
    setSelected(null)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showBanner && (
        <div className="relative z-[60] border-b border-white/10 bg-[#0a0a0a] px-4 py-2 text-center text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Concept démo · dual catalogue ·{" "}
          <span className="text-[#3e6757]">miroir boutique — hors live</span>
          {" · "}
          <Link href={backHref} className="text-zinc-400 underline-offset-2 hover:underline">
            {backLabel}
          </Link>
        </div>
      )}

      {/* === Navbar miroir (même structure / classes que components/navbar.tsx) === */}
      <header
        className={`fixed inset-x-0 z-50 border-b border-white/5 bg-black/70 backdrop-blur-xl ${
          showBanner ? "top-8" : "top-0"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#featured" className="flex shrink-0 items-center" aria-label="BreakingBad33">
            <Image
              src="/images/face.png"
              alt="BreakingBad33"
              width={55}
              height={55}
              className="h-11 w-auto object-contain"
            />
          </a>

          <nav className="hidden items-center gap-7 lg:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.action === "featured" ? "#featured" : "#"}
                onClick={(e) => {
                  if (item.action === "featured") {
                    e.preventDefault()
                    document.getElementById("featured")?.scrollIntoView({ behavior: "smooth" })
                  } else {
                    e.preventDefault()
                  }
                }}
                className={
                  item.action === "howitworks"
                    ? "flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/80 transition-colors hover:border-white/40 hover:text-white"
                    : "relative flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {item.action === "howitworks" && (
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              MON PANIER
              <div className="relative flex h-8 w-8 items-center justify-center">
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#22ffaa] px-1 text-[10px] font-bold text-black">
                    {cartCount}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              className="hidden items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-white/20 hover:text-white lg:flex"
              aria-label="Se déconnecter"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Déconnexion
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground lg:hidden"
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-border bg-background px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.action === "featured" ? "#featured" : "#"}
                  onClick={(e) => {
                    e.preventDefault()
                    setMenuOpen(false)
                    if (item.action === "featured") {
                      document.getElementById("featured")?.scrollIntoView({ behavior: "smooth" })
                    }
                  }}
                  className={
                    item.action === "howitworks"
                      ? "mt-1 flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-white/80 transition-colors hover:bg-secondary hover:text-white"
                      : "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  }
                >
                  <span className="flex items-center gap-2">
                    {item.action === "howitworks" && (
                      <HelpCircle className="h-4 w-4" aria-hidden="true" />
                    )}
                    {item.label}
                  </span>
                </a>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Spacer sous navbar (+ bandeau) */}
      <div className={showBanner ? "h-[calc(3.5rem+2rem)]" : "h-14"} aria-hidden="true" />

      <main className="bg-background text-foreground">
        {/* Hero réel du site */}
        <Hero />

        {/* === Sélecteur Laboratoire / Fumoir — entre BreakingBad et les articles === */}
        <div className="border-b border-white/5 bg-background">
          <div className="mx-auto flex max-w-[1100px] flex-col items-center px-4 py-6 sm:py-8">
            <p className="mb-4 text-[10px] uppercase tracking-[0.3em] text-[#3e6757] sm:text-xs">
              Choisis ton espace
            </p>
            <div
              className="grid w-full max-w-md grid-cols-2 gap-3 sm:gap-4"
              role="tablist"
              aria-label="Espace produits"
            >
              <VendorPicker
                vendor={labo}
                active={active === "labo"}
                disabled={spinning}
                onSelect={() => switchTo("labo")}
              />
              <VendorPicker
                vendor={fumoir}
                active={active === "fumoir"}
                disabled={spinning}
                onSelect={() => switchTo("fumoir")}
              />
            </div>
          </div>
        </div>

        {/* Catalogue — même shell que ShopSections */}
        <div
          className="relative w-full pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
          style={{ perspective: "1400px" }}
        >
          <div
            key={animKey}
            className="dual-flip-in mx-auto grid w-full max-w-[1400px] grid-cols-1"
            style={
              {
                ["--flip-from" as string]: dir === 1 ? "55deg" : "-55deg",
              } as React.CSSProperties
            }
          >
            <div className="min-w-0 w-full max-w-[1100px] justify-self-center px-3 sm:px-5 xl:px-3">
              {current.sections.map((section) => (
                <MirrorSection
                  key={`${current.id}-${section.title}`}
                  eyebrow={section.eyebrow}
                  title={section.title}
                  icon={section.icon}
                  anchor={section.anchor}
                  products={section.products}
                  onOpen={openProduct}
                />
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Modal produit — miroir product-section (version simplifiée) */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-6 top-6 z-50 text-white/50 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="relative flex w-full items-center justify-center bg-[#050505]/50 p-12 md:w-1/2">
              <div className="relative h-64 w-64">
                <Image
                  src={selected.image}
                  alt={selected.title}
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <div className="flex w-full flex-col justify-center p-12 md:w-1/2">
              <h3 className="mb-4 text-4xl font-bold text-white">{selected.title}</h3>
              <p className="mb-6 leading-relaxed text-zinc-400">{selected.description}</p>
              <select
                value={variantIdx}
                onChange={(e) => setVariantIdx(Number(e.target.value))}
                className="mb-6 w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
              >
                {selected.variants.map((v, i) => (
                  <option key={i} value={i}>
                    {v.qty} — {v.price}€
                  </option>
                ))}
              </select>
              <div className="mb-6 text-2xl font-semibold text-white">
                {selected.variants[variantIdx]?.price ?? 0}€
              </div>
              <button
                type="button"
                onClick={addToCart}
                className="w-full rounded-full bg-[#3e6757] py-4 text-sm font-bold uppercase tracking-widest text-white hover:bg-[#3e6757]/80"
              >
                Ajouter au Laboratoire
              </button>
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes dualFlipIn {
          0% { opacity: 0; transform: rotateY(var(--flip-from, 55deg)) scale(0.97); }
          100% { opacity: 1; transform: rotateY(0deg) scale(1); }
        }
        .dual-flip-in {
          animation: dualFlipIn 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: center center;
        }
        @media (prefers-reduced-motion: reduce) {
          .dual-flip-in { animation: none; }
        }
      `,
        }}
      />
    </div>
  )
}

function VendorPicker({
  vendor,
  active,
  disabled,
  onSelect,
}: {
  vendor: DualVendor
  active: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onSelect}
      className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 transition-all sm:py-5 ${
        active
          ? "border-[#3e6757]/50 bg-[#3e6757]/10 shadow-[0_0_24px_rgba(62,103,87,0.2)]"
          : "border-white/10 bg-[#0a0a0a] opacity-70 hover:border-white/20 hover:opacity-100"
      } ${disabled ? "cursor-wait" : "cursor-pointer"}`}
    >
      <div
        className={`relative h-16 w-16 overflow-hidden rounded-full border-2 sm:h-[4.5rem] sm:w-[4.5rem] ${
          active ? "border-[#3e6757]/70" : "border-white/15"
        }`}
      >
        <Image
          src={vendor.iconSrc}
          alt=""
          fill
          className="object-cover object-top"
          sizes="72px"
        />
      </div>
      <span
        className={`text-[10px] uppercase tracking-[0.25em] ${
          active ? "text-[#3e6757]" : "text-zinc-600"
        }`}
      >
        {vendor.label}
      </span>
      <span
        className={`text-sm font-semibold sm:text-base ${
          active ? "text-white" : "text-zinc-500"
        }`}
      >
        {vendor.name}
      </span>
    </button>
  )
}

/** Section produits — classes calquées sur product-section.tsx */
function MirrorSection({
  eyebrow,
  title,
  icon,
  anchor,
  products,
  onOpen,
}: {
  eyebrow: string
  title: string
  icon: "flask" | "sparkles"
  anchor?: string
  products: DualProduct[]
  onOpen: (p: DualProduct, vIdx?: number) => void
}) {
  const Icon = icon === "flask" ? FlaskConical : Sparkles
  const ordered = sortProductsFeaturedFirst(
    products.map((p) => ({ ...p, badges: p.badges })),
  ) as DualProduct[]

  const sectionProps = anchor
    ? { id: anchor, className: "w-full pb-12 pt-8 scroll-mt-20" }
    : { className: "w-full py-10 sm:py-12" }

  return (
    <section {...sectionProps}>
      <div className="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
        <Icon className="h-6 w-6 shrink-0 text-[#3e6757] sm:h-7 sm:w-7" />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#3e6757] sm:text-xs sm:tracking-[0.3em]">
            {eyebrow}
          </p>
          <h2 className="truncate text-2xl font-light tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {ordered.map((product) => {
          const badges = resolveBadges(product.badges, product.stock)
          const featured = isFeaturedProduct(product.badges)
          const out = product.stock <= 0
          const avail = product.variants.filter((v) => true) // stock global
          const minPrice = Math.min(...product.variants.map((v) => v.price))

          return (
            <article
              key={product.id}
              id={`product-${product.id}`}
              onClick={() => !out && onOpen(product, 0)}
              className={`group relative flex scroll-mt-28 flex-col overflow-hidden rounded-2xl border transition-all ${
                out
                  ? "cursor-not-allowed border-white/5 bg-[#0a0a0a] opacity-50"
                  : featured
                    ? "product-featured-arrivage cursor-pointer border-sky-400/40 bg-[#0a0a0a] hover:border-sky-400/70"
                    : "cursor-pointer border-white/10 bg-[#0a0a0a] hover:border-[#3e6757]/50"
              }`}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-[#111]">
                <Image
                  src={product.image}
                  alt={product.title}
                  fill
                  className="object-cover transition-transform duration-400 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, 25vw"
                />
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                <ProductBadges badges={badges} />
                {featured && !out && (
                  <span className="badge-blink absolute left-2 top-2 z-20 rounded-full bg-sky-400/90 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-black">
                    À la une
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white">
                  {product.title}
                </h3>
                <p className="text-[11px] text-zinc-500">
                  {out ? "Rupture" : `Dès ${minPrice}€`}
                  {!out && product.stock <= 5 ? ` · stock ${product.stock}` : ""}
                </p>

                {!out && avail.length > 0 && (
                  <div
                    className="mt-0.5 flex flex-wrap gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {avail.slice(0, 4).map((v, idx) => (
                      <button
                        key={`${product.id}-v-${idx}`}
                        type="button"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          onOpen(product, idx)
                        }}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-300 transition-colors hover:border-[#3e6757]/60 hover:bg-[#3e6757]/15 hover:text-white"
                        title={`×${v.qty} — ${v.price}€`}
                      >
                        ×{v.qty}
                        <span className="ml-0.5 text-zinc-500">{v.price}€</span>
                      </button>
                    ))}
                    {avail.length > 4 && (
                      <span className="self-center px-1 text-[10px] text-zinc-600">
                        +{avail.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {out ? (
                  <button
                    type="button"
                    disabled
                    className="mt-auto flex w-full items-center justify-center gap-1 rounded-full border border-[#3e6757]/50 bg-[#3e6757]/10 py-1.5 text-[11px] font-medium text-[#7fae9b] disabled:opacity-70"
                  >
                    <BellRing className="h-3 w-3" aria-hidden="true" />
                    Alerte OK
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mt-auto w-full rounded-full border border-white/10 py-1.5 text-[11px] text-zinc-300 transition-colors group-hover:border-[#3e6757]/40 group-hover:text-white"
                  >
                    Choisir
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
