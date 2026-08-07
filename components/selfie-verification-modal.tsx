"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ShieldCheck,
  Camera,
  RefreshCw,
  Video,
  Square,
  Upload,
  Check,
  Loader2,
  AlertTriangle,
  CircleDot,
  SwitchCamera,
  FlipHorizontal2,
} from "lucide-react"

export type VerificationMetadata = { siteName: string; recordedAt: string }

type Props = {
  // Appelé une fois toutes les étapes validées. Doit gérer l'upload / la persistance.
  onComplete: (photoFile: File, videoFile: File, metadata: VerificationMetadata) => Promise<void> | void
  submitting?: boolean
  submitError?: string | null
}

const SITE_NAME = "BreakingBad33"
const MIN_SECONDS = 5
const MAX_SECONDS = 10

type CamDevice = { deviceId: string; label: string }

function nowLabel() {
  return new Date().toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop()
    } catch {
      /* ignore */
    }
  })
}

function labelForDevice(d: MediaDeviceInfo, index: number): string {
  const raw = (d.label || "").trim()
  if (raw) return raw
  // Labels vides tant que l'utilisateur n'a pas autorisé la caméra
  return `Caméra ${index + 1}`
}

export function SelfieVerificationModal({ onComplete, submitting = false, submitError = null }: Props) {
  // Médias
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Caméra
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [devices, setDevices] = useState<CamDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")

  // Enregistrement vidéo
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  // Métadonnées + anti-bypass
  const [siteName, setSiteName] = useState(SITE_NAME)
  const [recordedAt, setRecordedAt] = useState("")
  const [mathA] = useState(() => Math.floor(Math.random() * 6) + 4) // 4..9
  const [mathB] = useState(() => Math.floor(Math.random() * 4) + 2) // 2..5
  const [mathAnswer, setMathAnswer] = useState("")
  const [confirmed, setConfirmed] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const selectedDeviceIdRef = useRef<string | null>(null)
  const facingModeRef = useRef<"user" | "environment">("user")

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId
  }, [selectedDeviceId])
  useEffect(() => {
    facingModeRef.current = facingMode
  }, [facingMode])

  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return
      const list = await navigator.mediaDevices.enumerateDevices()
      const cams = list
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: labelForDevice(d, i) }))
      setDevices(cams)
      return cams
    } catch (e) {
      console.error("[kyc] enumerateDevices:", e)
      return [] as CamDevice[]
    }
  }, [])

  /**
   * Démarre un flux caméra.
   * - deviceId prioritaire si fourni
   * - sinon facingMode (user / environment)
   * - fallback large si la caméra demandée échoue
   */
  const startCamera = useCallback(
    async (opts?: { deviceId?: string | null; facing?: "user" | "environment" }) => {
      if (recording) return
      setCameraBusy(true)
      setCameraError(null)

      // Stoppe l'ancien flux avant d'en ouvrir un nouveau
      stopStream(streamRef.current)
      streamRef.current = null
      setStream(null)
      setCameraReady(false)

      const wantDeviceId = opts?.deviceId !== undefined ? opts.deviceId : selectedDeviceIdRef.current
      const wantFacing = opts?.facing ?? facingModeRef.current

      const tryGet = async (constraints: MediaStreamConstraints) => {
        return navigator.mediaDevices.getUserMedia(constraints)
      }

      const attempts: MediaStreamConstraints[] = []

      if (wantDeviceId) {
        attempts.push({
          video: {
            deviceId: { exact: wantDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        })
        // Fallback sans exact si le device a disparu
        attempts.push({
          video: {
            deviceId: { ideal: wantDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        })
      }

      attempts.push({
        video: {
          facingMode: { ideal: wantFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      })
      // Autre face si la première échoue (selfie HS → caméra arrière)
      attempts.push({
        video: {
          facingMode: { ideal: wantFacing === "user" ? "environment" : "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      })
      // Dernier recours : n'importe quelle caméra + micro optionnel
      attempts.push({
        video: true,
        audio: true,
      })
      attempts.push({
        video: true,
        audio: false,
      })

      let lastErr: unknown = null
      let got: MediaStream | null = null

      for (const c of attempts) {
        try {
          got = await tryGet(c)
          break
        } catch (err) {
          lastErr = err
        }
      }

      if (!got) {
        console.error("[kyc] camera error:", lastErr)
        setCameraError(
          "Impossible d'accéder à la caméra. Autorise caméra/micro dans le navigateur, change de caméra, ou importe des fichiers.",
        )
        setCameraReady(false)
        setCameraBusy(false)
        return
      }

      streamRef.current = got
      setStream(got)
      setCameraReady(true)
      setCameraBusy(false)

      // Déduit deviceId / facing du track actif
      const vTrack = got.getVideoTracks()[0]
      const settings = vTrack?.getSettings?.() ?? {}
      if (settings.deviceId) {
        setSelectedDeviceId(settings.deviceId)
        selectedDeviceIdRef.current = settings.deviceId
      }
      if (settings.facingMode === "user" || settings.facingMode === "environment") {
        setFacingMode(settings.facingMode)
        facingModeRef.current = settings.facingMode
      }

      // Re-scan des labels (disponibles après permission)
      await refreshDevices()
    },
    [recording, refreshDevices],
  )

  // Montage initial
  useEffect(() => {
    void startCamera({ facing: "user" })
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      stopStream(streamRef.current)
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Attache le stream au video caché (capture photo)
  useEffect(() => {
    if (liveVideoRef.current && stream) {
      liveVideoRef.current.srcObject = stream
      liveVideoRef.current.play().catch(() => {})
    }
  }, [stream])

  // Nettoyage des object URLs
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [photoUrl, videoUrl])

  const switchToDevice = async (deviceId: string) => {
    if (recording || cameraBusy) return
    setSelectedDeviceId(deviceId)
    selectedDeviceIdRef.current = deviceId
    await startCamera({ deviceId })
  }

  const flipFacing = async () => {
    if (recording || cameraBusy) return
    const next = facingMode === "user" ? "environment" : "user"
    setFacingMode(next)
    facingModeRef.current = next
    // Si plusieurs devices, bascule vers le suivant
    if (devices.length > 1 && selectedDeviceId) {
      const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId)
      const nextDev = devices[(idx + 1) % devices.length]
      if (nextDev) {
        await switchToDevice(nextDev.deviceId)
        return
      }
    }
    // Sinon facingMode seul (mobile)
    setSelectedDeviceId(null)
    selectedDeviceIdRef.current = null
    await startCamera({ deviceId: null, facing: next })
  }

  // --- Photo ---
  const capturePhoto = () => {
    const video = liveVideoRef.current
    if (!video || !cameraReady) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 720
    canvas.height = video.videoHeight || 960
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], "selfie-photo.jpg", { type: "image/jpeg" })
        if (photoUrl) URL.revokeObjectURL(photoUrl)
        setPhotoFile(file)
        setPhotoUrl(URL.createObjectURL(file))
      },
      "image/jpeg",
      0.9,
    )
  }

  const onPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
    e.target.value = ""
  }

  const retakePhoto = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoFile(null)
    setPhotoUrl(null)
  }

  // --- Vidéo ---
  const startRecording = () => {
    const s = streamRef.current
    if (!s || recording) return
    chunksRef.current = []
    const mime =
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : ""
    let recorder: MediaRecorder
    try {
      recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s)
    } catch (err) {
      console.error("[kyc] recorder error:", err)
      setCameraError("L'enregistrement vidéo n'est pas supporté sur ce navigateur. Importe une vidéo.")
      return
    }
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" })
      const file = new File([blob], "selfie-video.webm", { type: "video/webm" })
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      setVideoFile(file)
      setVideoUrl(URL.createObjectURL(file))
      setRecordedAt(nowLabel())
      setSiteName(SITE_NAME)
    }
    recorder.start()
    setRecording(true)
    setSeconds(0)
    timerRef.current = setInterval(() => {
      setSeconds((s0) => {
        const next = s0 + 1
        if (next >= MAX_SECONDS) {
          // Arrêt auto à MAX_SECONDS (via timeout pour éviter setState imbriqué)
          window.setTimeout(() => {
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
            const r = recorderRef.current
            if (r && r.state !== "inactive") r.stop()
            setRecording(false)
          }, 0)
        }
        return next
      })
    }, 1000)
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") recorder.stop()
    setRecording(false)
  }

  const retakeVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoFile(null)
    setVideoUrl(null)
    setSeconds(0)
  }

  const onVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setRecordedAt(nowLabel())
    setSiteName(SITE_NAME)
    e.target.value = ""
  }

  // --- Validation ---
  const mathOk = mathAnswer.trim() !== "" && Number(mathAnswer) === mathA + mathB
  const canSubmit =
    !!photoFile &&
    !!videoFile &&
    mathOk &&
    confirmed &&
    siteName.trim() !== "" &&
    recordedAt.trim() !== "" &&
    !submitting

  const handleSubmit = async () => {
    if (!canSubmit || !photoFile || !videoFile) return
    await onComplete(photoFile, videoFile, { siteName: siteName.trim(), recordedAt: recordedAt.trim() })
  }

  const canSwitchCamera = !recording && !cameraBusy && (devices.length > 1 || cameraReady)

  return (
    <div
      className="fixed inset-0 z-[200] flex justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Vérification d'identité obligatoire"
    >
      <div className="my-auto w-full max-w-lg rounded-3xl border border-accent/30 bg-card p-6 shadow-2xl">
        {/* En-tête */}
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-bold leading-tight text-balance">
              Vérification d&apos;identité obligatoire
            </h2>
            <p className="text-xs text-muted-foreground">Requise pour ta première commande</p>
          </div>
        </div>

        <p className="mb-5 rounded-2xl border border-accent/20 bg-accent/5 p-4 text-sm leading-relaxed text-pretty text-muted-foreground">
          Cette vérification d&apos;identité est obligatoire pour ta première commande. Elle permet de garantir la
          sécurité de nos livreurs et de nous protéger contre les tentatives d&apos;agression, de vol ou tout autre
          incident. Tes données ne seront conservées que le temps de valider ta première livraison et seront ensuite
          supprimées.
        </p>

        {/* Sélecteur de caméra */}
        <div className="mb-5 rounded-2xl border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Caméra</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void flipFacing()}
                disabled={!canSwitchCamera}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-40"
                title="Changer de caméra (avant / arrière ou suivante)"
              >
                <SwitchCamera className="h-3.5 w-3.5" aria-hidden="true" />
                Changer
              </button>
              <button
                type="button"
                onClick={() => void startCamera()}
                disabled={recording || cameraBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-40"
                title="Relancer la caméra"
              >
                {cameraBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Relancer
              </button>
            </div>
          </div>

          {devices.length > 0 ? (
            <label className="block">
              <span className="mb-1 block text-[10px] text-muted-foreground">
                Choisis une caméra (utile si la selfie est HS)
              </span>
              <select
                value={selectedDeviceId ?? ""}
                disabled={recording || cameraBusy}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) void switchToDevice(id)
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent disabled:opacity-50"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                    {d.deviceId === selectedDeviceId ? " · active" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Mode actuel :{" "}
              <span className="font-semibold text-foreground">
                {facingMode === "user" ? "caméra avant (selfie)" : "caméra arrière"}
              </span>
              . Utilise « Changer » si l&apos;une des caméras ne fonctionne pas.
            </p>
          )}

          {cameraReady && (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400">
              <Check className="h-3 w-3" aria-hidden="true" />
              Caméra prête
              {facingMode === "environment" ? " · arrière" : " · avant"}
            </p>
          )}
        </div>

        {/* Video element pour capture photo (miroir optionnel géré sur preview) */}
        <video ref={liveVideoRef} muted playsInline className="hidden" />

        {cameraError && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-2">
              <span>{cameraError}</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void startCamera({ facing: "environment" })}
                  className="self-start rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-destructive/20"
                >
                  Essayer caméra arrière
                </button>
                <button
                  type="button"
                  onClick={() => void startCamera({ facing: "user" })}
                  className="self-start rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-destructive/20"
                >
                  Essayer caméra avant
                </button>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="self-start rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-destructive/20"
                >
                  Réessayer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Étape 1 : Photo */}
        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              1
            </span>
            Photo selfie
          </h3>
          {photoUrl ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl || "/placeholder.svg"}
                alt="Aperçu du selfie"
                className="aspect-[3/4] w-full object-cover"
              />
              <button
                type="button"
                onClick={retakePhoto}
                className="flex w-full items-center justify-center gap-2 bg-secondary py-2.5 text-sm font-medium text-secondary-foreground hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reprendre
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-background/40 p-4">
              <div className="mb-3 aspect-[3/4] w-full overflow-hidden rounded-xl bg-black/40">
                <LivePreview stream={stream} ready={cameraReady} mirror={facingMode === "user"} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={!cameraReady}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Prendre la photo
                </button>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-muted">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Importer
                  {/* Pas de capture="user" forcé : laisse le choix de la caméra système */}
                  <input type="file" accept="image/*" onChange={onPhotoUpload} className="hidden" />
                </label>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Caméra selfie HS ? Clique « Changer » ci-dessus, ou importe une photo depuis ta galerie.
              </p>
            </div>
          )}
        </section>

        {/* Étape 2 : Vidéo */}
        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              2
            </span>
            Vidéo selfie ({MIN_SECONDS}-{MAX_SECONDS}s)
          </h3>
          <p className="mb-3 rounded-xl border border-border bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
            Pendant l&apos;enregistrement, dis à voix haute&nbsp;: le nom du site (
            <strong className="text-foreground">{SITE_NAME}</strong>) ainsi que{" "}
            <strong className="text-foreground">la date et l&apos;heure</strong> actuelles.
          </p>

          {videoUrl ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <video src={videoUrl} controls playsInline className="aspect-[3/4] w-full bg-black object-cover" />
              <button
                type="button"
                onClick={retakeVideo}
                className="flex w-full items-center justify-center gap-2 bg-secondary py-2.5 text-sm font-medium text-secondary-foreground hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Réenregistrer
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-background/40 p-4">
              <div className="relative mb-3 aspect-[3/4] w-full overflow-hidden rounded-xl bg-black/40">
                <LivePreview stream={stream} ready={cameraReady} mirror={facingMode === "user"} />
                {recording && (
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">
                    <CircleDot className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
                    {seconds}s
                  </div>
                )}
              </div>
              {recording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={seconds < MIN_SECONDS}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  {seconds < MIN_SECONDS ? `Encore ${MIN_SECONDS - seconds}s…` : "Arrêter"}
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={!cameraReady}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    <Video className="h-4 w-4" aria-hidden="true" />
                    Démarrer l&apos;enregistrement
                  </button>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-muted">
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Importer
                    <input type="file" accept="video/*" onChange={onVideoUpload} className="hidden" />
                  </label>
                </div>
              )}
            </div>
          )}

          {videoFile && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Nom du site prononcé
                </span>
                <input
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Date et heure prononcées
                </span>
                <input
                  value={recordedAt}
                  onChange={(e) => setRecordedAt(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>
          )}
        </section>

        {/* Étape 3 : Vérification anti-bypass */}
        <section className="mb-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              3
            </span>
            Vérification de sécurité
          </h3>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-background/40 p-3">
            <span className="text-sm font-medium">
              Combien font {mathA} + {mathB} ?
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={mathAnswer}
              onChange={(e) => setMathAnswer(e.target.value)}
              className={`w-20 rounded-xl border bg-background/60 px-3 py-2 text-sm outline-none focus:border-accent ${
                mathAnswer && !mathOk ? "border-destructive" : "border-border"
              }`}
              aria-label="Réponse à l'opération"
            />
            {mathOk && <Check className="h-5 w-5 text-accent" aria-hidden="true" />}
          </label>
        </section>

        {/* Étape 4 : Confirmation */}
        <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background/40 p-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[var(--color-accent)]"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            Je confirme avoir réalisé cette vérification moi-même et avoir dit à voix haute le nom du site ainsi que la
            date et l&apos;heure pendant l&apos;enregistrement vidéo.
          </span>
        </label>

        {submitError && (
          <p className="mb-4 flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {submitError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-base font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Envoi en cours…
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              Valider mon identité
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function LivePreview({
  stream,
  ready,
  mirror = true,
}: {
  stream: MediaStream | null
  ready: boolean
  mirror?: boolean
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
      ref.current.play().catch(() => {})
    }
  }, [stream, ready])

  if (!ready || !stream) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-500">
        <FlipHorizontal2 className="h-8 w-8 opacity-40" aria-hidden="true" />
        <span className="text-xs">Caméra en attente…</span>
      </div>
    )
  }

  return (
    <video
      ref={ref}
      muted
      playsInline
      className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""}`}
    />
  )
}
