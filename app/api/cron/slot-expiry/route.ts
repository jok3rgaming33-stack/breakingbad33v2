import { NextResponse } from "next/server"
import { processSlotExpiryReminders } from "@/app/actions/slot-expiry-reminders"
import { unauthorizedCron } from "@/lib/cron-auth"

/**
 * Cron : rappel ~24 h avant l'expiration des tours et bons non utilisés.
 * Auth obligatoire en prod : Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const denied = unauthorizedCron(req)
  if (denied) return denied

  try {
    const result = await processSlotExpiryReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("[cron/slot-expiry]", e)
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}
