"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Gift,
  Loader2,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Ticket,
  Coins,
  Wrench,
  User,
} from "lucide-react"
import {
  getLoyaltyOverview,
  repairLoyaltySpent,
  type LoyaltyClientRow,
  type LoyaltyOverview,
} from "@/app/actions/loyalty-admin"

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

type InnerTab = "clients" | "codes" | "anomalies"

export function AdminLoyalty() {
  const [data, setData] = useState<LoyaltyOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<InnerTab>("clients")
  const [q, setQ] = useState("")
  const [expanded, setExpanded] = useState<number | null>(null)
  const [repairing, setRepairing] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const ov = await getLoyaltyOverview()
      setData(ov)
    } catch {
      setMsg("Impossible de charger la fidélité.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredClients = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    let list = data.clients
    if (tab === "anomalies") list = list.filter((c) => !c.debitOk)
    if (!needle) return list
    return list.filter(
      (c) =>
        c.pseudo.toLowerCase().includes(needle) ||
        (c.nickname ?? "").toLowerCase().includes(needle) ||
        c.token.toLowerCase().includes(needle),
    )
  }, [data, q, tab])

  const filteredCodes = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return data.allCodes
    return data.allCodes.filter(
      (c) =>
        c.code.toLowerCase().includes(needle) ||
        (c.pseudo ?? "").toLowerCase().includes(needle) ||
        c.userToken.toLowerCase().includes(needle),
    )
  }, [data, q])

  const handleRepair = async (userId: number) => {
    setRepairing(userId)
    setMsg(null)
    try {
      const res = await repairLoyaltySpent(userId)
      if (!res.ok) {
        setMsg(res.error ?? "Échec réparation")
        return
      }
      setMsg(
        `Débit réparé pour ${res.pseudo} : loyaltySpent ${res.previousSpent} → ${res.newSpent}`,
      )
      await load()
    } finally {
      setRepairing(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
    )
  }

  const t = data?.totals

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Gift className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold">Fidélité (PF)</h2>
            <p className="text-sm text-muted-foreground">
              Attribution des points, conversion en bons, et contrôle des débits.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualiser
        </button>
      </div>

      {/* KPI */}
      {t && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "Clients actifs PF", value: t.clients },
            { label: "Points gagnés", value: t.earned },
            { label: "Points dépensés", value: t.spent },
            { label: "Soldes restants", value: t.balance },
            { label: "Codes générés", value: t.codesTotal },
            { label: "Codes utilisés", value: t.codesUsed },
            { label: "Anomalies débit", value: t.anomalies, alert: t.anomalies > 0 },
          ].map((k) => (
            <div
              key={k.label}
              className={`rounded-2xl border p-3 ${
                k.alert ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-card"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {k.label}
              </p>
              <p className={`mt-1 text-xl font-bold ${k.alert ? "text-amber-400" : "text-foreground"}`}>
                {k.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">{msg}</p>
      )}

      {/* Formule */}
      <div className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Formule solde : </strong>
        points commandes <span className="font-mono text-foreground">livrées</span> (1€ = 1 pt) + ajustement
        admin − <span className="font-mono text-foreground">loyalty_spent</span>. À chaque conversion en bon
        (BB33-…), les points sont débités immédiatement (<span className="font-mono">pointsCost</span>). Le
        contrôle vérifie que <span className="font-mono">loyalty_spent = Σ pointsCost</span> des codes générés.
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-2xl border border-border bg-card p-1">
          {(
            [
              { id: "clients" as const, label: "Clients / attribution" },
              { id: "codes" as const, label: "Codes fidélité" },
              { id: "anomalies" as const, label: `Anomalies${t?.anomalies ? ` (${t.anomalies})` : ""}` },
            ] as const
          ).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                tab === x.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pseudo, code, token…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Contenu */}
      {tab === "codes" ? (
        <CodesTable codes={filteredCodes} />
      ) : (
        <ClientsTable
          clients={filteredClients}
          expanded={expanded}
          setExpanded={setExpanded}
          repairing={repairing}
          onRepair={handleRepair}
          showOnlyAnomalies={tab === "anomalies"}
        />
      )}
    </div>
  )
}

function ClientsTable({
  clients,
  expanded,
  setExpanded,
  repairing,
  onRepair,
  showOnlyAnomalies,
}: {
  clients: LoyaltyClientRow[]
  expanded: number | null
  setExpanded: (id: number | null) => void
  repairing: number | null
  onRepair: (id: number) => void
  showOnlyAnomalies: boolean
}) {
  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card py-14 text-center text-sm text-muted-foreground">
        {showOnlyAnomalies
          ? "Aucune anomalie de débit — les conversions en bons sont cohérentes."
          : "Aucun client avec activité fidélité pour le moment."}
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {clients.map((c) => {
        const open = expanded === c.userId
        return (
          <li key={c.userId}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : c.userId)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <User className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{c.pseudo}</span>
                  {c.nickname && (
                    <span className="text-xs text-muted-foreground">({c.nickname})</span>
                  )}
                  {c.debitOk ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Débit OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      <AlertTriangle className="h-3 w-3" /> Débit incohérent
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {c.token.length > 20 ? `${c.token.slice(0, 10)}…${c.token.slice(-8)}` : c.token}
                </p>
              </div>
              <div className="hidden shrink-0 grid-cols-4 gap-3 text-right text-xs sm:grid">
                <div>
                  <p className="text-muted-foreground">Gagnés</p>
                  <p className="font-semibold text-emerald-400">+{c.earned}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dépensés</p>
                  <p className="font-semibold text-orange-400">−{c.loyaltySpent}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Adj.</p>
                  <p className="font-semibold">{c.loyaltyAdjustment >= 0 ? `+${c.loyaltyAdjustment}` : c.loyaltyAdjustment}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Solde</p>
                  <p className="font-bold text-accent">{c.balance}</p>
                </div>
              </div>
              {open ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {open && (
              <div className="space-y-4 border-t border-border/60 bg-secondary/20 px-4 py-4">
                {/* Mobile KPI */}
                <div className="grid grid-cols-2 gap-2 sm:hidden">
                  <Kpi label="Gagnés" value={`+${c.earned}`} />
                  <Kpi label="Dépensés" value={`−${c.loyaltySpent}`} />
                  <Kpi label="Ajustement" value={String(c.loyaltyAdjustment)} />
                  <Kpi label="Solde" value={String(c.balance)} accent />
                </div>

                <div className="rounded-xl border border-border bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground">
                  <Coins className="mb-1 inline h-3.5 w-3.5 text-accent" />{" "}
                  <span className="font-mono text-foreground">
                    {c.earned} + ({c.loyaltyAdjustment}) − {c.loyaltySpent} = {c.balance}
                  </span>
                  {" · "}
                  Codes : {c.codesCount} ({c.codesUsed} utilisés / {c.codesUnused} en stock) · Σ pointsCost ={" "}
                  <span className="font-mono text-foreground">{c.codesPointsCost}</span>
                  {!c.debitOk && (
                    <span className="mt-1 block text-amber-400">
                      ⚠ loyalty_spent ({c.loyaltySpent}) ≠ somme des codes ({c.codesPointsCost}). Les points
                      n&apos;ont peut‑être pas été débités correctement à la conversion.
                    </span>
                  )}
                </div>

                {!c.debitOk && (
                  <button
                    type="button"
                    onClick={() => onRepair(c.userId)}
                    disabled={repairing === c.userId}
                    className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {repairing === c.userId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5" />
                    )}
                    Aligner loyalty_spent sur la somme des codes ({c.codesPointsCost})
                  </button>
                )}

                {/* Attribution par commande livrée */}
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Coins className="h-3.5 w-3.5" /> Attribution (commandes livrées)
                  </h4>
                  {c.orderLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune commande livrée générant des points.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[480px] text-left text-xs">
                        <thead className="bg-secondary/50 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Commande</th>
                            <th className="px-3 py-2 font-medium">Mode</th>
                            <th className="px-3 py-2 font-medium">Total</th>
                            <th className="px-3 py-2 font-medium">Points</th>
                            <th className="px-3 py-2 font-medium">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {c.orderLines.map((o) => (
                            <tr key={o.orderId} className="bg-background/40">
                              <td className="px-3 py-2 font-semibold">#{o.orderId}</td>
                              <td className="px-3 py-2 capitalize text-muted-foreground">{o.fulfillment}</td>
                              <td className="px-3 py-2">{o.total}€</td>
                              <td className="px-3 py-2 font-semibold text-emerald-400">+{o.points}</td>
                              <td className="px-3 py-2 text-muted-foreground">{fmtDate(o.deliveredAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Codes du client */}
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Ticket className="h-3.5 w-3.5" /> Bons générés (conversion PF)
                  </h4>
                  {c.codeLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun bon généré.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[520px] text-left text-xs">
                        <thead className="bg-secondary/50 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Code</th>
                            <th className="px-3 py-2 font-medium">Réduc.</th>
                            <th className="px-3 py-2 font-medium">Coût PF</th>
                            <th className="px-3 py-2 font-medium">Min.</th>
                            <th className="px-3 py-2 font-medium">Statut</th>
                            <th className="px-3 py-2 font-medium">Créé</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {c.codeLines.map((code) => (
                            <tr key={code.id} className="bg-background/40">
                              <td className="px-3 py-2 font-mono font-semibold">{code.code}</td>
                              <td className="px-3 py-2">−{code.discount}€</td>
                              <td className="px-3 py-2 font-semibold text-orange-400">−{code.pointsCost}</td>
                              <td className="px-3 py-2 text-muted-foreground">{code.minAmount}€</td>
                              <td className="px-3 py-2">
                                {code.used ? (
                                  <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                                    Utilisé
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                    Disponible
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{fmtDate(code.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CodesTable({ codes }: { codes: LoyaltyClientRow["codeLines"] }) {
  if (codes.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card py-14 text-center text-sm text-muted-foreground">
        Aucun code fidélité généré.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Réduction</th>
            <th className="px-4 py-3 font-medium">Points débités</th>
            <th className="px-4 py-3 font-medium">Min. achat</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 font-medium">Créé le</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {codes.map((c) => (
            <tr key={c.id} className="hover:bg-secondary/20">
              <td className="px-4 py-3 font-mono text-xs font-semibold">{c.code}</td>
              <td className="px-4 py-3 text-xs">{c.pseudo ?? "—"}</td>
              <td className="px-4 py-3">−{c.discount}€</td>
              <td className="px-4 py-3 font-semibold text-orange-400">−{c.pointsCost} PF</td>
              <td className="px-4 py-3 text-muted-foreground">{c.minAmount}€</td>
              <td className="px-4 py-3">
                {c.used ? (
                  <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                    Utilisé en caisse
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    Non utilisé
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`font-bold ${accent ? "text-accent" : "text-foreground"}`}>{value}</p>
    </div>
  )
}
