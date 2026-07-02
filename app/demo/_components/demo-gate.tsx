"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { verifyDemoPassword } from "@/app/demo/actions"
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react"
import Image from "next/image"

export function DemoGate() {
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await verifyDemoPassword(password)
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error ?? "Mot de passe incorrect.")
        setPassword("")
      }
    })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="relative h-20 w-20 overflow-hidden rounded-2xl">
          <Image src="/images/logoapp.png" alt="BreakingBad33" fill className="object-cover" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">BreakingBad33</h1>
        <p className="text-sm text-muted-foreground">Accès démo réservé</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
            <Lock className="h-6 w-6 text-accent" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Accès protégé</h2>
          <p className="text-xs text-muted-foreground">
            Cette démo est réservée aux acheteurs potentiels.
            <br />
            Entre le mot de passe reçu pour y accéder.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              autoFocus
              className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground outline-none transition-colors focus:border-accent"
              aria-label="Mot de passe démo"
              required
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Masquer" : "Afficher"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Accéder à la démo
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Toutes les données affichées sont fictives — aucune commande réelle.
      </p>
    </div>
  )
}
