"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Mic, Square, X } from "lucide-react"

const MAX_SECONDS = 120

function pickMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mime: "", ext: "webm" }
  }
  const candidates: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/ogg", ext: "ogg" },
  ]
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c
    } catch {
      /* ignore */
    }
  }
  return { mime: "", ext: "webm" }
}

type Props = {
  disabled?: boolean
  /** Appelé avec le corps message prêt à envoyer, ex. [audio]url[/audio] */
  onSent: (body: string) => Promise<void>
  className?: string
  size?: "sm" | "md"
}

/**
 * Bouton micro : 1er clic = enregistre, 2e clic = stop + envoi.
 * Pendant l'enregistrement : pastille rouge + durée + annuler.
 */
export function VoiceNoteButton({ disabled, onSent, className = "", size = "md" }: Props) {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeRef = useRef({ mime: "", ext: "webm" })
  const cancelledRef = useRef(false)

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    setSupported(ok)
    if (ok) mimeRef.current = pickMimeType()
  }, [])

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const cleanupRecorder = () => {
    clearTimer()
    stopStream()
    mediaRecorderRef.current = null
    chunksRef.current = []
    setRecording(false)
    setSeconds(0)
  }

  const uploadAndSend = useCallback(
    async (blob: Blob) => {
      setUploading(true)
      setError(null)
      try {
        const { ext, mime } = mimeRef.current
        const type = blob.type || mime || "audio/webm"
        const file = new File([blob], `vocal-${Date.now()}.${ext}`, { type })
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/messages/upload", { method: "POST", body: fd })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d?.error ?? "Échec de l'envoi du vocal.")
        }
        const data = (await res.json()) as { url: string; type: string }
        await onSent(`[audio]${data.url}[/audio]`)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Envoi impossible.")
      } finally {
        setUploading(false)
      }
    },
    [onSent],
  )

  const stopRecording = useCallback(
    (cancel: boolean) => {
      cancelledRef.current = cancel
      const rec = mediaRecorderRef.current
      if (!rec || rec.state === "inactive") {
        cleanupRecorder()
        return
      }
      try {
        rec.stop()
      } catch {
        cleanupRecorder()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const startRecording = async () => {
    if (disabled || uploading || recording) return
    setError(null)
    cancelledRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream
      const { mime } = mimeRef.current
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      rec.onstop = async () => {
        clearTimer()
        stopStream()
        const wasCancelled = cancelledRef.current
        const chunks = [...chunksRef.current]
        mediaRecorderRef.current = null
        chunksRef.current = []
        setRecording(false)
        setSeconds(0)

        if (wasCancelled || chunks.length === 0) return

        const blob = new Blob(chunks, {
          type: rec.mimeType || mimeRef.current.mime || "audio/webm",
        })
        if (blob.size < 200) {
          setError("Enregistrement trop court.")
          return
        }
        await uploadAndSend(blob)
      }

      rec.start(250)
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1
          if (next >= MAX_SECONDS) {
            // Stop auto à la limite
            try {
              mediaRecorderRef.current?.stop()
            } catch {
              /* ignore */
            }
          }
          return next
        })
      }, 1000)
    } catch {
      stopStream()
      setError("Micro inaccessible. Autorise le micro dans ton navigateur.")
    }
  }

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      try {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop()
        }
      } catch {
        /* ignore */
      }
      cleanupRecorder()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!supported) return null

  const box =
    size === "sm"
      ? "h-10 w-10 rounded-xl"
      : "h-11 w-11 rounded-2xl"

  const fmt = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

  return (
    <div className={`relative flex items-center gap-1.5 ${className}`}>
      {recording && (
        <>
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-1 text-[11px] font-semibold tabular-nums text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {fmt}
          </span>
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-destructive"
            aria-label="Annuler l'enregistrement"
            title="Annuler"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => {
          if (recording) stopRecording(false)
          else void startRecording()
        }}
        className={`relative flex shrink-0 items-center justify-center border transition-colors disabled:opacity-40 ${box} ${
          recording
            ? "border-red-500/60 bg-red-500/20 text-red-400"
            : "border-border bg-background/60 text-muted-foreground hover:border-accent hover:text-accent"
        }`}
        aria-label={recording ? "Arrêter et envoyer le vocal" : "Enregistrer un message vocal"}
        title={recording ? "Arrêter et envoyer" : "Message vocal"}
      >
        {uploading ? (
          <Loader2 className={size === "sm" ? "h-4 w-4 animate-spin" : "h-5 w-5 animate-spin"} />
        ) : recording ? (
          <Square className={size === "sm" ? "h-3.5 w-3.5 fill-current" : "h-4 w-4 fill-current"} />
        ) : (
          <Mic className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
        )}
      </button>

      {error && (
        <span className="absolute bottom-full left-0 mb-1 max-w-[14rem] rounded-lg bg-destructive/90 px-2 py-1 text-[10px] text-white shadow-lg">
          {error}
        </span>
      )}
    </div>
  )
}
