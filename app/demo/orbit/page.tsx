"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Sparkles, X } from "lucide-react"
import { DemoOrbitCarousel, type OrbitItem } from "@/app/demo/_components/demo-orbit-carousel"

const ORBIT_ITEMS: OrbitItem[] = [
  {
    id: 1,
    title: "Blue Sky Premium",
    subtitle: "Phares",
    priceLabel: "dès 15€",
    image: "/pdt/cloud.png",
  },
  {
    id: 2,
    title: "Crystal Reserve",
    subtitle: "Exclusif",
    priceLabel: "dès 20€",
    image: "/pdt/water.png",
  },
  {
    id: 3,
    title: "Heisenberg OG",
    subtitle: "Signature",
    priceLabel: "dès 12€",
    image: "/pdt/iron.png",
  },
  {
    id: 4,
    title: "Los Pollos Extract",
    subtitle: "Concentré",
    priceLabel: "dès 25€",
    image: "/pdt/bai.png",
  },
  {
    id: 5,
    title: "Marvel Drop",
    subtitle: "Édition",
    priceLabel: "dès 18€",
    image: "/pdt/marvel.jpg",
  },
  {
    id: 6,
    title: "Punisher Batch",
    subtitle: "Limited",
    priceLabel: "dès 22€",
    image: "/pdt/punisher.jpg",
  },
  {
    id: 7,
    title: "Tesla Lab",
    subtitle: "Tech",
    priceLabel: "dès 30€",
    image: "/pdt/tesla.jpg",
  },
  {
    id: 8,
    title: "Speed Run",
    subtitle: "Flash",
    priceLabel: "dès 14€",
    image: "/pdt/spee.png",
  },
]

export default function DemoOrbitPage() {
  const [selected, setSelected] = useState<OrbitItem | null>(null)

  return (
    <div className="relative min-h-[calc(100vh-2.25rem)] overflow-hidden bg-[#050505] text-white">
      {/* Ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(62,103,87,0.22),transparent_55%),radial-gradient(ellipse_at_80%_80%,rgba(62,103,87,0.08),transparent_40%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour démo
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3e6757]/40 bg-[#3e6757]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#9ec5b4]">
            <Sparkles className="h-3 w-3" />
            Prototype UI · Orbite 3D
          </span>
        </div>

        <header className="mb-6 text-center">
          <p className="mb-2 text-xs uppercase tracking-[0.35em] text-[#3e6757]">Expérience vitrine</p>
          <h1 className="mb-3 text-3xl font-light tracking-tight md:text-5xl">
            Carousel <span className="font-semibold">orbite</span>
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-zinc-400">
            Petit test inspiré de la vidéo référence : les produits flottent et tournent autour d&apos;un
            axe central — sans table, juste l&apos;effet « coverflow » premium. Idéal pour une sélection
            phare en haut de boutique.
          </p>
        </header>

        <DemoOrbitCarousel items={ORBIT_ITEMS} onSelect={setSelected} />

        <section className="mx-auto mt-14 max-w-2xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-relaxed text-zinc-400">
          <h2 className="mb-2 text-base font-semibold text-white">Avis rapide</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-zinc-200">Très stylé</strong> en hero / « Produits phares » — ça
              donne un côté labo / vitrine premium.
            </li>
            <li>
              À garder pour <strong className="text-zinc-200">6–10 items max</strong> : au-delà, la
              grille reste plus lisible pour commander.
            </li>
            <li>
              Sur mobile : drag + boutons OK ; l&apos;auto-spin se coupe si{" "}
              <code className="text-zinc-300">prefers-reduced-motion</code>.
            </li>
          </ul>
        </section>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#3e6757]/40 bg-[#0a0a0a] p-6 shadow-[0_0_60px_rgba(62,103,87,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-zinc-400 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative mx-auto mb-5 h-48 w-48">
              <Image src={selected.image} alt="" fill className="object-contain" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#3e6757]">{selected.subtitle}</p>
            <h3 className="mt-1 text-2xl font-bold">{selected.title}</h3>
            {selected.priceLabel && <p className="mt-1 text-zinc-400">{selected.priceLabel}</p>}
            <p className="mt-4 text-sm text-zinc-500">
              Démo visuelle uniquement — pas de panier branché sur cette page. L&apos;idée : un clic ici
              ouvrirait la fiche produit classique.
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-6 w-full rounded-2xl bg-[#3e6757] py-3 text-sm font-bold text-white hover:bg-[#4a7d6a]"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
