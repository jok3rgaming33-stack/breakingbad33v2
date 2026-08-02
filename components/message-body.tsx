"use client"

import { Mic } from "lucide-react"
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

/**
 * Rendu d'un corps de message (texte + image / vidéo / vocal).
 */
export function MessageBody({ body }: { body: string }) {
  const segments = parseMessageBody(body)

  return (
    <div className="flex flex-col gap-2">
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
