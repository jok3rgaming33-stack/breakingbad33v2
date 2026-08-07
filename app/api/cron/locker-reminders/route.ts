import { NextResponse } from "next/server"
import { processLockerReminders } from "@/app/actions/locker-reminders"

/**
 * Cron Vercel : rappels locker.
 * Sécurisé par CRON_SECRET (header Authorization: Bearer …)
 * ou en dev sans secret.
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
    const result = await processLockerReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("[cron/locker-reminders]", e)
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}
