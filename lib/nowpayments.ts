/**
 * Client NOWPayments — BreakingBad33 : paiement XMR uniquement.
 * Désactivé si NOWPAYMENTS_API_KEY absent → le site continue sans gateway.
 */

import { createHmac } from "crypto"

const API_BASE = (process.env.NOWPAYMENTS_API_URL || "https://api.nowpayments.io/v1").replace(/\/$/, "")

/** Crypto forcée côté BB33 */
export const FIXED_PAY_CURRENCY = "xmr" as const

export function isNowPaymentsConfigured(): boolean {
  return Boolean(process.env.NOWPAYMENTS_API_KEY?.trim())
}

function apiKey(): string {
  return process.env.NOWPAYMENTS_API_KEY?.trim() || ""
}

function ipnSecret(): string {
  // IPN Secret (recommandé) ou clé publique dashboard (fallback si pas de secret dédié)
  return (
    process.env.NOWPAYMENTS_IPN_SECRET?.trim() ||
    process.env.NOWPAYMENTS_PUBLIC_KEY?.trim() ||
    ""
  )
}

export type NowPaymentsXmrPayment = {
  paymentId: string
  /** URL page paiement NOWPayments si fournie */
  payUrl: string | null
  payAddress: string | null
  payAmount: string | null
  payCurrency: string
  orderId: string
  priceAmount: number
}

export type CreateXmrPaymentInput = {
  priceAmount: number
  orderId: string
  description?: string
  ipnCallbackUrl: string
  successUrl?: string
  cancelUrl?: string
}

/**
 * Crée un paiement NOWPayments en Monero uniquement (pay_currency=xmr).
 * Utilise /v1/payment pour forcer XMR (pas de multi-crypto côté client).
 */
export async function createNowPaymentsXmrPayment(
  input: CreateXmrPaymentInput,
): Promise<{ ok: true; payment: NowPaymentsXmrPayment } | { ok: false; error: string }> {
  if (!isNowPaymentsConfigured()) {
    return { ok: false, error: "NOWPayments non configuré." }
  }
  const amount = Number(input.priceAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Montant invalide." }
  }

  try {
    const body: Record<string, unknown> = {
      price_amount: Math.round(amount * 100) / 100,
      price_currency: "eur",
      pay_currency: FIXED_PAY_CURRENCY,
      order_id: String(input.orderId),
      order_description: (input.description || `Commande ${input.orderId}`).slice(0, 200),
      ipn_callback_url: input.ipnCallbackUrl,
    }
    if (input.successUrl) body.success_url = input.successUrl
    if (input.cancelUrl) body.cancel_url = input.cancelUrl

    const res = await fetch(`${API_BASE}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey(),
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : `NOWPayments HTTP ${res.status}`
      console.error("[nowpayments] XMR payment error:", res.status, data)
      return { ok: false, error: msg }
    }

    const paymentId = String(data.payment_id ?? data.id ?? "")
    if (!paymentId) {
      console.error("[nowpayments] unexpected payment payload:", data)
      return { ok: false, error: "Réponse payment incomplète." }
    }

    const payUrl =
      (typeof data.invoice_url === "string" && data.invoice_url) ||
      (typeof data.payment_url === "string" && data.payment_url) ||
      null
    const payAddress = typeof data.pay_address === "string" ? data.pay_address : null
    const payAmount =
      data.pay_amount != null ? String(data.pay_amount) : data.amount != null ? String(data.amount) : null

    return {
      ok: true,
      payment: {
        paymentId,
        payUrl,
        payAddress,
        payAmount,
        payCurrency: FIXED_PAY_CURRENCY,
        orderId: String(input.orderId),
        priceAmount: amount,
      },
    }
  } catch (e) {
    console.error("[nowpayments] createXmrPayment:", e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau NOWPayments." }
  }
}

function sortObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj
  const rec = obj as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(rec).sort()) {
    sorted[key] = sortObject(rec[key])
  }
  return sorted
}

export type IpnVerifyResult = "ok" | "invalid" | "no_secret"

/**
 * Vérifie la signature IPN (HMAC-SHA512).
 * - ok : signature valide
 * - no_secret : pas de secret configuré → le routeur peut valider via GET /payment/{id}
 * - invalid : secret présent mais signature fausse
 */
export function verifyNowPaymentsIpn(
  rawBody: string,
  signatureHeader: string | null,
): IpnVerifyResult {
  const secret = ipnSecret()
  if (!secret) return "no_secret"
  if (!signatureHeader) return "invalid"
  try {
    const parsed = JSON.parse(rawBody) as unknown
    const sorted = sortObject(parsed)
    const payload = JSON.stringify(sorted)
    const hmac = createHmac("sha512", secret).update(payload).digest("hex")
    return hmac === signatureHeader ? "ok" : "invalid"
  } catch (e) {
    console.error("[nowpayments] IPN verify parse error:", e)
    return "invalid"
  }
}

/** Relit le statut d'un paiement côté API (auth x-api-key) — fallback si IPN non signé. */
export async function fetchNowPaymentsPaymentStatus(
  paymentId: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  if (!isNowPaymentsConfigured() || !paymentId) {
    return { ok: false, error: "missing api key or payment id" }
  }
  try {
    const res = await fetch(`${API_BASE}/payment/${encodeURIComponent(paymentId)}`, {
      headers: { "x-api-key": apiKey() },
      cache: "no-store",
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.message === "string" ? data.message : `HTTP ${res.status}`,
      }
    }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" }
  }
}

export function mapNowPaymentsStatus(raw: string | undefined | null): string {
  const s = (raw || "").toLowerCase()
  if (s === "finished" || s === "confirmed") return "confirmed"
  if (s === "partially_paid") return "partial"
  if (s === "failed" || s === "refunded" || s === "expired") return "failed"
  if (s === "waiting" || s === "sending" || s === "confirming") return "awaiting"
  return s || "awaiting"
}
