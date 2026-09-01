import { NextResponse } from "next/server"
import { processPlatinumFreeDeliveryNotifs } from "@/app/actions/platinum-delivery-notifs"

/**
 * Cron : notifications fenêtre Platine (démarrage + rappel J-7).
 * Auth : Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization") || ""
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

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
