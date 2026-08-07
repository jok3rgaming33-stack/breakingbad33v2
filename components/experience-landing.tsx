"use client"

import Link from "next/link"
import {
  Gift,
  Package,
  MessageSquare,
  Shield,
  Crown,
  Truck,
  Sparkles,
  Check,
  ArrowRight,
  Star,
  Coins,
  Lock,
} from "lucide-react"

const TIERS = [
  {
    id: "bronze",
    emoji: "🥉",
    label: "Bronze",
    multi: "×1",
    from: "Dès le départ",
    color: "border-amber-700/40 bg-amber-900/20 text-amber-500",
    perks: ["1€ payé = 1 point", "Bons fidélité", "Parrainage à la 1ʳᵉ livraison"],
  },
  {
    id: "silver",
    emoji: "🥈",
    label: "Argent",
    multi: "×1,1",
    from: "dès 100€ livrés",
    color: "border-zinc-400/40 bg-zinc-500/10 text-zinc-300",
    perks: ["+10 % de points", "Bon -10€ à 300 pts", "Tous les avantages Bronze"],
  },
  {
    id: "gold",
    emoji: "🥇",
    label: "Or",
    multi: "×1,2",
    from: "dès 300€ livrés",
    color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
    perks: ["+20 % de points", "Priorité messagerie", "Emoji 🥇 · bon -20€ à 600 pts"],
  },
  {
    id: "platinum",
    emoji: "💎",
    label: "Platine",
    multi: "×1,3",
    from: "dès 600€ livrés",
    color: "border-cyan-400/40 bg-cyan-500/10 text-cyan-300",
    perks: [
      "+30 % de points",
      "Réservation produit 48 h",
      "Livraison offerte* ≥ 90€ · bon -30€ à 900 pts",
    ],
  },
]

const STEPS = [
  {
    n: "01",
    title: "Entre dans le shop",
    text: "Accès simple, catalogue clair, panier fluide.",
    icon: Sparkles,
  },
  {
    n: "02",
    title: "Commande & suis",
    text: "Statuts de commande, messagerie, options de retrait ou livraison.",
    icon: Package,
  },
  {
    n: "03",
    title: "Gagne des points",
    text: "À chaque livraison, tes points montent — et ton palier aussi.",
    icon: Coins,
  },
  {
    n: "04",
    title: "Échange en bons",
    text: "Génère -10€ / -20€ / -30€. Ton statut reste, même après un bon.",
    icon: Gift,
  },
]

const PILLARS = [
  {
    icon: Package,
    title: "Suivi de commande",
    text: "Timeline claire, de la validation à la réception.",
  },
  {
    icon: MessageSquare,
    title: "Messagerie directe",
    text: "Échange avec l’équipe. Les membres Or & Platine sont prioritaires.",
  },
  {
    icon: Crown,
    title: "Club fidélité",
    text: "4 paliers, multi points, bons, avantages exclusifs.",
  },
  {
    icon: Shield,
    title: "Compte sécurisé",
    text: "Accès personnel, espace fidélité, historique à portée de main.",
  },
]

