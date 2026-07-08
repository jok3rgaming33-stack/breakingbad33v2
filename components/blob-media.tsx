"use client"

import { type VideoHTMLAttributes, type ImgHTMLAttributes } from "react"

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
  return /\.(mp4|webm|mov|quicktime|m4v|ogg)(\?|$)/i.test(original)
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
