import { NextResponse } from "next/server"
import { processLockerReminders } from "@/app/actions/locker-reminders"
import { unauthorizedCron } from "@/lib/cron-auth"

/**
 * Cron Vercel : rappels locker.
 * Auth obligatoire en prod : Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const denied = unauthorizedCron(req)
  if (denied) return denied


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
