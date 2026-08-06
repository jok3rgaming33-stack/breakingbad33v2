import { NextRequest, NextResponse } from "next/server"
import {
  verifyNowPaymentsIpn,
  fetchNowPaymentsPaymentStatus,
} from "@/lib/nowpayments"
import { applyCryptoIpnPayload } from "@/app/actions/crypto-payment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Webhook IPN NOWPayments (XMR).
 * 1) Signature HMAC si secret/public key configuré
 * 2) Sinon (ou en secours) : relecture GET /payment/{id} avec l'API key
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const sig =
      request.headers.get("x-nowpayments-sig") ||
      request.headers.get("x-nowpayments-signature")

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 })
    }

    const verify = verifyNowPaymentsIpn(rawBody, sig)

    if (verify === "invalid") {
      // Signature présente mais fausse → on tente quand même la relecture API (secret mal collé)
      console.warn("[crypto/ipn] signature mismatch — fallback API status check")
    }

    if (verify !== "ok") {
      const paymentId = String(payload.payment_id ?? payload.id ?? "")
      if (!paymentId) {
        return NextResponse.json(
          { ok: false, error: verify === "no_secret" ? "no secret and no payment_id" : "invalid signature" },
          { status: 401 },
        )
      }
      const live = await fetchNowPaymentsPaymentStatus(paymentId)
      if (!live.ok) {
        console.error("[crypto/ipn] API fallback failed:", live.error)
        return NextResponse.json({ ok: false, error: live.error }, { status: 401 })
      }
      // Fusionne le statut officiel API (source de confiance)
      payload = { ...payload, ...live.data }
    }

    const result = await applyCryptoIpnPayload(payload)
    if (!result.ok) {
      console.error("[crypto/ipn] apply failed:", result.error)
      return NextResponse.json({ ok: false, error: result.error })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[crypto/ipn] error:", e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "crypto-ipn-xmr",
    project: "breakingbad33v2",
    note: "IPN Secret optionnel : sans secret, le statut est revérifié via API key.",
  })
}
