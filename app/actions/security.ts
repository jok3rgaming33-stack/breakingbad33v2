"use server"

import { verifyTurnstile } from "@/lib/turnstile"

// Vérifie côté serveur un token Cloudflare Turnstile.
// À appeler AVANT toute action sensible (connexion / création de compte).
export async function verifyHuman(token: string): Promise<{ ok: boolean; error?: string }> {
  const ok = await verifyTurnstile(token)
  if (!ok) return { ok: false, error: "Vérification anti-robot échouée. Réessaie." }
  return { ok: true }
}