export function ExperienceLanding() {
  return (
    <div className="min-h-screen bg-[#050505] text-[#f0f0f0]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logoweb.png" alt="BB33" className="h-8 w-auto" />
            <span className="hidden font-semibold tracking-wide sm:inline">BreakingBad33</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="#fidelite"
              className="hidden rounded-full px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white sm:inline"
            >
              Fidélité
            </a>
            <Link
              href="/?utm_source=landing&utm_medium=experience&utm_campaign=client_experience"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#3e6757] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Entrer dans le shop
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(62,103,87,0.45), transparent), radial-gradient(ellipse 60% 40% at 80% 60%, rgba(249,115,22,0.08), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#3e6757]/40 bg-[#3e6757]/15 px-3 py-1 text-xs font-medium text-[#8fbc8f]">
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
            Nouvelle expérience client · Programme fidélité
          </div>
          <h1 className="max-w-2xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Commande. Suis.{" "}
            <span className="text-[#3e6757]">Gagne.</span>
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
            Le shop qui te récompense vraiment : suivi clair, messagerie, et un club fidélité
            Bronze → Platine avec bons jusqu’à <strong className="text-white">-30€</strong> — sans
            jamais te faire redescendre de palier.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/?utm_source=landing&utm_medium=experience&utm_campaign=client_experience&utm_content=hero_cta"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f97316] px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition-transform hover:scale-[1.02]"
            >
              Découvrir le shop
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#comment"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-7 py-3.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/10"
            >
              Comment ça marche
            </a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#3e6757]" /> Points à chaque livraison
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#3e6757]" /> Palier conservé avec un bon
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#3e6757]" /> Avantages Or & Platine
            </span>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="border-y border-white/[0.06] bg-[#0a0a0a]">
        <div className="mx-auto grid max-w-5xl gap-px bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div key={p.title} className="bg-[#0a0a0a] px-5 py-7 sm:px-6">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#3e6757]/20 text-[#3e6757]">
                <p.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="comment" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-10 max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3e6757]">Parcours</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Une expérience fluide, du panier à la fidélité
          </h2>
          <p className="mt-3 text-zinc-400">
            Quatre étapes. Zéro blabla. Tout est pensé pour que tu saches toujours où tu en es.
          </p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111] p-6 transition-colors hover:border-[#3e6757]/40"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-600">{s.n}</span>
                <s.icon className="h-5 w-5 text-[#3e6757] opacity-80" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Loyalty */}
      <section id="fidelite" className="border-t border-white/[0.06] bg-[#0a0a0a]">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3e6757]">
                Programme fidélité
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Monte de palier. Garde tes avantages.
              </h2>
              <p className="mt-3 text-zinc-400">
                Plus tu commandes (commandes <em>livrées</em>), plus ton multi points grimpe. Utiliser un
                bon <strong className="text-zinc-200">ne te fait pas redescendre</strong> de palier.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-zinc-400">
              <span className="font-semibold text-white">Règle d’or</span>
              <br />
              Points débités à la génération du bon · statut conservé
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t) => (
              <article
                key={t.id}
                className={`flex flex-col rounded-3xl border p-5 ${t.color.split(" ").slice(0, 2).join(" ")} border`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${t.color}`}>
                    {t.emoji} {t.label}
                  </span>
                  <span className="font-mono text-sm font-bold text-white">{t.multi}</span>
                </div>
                <p className="mb-3 text-[11px] uppercase tracking-wide text-zinc-500">{t.from}</p>
                <ul className="mt-auto space-y-1.5 text-sm text-zinc-300">
                  {t.perks.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3e6757]" aria-hidden="true" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {/* Rewards table */}
          <div className="mt-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111]">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h3 className="flex items-center gap-2 font-semibold">
                <Gift className="h-4 w-4 text-[#3e6757]" aria-hidden="true" />
                Bons à échanger
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Génère le code dans l’Espace fidélité, puis applique-le au panier.
              </p>
            </div>
            <div className="grid divide-y divide-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                { label: "-10€", pts: "300 pts", min: "dès 50€ d’achat" },
                { label: "-20€", pts: "600 pts", min: "dès 100€ d’achat" },
                { label: "-30€", pts: "900 pts", min: "dès 150€ d’achat" },
              ].map((r) => (
                <div key={r.label} className="px-5 py-5 text-center">
                  <p className="text-2xl font-bold text-[#f97316]">{r.label}</p>
                  <p className="mt-1 text-sm font-medium text-white">{r.pts}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{r.min}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:flex-row sm:items-center sm:gap-4">
            <Truck className="h-6 w-6 shrink-0 text-cyan-400" aria-hidden="true" />
            <p className="text-sm text-zinc-300">
              <strong className="text-cyan-300">Platine</strong> : livraison offerte pendant 1 mois sur
              les commandes ≥ 90€ · réservation d’un produit 48 h pour le sécuriser avant les autres.
            </p>
          </div>
          <p className="mt-3 text-[11px] text-zinc-600">
            * Avantages soumis aux conditions affichées dans l’Espace fidélité. Points crédités à la
            livraison. Le multi s’applique selon ton palier.
          </p>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="rounded-[2rem] border border-white/[0.08] bg-gradient-to-br from-[#111] to-[#0a0a0a] p-8 sm:p-12">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3e6757]">
                Pourquoi BB33
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                Pas seulement un panier. Un parcours client.
              </h2>
              <ul className="mt-6 space-y-3 text-sm text-zinc-400">
                {[
                  "Tu vois l’avancée de ta commande",
                  "Tu parles à l’équipe en messagerie",
                  "Tu progresses dans un vrai club (Argent → Platine)",
                  "Tu utilises un bon sans perdre ton statut",
                  "Tu regagnes des points en recommendant",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3e6757]/25">
                      <Check className="h-3 w-3 text-[#8fbc8f]" aria-hidden="true" />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <Lock className="mb-2 h-5 w-5 text-[#3e6757]" aria-hidden="true" />
                <p className="font-semibold">Compte personnel</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Accès sécurisé, Espace fidélité, codes et historique au même endroit.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <MessageSquare className="mb-2 h-5 w-5 text-[#3e6757]" aria-hidden="true" />
                <p className="font-semibold">Support réactif</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Discussions directes. Membres Or & Platine en file prioritaire.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-white/[0.06] bg-[#0a0a0a]">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Prêt à entrer dans le labo ?</h2>
          <p className="mx-auto mt-3 max-w-md text-zinc-400">
            Rejoins le shop, passe ta première commande livrée, et commence à grimper les paliers.
          </p>
          <Link
            href="/?utm_source=landing&utm_medium=experience&utm_campaign=client_experience&utm_content=footer_cta"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#3e6757] px-8 py-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Accéder au shop
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-zinc-600">
        <p>BreakingBad33 · Expérience client</p>
        <p className="mt-1">
          <Link href="/" className="underline-offset-2 hover:text-zinc-400 hover:underline">
            Accueil
          </Link>
          {" · "}
          Conditions fidélité dans l’Espace fidélité une fois connecté
        </p>
      </footer>
    </div>
  )
}
