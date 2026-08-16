"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { completeStaffOnboarding } from "@/app/actions/staff"
import { savePushSubscription } from "@/app/actions/push"
import { PASSWORD_RULES } from "@/lib/password-rules"
import { Eye, EyeOff, ShieldCheck, CheckCircle2, Loader2, AlertTriangle, Users, Bell } from "lucide-react"
import { BbLogo } from "@/components/bb-logo"

// Libellés des permissions pour l'affichage
const PERMISSION_LABELS: Record<string, string> = {
  messagerie: "Messagerie",
  produits: "Gestion produits",
  commandes: "Suivi commandes",
  utilisateurs: "Gestion utilisateurs",
  promos: "Codes promo",
  logistique: "Logistique",
  notifications: "Notifications",
}

type Invite =
  | { ok: true; id: number; canAdmin: boolean; permissions: string[]; alreadyUsed: boolean }
  | { ok: false }

export function StaffOnboarding({
  token,
  invite,
}: {
  token: string
  invite: Invite
}) {
  const router = useRouter()

  const [pseudo, setPseudo] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [canAdmin, setCanAdmin] = useState(false)
  const [customerToken, setCustomerToken] = useState<string | null>(null)

  // Permission notifications push
  const [notifStep, setNotifStep] = useState<"idle" | "asking" | "granted" | "denied">("idle")

  // Règles de validation en temps réel
  const rules = [
    { ok: password.length >= 8, label: "8 caractères minimum" },
    { ok: /[A-Z]/.test(password), label: "Une majuscule" },
    { ok: /[0-9]/.test(password), label: "Un chiffre" },
    { ok: /[-_/*ù]/.test(password), label: "Un symbole parmi : - _ / * ù" },
    { ok: confirm.length > 0 && password === confirm, label: "Mots de passe identiques" },
  ]
  const allRulesOk = rules.every((r) => r.ok)

  async function askNotificationPermission() {
    setNotifStep("asking")
    try {
      const result = await Notification.requestPermission()
      if (result !== "granted") {
        setNotifStep("denied")
        return
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (vapidKey && "serviceWorker" in navigator && "PushManager" in window) {
        const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4)
        const base64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/")
        const raw = atob(base64)
        const key = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i)

        const reg = await navigator.serviceWorker.register("/sw.js")
        await navigator.serviceWorker.ready
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          })
        }
        const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          await savePushSubscription({
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            role: canAdmin ? "vendeur" : "client",
            customerToken: customerToken ?? null,
          })
        }
      }
      setNotifStep("granted")
    } catch {
      setNotifStep("denied")
    }
  }

  async function handleSubmit() {
    if (submitting || !allRulesOk) return
    setError("")
    setSubmitting(true)
    try {
      const res = await completeStaffOnboarding({ token, pseudo, password, confirmPassword: confirm })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setCanAdmin(res.canAdmin)
      if (res.customerToken) {
        setCustomerToken(res.customerToken)
        localStorage.setItem("authToken", res.customerToken)
        localStorage.setItem("userPseudo", pseudo)
      }
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  // Après la demande de notifications, on redirige
  function handleFinish() {
    if (canAdmin) {
      router.push("/admin")
    } else {
      router.push("/")
    }
  }

  // ── Lien invalide ──────────────────────────────────────────────────────
  if (!invite.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
          <h1 className="mb-2 text-xl font-bold">Lien invalide</h1>
          <p className="text-sm text-muted-foreground">
            Ce lien d&apos;invitation est introuvable ou a expiré. Demande un nouveau lien à l&apos;administrateur.
          </p>
        </div>
      </div>
    )
  }

  // ── Déjà utilisé ──────────────────────────────────────────────────────
  if (invite.alreadyUsed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-accent" aria-hidden="true" />
          <h1 className="mb-2 text-xl font-bold">Invitation déjà utilisée</h1>
          <p className="text-sm text-muted-foreground">
            Ce lien a déjà été consommé. Connecte-toi normalement ou demande un nouveau lien.
          </p>
        </div>
      </div>
    )
  }

  // ── Étape 2 : demande de notifications ────────────────────────────────
  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8">
          <div className="mb-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-accent" aria-hidden="true" />
            <h1 className="mb-1 text-2xl font-bold">Bienvenue dans l&apos;équipe !</h1>
            <p className="text-sm text-muted-foreground">
              Ton compte a été créé avec succès, <strong className="text-foreground">{pseudo}</strong>.
            </p>
          </div>

          <div className="mb-6 rounded-2xl border border-border bg-background/50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4 text-accent" aria-hidden="true" />
              <p className="font-semibold">Activer les notifications</p>
            </div>
            <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
              Autorise les notifications pour recevoir les alertes importantes en temps réel,
              même lorsque le site est fermé.
            </p>
            {notifStep === "idle" ? (
              <button
                type="button"
                onClick={askNotificationPermission}
                className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Autoriser les notifications
              </button>
            ) : notifStep === "asking" ? (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                En attente de ta réponse…
              </div>
            ) : notifStep === "granted" ? (
              <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Notifications activées
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                Notifications refusées — tu pourras les activer plus tard.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="w-full rounded-2xl border border-border bg-secondary py-3 text-sm font-semibold transition-colors hover:bg-secondary/80"
          >
            {canAdmin ? "Accéder au panel admin" : "Accéder au site"}
          </button>
        </div>
      </div>
    )
  }

  // ── Étape 1 : formulaire d'inscription ───────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <BbLogo className="h-12 w-auto" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">Rejoindre l&apos;équipe</h1>
          <p className="text-sm text-muted-foreground">
            Tu as été invité en tant que membre du staff. Choisis ton pseudo et ton mot de passe.
          </p>
        </div>

        {/* Badge rôle + permissions */}
        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" aria-hidden="true" />
            <p className="text-sm font-semibold">Ton rôle</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              invite.canAdmin
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-secondary text-muted-foreground"
            }`}>
              {invite.canAdmin ? "Accès panel admin" : "Compte client étendu"}
            </span>
            {invite.permissions.map((p) => (
              <span key={p} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">
                {PERMISSION_LABELS[p] ?? p}
              </span>
            ))}
          </div>
        </div>

        {/* Formulaire */}
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5">
            {/* Pseudo */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-pseudo">
                Pseudo
              </label>
              <input
                id="staff-pseudo"
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Ton pseudo dans l'équipe"
                autoComplete="username"
                className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition-colors focus:border-accent"
              />
            </div>

            {/* Mot de passe */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-pw">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="staff-pw"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères…"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-border bg-background/60 py-3 pl-4 pr-11 text-sm outline-none transition-colors focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Masquer" : "Afficher"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Confirmation */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-confirm">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <input
                  id="staff-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit()
                  }}
                  placeholder="Resaisir le mot de passe…"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-border bg-background/60 py-3 pl-4 pr-11 text-sm outline-none transition-colors focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? "Masquer" : "Afficher"}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Indicateurs de force */}
            {password.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-xs">
                {rules.map((r) => (
                  <li key={r.label} className={`flex items-center gap-2 ${r.ok ? "text-accent" : "text-muted-foreground/60"}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${r.ok ? "border-accent bg-accent/10" : "border-border"}`}>
                      {r.ok && <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />}
                    </span>
                    {r.label}
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !pseudo.trim() || !allRulesOk}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {submitting
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              }
              Valider et rejoindre l&apos;équipe
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Ce lien est personnel et à usage unique.
        </p>
      </div>
    </div>
  )
}
