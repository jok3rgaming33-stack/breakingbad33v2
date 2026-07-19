"use server"
import { NextRequest, NextResponse } from "next/server"
import { markNotificationRead } from "@/app/actions/notifications"

// Appelé par le Service Worker lors de la réception d'une push notification.
// POST { notificationId, customerToken }
export async function POST(req: NextRequest) {
  try {
    const { notificationId, customerToken } = await req.json()
    if (!notificationId || !customerToken) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    await markNotificationRead(Number(notificationId), String(customerToken))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
