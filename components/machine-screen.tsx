"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { claimFreeSpin, loadMachine, spinAdminTrial, spinMachine } from "@/app/actions/slot"
import { PRIZE_CARDS, RULES, symbolSrc, SLOT_SYMBOLS, type MachineState } from "@/lib/slot-public"

const PRIZE_OUTCOMES = new Set(["walter", "jesse", "gus", "badger", "crystal"])

function Reel({
  symbol,
  spinning,
  bright,
}: {
  symbol: string | null
  spinning: boolean
  bright: boolean
}) {
  const [flick, setFlick] = useState(symbol ?? "crystal")
  useEffect(() => {
    if (!spinning) {
      if (symbol) setFlick(symbol)
      return
    }
    const id = window.setInterval(() => {
      const next = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]
      setFlick(next.id)
    }, 90)
    return () => window.clearInterval(id)
  }, [spinning, symbol])

  const shown = spinning ? flick : symbol
  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-xl border bg-black/80 shadow-[inset_0_0_24px_rgba(0,0,0,0.85)] ${
        bright ? "border-[#8fbc8f] shadow-[0_0_24px_rgba(62,103,87,0.55)]" : "border-white/10"
      }`}
    >
      {shown ? (
        // Photos entières. Seul le cristal est légèrement remonté pour sortir le filigrane.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={symbolSrc(shown)}
          alt=""
          className={shown === "crystal" ? "h-full w-full object-cover" : "h-full w-full object-contain"}
          style={shown === "crystal" ? { objectPosition: "center 42%" } : undefined}
        />
      ) : (
        <div className="h-full w-full bg-[#0a0a0a]" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />
    </div>
  )
}

export function MachineScreen() {
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<MachineState | null>(null)
  const [admin, setAdmin] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [symbols, setSymbols] = useState<(string | null)[]>([null, null, null])
  const [label, setLabel] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trial, setTrial] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = async (current = token) => {
    const res = await loadMachine(current)
    setState(res.state)
    setAdmin(res.admin)
    if (res.state.last && !spinning) {
      setSymbols(res.state.last.symbols)
      setOutcome(res.state.last.outcome)
      setLabel(res.state.last.label)
      setTrial(false)
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("authToken")
    setToken(saved)
    loadMachine(saved)
      .then((res) => {
        setState(res.state)
        setAdmin(res.admin)
        if (res.state.last) {
          setSymbols(res.state.last.symbols)
          setOutcome(res.state.last.outcome)
          setLabel(res.state.last.label)
        }
      })
      .catch(() => setError("Albuquerque Luck Spin ne répond pas."))
  }, [])

  const run = async (kind: "play" | "trial") => {
    if (busy) return
    setBusy(true)
    setError(null)
    setSpinning(true)
    setTrial(kind === "trial")
    try {
      const res = kind === "trial" ? await spinAdminTrial() : await spinMachine(token ?? "")
      if (!res.ok) {
        setSpinning(false)
        setError(res.error)
        return
      }
      window.setTimeout(() => {
        setSymbols(res.symbols)
        setOutcome(res.outcome)
        setLabel(res.label)
        setTrial(!!res.trial)
        setSpinning(false)
        setBusy(false)
        if (kind === "play") void refresh()
      }, 1600)
      return
    } catch {
      setError("Tirage interrompu. Recharge la page : le résultat enregistré s'affiche.")
      setSpinning(false)
    }
    setBusy(false)
  }

  const claim = async () => {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    const res = await claimFreeSpin(token)
    setBusy(false)
    if (!res.ok) setError(res.error)
    else setLabel(res.hint)
    await refresh()
  }

  const bright = !spinning && !!outcome && PRIZE_OUTCOMES.has(outcome)
  const available = state?.available ?? 0

  return (
    <div className="relative min-h-screen text-[#f0f0f0]">
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/hero-rv.png)" }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/75 via-[#050505]/88 to-[#050505]" />

      <header className="relative z-10 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            BreakingBad33
          </Link>
          <Link href="/" className="text-xs uppercase tracking-[0.16em] text-white/70 hover:text-white">
            Retour au shop
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8fbc8f]">Albuquerque Luck Spin</p>
        <h1 className="mt-2 max-w-xl text-3xl font-bold tracking-tight sm:text-5xl">3 Précurseurs identiques = un lot</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
          Les tours viennent des commandes payées. Le palier Ultimate ouvre en plus un tour gratuit à réclamer.
          Les chances ne sont pas affichées.
        </p>

        <section className="relative mx-auto mt-8 max-w-xl rounded-[28px] border border-[#3e6757]/70 bg-[#141414]/90 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:p-6">
          <div className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-full bg-[radial-gradient(circle,#7ec8ff,transparent_70%)] opacity-80" />
          <div className="pointer-events-none absolute right-3 top-3 h-8 w-8 rounded-full bg-[radial-gradient(circle,#7ec8ff,transparent_70%)] opacity-80" />
          <div className="pointer-events-none absolute bottom-16 left-3 h-8 w-8 rounded-full bg-[radial-gradient(circle,#7ec8ff,transparent_70%)] opacity-70" />
          <div className="pointer-events-none absolute bottom-16 right-3 h-8 w-8 rounded-full bg-[radial-gradient(circle,#7ec8ff,transparent_70%)] opacity-70" />

          <div className="relative rounded-2xl border border-[#3e6757]/50 bg-black/40 p-3">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {symbols.map((s, i) => (
                <Reel key={i} symbol={s} spinning={spinning} bright={bright} />
              ))}
            </div>
            <div
              className={`pointer-events-none absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 ${
                bright ? "bg-[#8fbc8f] shadow-[0_0_12px_#3e6757]" : "bg-white/15"
              }`}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/80">
              {state?.loggedIn ? (
                <>
                  <strong className="text-white">{available}</strong> tour{available > 1 ? "s" : ""} disponible{available > 1 ? "s" : ""}
                  {state.soonestExpiry ? ` · le plus court expire le ${new Date(state.soonestExpiry).toLocaleDateString("fr-FR")}` : ""}
                </>
              ) : (
                "Connecte-toi sur le shop pour voir tes tours."
              )}
            </p>
            <button
              type="button"
              disabled={busy || spinning || !state?.loggedIn || available < 1}
              onClick={() => void run("play")}
              className="rounded-full bg-[#3e6757] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {spinning && !trial ? "Les rouleaux tournent…" : "Tirer"}
            </button>
          </div>

          {trial && (
            <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              Essai admin. Ce tirage utilise le vrai tirage, mais il ne crée ni bon, ni points, ni tour.
            </p>
          )}
          {label && <p className="mt-3 text-sm leading-relaxed text-white">{label}</p>}
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

          {admin && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">Mode essai — session admin</p>
              <button
                type="button"
                disabled={busy || spinning}
                onClick={() => void run("trial")}
                className="mt-2 rounded-full border border-amber-200/40 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-40"
              >
                Tirer un essai
              </button>
            </div>
          )}
        </section>

        {state?.loggedIn && state.ultimate && (
          <section className="mt-8 rounded-3xl border border-amber-200/30 bg-black/55 p-5">
            <h2 className="text-lg font-semibold">👑 Ultimate — tours gratuits</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{state.ultimate.claimHint}</p>
            {state.isUltimate && (
              <button
                type="button"
                disabled={!state.ultimate.canClaim || busy}
                onClick={() => void claim()}
                className="mt-3 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
              >
                Réclamer le tour gratuit
              </button>
            )}
          </section>
        )}

        {state?.vouchers && state.vouchers.length > 0 && (
          <section className="mt-6 rounded-3xl border border-white/10 bg-black/55 p-5">
            <h2 className="text-lg font-semibold">Tes bons</h2>
            <ul className="mt-3 space-y-2">
              {state.vouchers.map((v) => (
                <li key={v.code} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-mono text-[#8fbc8f]">{v.code}</span>
                    <span className="ml-2 text-white/70">{v.label}</span>
                  </span>
                  <span className="text-xs text-white/50">
                    {v.expiresAt ? `jusqu'au ${new Date(v.expiresAt).toLocaleDateString("fr-FR")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-white/50">À choisir dans le panier. Pas de cumul avec un autre code.</p>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-2xl font-bold">Les lots</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRIZE_CARDS.map((card) => (
              <article key={card.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/60">
                <div className="flex h-52 items-center justify-center bg-[#0c0c0c] sm:h-60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={symbolSrc(card.id)}
                    alt={card.title}
                    className={
                      card.id === "crystal"
                        ? "h-full w-full object-cover object-[center_40%]"
                        : "h-full w-full object-contain"
                    }
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{card.title}</h3>
                  <p className="text-sm text-[#8fbc8f]">{card.gain}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">{card.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Les règles</h2>
          {RULES.map((rule) => (
            <article key={rule.title} className="rounded-2xl border border-white/10 bg-black/55 p-4">
              <h3 className="font-semibold">{rule.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{rule.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
