"use client"

import { BlobImg, BlobVideo, isVideoUrl, toProxyUrl } from "@/components/blob-media"

/**
 * Parse le corps d'un message et retourne un tableau de segments :
 * - texte brut
 * - image (balise [image]url[/image] ou URL nue reconnue comme image)
 * - vidéo (balise [video]url[/video] ou URL nue reconnue comme vidéo)
 *
 * Les URLs dans [image] ou [video] passent automatiquement par le proxy Blob.
 */
type Segment =
  | { type: "text"; value: string }
  | { type: "image"; url: string }
  | { type: "video"; url: string }

export function parseMessageBody(body: string): Segment[] {
  const segments: Segment[] = []
  // Regex qui capture [image]...[/image] et [video]...[/video]
  const RE = /\[image]([\s\S]*?)\[\/image]|\[video]([\s\S]*?)\[\/video]/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = RE.exec(body)) !== null) {
    // Texte avant la balise
    if (match.index > lastIndex) {
      const txt = body.slice(lastIndex, match.index).trim()
      if (txt) segments.push({ type: "text", value: txt })
    }
    if (match[1] !== undefined) {
      // [image]url[/image]
      const url = match[1].trim()
      if (url) segments.push({ type: isVideoUrl(url) ? "video" : "image", url })
    } else if (match[2] !== undefined) {
      // [video]url[/video]
      const url = match[2].trim()
      if (url) segments.push({ type: "video", url })
    }
    lastIndex = RE.lastIndex
  }

  // Texte restant après la dernière balise
  if (lastIndex < body.length) {
    const txt = body.slice(lastIndex).trim()
    if (txt) segments.push({ type: "text", value: txt })
  }

  // Si aucune balise n'a été trouvée, retourne le corps entier comme texte
  if (segments.length === 0 && body.trim()) {
    segments.push({ type: "text", value: body })
  }

  return segments
}

/**
 * Rendu d'un corps de message avec support des pièces jointes image/vidéo.
 *
 * - Le texte respecte les sauts de ligne et les longs tokens se coupent (break-all).
 * - Les images s'affichent en pleine largeur sans dépasser le conteneur parent,
 *   avec object-contain pour ne jamais recadrer le contenu.
 * - Les vidéos s'affichent avec les contrôles natifs, bornées en hauteur.
 *
 * Usage : <MessageBody body={m.body} />
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
            // max-w-full + w-full garantissent que l'image ne déborde jamais.
            // object-contain affiche l'image entière sans la recadrer.
            // max-h-[60dvh] évite qu'une image portrait prenne toute la hauteur d'écran.
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

        return null
      })}
    </div>
  )
}
