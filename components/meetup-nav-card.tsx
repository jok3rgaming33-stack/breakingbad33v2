"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MapPin, Navigation, Radio, Clock } from "lucide-react"
import { pingMeetupLocation, notifyMeetupEta } from "@/app/actions/meetup"
import { mapsNavUrl, wazeNavUrl } from "@/lib/meetup-nav"

type Props = {
  threadId: number
  customerToken: string
  address: string
  lat?: number | null
  lng?: number | null
  status: string
}

export function MeetupNavCard({ threadId, customerToken, address, lat, lng, status }: Props) {
  const active = status === "pret_meetup"
  const [sharing, setSharing] = useState(false)
  const [shareErr, setShareErr] = useState<string | null>(null)
  const [lastOk, setLastOk] = useState<Date | null>(null)
  const [etaBusy, setEtaBusy] = useState(false)
  const [etaSent, setEtaSent] = useState(false)
  const [etaErr, setEtaErr] = useState<string | null>(null)
  const watchRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation?.clearWatch(watchRef.current)
      watchRef.current = null
    }
    setSharing(false)
  }, [])

  useEffect(() => {
    if (!active) stop()
    return () => stop()
  }, [active, stop])

  const startShare = () => {
    if (!navigator.geolocation) {
      setShareErr("La géolocalisation n'est pas dispo sur cet appareil.")
      return
    }
    setShareErr(null)
    setSharing(true)
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        void pingMeetupLocation(threadId, customerToken, pos.coords.latitude, pos.coords.longitude).then(
          (res) => {
            if (res.ok) setLastOk(new Date())
          },
        )
      },
      (err) => {
        setShareErr(
          err.code === 1
            ? "Autorise la position dans ton navigateur pour le suivi live."
            : "Impossible de lire ta position.",
        )
        stop()
      },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20_000 },
    )
  }

  const waze = wazeNavUrl(address, lat, lng)
  const maps = mapsNavUrl(address, lat, lng)

  return (
    <div className="rounded-2xl border border-accent/35 bg-accent/10 px-4 py-3.5">
      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span>Point de rendez-vous</span>
      </p>
      <p className="mt-1 pl-6 text-sm text-foreground/90">{address}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={waze}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#33ccff] px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-[#0a2540]"
        >
          <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
          Waze
        </a>
        <a
          href={maps}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-900"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Maps
        </a>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        Lance le parcours jusqu&apos;au meet-up (GPS)
      </p>

      {active && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          <button
            type="button"
            disabled={etaBusy || etaSent}
            onClick={async () => {
              setEtaBusy(true)
              setEtaErr(null)
              try {
                const res = await notifyMeetupEta(threadId, customerToken, 10)
                if (!res.ok) {
                  setEtaErr(res.error)
                  return
                }
                setEtaSent(true)
              } finally {
                setEtaBusy(false)
              }
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-opacity ${
              etaSent
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
            }`}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {etaSent ? "Prévenu — tu es à 10 min" : etaBusy ? "Envoi…" : "Je suis à 10 min"}
          </button>
          {etaErr && <p className="text-[10px] text-destructive">{etaErr}</p>}

          <button
            type="button"
            onClick={() => (sharing ? stop() : startShare())}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
              sharing
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                : "border-border bg-background/50 text-foreground hover:border-accent"
            }`}
          >
            {sharing ? (
              <>
                <Radio className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
                Position partagée — toucher pour arrêter
              </>
            ) : (
              <>Partager ma position (live)</>
            )}
          </button>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            Optionnel. Le chimiste voit si tu t&apos;approches. Ça s&apos;arrête à la remise du colis, ou
            quand tu coupes.
          </p>
          {lastOk && sharing && (
            <p className="mt-1 text-[10px] text-emerald-400/90">
              Envoyé {lastOk.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          )}
          {shareErr && <p className="mt-1 text-[10px] text-destructive">{shareErr}</p>}
        </div>
      )}
    </div>
  )
}
