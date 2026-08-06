"use server"

import { db } from "@/lib/db"
import { orderThreads, threadMessages, appSettings } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer, notifyVendor } from "@/lib/push"
import {
  createNowPaymentsXmrPayment,
  isNowPaymentsConfigured,
  mapNowPaymentsStatus,
  FIXED_PAY_CURRENCY,
} from "@/lib/nowpayments"

export type CryptoGatewayPublicStatus = {
  enabled: boolean
  provider: "nowpayments" | null
  configured: boolean
  currency: "xmr"
  message: string
}

const SETTINGS_KEY = "crypto_gateway_xmr"

type GatewaySettings = { enabled: boolean }
const DEFAULT_SETTINGS: GatewaySettings = { enabled: true }

async function ensurePaymentColumns() {
  try {
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_provider TEXT`)
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_provider_id TEXT`)
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_status TEXT`)
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_crypto TEXT`)
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_amount_crypto TEXT`)
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_amount_eur INTEGER`)
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_pay_url TEXT`)
    await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_pay_address TEXT`)
  } catch (e) {
    console.error("[crypto] ensure columns:", e)
  }
}

async function readGatewaySettings(): Promise<GatewaySettings> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).limit(1)
    if (!rows[0]) return { ...DEFAULT_SETTINGS }
    const v = rows[0].value as Partial<GatewaySettings>
    return { enabled: v.enabled !== false }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function getCryptoGatewayStatus(): Promise<CryptoGatewayPublicStatus> {
  const configured = isNowPaymentsConfigured()
  const settings = await readGatewaySettings()
  const enabled = configured && settings.enabled
  return {
    enabled,
    provider: configured ? "nowpayments" : null,
    configured,
    currency: "xmr",
    message: !configured
      ? "NOWPayments non configuré (variables d'env manquantes). Le site fonctionne sans gateway."
      : !settings.enabled
        ? "Gateway XMR configuré mais désactivé dans l'admin."
        : "Paiement Monero (XMR) via NOWPayments actif.",
  }
}

export async function setCryptoGatewayEnabled(enabled: boolean) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  try {
    await db
      .insert(appSettings)
      .values({ key: SETTINGS_KEY, value: { enabled }, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: { enabled }, updatedAt: new Date() },
      })
    revalidatePath("/admin")
    return { ok: true as const, enabled }
  } catch (e) {
    console.error("[crypto] set enabled:", e)
    return { ok: false as const, error: "Impossible d'enregistrer." }
  }
}

function siteBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/\/$/, "")
  if (fromEnv) return fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
  return "https://breakingbad33v2.vercel.app"
}

/**
 * Crée un paiement XMR NOWPayments pour une commande BB33.
 * Non bloquant : en cas d'échec la commande reste valide.
 */
export async function createXmrPaymentForOrder(input: {
  threadId: number
  totalEur: number
  customerToken?: string | null
  customerName: string
}): Promise<
  | {
      ok: true
      payUrl: string | null
      payAddress: string | null
      payAmount: string | null
      providerId: string
      paymentStatus: string
    }
  | { ok: false; error: string; skipped?: boolean }
