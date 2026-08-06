import { NextRequest, NextResponse } from "next/server"
import { verifyNowPaymentsIpn } from "@/lib/nowpayments"
import { applyCryptoIpnPayload } from "@/app/actions/crypto-payment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Webhook IPN NOWPayments (XMR). */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const sig =
      request.headers.get("x-nowpayments-sig") ||
      request.headers.get("x-nowpayments-signature")

    if (!verifyNowPaymentsIpn(rawBody, sig)) {
      console.error("[crypto/ipn] signature invalide")
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 })
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 })
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
  return NextResponse.json({ ok: true, service: "crypto-ipn-xmr", project: "breakingbad33v2" })
}
