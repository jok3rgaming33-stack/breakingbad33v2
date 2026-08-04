"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SelfieVerificationModal } from "@/components/selfie-verification-modal"
import type { VerificationMetadata } from "@/components/selfie-verification-modal"
import { submitVerification } from "@/app/actions/verification"
import { getMyRecoveryStatus } from "@/app/actions/lost-key"
import { ShieldCheck, CheckCircle, MessageSquare, KeyRound } from "lucide-react"
import Link from "next/link"

export default function VerificationPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [fromRecovery, setFromRecovery] = useState(false)
  const [claimedPseudo, setClaimedPseudo] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setFromRecovery(params.get("from") === "recovery")
    const t = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!t) {
      router.replace("/")
      return
    }
    setToken(t)
    getMyRecoveryStatus(t)
      .then((s) => {
        if (s?.active) {
          setFromRecovery(true)
          setClaimedPseudo(s.claimedPseudo)
        }
      })
      .catch(() => {})
  }, [router])

  const handleComplete = async (photo: File, video: File, meta: VerificationMetadata) => {
    if (!token) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const upload = async (file: File, kind: "photo" | "video") => {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("token", token)
        fd.append("kind", kind)
        const res = await fetch("/api/verification/upload", { method: "POST", body: fd })
        if (!res.ok) throw new Error("upload failed")
        const data = (await res.json()) as { pathname: string }
        return data.pathname
      }
      const [photoPathname, videoPathname] = await Promise.all([
        upload(photo, "photo"),
        upload(video, "video"),
      ])
      const saved = await submitVerification({
        token,
        photoPathname,
        videoPathname,
        siteName: meta.siteName,
        recordedAt: meta.recordedAt,
      })
      if (!saved.ok) {
        setSubmitError(saved.error ?? "Échec de l'enregistrement. Réessaie.")
        return
      }
      setDone(true)
    } catch {
      setSubmitError("Échec de l'envoi des fichiers. Vérifie ta connexion et réessaie.")
    } finally {
      setSubmitting(false)
    }
  }

  if (token === null) return null

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-accent">
          <CheckCircle className="h-8 w-8" aria-hidden="true" />
        </span>
        <div>
          <h1 className="mb-2 text-2xl font-bold text-foreground">
            {fromRecovery ? "KYC envoyé — en attente admin" : "Vérification soumise"}
          </h1>
          <p className="text-muted-foreground text-pretty max-w-md mx-auto">
            {fromRecovery ? (
              <>
                Ta vérification d&apos;identité a bien été envoyée
                {claimedPseudo ? ` pour le compte « ${claimedPseudo} »` : ""}. L&apos;admin peut
                valider en direct. En attendant, tu peux <strong>écrire et recevoir des réponses</strong>{" "}
                dans la messagerie.
              </>
            ) : (
              <>
                Ta vérification a bien été envoyée. Elle sera examinée prochainement.
                <br />
                Tu peux retourner sur le site et passer ta commande.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {fromRecovery && (
            <Link
              href="/?open=messaging"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
            >
              <MessageSquare className="h-4 w-4" />
              Ouvrir la messagerie
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-border px-6 py-3 text-sm font-semibold"
          >
            Retour au site
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {fromRecovery && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-amber-100">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <strong>Récupération de compte</strong>
                {claimedPseudo ? ` — ${claimedPseudo}` : ""}. Selfie + courte vidéo, puis
                l&apos;admin valide. La messagerie reste ouverte.
              </p>
            </div>
            <Link
              href="/?open=messaging"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-100"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Messagerie
            </Link>
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold text-center">
          {fromRecovery ? "Vérification d'identité (récupération)" : "Vérification d'identité"}
        </h1>
        <SelfieVerificationModal
          onComplete={handleComplete}
          submitting={submitting}
          submitError={submitError}
        />
      </div>
    </div>
  )
}
