"use client"

import { useActionState, useState } from "react"
import { adminGateAction } from "@/app/actions/admin-auth"
import { ShieldCheck, Loader2 } from "lucide-react"
import { TurnstileWidget } from "@/components/turnstile-widget"

export function AdminGate() {
  const [state, formAction, isPending] = useActionState(adminGateAction, null)
  const [mode, setMode] = useState<"token" | "password">("token")
  const [captcha, setCaptcha] = useState("")

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

          <input type="hidden" name="captcha" value={captcha} />
          <TurnstileWidget onVerify={setCaptcha} className="flex justify-center" />

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
