"use client"

import { useState, useTransition, useCallback } from "react"
import { TrendingUp, TrendingDown, Package, Euro, ShoppingCart, RefreshCw, Check, Loader2 } from "lucide-react"
import type { ProfitSummary, ProductProfitRow } from "@/app/actions/profit"
import { getProfitData, saveProductCost } from "@/app/actions/profit"

type Period = "all" | "month" | "week"

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "€"
}

function StatCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold ${positive === true ? "text-accent" : positive === false ? "text-destructive" : "text-foreground"}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

function CostInput({ row, onSaved }: { row: ProductProfitRow; onSaved: (id: number, cost: number) => void }) {
  const [val, setVal] = useState(row.costPrice > 0 ? String(row.costPrice) : "")
  const [saving, startSave] = useTransition()
  const [saved, setSaved] = useState(false)

  const handleSave = useCallback(() => {
    const cost = parseFloat(val.replace(",", ".")) || 0
    startSave(async () => {
      await saveProductCost(row.id, cost)
      onSaved(row.id, cost)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    })
  }, [val, row.id, onSaved])

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={val}
          onChange={e => { setVal(e.target.value); setSaved(false) }}
          onKeyDown={e => { if (e.key === "Enter") handleSave() }}
          placeholder="0"
          className="w-24 rounded-xl border border-border bg-background pl-7 pr-2 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          aria-label={`Prix d'achat pour ${row.title}`}
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity hover:opacity-80 disabled:opacity-40"
        aria-label="Enregistrer"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

const PERIOD_LABELS: Record<Period, string> = { all: "Tout", month: "Ce mois", week: "Cette semaine" }

export function AdminProfit({ initialData }: { initialData: ProfitSummary }) {
  const [period, setPeriod] = useState<Period>("all")
  const [data, setData] = useState<ProfitSummary>(initialData)
  const [loading, startTransition] = useTransition()
  const [costOverrides, setCostOverrides] = useState<Map<number, number>>(new Map())

  const reload = useCallback((p: Period) => {
    setPeriod(p)
    startTransition(async () => {
      let startDate: Date | undefined
      const now = new Date()
      if (p === "week") {
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 7)
      } else if (p === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      }
      const fresh = await getProfitData(startDate)
      setData(fresh)
      setCostOverrides(new Map())
    })
  }, [])

  const handleCostSaved = useCallback((id: number, cost: number) => {
    setCostOverrides(prev => new Map(prev).set(id, cost))
    setData(prev => {
      const updated = prev.products.map(p => {
        if (p.id !== id) return p
        const newCost = cost
        const netProfit = Math.round(p.revenue - newCost * p.unitsSold)
        return { ...p, costPrice: newCost, netProfit }
      })
      const totalCost = updated.reduce((s, r) => s + r.costPrice * r.unitsSold, 0)
      const totalNetProfit = Math.round(prev.totalRevenue - totalCost)
      return { ...prev, products: updated, totalCost, totalNetProfit }
    })
  }, [])

  const rows = data.products

  return (
    <div className="flex flex-col gap-6">
      {/* Header + filtre période */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Profits &amp; Bénéfices</h2>
          <p className="text-sm text-muted-foreground text-pretty">Saisir le prix d&apos;achat de chaque produit pour calculer le bénéfice net.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => reload(p)}
              disabled={loading}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${period === p ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => reload(period)}
            disabled={loading}
            className="ml-1 rounded-lg p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Cartes synthèse */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Chiffre d'affaires" value={fmt(data.totalRevenue)} sub={PERIOD_LABELS[period]} />
        <StatCard label="Coût total" value={fmt(data.totalCost)} sub="Prix d'achat × unités" positive={false} />
        <StatCard
          label="Bénéfice net"
          value={fmt(data.totalNetProfit)}
          sub={data.totalNetProfit >= 0 ? "Positif" : "Déficit"}
          positive={data.totalNetProfit >= 0}
        />
        <StatCard
          label="Produits suivis"
          value={String(rows.filter(r => r.costPrice > 0).length) + " / " + rows.length}
          sub="avec prix d'achat"
        />
      </div>

      {/* Tableau produits */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Produit</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Prix d&apos;achat</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Unités vendues</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">CA</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Coût</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Bénéfice net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cost = row.costPrice * row.unitsSold
              const isProfit = row.netProfit >= 0
              return (
                <tr key={row.id} className={`border-b border-border/50 transition-colors hover:bg-secondary/20 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium text-foreground">{row.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CostInput row={row} onSaved={handleCostSaved} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${row.unitsSold > 0 ? "bg-accent/10 text-accent" : "text-muted-foreground"}`}>
                      <ShoppingCart className="h-3 w-3" aria-hidden="true" />
                      {row.unitsSold}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{fmt(row.revenue)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.costPrice > 0 ? fmt(cost) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {row.costPrice > 0 ? (
                      <span className={`inline-flex items-center gap-1 font-bold ${isProfit ? "text-accent" : "text-destructive"}`}>
                        {isProfit ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
                        {fmt(row.netProfit)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Saisir un coût</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pied de page total */}
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
              <Euro className="h-5 w-5 text-accent" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bénéfice net total — {PERIOD_LABELS[period]}</p>
              <p className={`text-3xl font-bold ${data.totalNetProfit >= 0 ? "text-accent" : "text-destructive"}`}>
                {fmt(data.totalNetProfit)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-right text-sm">
            <span className="text-muted-foreground">CA : <span className="font-semibold text-foreground">{fmt(data.totalRevenue)}</span></span>
            <span className="text-muted-foreground">Coûts : <span className="font-semibold text-destructive">−{fmt(data.totalCost)}</span></span>
            <span className="text-muted-foreground">Marge : <span className="font-semibold text-foreground">
              {data.totalRevenue > 0 ? Math.round((data.totalNetProfit / data.totalRevenue) * 100) + "%" : "—"}
            </span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
