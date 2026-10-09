import { NextResponse } from "next/server"

// Clé publique uniquement. Le service worker s'en sert si iOS change l'abonnement
// pendant que l'application est fermée.
export function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return NextResponse.json({ ok: false }, { status: 404 })
  return NextResponse.json({ publicKey })
}
