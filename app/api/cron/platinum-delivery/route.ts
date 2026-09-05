import { NextResponse } from "next/server"
import { processPlatinumFreeDeliveryNotifs } from "@/app/actions/platinum-delivery-notifs"
import { unauthorizedCron } from "@/lib/cron-auth"

/**
 * Cron : notifications fenêtre Platine (démarrage + rappel J-7).
 * Auth obligatoire en prod : Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const denied = unauthorizedCron(req)
  if (denied) return denied


  try {
    const result = await processPlatinumFreeDeliveryNotifs()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("[cron/platinum-delivery]", e)
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}
