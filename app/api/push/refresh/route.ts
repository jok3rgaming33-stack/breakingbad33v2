import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { pushSubscriptions } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ensurePushOriginColumn, safePushOrigin } from "@/lib/push"

// Le téléphone a changé d'adresse push tout seul. On reporte le rôle
// (client / vendeur) de l'ancienne adresse vers la nouvelle.
// Sans l'ancienne adresse, on ne crée rien : ça éviterait d'inscrire un inconnu comme vendeur.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const oldEndpoint = typeof body.oldEndpoint === "string" ? body.oldEndpoint : ""
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : ""
    const p256dh = body.keys?.p256dh
    const auth = body.keys?.auth
    if (!oldEndpoint || !endpoint || typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    if (!endpoint.startsWith("https://") || p256dh.length > 256 || auth.length > 256) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    await ensurePushOriginColumn()

    const [existing] = await db
      .select({
        role: pushSubscriptions.role,
        customerToken: pushSubscriptions.customerToken,
        origin: pushSubscriptions.origin,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, oldEndpoint))
      .limit(1)
    if (!existing) return NextResponse.json({ ok: false }, { status: 404 })

    if (oldEndpoint !== endpoint) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, oldEndpoint))
    }
    await db
      .insert(pushSubscriptions)
      .values({
        endpoint,
        p256dh,
        auth,
        role: existing.role,
        customerToken: existing.customerToken,
        origin: safePushOrigin(typeof body.origin === "string" ? body.origin : null) || existing.origin,
        expiredAt: null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh,
          auth,
          role: existing.role,
          customerToken: existing.customerToken,
          origin: safePushOrigin(typeof body.origin === "string" ? body.origin : null) || existing.origin,
          expiredAt: null,
        },
      })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
