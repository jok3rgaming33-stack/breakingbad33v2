"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, FlaskConical, Cigarette, Sparkles } from "lucide-react"
import { DUAL_VENDORS, type DualVendor } from "@/app/demo/_data/dual-mock"

type VendorId = DualVendor["id"]

type Props = {
  /** Lien du bouton retour (défaut : /concept/labo-fumoir) */
  backHref?: string
  backLabel?: string
  /** Affiche le bandeau "concept démo" en haut */
  showBanner?: boolean
}

export function DualCatalogDemo({
  backHref = "/",
  backLabel = "Accueil",
  showBanner = true,
}: Props = {}) {
  const [active, setActive] = useState<VendorId>("labo")
  const [spinning, setSpinning] = useState(false)
  // direction pour l'animation : 1 = vers le fumoir, -1 = vers le labo
  const [dir, setDir] = useState<1 | -1>(1)
  const [animKey, setAnimKey] = useState(0)

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
      window.setTimeout(() => setSpinning(false), 650)
    },
    [active, spinning],
  )

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Bandeau concept */}
      {showBanner && (
        <div className="border-b border-white/10 bg-[#0a0a0a]/90 px-4 py-2.5 text-center text-[11px] uppercase tracking-[0.22em] text-zinc-400">
          Concept démo — dual catalogue ·{" "}
          <span className="text-[#3e6757]">ne touche pas la boutique live</span>
        </div>
      )}

      {/* Nav minimal */}
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <Link
          href={backHref}
          className="flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="flex items-center gap-2">
          <div className="relative h-7 w-7 overflow-hidden rounded-md">
            <Image src="/images/logoapp.png" alt="" fill className="object-cover" />
          </div>
          <span className="text-sm font-bold">
            Breaking<span className="text-zinc-400">Bad</span>
            <span className="text-[#3e6757]">33</span>
          </span>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-500">
          Prototype
        </span>
      </nav>

      {/* Hero marque — Breaking Bad */}
      <header className="flex flex-col items-center px-4 pb-6 pt-14 text-center sm:pt-16">
        <p className="mb-3 text-[11px] uppercase tracking-[0.35em] text-[#3e6757]">
          Laboratoire Clandestin
        </p>
        <h1 className="mb-3 text-4xl font-light tracking-tight sm:text-6xl">
          Breaking<span className="font-bold">Bad</span>
          <span className="text-[#3e6757]">33</span>
        </h1>
        <p className="max-w-md text-sm text-zinc-500">
          Deux espaces, un même univers. Choisis ton coin — le labo ou le fumoir.
        </p>
      </header>

      {/* === Sélecteur entre marque et articles === */}
      <div className="mx-auto w-full max-w-lg px-4 pb-8">
        <div
          className="relative grid grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-[#0a0a0a] p-3"
          role="tablist"
          aria-label="Choisir l'espace produits"
        >
          {/* Pastille glissante */}
          <div
            className="pointer-events-none absolute bottom-3 top-3 w-[calc(50%-0.5rem)] rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              left: active === "labo" ? "0.75rem" : "calc(50% + 0.125rem)",
              background:
                active === "labo"
                  ? "linear-gradient(160deg, rgba(62,103,87,0.35), rgba(62,103,87,0.08))"
                  : "linear-gradient(160deg, rgba(196,120,74,0.35), rgba(196,120,74,0.08))",
              boxShadow:
                active === "labo"
                  ? "0 0 28px rgba(62,103,87,0.25)"
                  : "0 0 28px rgba(196,120,74,0.25)",
            }}
            aria-hidden="true"
          />

          <VendorTab
            vendor={labo}
            active={active === "labo"}
            disabled={spinning}
            onSelect={() => switchTo("labo")}
            icon={<FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <VendorTab
            vendor={fumoir}
            active={active === "fumoir"}
            disabled={spinning}
            onSelect={() => switchTo("fumoir")}
            icon={<Cigarette className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        </div>

        <p className="mt-3 text-center text-[11px] text-zinc-600">
          Clique sur un portrait pour faire tourner le catalogue
        </p>
      </div>

      {/* === Catalogue animé (flip + fade) === */}
      <div className="mx-auto w-full max-w-[1100px] px-3 pb-24 sm:px-5" style={{ perspective: "1400px" }}>
        <div
          key={animKey}
          className="dual-flip-in w-full"
          style={
            {
              ["--flip-from" as string]: dir === 1 ? "72deg" : "-72deg",
            } as React.CSSProperties
          }
        >
          <VendorPanel vendor={current} />
        </div>

        <div className="mt-10 rounded-2xl border border-white/8 bg-[#0a0a0a] px-5 py-4 text-center">
          <p className="text-xs leading-relaxed text-zinc-500">
            Espace actif :{" "}
            <span className="font-semibold" style={{ color: current.accent }}>
              {current.name}
            </span>
            {" — "}
            {current.products.length} produit{current.products.length > 1 ? "s" : ""} fictif
            {current.products.length > 1 ? "s" : ""}. En production, chaque face pourrait charger un
            vendeur / une catégorie distincte en base, avec paniers séparés ou un panier unifié.
          </p>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes dualFlipIn {
          0% {
            opacity: 0;
            transform: rotateY(var(--flip-from, 72deg)) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: rotateY(0deg) scale(1);
          }
        }
        .dual-flip-in {
          animation: dualFlipIn 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-style: preserve-3d;
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

function VendorTab({
  vendor,
  active,
  disabled,
  onSelect,
  icon,
}: {
  vendor: DualVendor
  active: boolean
  disabled: boolean
  onSelect: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onSelect}
      className={`relative z-10 flex flex-col items-center gap-2 rounded-2xl px-2 py-4 transition-opacity ${
        disabled ? "cursor-wait opacity-80" : "cursor-pointer"
      }`}
    >
      <div
        className={`relative h-16 w-16 overflow-hidden rounded-full border-2 transition-all duration-300 sm:h-20 sm:w-20 ${
          active ? vendor.borderActive : "border-white/15 opacity-70"
        }`}
        style={
          active
            ? { boxShadow: `0 0 0 3px ${vendor.accentSoft}, 0 0 24px ${vendor.accentSoft}` }
            : undefined
        }
      >
        <Image
          src={vendor.iconSrc}
          alt=""
          fill
          className="object-cover object-top"
          sizes="80px"
        />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] ${
            active ? "opacity-100" : "opacity-50"
          }`}
          style={{ color: active ? vendor.accent : undefined }}
        >
          {icon}
          {vendor.tagline}
        </span>
        <span
          className={`text-sm font-semibold sm:text-base ${
            active ? "text-white" : "text-zinc-500"
          }`}
        >
          {vendor.name}
        </span>
      </div>
    </button>
  )
}

function VendorPanel({ vendor }: { vendor: DualVendor }) {
  return (
    <section
      className="rounded-3xl border border-white/10 bg-[#080808] p-4 sm:p-6"
      style={{ boxShadow: `inset 0 1px 0 ${vendor.accentSoft}` }}
      aria-label={vendor.name}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl border"
            style={{
              borderColor: `${vendor.accent}55`,
              background: vendor.accentSoft,
              color: vendor.accent,
            }}
          >
            {vendor.id === "labo" ? (
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <p
              className="text-[11px] uppercase tracking-[0.28em]"
              style={{ color: vendor.accent }}
            >
              {vendor.tagline}
            </p>
            <h2 className="text-2xl font-light tracking-tight sm:text-3xl">{vendor.name}</h2>
          </div>
        </div>
        <p className="max-w-xs text-right text-xs text-zinc-500">{vendor.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {vendor.products.map((p) => {
          const out = p.stock <= 0
          return (
            <article
              key={p.id}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 transition-colors ${
                out ? "opacity-55" : "hover:border-white/25"
              }`}
            >
              {p.badge && (
                <span
                  className="absolute left-3 top-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ background: vendor.accent }}
                >
                  {p.badge}
                </span>
              )}
              <div className="relative mx-auto mb-3 h-28 w-28 sm:h-32 sm:w-32">
                <Image
                  src={p.image}
                  alt={p.title}
                  fill
                  className="object-contain transition-transform duration-300 group-hover:scale-105"
                  sizes="128px"
                />
              </div>
              <span
                className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: vendor.accent }}
              >
                {p.symbol}
              </span>
              <h3 className="mb-1 text-sm font-semibold leading-snug sm:text-base">{p.title}</h3>
              <p className="mb-3 line-clamp-2 flex-1 text-[11px] leading-relaxed text-zinc-500">
                {p.description}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">
                  {out ? "Rupture" : `Dès ${p.priceFrom}€`}
                </span>
                <button
                  type="button"
                  disabled={out}
                  className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: vendor.accent }}
                >
                  {out ? "—" : "Voir"}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
