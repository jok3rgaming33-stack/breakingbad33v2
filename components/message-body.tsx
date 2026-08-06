"use client"

import { Star, Mic } from "lucide-react"
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
const RATING_TAG = "[NOTER_PRODUITS]"

/**
 * Rendu d'un corps de message (texte + image / vidéo / vocal).
 * Accepte un callback optionnel `onRateProducts` : quand le corps contient
 * le tag [NOTER_PRODUITS], un bouton s'affiche à la place du tag.
 */
export function MessageBody({ body, onRateProducts }: { body: string; onRateProducts?: () => void }) {
  // Tag notation : remplacer par bouton si callback fourni
  const cleanBody = body.startsWith(RATING_TAG)
    ? body.slice(RATING_TAG.length).trimStart()
    : body

  const isRatingMessage = body.startsWith(RATING_TAG)

  const segments = parseMessageBody(cleanBody)

  return (
    <div className="flex flex-col gap-2">
      {isRatingMessage && onRateProducts && (
        <button
          onClick={onRateProducts}
          className="mt-1 flex items-center gap-2 self-start rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/20 active:scale-95"
        >
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
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
            >
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                <Mic className="h-3 w-3" aria-hidden="true" />
                Message vocal
              </div>
              <BlobAudio
                src={seg.url}
                className="w-full max-w-full"
                style={{ minHeight: 40 }}
              />
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
