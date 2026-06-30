import "server-only"

// Vérifie un token Cloudflare Turnstile côté serveur.
// Fail-open si la clé secrète n'est pas configurée (pour ne pas bloquer en dev).
export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // non configuré : on ne bloque pas
  if (!token) return false

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    })
    const data = (await res.json()) as { success?: boolean }
    return Boolean(data.success)
  } catch (err) {
    console.log("[v0] turnstile verify error:", err)
    // En cas de panne réseau côté serveur, on ne bloque pas l'accès légitime.
    return true
  }
}
