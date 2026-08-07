"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Star,
  RefreshCw,
  Send,
  Loader2,
  Package,
  CheckCircle2,
  Clock,
  MessageSquare,
  Link2,
  AlertTriangle,
} from "lucide-react"
import {
  getRatingsAdminOverview,
  sendRatingInvites,
  analyzeProductIdBackfill,
  applyProductIdBackfill,
  type RatingInviteTarget,
  type ProductIdBackfillAnalysis,
} from "@/app/actions/ratings"

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AdminRatings() {
  const { data, mutate, isLoading, isValidating } = useSWR(
    "admin-ratings-overview",
    () => getRatingsAdminOverview(),
    { revalidateOnFocus: false },
  )

  const [filter, setFilter] = useState<"pending" | "all" | "done">("pending")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Backfill product_ids
  const [backfill, setBackfill] = useState<ProductIdBackfillAnalysis | null>(null)
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillApplying, setBackfillApplying] = useState(false)
  /** Associations manuelles : clé = terme normalisé approximatif (on envoie le terme brut) */
  const [manualMap, setManualMap] = useState<Record<string, number>>({})
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)
  const [backfillErr, setBackfillErr] = useState<string | null>(null)

  const targets = data?.targets ?? []
  const stats = data?.stats
  const recent = data?.recentRatings ?? []

  const filtered = useMemo(() => {
    if (filter === "pending") return targets.filter((t) => t.pendingCount > 0)
    if (filter === "done") return targets.filter((t) => t.pendingCount === 0)
    return targets
  }, [targets, filter])

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllPendingVisible = () => {
    const ids = filtered.filter((t) => t.pendingCount > 0).map((t) => t.threadId)
    setSelected(new Set(ids))
  }

  const clearSelection = () => setSelected(new Set())

  const handleSend = async (ids: number[]) => {
    if (!ids.length || sending) return
    setSending(true)
    setMsg(null)
    setErr(null)
    try {
      const res = await sendRatingInvites(ids)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setMsg(
        `${res.sent} invitation${res.sent > 1 ? "s" : ""} envoyée${res.sent > 1 ? "s" : ""}${
          res.skipped ? ` · ${res.skipped} ignorée${res.skipped > 1 ? "s" : ""}` : ""
        }.`,
      )
      setSelected(new Set())
      await mutate()
    } catch {
      setErr("Échec réseau. Réessaie.")
    } finally {
      setSending(false)
    }
  }

  const sendOne = (t: RatingInviteTarget) => {
    if (t.pendingCount <= 0) return
    void handleSend([t.threadId])
  }

  const runBackfillAnalysis = async () => {
    setBackfillLoading(true)
    setBackfillMsg(null)
    setBackfillErr(null)
    try {
      const res = await analyzeProductIdBackfill()
      setBackfill(res)
      setManualMap({})
    } catch {
      setBackfillErr("Analyse impossible (réseau).")
    } finally {
      setBackfillLoading(false)
    }
  }

  const applyBackfill = async () => {
    if (backfillApplying) return
    setBackfillApplying(true)
    setBackfillMsg(null)
    setBackfillErr(null)
    try {
      const res = await applyProductIdBackfill({ mappings: manualMap })
      if (!res.ok) {
        setBackfillErr(res.error)
        return
      }
      setBackfillMsg(
        `${res.updated} commande${res.updated > 1 ? "s" : ""} mise${res.updated > 1 ? "s" : ""} à jour` +
          (res.skipped ? ` · ${res.skipped} ignorée${res.skipped > 1 ? "s" : ""}` : "") +
          (res.stillBlocked.length
            ? ` · encore bloquée(s) : ${res.stillBlocked.slice(0, 5).join(" ; ")}`
            : ""),
      )
      // Re-analyse + refresh cibles de relance
      const next = await analyzeProductIdBackfill()
      setBackfill(next)
      await mutate()
    } catch {
      setBackfillErr("Échec application.")
    } finally {
      setBackfillApplying(false)
    }
  }

  const mappedCount = Object.keys(manualMap).filter((k) => manualMap[k]! > 0).length
  const uncertainLeft = (backfill?.uncertainTerms ?? []).filter((u) => !manualMap[u.term]).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Notations</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Relance les clients dont la commande est livrée et possède des{" "}
            <span className="font-medium text-foreground">productIds</span>. Un produit ne peut être
            noté qu&apos;une fois par commande. L&apos;invitation part sur le fil de commande avec le
            bouton « Noter mes produits ».
          </p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          disabled={isValidating}
          className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} aria-hidden="true" />
          Actualiser
        </button>
      </div>

      {/* ═══ Rattachement archives ═══ */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold">
              <Link2 className="h-4 w-4 text-accent" aria-hidden="true" />
              Rattacher les IDs (archives)
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Analyse les commandes livrées <strong className="text-foreground">sans productIds</strong>{" "}
              à partir du texte récap (ex. « 1x Coke ×2 »). Les matches sûrs sont proposés
              automatiquement ; les termes ambigus t&apos;attendent ci-dessous pour association manuelle.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runBackfillAnalysis()}
            disabled={backfillLoading}
            className="flex items-center gap-2 self-start rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {backfillLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Analyser les archives
          </button>
        </div>

        {backfillErr && (
          <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {backfillErr}
          </p>
        )}
        {backfillMsg && (
          <p className="mb-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
            {backfillMsg}
          </p>
        )}

        {backfill && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Sans IDs", value: backfill.stats.ordersWithoutIds },
                { label: "Prêtes (auto)", value: backfill.stats.fullyResolvable },
                { label: "Bloquées", value: backfill.stats.blockedByUncertain },
                { label: "Termes à valider", value: backfill.stats.uniqueUncertainTerms },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-background/60 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Termes incertains → association manuelle */}
            {backfill.uncertainTerms.length > 0 ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Termes non sûrs — associe-les au bon produit
                </div>
                <ul className="space-y-2">
                  {backfill.uncertainTerms.map((u) => (
                    <li
                      key={u.term}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-foreground">
                          « {u.term} »
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {u.count} occurrence{u.count > 1 ? "s" : ""} · cmd{" "}
                          {u.orderIds
                            .slice(0, 6)
                            .map((id) => `#${id}`)
                            .join(", ")}
                          {u.orderIds.length > 6 ? "…" : ""}
                        </p>
                      </div>
                      <select
                        value={manualMap[u.term] ?? ""}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setManualMap((prev) => {
                            const next = { ...prev }
                            if (!v) delete next[u.term]
                            else next[u.term] = v
                            return next
                          })
                        }}
                        className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent sm:w-64"
                      >
                        <option value="">— Choisir un produit —</option>
                        {u.candidates.length > 0 && (
                          <optgroup label="Suggestions">
                            {u.candidates.map((c) => (
                              <option key={`s-${c.id}`} value={c.id}>
                                #{c.id} · {c.title}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Catalogue complet">
                          {backfill.catalog.map((c) => (
                            <option key={c.id} value={c.id}>
                              #{c.id} · {c.title}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Associés : {mappedCount} / {backfill.uncertainTerms.length}
                  {uncertainLeft > 0 ? ` · reste ${uncertainLeft}` : " · tous associés ✓"}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Aucun terme ambigu — tous les rattachements détectés sont sûrs (ou aucune archive sans
                IDs).
              </p>
            )}

            {/* Aperçu commandes — détail produit par produit (sans troncature) */}
            {backfill.orders.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Détail des commandes ({backfill.orders.length})
                  </p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" /> Match auto
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-sky-400" /> Associé par toi
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-400" /> À valider
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-zinc-500" /> Introuvable
                    </span>
                  </div>
                </div>

                <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-border p-2 sm:p-3">
                  {backfill.orders.map((o) => {
                    const termsOk =
                      o.terms.length > 0 &&
                      o.terms.every((t) => t.status === "matched" || !!manualMap[t.term])
                    const pendingTerms = o.terms.filter(
                      (t) => t.status !== "matched" && !manualMap[t.term],
                    )

                    return (
                      <article
                        key={o.threadId}
                        className={`rounded-xl border px-3 py-2.5 ${
                          termsOk
                            ? "border-emerald-500/25 bg-emerald-500/5"
                            : o.terms.length === 0
                              ? "border-border bg-background/40"
                              : "border-amber-500/20 bg-amber-500/[0.04]"
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              #{o.threadId}
                            </span>
                            <span className="text-sm font-semibold">{o.customerName}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {o.terms.length} produit{o.terms.length > 1 ? "s" : ""} détecté
                              {o.terms.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              termsOk
                                ? "bg-emerald-500/15 text-emerald-400"
                                : o.terms.length === 0
                                  ? "bg-zinc-500/15 text-zinc-400"
                                  : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {termsOk
                              ? "Prêt"
                              : o.terms.length === 0
                                ? "Illisible"
                                : `${pendingTerms.length} à valider`}
                          </span>
                        </div>

                        {/* Texte brut récap (wrap complet) */}
                        <p className="mb-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                          {o.productsText}
                        </p>

                        {/* Pastilles produit par produit */}
                        {o.terms.length > 0 ? (
                          <ul className="flex flex-wrap gap-1.5">
                            {o.terms.map((t, idx) => {
                              const manualId = manualMap[t.term]
                              const isManual = !!manualId
                              const isAuto = t.status === "matched" && !isManual
                              const isPending = t.status !== "matched" && !isManual
                              const isUnmatched = t.status === "unmatched" && !isManual

                              const catalogTitle =
                                isManual
                                  ? backfill.catalog.find((c) => c.id === manualId)?.title
                                  : t.productTitle

                              let chipClass =
                                "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"
                              if (isAuto)
                                chipClass =
                                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              else if (isManual)
                                chipClass = "border-sky-500/40 bg-sky-500/10 text-sky-200"
                              else if (isPending && !isUnmatched)
                                chipClass =
                                  "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              else if (isUnmatched)
                                chipClass = "border-zinc-500/40 bg-zinc-600/20 text-zinc-400"

                              return (
                                <li
                                  key={`${o.threadId}-${idx}-${t.term}`}
                                  className={`inline-flex max-w-full flex-col rounded-lg border px-2 py-1 ${chipClass}`}
                                  title={
                                    catalogTitle
                                      ? `${t.term} → #${isManual ? manualId : t.productId} ${catalogTitle}`
                                      : t.term
                                  }
                                >
                                  <span className="break-words text-[11px] font-semibold leading-snug">
                                    {t.term}
                                  </span>
                                  <span className="break-words text-[10px] opacity-80">
                                    {isAuto && (
                                      <>
                                        → #{t.productId} {t.productTitle}
                                      </>
                                    )}
                                    {isManual && (
                                      <>
                                        → #{manualId} {catalogTitle ?? "?"}
                                      </>
                                    )}
                                    {isPending && !isUnmatched && (
                                      <>→ à valider ({t.candidates.length} suggestion
                                      {t.candidates.length > 1 ? "s" : ""})</>
                                    )}
                                    {isUnmatched && <>→ introuvable au catalogue</>}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-zinc-500">
                            Aucun produit extrait du texte — saisie manuelle impossible ici.
                          </p>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void applyBackfill()}
                disabled={backfillApplying || backfill.stats.ordersWithoutIds === 0}
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {backfillApplying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Appliquer les rattachements
              </button>
              <p className="text-[11px] text-muted-foreground">
                N&apos;écrit que les commandes 100 % résolues. N&apos;écrase jamais un productIds déjà
                rempli.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          {
            label: "Commandes éligibles",
            value: stats?.ordersWithProducts ?? "—",
            icon: Package,
          },
          {
            label: "À relancer",
            value: stats?.pendingOrders ?? "—",
            icon: Clock,
          },
          {
            label: "Tout noté",
            value: stats?.fullyRatedOrders ?? "—",
            icon: CheckCircle2,
          },
          {
            label: "Avis reçus",
            value: stats?.totalRatings ?? "—",
            icon: MessageSquare,
          },
          {
            label: "Note moyenne",
            value: stats?.avgScore != null ? `${stats.avgScore}/5` : "—",
            icon: Star,
          },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <p className="text-xs">{label}</p>
            </div>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Actions de masse */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="flex gap-1 rounded-xl bg-secondary/50 p-1">
          {(
            [
              { id: "pending" as const, label: "À noter" },
              { id: "all" as const, label: "Toutes" },
              { id: "done" as const, label: "Complètes" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id)
                setSelected(new Set())
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={selectAllPendingVisible}
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          Tout sélectionner (visibles)
        </button>
        <button
          type="button"
          onClick={clearSelection}
          disabled={!selected.size}
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"
        >
          Vider
        </button>

        <button
          type="button"
          disabled={sending || selected.size === 0}
          onClick={() => handleSend([...selected])}
          className="ml-auto flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Relancer ({selected.size})
        </button>
      </div>

      {msg && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          {msg}
        </p>
      )}
      {err && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {err}
        </p>
      )}

      {/* Table cibles */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card py-16 text-center">
          <p className="font-medium">Aucune commande dans ce filtre</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Seules les commandes livrées avec productIds apparaissent ici.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="w-10 px-3 py-3" />
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">#</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Client</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Commande</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Notes</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Invite</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Date</th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const canInvite = t.pendingCount > 0
                return (
                  <tr
                    key={t.threadId}
                    className={`border-b border-border last:border-0 ${
                      i % 2 === 0 ? "bg-background" : "bg-card"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(t.threadId)}
                        disabled={!canInvite}
                        onChange={() => toggle(t.threadId)}
                        className="h-4 w-4 rounded border-border accent-[#3e6757]"
                        aria-label={`Sélectionner #${t.threadId}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      #{t.threadId}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{t.customerName}</div>
                      <div className="max-w-[140px] truncate font-mono text-[10px] text-muted-foreground">
                        {t.customerToken.slice(0, 12)}…
                      </div>
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <p className="truncate text-xs">{t.summary}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.fulfillment} · {t.total}€
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                          t.pendingCount === 0
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {t.ratedCount}/{t.productCount}
                        {t.pendingCount > 0 ? ` · ${t.pendingCount} restant${t.pendingCount > 1 ? "s" : ""}` : " · ok"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {t.alreadyInvited ? (
                        <span className="text-muted-foreground">Déjà envoyée</span>
                      ) : (
                        <span className="text-zinc-500">Jamais</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {formatDate(t.updatedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={!canInvite || sending}
                        onClick={() => sendOne(t)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-accent/40 hover:bg-accent/10 disabled:opacity-40"
                      >
                        <Send className="h-3 w-3" aria-hidden="true" />
                        Relancer
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Derniers avis */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Star className="h-4 w-4 text-amber-400" aria-hidden="true" />
          Derniers avis reçus
        </h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun avis pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.productTitle}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      · {r.pseudo ?? "Client"} · cmd #{r.threadId}
                    </span>
                  </p>
                  {r.comment && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.comment}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {r.avgScore}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
