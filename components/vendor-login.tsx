"use client"

import { useActionState } from "react"
import { vendorLogin } from "@/app/actions/vendor-auth"
import { Lock, Loader2 } from "lucide-react"

export function VendorLogin() {
  const [state, formAction, pending] = useActionState(vendorLogin, null)

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-card-foreground"
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Lock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Accès vendeur</h2>
            <p className="text-xs text-muted-foreground">Réservé à la gestion des commandes</p>
          </div>
        </div>

        <label htmlFor="vendor-code" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Code d&apos;accès
        </label>
        <input
          id="vendor-code"
          name="code"
          type="password"
          autoComplete="off"
          required
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
          placeholder="••••••••"
        />

        {state?.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {pending ? "Vérification..." : "Entrer"}
        </button>
      </form>
    </div>
  )
}
