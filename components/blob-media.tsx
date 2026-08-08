"use client"

import {
  useEffect,
  useRef,
  useState,
  type VideoHTMLAttributes,
  type ImgHTMLAttributes,
  type AudioHTMLAttributes,
} from "react"
import { Loader2, Pause, Play, Mic } from "lucide-react"

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
  return (
    /\.(mp4|mov|quicktime|m4v)(\?|$)/i.test(original) ||
    (/\.webm(\?|$)/i.test(original) &&
      !/\/messages\//i.test(original) &&
      !/audio/i.test(original))
  )
}

export function isAudioUrl(url: string): boolean {
  const original = resolveOriginalUrl(url)
  return (
    /\.(webm|ogg|opus|mp3|m4a|aac|wav|mpeg)(\?|$)/i.test(original) &&
    !/\.(mp4|mov|m4v)(\?|$)/i.test(original)
  )
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

function isLikelyIos(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  // iPhone / iPad / iPod, ou iPadOS desktop UA
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
  )
}

function isWebmUrl(url: string): boolean {
  return /\.webm(\?|$)/i.test(resolveOriginalUrl(url).split("?")[0] || "")
}

type BlobImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined
}

/** <img> avec passage automatique par le proxy pour les fichiers Blob privés */
export function BlobImg({ src, alt = "", ...props }: BlobImgProps) {
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element
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
 * Lecteur vocal custom (pas le <audio controls> natif qui pose problème sur mobile) :
 * - bouton Play/Pause avec stopPropagation (évite de fermer le fil / re-déclencher un deep-link)
 * - MIME explicite pour Safari
 * - détection webm + iOS (Safari ne décode pas webm/opus)
 * - src direct sur <audio> (meilleure compat Range/iOS que <source> seul)
 */
export function BlobAudio({ src, className, style, ...props }: BlobAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [iosWebmBlocked, setIosWebmBlocked] = useState(false)

  useEffect(() => {
    setFailed(false)
    setPlaying(false)
    setLoading(false)
    setProgress(0)
    setDuration(0)
    setIosWebmBlocked(!!src && isLikelyIos() && isWebmUrl(src))
  }, [src])

  if (!src) return null
  const proxied = toProxyUrl(src)
  const mime = guessAudioMime(src)

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return "0:00"
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, "0")}`
  }

  const togglePlay = async (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    // Empêche tout parent (liste de fils, deep-link, etc.) de capturer le geste
    e.preventDefault()
    e.stopPropagation()
    if (iosWebmBlocked || failed) return

    const el = audioRef.current
    if (!el) return

    try {
      if (el.paused) {
        setLoading(true)
        // load() avant play aide Safari quand le média n'est pas encore bufferisé
        if (el.readyState < 2) {
          el.load()
        }
        await el.play()
        setPlaying(true)
      } else {
        el.pause()
        setPlaying(false)
      }
    } catch (err) {
      console.warn("[BlobAudio] play failed:", err)
      setFailed(true)
      setPlaying(false)
    } finally {
      setLoading(false)
    }
  }

  if (iosWebmBlocked || failed) {
    return (
      <div
        className={`flex flex-col gap-1.5 ${className ?? ""}`}
        style={style}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] leading-snug text-amber-200/90">
          {iosWebmBlocked
            ? "Ce vocal (format WebM) ne peut pas être lu sur iPhone/iPad. Demande au vendeur de le renvoyer depuis un iPhone, ou ouvre le site sur Chrome Android / ordinateur."
            : "Lecture impossible sur ce navigateur."}
        </p>
        {!iosWebmBlocked && (
          <a
            href={proxied}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium underline opacity-80 hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            Télécharger le vocal
          </a>
        )}
      </div>
    )
  }

  return (
    <div
      className={`flex w-full items-center gap-2.5 ${className ?? ""}`}
      style={style}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={togglePlay}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90 active:scale-95"
        aria-label={playing ? "Pause" : "Lire le message vocal"}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 translate-x-0.5" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
          <Mic className="h-3 w-3" aria-hidden="true" />
          Vocal
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
            style={{
              width: duration > 0 ? `${Math.min(100, (progress / duration) * 100)}%` : "0%",
            }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] opacity-60 tabular-nums">
          <span>{formatTime(progress)}</span>
          <span>{duration > 0 ? formatTime(duration) : "—:——"}</span>
        </div>
      </div>

      {/* audio caché — piloté par le bouton (évite les bugs du contrôle natif iOS) */}
      <audio
        ref={audioRef}
        src={proxied}
        preload="metadata"
        playsInline
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setDuration(d)
        }}
        onError={() => {
          setFailed(true)
          setPlaying(false)
          setLoading(false)
        }}
        {...props}
      >
        {mime ? <source src={proxied} type={mime} /> : null}
      </audio>
    </div>
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
