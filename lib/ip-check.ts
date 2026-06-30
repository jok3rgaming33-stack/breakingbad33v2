import "server-only"
import { headers } from "next/headers"

// Récupère l'IP réelle du client depuis les en-têtes de la requête.
export async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return h.get("x-real-ip")?.trim() || null
}

// Interroge proxycheck.io pour savoir si une IP est un VPN/proxy.
// En cas d'erreur réseau ou de clé absente, on NE bloque PAS (fail-open) pour
// éviter de rejeter des clients légitimes à cause d'une panne externe.
export async function isVpnOrProxy(ip: string | null): Promise<boolean> {
  if (!ip) return false
  // IPs locales/privées : jamais considérées comme VPN (utile en dev).
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.")
  ) {
    return false
  }

  const key = process.env.PROXYCHECK_API_KEY
  if (!key) return false

  try {
    const res = await fetch(`https://proxycheck.io/v2/${ip}?key=${key}&vpn=1&risk=1`, {
      // Pas de cache : on veut une réponse fraîche par IP.
      cache: "no-store",
    })
    if (!res.ok) return false
    const data = (await res.json()) as Record<string, any>
    const entry = data[ip]
    if (!entry || typeof entry !== "object") return false
    // proxycheck renvoie proxy: "yes"/"no" et type (VPN, TOR, etc.).
    return entry.proxy === "yes"
  } catch (err) {
    console.log("[v0] proxycheck error:", err)
    return false
  }
}
