"use client"

import { Star } from "lucide-react"
import { BlobImg, BlobVideo, BlobAudio, isVideoUrl } from "@/components/blob-media"

/**
 * Parse le corps d'un message et retourne un tableau de segments :
 * - texte brut
 * - image [image]url[/image]
 * - vidéo [video]url[/video]
 * - audio [audio]url[/audio]
 */
type Segment =
  | { type: "text"; value: string }
  | { type: "image"; url: string }
  | { type: "video"; url: string }
  | { type: "audio"; url: string }

export function parseMessageBody(body: string): Segment[] {
  const segments: Segment[] = []
  const RE =
    /\[image]([\s\S]*?)\[\/image]|\[video]([\s\S]*?)\[\/video]|\[audio]([\s\S]*?)\[\/audio]/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      const txt = body.slice(lastIndex, match.index).trim()
      if (txt) segments.push({ type: "text", value: txt })
    }
    if (match[1] !== undefined) {
      const url = match[1].trim()
      if (url) segments.push({ type: isVideoUrl(url) ? "video" : "image", url })
    } else if (match[2] !== undefined) {
      const url = match[2].trim()
      if (url) segments.push({ type: "video", url })
    } else if (match[3] !== undefined) {
      const url = match[3].trim()
      if (url) segments.push({ type: "audio", url })
    }
    lastIndex = RE.lastIndex
  }

  if (lastIndex < body.length) {
    const txt = body.slice(lastIndex).trim()
    if (txt) segments.push({ type: "text", value: txt })
  }

  if (segments.length === 0 && body.trim()) {
    segments.push({ type: "text", value: body })
  }

  return segments
}

// Tag spécial inséré automatiquement lors du passage au statut "livree".
export const RATING_TAG = "[NOTER_PRODUITS]"

/** Détecte le tag de notation même avec espaces / position variable. */
export function hasRatingInviteTag(body: string | null | undefined): boolean {
  if (!body) return false
  return body.includes(RATING_TAG)
}

function stripRatingTag(body: string): string {
  return body.replace(RATING_TAG, "").trimStart()
}

/**
 * Rendu d'un corps de message (texte + image / vidéo / vocal).
 * Si le corps contient [NOTER_PRODUITS], le bouton « Noter mes produits » est
 * TOUJOURS affiché (aperçu admin inclus). Clic actif uniquement si
 * `onRateProducts` est fourni (espace client).
 */
export function MessageBody({ body, onRateProducts }: { body: string; onRateProducts?: () => void }) {
  const raw = body ?? ""
  const isRatingMessage = hasRatingInviteTag(raw)
  const cleanBody = isRatingMessage ? stripRatingTag(raw) : raw

  const segments = parseMessageBody(cleanBody)

  return (
    <div className="flex flex-col gap-2">
      {isRatingMessage && (
        <button
          type="button"
          disabled={!onRateProducts}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRateProducts?.()
          }}
          className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400/70 bg-amber-400/20 px-4 py-3 text-sm font-bold text-amber-100 shadow-sm transition ${
            onRateProducts
              ? "hover:bg-amber-400/30 active:scale-[0.98] cursor-pointer"
              : "cursor-default opacity-90"
          }`}
        >
          <Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
          Noter mes produits
        </button>
      )}
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <p
              key={i}
              className="whitespace-pre-wrap break-all leading-relaxed text-sm"
            >
              {seg.value}
            </p>
          )
        }

        if (seg.type === "image") {
          return (
            <div key={i} className="w-full overflow-hidden rounded-xl bg-secondary/40">
              <BlobImg
                src={seg.url}
                alt="Pièce jointe"
                className="max-h-[60dvh] w-full object-contain"
              />
            </div>
          )
        }

        if (seg.type === "video") {
          return (
            <div key={i} className="w-full overflow-hidden rounded-xl bg-black">
              <BlobVideo
                src={seg.url}
                controls
                playsInline
                preload="metadata"
                className="max-h-[60dvh] w-full object-contain"
              />
            </div>
          )
        }

        if (seg.type === "audio") {
          return (
            <div
              key={i}
              className="flex w-full min-w-[14rem] max-w-full flex-col gap-1.5 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <BlobAudio
                src={seg.url}
                className="w-full max-w-full"
              />
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
