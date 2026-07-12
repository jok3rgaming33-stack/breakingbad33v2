"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SelfieVerificationModal } from "@/components/selfie-verification-modal"
import type { VerificationMetadata } from "@/components/selfie-verification-modal"
import { submitVerification } from "@/app/actions/verification"
import { ShieldCheck, CheckCircle } from "lucide-react"

export default function VerificationPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!t) {
      // Pas connecté — renvoi vers l'accueil
      router.replace("/")
      return
    }
    setToken(t)
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

  // Attente du token
  if (token === null) return null

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-accent">
          <CheckCircle className="h-8 w-8" aria-hidden="true" />
        </span>
        <div>
          <h1 className="mb-2 text-2xl font-bold text-foreground">Vérification soumise</h1>
          <p className="text-muted-foreground text-pretty">
            Ta vérification a bien été envoyée. Elle sera examinée prochainement.<br />
            Tu peux maintenant retourner sur le site et passer ta commande.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-2xl bg-accent px-6 py-3 font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background px-4 py-8">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold text-foreground">Vérification d&apos;identité</h1>
        <p className="max-w-sm text-sm text-muted-foreground text-pretty">
          Suis les étapes ci-dessous pour soumettre ta nouvelle vérification.
          Une fois validée par l&apos;équipe, tu pourras passer ta commande.
        </p>
      </div>
      <div className="w-full max-w-lg">
        <SelfieVerificationModal
          onComplete={handleComplete}
          submitting={submitting}
          submitError={submitError}
        />
      </div>
    </div>
  )
}
