import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { isVendorAuthenticated } from "@/app/actions/vendor-auth"
import { getClientIp } from "@/lib/ip-check"
import { isRateLimited } from "@/lib/rate-limit"

// Upload messagerie : client (token compte) OU session vendeur/admin.
// Utilisée dans les commandes et discussions.

const AUDIO_EXTS = new Set(["webm", "ogg", "opus", "mp3", "m4a", "aac", "wav", "mpeg"])
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm"])
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"])

function extFromName(name: string | undefined): string | null {
  if (!name) return null
  const ext = name.split(".").pop()?.toLowerCase()
  if (!ext || ext.length > 5) return null
  return ext
}

/**
 * Détecte le kind même si le navigateur envoie un MIME vide / octet-stream
 * (fréquent sur iOS/Android pour les vocaux MediaRecorder).
 */
function detectKind(
  mime: string,
  filename: string,
): "image" | "video" | "audio" | null {
  const type = (mime || "").toLowerCase().split(";")[0].trim()
  const ext = extFromName(filename) ?? ""

  if (type.startsWith("audio/")) return "audio"
  if (type.startsWith("video/")) return "video"
  if (type.startsWith("image/")) return "image"

  // MIME manquant / application/octet-stream → extension
  if (ext === "webm") {
    // Les vocaux MediaRecorder sont en .webm audio ; les vidéos produit passent
    // rarement par cette route sans MIME video/.
    return "audio"
  }
  if (AUDIO_EXTS.has(ext)) return "audio"
  if (VIDEO_EXTS.has(ext)) return "video"
  if (IMAGE_EXTS.has(ext)) return "image"

  return null
}

/** Content-Type propre pour le stockage (sans ;codecs=...). */
function resolveContentType(
  kind: "image" | "video" | "audio",
  mime: string,
  ext: string,
): string {
  const base = (mime || "").split(";")[0].trim().toLowerCase()
  if (base && base !== "application/octet-stream") {
    if (kind === "audio" && (base.includes("mp4") || base.includes("m4a"))) return "audio/mp4"
    if (kind === "audio" && base.startsWith("audio/")) return base
    if (kind === "video" && base.startsWith("video/")) return base
    if (kind === "image" && base.startsWith("image/")) return base
  }
  if (kind === "audio") {
    if (ext === "m4a" || ext === "mp4") return "audio/mp4"
    if (ext === "ogg" || ext === "opus") return "audio/ogg"
    if (ext === "mp3" || ext === "mpeg") return "audio/mpeg"
    if (ext === "wav") return "audio/wav"
    if (ext === "aac") return "audio/aac"
    return "audio/webm"
  }
  if (kind === "video") {
    if (ext === "webm") return "video/webm"
    if (ext === "mov") return "video/quicktime"
    return "video/mp4"
  }
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  if (ext === "gif") return "image/gif"
  return "image/jpeg"
}

function resolveExt(
  kind: "image" | "video" | "audio",
  mime: string,
  fromName: string | null,
): string {
  if (kind === "audio") {
    const m = mime.toLowerCase()
    // Priorité au MIME réel (évite .webm nommé pour du mp4 iOS)
    if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a"
    if (m.includes("ogg")) return "ogg"
    if (m.includes("mpeg") || m.includes("mp3")) return "mp3"
    if (m.includes("wav")) return "wav"
    if (m.includes("webm")) return "webm"
    if (fromName && AUDIO_EXTS.has(fromName)) return fromName === "opus" ? "ogg" : fromName
    return "webm"
  }
  if (fromName) return fromName
  if (kind === "video") return "mp4"
  return "jpg"
}

async function isAuthorizedUploader(formData: FormData): Promise<boolean> {
  if (await isVendorAuthenticated()) return true
  if (await isAdminAuthenticated()) return true
  const token = String(formData.get("token") ?? "").trim()
  if (!token || token.length < 20) return false
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.token, token)).limit(1)
  return rows.length > 0
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = (await getClientIp()) || "unknown"
    if (isRateLimited(`msg-upload:${ip}`, 40, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Trop d'envois. Réessaie plus tard." }, { status: 429 })
    }

    const formData = await request.formData()
    if (!(await isAuthorizedUploader(formData))) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
    }

    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 })
    }

    const kind = detectKind(file.type, file.name)
    if (!kind) {
      return NextResponse.json(
        { error: "Format non supporté (image, vidéo ou audio)." },
        { status: 400 },
      )
    }

    // ~10 Mo max (vocaux longs + photos)
    const MAX_BYTES = 10 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 })
    }

    // Vocaux quasi vides (souvent un bug micro mobile)
    if (kind === "audio" && file.size < 200) {
      return NextResponse.json(
        { error: "Enregistrement audio trop court ou vide." },
        { status: 400 },
      )
    }

    const fromName = extFromName(file.name)
    const ext = resolveExt(kind, file.type, fromName)
    const contentType = resolveContentType(kind, file.type, ext)
    const safeName = `messages/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(safeName, file, {
      access: "private",
      contentType,
    })

    return NextResponse.json({ url: blob.url, type: kind })
  } catch (error) {
    console.error("[messages/upload] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Echec de l'envoi." },
      { status: 500 },
    )
  }
}