> {
  const status = await getCryptoGatewayStatus()
  if (!status.enabled) {
    return { ok: false, error: "Gateway inactif.", skipped: true }
  }

  await ensurePaymentColumns()

  const base = siteBaseUrl()
  const created = await createNowPaymentsXmrPayment({
    priceAmount: input.totalEur,
    orderId: `bb33-${input.threadId}`,
    description: `BreakingBad33 #${input.threadId} — ${input.customerName}`,
    ipnCallbackUrl: `${base}/api/crypto/ipn`,
    successUrl: `${base}/?paid=1&order=${input.threadId}`,
    cancelUrl: `${base}/?paid=0&order=${input.threadId}`,
  })

  if (!created.ok) return { ok: false, error: created.error }

  const p = created.payment
  try {
    await db.execute(sql`
      UPDATE order_threads SET
        payment_provider = 'nowpayments',
        payment_provider_id = ${p.paymentId},
        payment_status = 'awaiting',
        payment_crypto = ${FIXED_PAY_CURRENCY},
        payment_amount_crypto = ${p.payAmount},
        payment_amount_eur = ${Math.round(input.totalEur)},
        payment_pay_url = ${p.payUrl},
        payment_pay_address = ${p.payAddress},
        updated_at = NOW()
      WHERE id = ${input.threadId}
    `)
  } catch (e) {
    console.error("[crypto] update order payment fields:", e)
  }

  try {
    const lines = [
      `💳 Paiement Monero (XMR) — Commande #${input.threadId}`,
      ``,
      `Total à régler : ${Math.round(input.totalEur)} €`,
      `Crypto : Monero (XMR) uniquement`,
    ]
    if (p.payAmount) {
      lines.push(`Montant XMR : ${p.payAmount} XMR`)
    }
    if (p.payAddress) {
      lines.push(``, `Adresse de paiement XMR :`, p.payAddress)
    }
    if (p.payUrl) {
      lines.push(``, `Lien de paiement :`, p.payUrl)
    }
    lines.push(
      ``,
      `⚠️ Envoie UNIQUEMENT du XMR sur cette adresse.`,
      `Le statut sera mis à jour automatiquement après réception des fonds.`,
      `En cas de souci, réponds ici.`,
    )
    await db.insert(threadMessages).values({
      threadId: input.threadId,
      sender: "vendeur",
      body: lines.join("\n"),
    })
  } catch (e) {
    console.error("[crypto] payment message:", e)
  }

  return {
    ok: true,
    payUrl: p.payUrl,
    payAddress: p.payAddress,
    payAmount: p.payAmount,
    providerId: p.paymentId,
    paymentStatus: "awaiting",
  }
}

export async function applyCryptoIpnPayload(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  await ensurePaymentColumns()

  const orderIdRaw = String(payload.order_id ?? "")
  const match = orderIdRaw.match(/bb33-(\d+)/i)
  let threadId = match ? parseInt(match[1], 10) : NaN

  if (!Number.isFinite(threadId)) {
    const paymentId = String(payload.payment_id ?? payload.invoice_id ?? payload.id ?? "")
    if (!paymentId) return { ok: false, error: "order_id manquant" }
    try {
      const rows = await db.execute(sql`
        SELECT id FROM order_threads
        WHERE payment_provider_id = ${paymentId}
        LIMIT 1
      `)
      const id = (rows as { rows?: { id: number }[] }).rows?.[0]?.id
      if (!id) return { ok: false, error: "commande introuvable" }
      threadId = id
    } catch {
      return { ok: false, error: "lookup failed" }
    }
  }

  return applyStatusToThread(threadId, payload)
}

async function applyStatusToThread(
  threadId: number,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const npStatus = String(payload.payment_status ?? payload.status ?? "")
  const mapped = mapNowPaymentsStatus(npStatus)
  const payCurrency = payload.pay_currency
    ? String(payload.pay_currency).toLowerCase()
    : FIXED_PAY_CURRENCY
  const payAmount = payload.pay_amount != null ? String(payload.pay_amount) : null
  const providerPaymentId = payload.payment_id != null ? String(payload.payment_id) : null
  const payAddress = payload.pay_address != null ? String(payload.pay_address) : null

  try {
    await db.execute(sql`
      UPDATE order_threads SET
        payment_status = ${mapped},
        payment_crypto = COALESCE(${payCurrency}, payment_crypto),
        payment_amount_crypto = COALESCE(${payAmount}, payment_amount_crypto),
        payment_provider_id = COALESCE(${providerPaymentId}, payment_provider_id),
        payment_pay_address = COALESCE(${payAddress}, payment_pay_address),
        updated_at = NOW()
      WHERE id = ${threadId}
    `)
  } catch (e) {
    console.error("[crypto] IPN update:", e)
    return { ok: false, error: "update failed" }
  }

  if (mapped === "confirmed") {
    try {
      const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId)).limit(1)
      await db.insert(threadMessages).values({
        threadId,
        sender: "vendeur",
        body: `✅ Paiement Monero (XMR) reçu. Merci ! Ta commande va être traitée.`,
      })
      if (thread?.customerToken) {
        await notifyCustomer(thread.customerToken, {
          title: `Commande #${threadId} — Paiement XMR reçu`,
          body: "Ton paiement Monero a été confirmé.",
          url: "/",
          tag: `crypto-paid-${threadId}`,
        })
      }
      await notifyVendor({
        title: `Paiement XMR #${threadId}`,
        body: "Monero confirmé",
        url: "/admin",
        tag: `crypto-${threadId}`,
      })
    } catch (e) {
      console.error("[crypto] IPN notify:", e)
    }
  }

  revalidatePath("/admin")
  revalidatePath("/messagerie")
  return { ok: true }
}
