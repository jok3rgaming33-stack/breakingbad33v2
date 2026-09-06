"use client"

import useSWR from "swr"
import { MapPin, Navigation, Radio } from "lucide-react"
import { getMeetupLive } from "@/app/actions/meetup"
import { formatAgeSec, formatDistanceKm, mapsNavUrl, wazeNavUrl } from "@/lib/meetup-nav"

export function MeetupLivePanel({
  threadId,
  address,
  lat,
  lng,
  active,
}: {
  threadId: number
  address?: string | null
  lat?: number | null
  lng?: number | null
  active: boolean
}) {
  const { data } = useSWR(
    active ? `meetup-live:${threadId}` : null,
    () => getMeetupLive(threadId),
    { refreshInterval: 8000, revalidateOnFocus: true },
  )

  const point = data?.address || address
  const plat = data?.lat ?? lat ?? null
  const plng = data?.lng ?? lng ?? null
  if (!point) return null

  const client = data?.client ?? null
  const dist = data?.distanceKm
  const fresh =
    client && Date.now() - new Date(client.at).getTime() < 90_000

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm">
      <p className="flex items-start gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 text-accent" aria-hidden="true" />
        RDV meet-up
      </p>
      <p className="mt-1 text-sm text-foreground">{point}</p>
      <div className="mt-2 flex gap-2">
        <a
          href={wazeNavUrl(point, plat, plng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#33ccff] px-2 py-1.5 text-[11px] font-bold text-[#0a2540]"
        >
          <Navigation className="h-3 w-3" aria-hidden="true" />
          Waze
        </a>
        <a
          href={mapsNavUrl(point, plat, plng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-900"
        >
          Maps
        </a>
      </div>
      {active && (
        <p className={`mt-2 flex items-center gap-1.5 text-xs ${fresh ? "text-emerald-400" : "text-muted-foreground"}`}>
          <Radio className={`h-3 w-3 ${fresh ? "animate-pulse" : ""}`} aria-hidden="true" />
          {client
            ? `Client ${fresh ? "en live" : "vu"} ${formatAgeSec(client.at)}${
                dist != null ? ` · ${formatDistanceKm(dist)} du RDV` : ""
              }`
            : "Le client n'a pas encore partagé sa position."}
        </p>
      )}
    </div>
  )
}
