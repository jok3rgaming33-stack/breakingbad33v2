"use client"

import { useActionState, useEffect, useState } from "react"
import { adminGateAction } from "@/app/actions/admin-auth"
import { Fingerprint, ShieldCheck, Loader2 } from "lucide-react"
import { TurnstileWidget } from "@/components/turnstile-widget"
import { syncPushSubscription } from "@/hooks/use-push-notifications"
import {
  biometryLabel,
  browserSupportsWebAuthn,
  clearLocalWebAuthn,
  runBiometricLogin,
} from "@/lib/webauthn-client"

export function AdminGate() {
  const [state, formAction, isPending] = useActionState(adminGateAction, null)
  const [mode, setMode] = useState<"token" | "password">("token")
  const [captcha, setCaptcha] = useState("")
  const [bioOk, setBioOk] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState("")

  useEffect(() => {
    setBioOk(browserSupportsWebAuthn())
  }, [])

  const unlock = async () => {
    if (bioBusy || isPending) return
    setBioError("")
    setBioBusy(true)
    try {
      const done = await runBiometricLogin()
      if (!done.ok) {
        if (done.clearLocal) clearLocalWebAuthn()
        setBioError(done.error)
        return
      }
      if (!done.admin) {
        setBioError("Cette biométrie ouvre un compte client, pas le panel. Utilise ton token admin, puis active la biométrie dans le panel.")
        return
      }
      await syncPushSubscription({ role: "vendeur", ask: true })
      window.location.href = "/admin"
    } catch {
      setBioError("Déverrouillage impossible. Utilise ton token.")
    } finally {
      setBioBusy(false)
    }
  }
  // Aligné sur le login client : token Turnstile OU "unavailable" (widget HS / timeout).
  // Ne jamais envoyer une chaîne vide — le serveur refuse sinon l'accès admin.
  const captchaValue = captcha.trim() || "unavailable"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8">
        <div className="mb-7 text-center">
          <ShieldCheck className="mx-auto mb-4 h-14 w-14 text-accent" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Panel Administrateur</h1>
          <p className="mt-2 text-sm text-muted-foreground">Accès strictement réservé.</p>
        </div>

        <div className="mb-5 flex rounded-2xl border border-border bg-background/60 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("token")}
            className={`flex-1 rounded-xl py-2 font-medium transition-colors ${
              mode === "token" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            }`}
          >
            Token
          </button>
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 rounded-xl py-2 font-medium transition-colors ${
              mode === "password" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            }`}
          >
            Pseudo + mot de passe
          </button>
        </div>

        {bioOk && (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => void unlock()}
              disabled={bioBusy || isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-accent/15 py-3.5 text-sm font-semibold text-accent disabled:opacity-50"
            >
              {bioBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
              {bioBusy ? "Vérification..." : `Ouvrir avec ${biometryLabel()}`}
            </button>
            {bioError && <p className="mt-2 text-center text-xs text-destructive">{bioError}</p>}
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Disponible après une première activation dans le panel. Sinon, token ou mot de passe ci-dessous.
            </p>
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-4">
          {mode === "token" ? (
            <div>
              <label htmlFor="admin-token" className="mb-1.5 block text-sm text-muted-foreground">
                Token admin
              </label>
              <input
                id="admin-token"
                name="token"
                type="password"
                autoComplete="off"
                required
                className="w-full rounded-2xl border border-input bg-background/60 px-5 py-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                placeholder="Colle ton token admin"
              />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="admin-pseudo" className="mb-1.5 block text-sm text-muted-foreground">
                  Pseudo
                </label>
                <input
                  id="admin-pseudo"
                  name="pseudo"
                  type="text"
                  autoComplete="off"
                  required
                  className="w-full rounded-2xl border border-input bg-background/60 px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                  placeholder="Ton pseudo admin"
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="mb-1.5 block text-sm text-muted-foreground">
                  Mot de passe
                </label>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="off"
                  required
                  className="w-full rounded-2xl border border-input bg-background/60 px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                  placeholder="Ton mot de passe"
                />
              </div>
            </>
          )}

          <input type="hidden" name="captcha" value={captchaValue} />
          <TurnstileWidget
            onVerify={setCaptcha}
            onError={() => setCaptcha("")}
            className="flex justify-center"
          />

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isPending ? "Vérification..." : "Accéder au panel"}
          </button>
        </form>
      </div>
    </div>
  )
}
