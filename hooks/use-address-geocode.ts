"use client"

import { useEffect, useState } from "react"

export type GeoStatus = "idle" | "loading" | "done" | "error" | "notfound"

export type GeocodeResult = {
  geoStatus: GeoStatus
  distanceKm: number | null
  coords: { lat: number; lng: number } | null
  resolvedLabel: string | null
}

/** Géocode une adresse (BAN) avec debounce — calcule la distance depuis le point de départ. */
export function useAddressGeocode(address: string, enabled = true, delayMs = 650): GeocodeResult {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle")
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setGeoStatus("idle")
      setDistanceKm(null)
      setCoords(null)
      setResolvedLabel(null)
      return
    }
    const q = address.trim()
    if (q.length < 8) {
      setGeoStatus("idle")
      setDistanceKm(null)
      setCoords(null)
      setResolvedLabel(null)
      return
    }
    let cancelled = false
    setGeoStatus("loading")
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (cancelled) return
        if (res.ok && data.found) {
          setDistanceKm(Number(data.distanceKm))
          setCoords(
            typeof data.lat === "number" && typeof data.lng === "number"
              ? { lat: data.lat, lng: data.lng }
              : null,
          )
          setResolvedLabel(typeof data.label === "string" ? data.label : null)
          setGeoStatus("done")
        } else if (res.ok && data.found === false) {
          setDistanceKm(null)
          setCoords(null)
          setResolvedLabel(null)
          setGeoStatus("notfound")
        } else {
          setDistanceKm(null)
          setCoords(null)
          setResolvedLabel(null)
          setGeoStatus("error")
        }
      } catch {
        if (!cancelled) {
          setDistanceKm(null)
          setCoords(null)
          setResolvedLabel(null)
          setGeoStatus("error")
        }
      }
    }, delayMs)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [address, enabled, delayMs])

  return { geoStatus, distanceKm, coords, resolvedLabel }
}
