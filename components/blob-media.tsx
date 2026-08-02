"use client"

import { useEffect, useState, type VideoHTMLAttributes, type ImgHTMLAttributes, type AudioHTMLAttributes } from "react"

/**
 * Retourne l'URL originale stockée dans le paramètre ?url= si c'est déjà
 * une URL proxy, sinon retourne l'URL telle quelle.
 */
function resolveOriginalUrl(url: string): string {
  if (url.startsWith("/api/media?")) {
    try {
      return new URLSearchParams(url.slice(url.indexOf("?"))).get("url") ?? url
    } catch {
      return url
    }
  }
  return url
}

/**
 * Convertit une URL Vercel Blob privée en URL proxy (/api/media?url=...).
 * Les URLs déjà proxifiées ou non-Blob sont retournées telles quelles.
 */
export function toProxyUrl(url: string | null | undefined): string {
  if (!url) return ""
  // Déjà proxifiée
  if (url.startsWith("/api/media?")) return url
  // URL Blob privée → proxy
  if (url.includes(".blob.vercel-storage.com")) {
    return `/api/media?url=${encodeURIComponent(url)}`
  }
  return url
}

/**
 * Détecte si une URL pointe vers une vidéo en testant l'extension
 * sur l'URL originale (avant proxy).
 */
export function isVideoUrl(url: string): boolean {
  const original = resolveOriginalUrl(url)
  // webm peut être audio ou vidéo — on ne force vidéo que pour les extensions clairement vidéo
  // Les vocaux sont toujours en balise [audio], pas via isVideoUrl.
  return /\.(mp4|mov|quicktime|m4v)(\?|$)/i.test(original) ||
    (/\.webm(\?|$)/i.test(original) && !/\/messages\//i.test(original) && !/audio/i.test(original))
}

export function isAudioUrl(url: string): boolean {
  const original = resolveOriginalUrl(url)
  return /\.(webm|ogg|opus|mp3|m4a|aac|wav|mpeg)(\?|$)/i.test(original) &&
    !/\.(mp4|mov|m4v)(\?|$)/i.test(original)
}

/** Devine un type MIME audio pour l'attribut type du <source>. */
function guessAudioMime(url: string): string | undefined {
  const original = resolveOriginalUrl(url).split("?")[0].toLowerCase()
  if (original.endsWith(".m4a") || original.endsWith(".mp4")) return "audio/mp4"
  if (original.endsWith(".webm")) return "audio/webm"
  if (original.endsWith(".ogg") || original.endsWith(".opus")) return "audio/ogg"
  if (original.endsWith(".mp3") || original.endsWith(".mpeg")) return "audio/mpeg"
  if (original.endsWith(".wav")) return "audio/wav"
  if (original.endsWith(".aac")) return "audio/aac"
  return undefined
}

type BlobImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined
}

/** <img> avec passage automatique par le proxy pour les fichiers Blob privés */
export function BlobImg({ src, alt = "", ...props }: BlobImgProps) {
  if (!src) return null
  return <img src={toProxyUrl(src)} alt={alt} {...props} />
}

type BlobVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string | null | undefined
}

/** <video> avec passage automatique par le proxy pour les fichiers Blob privés */
export function BlobVideo({ src, ...props }: BlobVideoProps) {
  if (!src) return null
  return <video src={toProxyUrl(src)} {...props} />
}

type BlobAudioProps = Omit<AudioHTMLAttributes<HTMLAudioElement>, "src"> & {
  src: string | null | undefined
}

/**
 * <audio> via le proxy Blob privé.
 * - type MIME explicite pour aider Safari/iOS
 * - message d'erreur si le navigateur ne peut pas décoder (ex: webm sur iOS)
 */
export function BlobAudio({ src, className, ...props }: BlobAudioProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src) return null
  const proxied = toProxyUrl(src)
  const mime = guessAudioMime(src)

  if (failed) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-red-300/90">
          Lecture impossible sur ce navigateur. Ouvre le lien ou réessaie sur Chrome.
        </p>
        <a
          href={proxied}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium underline opacity-80 hover:opacity-100"
        >
          Télécharger le vocal
        </a>
      </div>
    )
  }

  return (
    <audio
      controls
      playsInline
      preload="metadata"
      className={className}
      onError={() => setFailed(true)}
      {...props}
    >
      {mime ? <source src={proxied} type={mime} /> : null}
      <source src={proxied} />
    </audio>
  )
}

/**
 * Composant universel image OU vidéo.
 * - Si `mediaType` est fourni, il est utilisé directement (fiable).
 * - Sinon, détection par l'extension de l'URL (fallback).
 * Passe automatiquement par le proxy Blob privé.
 */
export function BlobMedia({
  src,
  alt = "",
  className,
  mediaType,
  videoProps,
}: {
  src: string | null | undefined
  alt?: string
  className?: string
  mediaType?: "image" | "video"
  videoProps?: Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "className">
}) {
  if (!src) return null
  const proxied = toProxyUrl(src)
  const isVideo = mediaType === "video" || (mediaType === undefined && isVideoUrl(src))
  if (isVideo) {
    return (
      <video
        src={proxied}
        className={className}
        autoPlay
        muted
        loop
        playsInline
        {...videoProps}
      />
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={proxied} alt={alt} className={className} />
}
