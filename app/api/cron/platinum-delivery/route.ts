import { NextResponse } from "next/server"
import { processPlatinumFreeDeliveryNotifs } from "@/app/actions/platinum-delivery-notifs"
import { processSlotExpiryReminders } from "@/app/actions/slot-expiry-reminders"
import { unauthorizedCron } from "@/lib/cron-auth"

/**
 * Cron du matin : fenêtre Platine, puis rappel des tours et bons
 * qui expirent dans les 36 h. Le rappel reste dans cette passe
 * pour ne pas ajouter un troisième cron.
 * Auth obligatoire en prod : Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const denied = unauthorizedCron(req)
  if (denied) return denied

  let slotExpiry: { users: number; spins: number; vouchers: number } | null = null
  try {
    slotExpiry = await processSlotExpiryReminders()
  } catch (e) {
    console.error("[cron/platinum-delivery] slot-expiry", e)
  }

  try {
    const result = await processPlatinumFreeDeliveryNotifs()
    return NextResponse.json({ ok: true, ...result, slotExpiry })
  } catch (e) {
    console.error("[cron/platinum-delivery]", e)
    return NextResponse.json({ ok: false, error: "failed", slotExpiry }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}
