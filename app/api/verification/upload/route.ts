import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Upload privé d'un média de vérification (photo ou vidéo selfie).
// Authentifié par la clé secrète du client (doit correspondre à un compte existant).
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const token = String(formData.get("token") ?? "").trim()
    const kind = String(formData.get("kind") ?? "").trim() // 'photo' | 'video'

    if (!file) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 })
    if (!token || (kind !== "photo" && kind !== "video")) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 })
    }

    // Vérifie que le token correspond à un compte réel.
    const account = await db.select({ id: users.id }).from(users).where(eq(users.token, token)).limit(1)
    if (account.length === 0) {
      return NextResponse.json({ error: "Compte introuvable." }, { status: 401 })
    }

    // Limite de taille raisonnable (photo 10 Mo, vidéo 50 Mo).
    const maxBytes = kind === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "Fichier trop volumineux." }, { status: 413 })
    }

    const ext = kind === "video" ? "webm" : "jpg"
    const safeToken = token.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)
    const pathname = `verifications/${safeToken}/${kind}-${Date.now()}.${ext}`

    const blob = await put(pathname, file, { access: "private", addRandomSuffix: true })

    // On ne renvoie jamais l'URL privée : seul le pathname sert à servir le fichier.
    return NextResponse.json({ pathname: blob.pathname })
  } catch (error) {
    console.error("[v0] verification upload error:", error)
    return NextResponse.json({ error: "Échec de l'envoi." }, { status: 500 })
  }
}
