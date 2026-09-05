import { NextResponse } from "next/server"

/**
 * Protège les routes cron. En production le secret est obligatoire
 * (fail-closed). En local, pas de secret = autorisé pour le debug.
 */
export function unauthorizedCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim()
  const auth = req.headers.get("authorization") || ""
  const prod = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"

  if (!secret) {
    if (prod) {
      console.error("[cron] CRON_SECRET manquant — endpoint refusé.")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
  }

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
