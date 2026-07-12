"use client"

import { useState, useMemo } from "react"
import type { LoginLogRow } from "@/app/actions/login-logs"
import { listLoginLogs } from "@/app/actions/login-logs"
import { Monitor, Smartphone, Search, RefreshCw, MapPin, Globe, Clock, User } from "lucide-react"

function parseDevice(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Inconnu", mobile: false }
  const mobile = /mobile|android|iphone|ipad/i.test(ua)
  const browser =
    /Firefox\//.test(ua) ? "Firefox" :
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" :
    /OPR\/|Opera\//.test(ua) ? "Opera" : "Navigateur"
  const os =
    /Windows/.test(ua) ? "Windows" :
    /Macintosh|Mac OS/.test(ua) ? "macOS" :
    /iPhone/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Android/.test(ua) ? "Android" :
    /Linux/.test(ua) ? "Linux" : "OS inconnu"
  return { label: `${browser} / ${os}`, mobile }
}

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

export function AdminLoginLogs({ initialLogs }: { initialLogs: LoginLogRow[] }) {
  const [logs, setLogs] = useState<LoginLogRow[]>(initialLogs)
  const [search, setSearch] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return logs
    return logs.filter(
      (l) =>
        l.pseudo.toLowerCase().includes(q) ||
        (l.ip ?? "").includes(q) ||
        (l.city ?? "").toLowerCase().includes(q) ||
        (l.country ?? "").toLowerCase().includes(q) ||
        (l.userToken ?? "").toLowerCase().includes(q),
    )
  }, [logs, search])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const fresh = await listLoginLogs(200)
      setLogs(fresh)
    } finally {
      setRefreshing(false)
    }
  }

  // Stats rapides
  const uniqueTokens = new Set(logs.map((l) => l.userToken)).size
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayCount = logs.filter((l) => new Date(l.createdAt) >= today).length

  return (
    <div className="space-y-6">
      {/* Header + stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Journal des connexions</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {logs.length} connexion{logs.length > 1 ? "s" : ""} enregistrée{logs.length > 1 ? "s" : ""} — {uniqueTokens} membre{uniqueTokens > 1 ? "s" : ""} distinct{uniqueTokens > 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          Actualiser
        </button>
      </div>

      {/* Cartes stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total connexions", value: logs.length, icon: Clock },
          { label: "Aujourd'hui", value: todayCount, icon: Clock },
          { label: "Membres distincts", value: uniqueTokens, icon: User },
          { label: "Pays détectés", value: new Set(logs.map(l => l.countryCode).filter(Boolean)).size, icon: Globe },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          placeholder="Rechercher par pseudo, IP, ville, pays..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
        />
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card py-16 text-center">
          <p className="font-medium">Aucune connexion trouvée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search ? "Modifie ta recherche." : "Les connexions apparaîtront ici dès qu'un client se connecte."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Date / Heure</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Membre</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">IP</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Localisation</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Appareil</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => {
                const { label: device, mobile } = parseDevice(log.userAgent)
                const location = [log.city, log.country].filter(Boolean).join(", ") || "—"
                return (
                  <tr
                    key={log.id}
                    className={`border-b border-border transition-colors last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-card"}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{log.pseudo}</div>
                      <div className="mt-0.5 max-w-[160px] truncate font-mono text-xs text-muted-foreground" title={log.userToken}>
                        {log.userToken.slice(0, 16)}…
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {log.ip ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {log.country ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span>{location}</span>
                          {log.countryCode && (
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono uppercase">
                              {log.countryCode}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        {mobile ? (
                          <Smartphone className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        ) : (
                          <Monitor className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        )}
                        <span className="text-xs">{device}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Affichage limité aux 200 dernières connexions.
      </p>
    </div>
  )
}
