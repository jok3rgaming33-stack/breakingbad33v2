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
  return process.env.NOWPAYMENTS_IPN_SECRET?.trim() || ""
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

export function verifyNowPaymentsIpn(rawBody: string, signatureHeader: string | null): boolean {
  const secret = ipnSecret()
  if (!secret) {
    console.error("[nowpayments] IPN secret manquant — IPN rejeté")
    return false
  }
  if (!signatureHeader) return false
  try {
    const parsed = JSON.parse(rawBody) as unknown
    const sorted = sortObject(parsed)
    const payload = JSON.stringify(sorted)
    const hmac = createHmac("sha512", secret).update(payload).digest("hex")
    return hmac === signatureHeader
  } catch (e) {
    console.error("[nowpayments] IPN verify parse error:", e)
    return false
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
