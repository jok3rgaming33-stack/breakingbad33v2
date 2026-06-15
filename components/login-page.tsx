"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, CheckCircle2, Copy, AlertTriangle } from "lucide-react"
import { adminLogin } from "@/app/actions/admin-auth"

const CRYSTAL_COUNT = 4

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [generatedPseudo, setGeneratedPseudo] = useState("")
  const [generatedKey, setGeneratedKey] = useState("")
  const [loginInput, setLoginInput] = useState("")
  const [error, setError] = useState("")
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Canvas Cristaux
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    let animationId = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const crystalImages: HTMLImageElement[] = []
    for (let i = 1; i <= CRYSTAL_COUNT; i++) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = `/images/${i}.png`
      crystalImages.push(img)
    }

    type P = {
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      rotation: number
      rotationSpeed: number
      alpha: number
      image: HTMLImageElement
    }

    const particles: P[] = []

    const createParticles = () => {
      for (let i = 0; i < 28; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height * 0.95,
          size: Math.random() * 48 + 26,
          // FIX: dérive dans les deux sens (avant: toujours négatif)
          speedX: (Math.random() - 0.5) * 0.6,
          speedY: (Math.random() - 0.5) * 0.6,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.012,
          alpha: 0.55 + Math.random() * 0.3,
          image: crystalImages[Math.floor(Math.random() * crystalImages.length)],
        })
      }
    }

    let loaded = 0
    const onLoad = () => {
      loaded++
      if (loaded === CRYSTAL_COUNT) createParticles()
    }
    crystalImages.forEach((img) => {
      if (img.complete) onLoad()
      else {
        img.onload = onLoad
        img.onerror = onLoad
      }
    })

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((p) => {
        p.x += p.speedX
        p.y += p.speedY
        p.rotation += p.rotationSpeed
        if (p.x < 0 || p.x > canvas.width) p.speedX *= -1
        if (p.y < 0 || p.y > canvas.height * 0.98) p.speedY *= -1
        if (!p.image.complete || p.image.naturalWidth === 0) return
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.alpha
        ctx.drawImage(p.image, -p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      })
      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  const generateShortPseudo = () => {
    const adj = ["Cool", "Fast", "Zen", "Big", "Red", "Swift", "Bold", "Wild"]
    const noun = ["Cat", "Fox", "Bear", "Wolf", "Hawk", "Lynx"]
    const a = adj[Math.floor(Math.random() * adj.length)]
    const n = noun[Math.floor(Math.random() * noun.length)]
    return a + n
  }

  const generateSecretKey = () => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }

  const createAnonymousAccess = () => {
    const pseudo = generateShortPseudo()
    const key = generateSecretKey()
    setGeneratedPseudo(pseudo)
    setGeneratedKey(key)
    localStorage.setItem("authToken", key)
    localStorage.setItem("userPseudo", pseudo)
    localStorage.removeItem("isAdmin")
    setShowResultModal(true)
  }

  const loginWithKey = async () => {
    const token = loginInput.trim()
    if (token.length < 30) {
      setError("Veuillez entrer votre clé secrète complète.")
      return
    }
    setError("")

    // Vérifie côté serveur si ce token correspond à l'accès admin (Heisenberg)
    const res = await adminLogin(token)
    if (res.ok && res.pseudo) {
      localStorage.setItem("authToken", token)
      localStorage.setItem("userPseudo", res.pseudo)
      localStorage.setItem("isAdmin", "1")
      setGeneratedPseudo(res.pseudo)
      setIsLoggedIn(true)
      return
    }

    // Connexion utilisateur standard
    localStorage.removeItem("isAdmin")
    localStorage.setItem("authToken", token)
    const savedPseudo = localStorage.getItem("userPseudo") || ""
    if (savedPseudo) setGeneratedPseudo(savedPseudo)
    setIsLoggedIn(true)
  }

  const closeResultModal = () => {
    setShowResultModal(false)
    setIsLoggedIn(true)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Dashboard affiché juste après la connexion
  if (isLoggedIn) {
    return (
      <div className="relative min-h-screen bg-background text-foreground pt-16">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="mb-10 text-center">
            <h1 className="mb-2 text-4xl font-bold">Bienvenue !</h1>
            <p className="text-muted-foreground">Vous êtes connecté de manière anonyme</p>
          </div>

          <div className="mb-8 rounded-3xl border border-accent/30 bg-card p-8">
            <div className="grid grid-cols-1 gap-6 text-center md:grid-cols-3">
              <div className="rounded-2xl bg-background/40 p-6">
                <div className="text-4xl font-bold text-accent">248</div>
                <div className="mt-2 text-sm text-muted-foreground">Points fidélité</div>
              </div>
              <div className="rounded-2xl bg-background/40 p-6">
                <div className="text-4xl font-bold text-primary">1</div>
                <div className="mt-2 text-sm text-muted-foreground">Commandes en cours</div>
              </div>
              <div className="rounded-2xl bg-background/40 p-6">
                <div className="text-4xl font-bold text-muted-foreground">14</div>
                <div className="mt-2 text-sm text-muted-foreground">Commandes passées</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
            <button className="rounded-2xl bg-secondary px-8 py-3 font-semibold text-secondary-foreground transition-colors hover:bg-muted">
              Historique
            </button>
            <button
              onClick={onSuccess}
              className="rounded-2xl bg-accent px-8 py-3 text-lg font-bold text-accent-foreground shadow-lg shadow-accent/30 transition-colors hover:brightness-110"
            >
              Aller à la boutique
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Écran de Login principal
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <img
        src="/images/hero-rv.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10" />
      <div className="absolute inset-0 z-20 bg-background/55" />
      <div className="absolute inset-0 z-20 bg-gradient-to-b from-background/20 via-background/60 to-background" />

      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-[0_0_35px_rgba(62,103,87,0.6)]">
              <span className="text-2xl font-black tracking-tighter">Br</span>
              <span className="absolute right-1.5 top-0.5 text-xs font-bold">35</span>
            </div>
            <div className="text-3xl font-bold tracking-tighter">
              eakingBad<span className="text-accent">33</span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-30 flex min-h-screen items-center justify-center px-6 pt-16">
        <div className="w-full max-w-lg">
          <div className="mb-10 text-center">
            <h1 className="mb-3 text-5xl font-bold tracking-tight text-balance">Accès Anonyme</h1>
            <p className="text-xl text-muted-foreground">Aucune donnée personnelle requise</p>
          </div>

          <div className="mb-6">
            <button
              onClick={createAnonymousAccess}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-accent py-5 text-xl font-semibold text-accent-foreground transition-colors hover:brightness-110"
            >
              <Plus className="h-6 w-6" aria-hidden="true" />
              <span>Créer mon accès anonyme</span>
            </button>
          </div>

          <div className="rounded-3xl border border-border bg-background/40 p-8 backdrop-blur-xl">
            <h2 className="mb-5 text-center text-2xl font-semibold">{"J'ai déjà une clé"}</h2>
            <input
              type="text"
              value={loginInput}
              onChange={(e) => {
                setLoginInput(e.target.value)
                if (error) setError("")
              }}
              className="mb-2 w-full rounded-2xl border border-input bg-background/60 px-6 py-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
              placeholder="Colle ta clé secrète ici"
              aria-label="Clé secrète"
            />
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            <button
              onClick={loginWithKey}
              className="mt-2 w-full rounded-2xl bg-foreground py-4 text-lg font-semibold text-background transition-colors hover:opacity-90"
            >
              Se connecter avec ma clé
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showResultModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4">
          <div className="w-full max-w-md rounded-3xl border border-accent/40 bg-card p-8">
            <div className="mb-7 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-accent" aria-hidden="true" />
              <h3 className="text-3xl font-bold">Accès créé !</h3>
            </div>

            <div className="mb-7 rounded-2xl border border-accent/30 bg-background/60 p-6">
              <div className="mb-4 font-semibold text-accent">Pourquoi cette clé est importante ?</div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  • <strong className="text-foreground">Accès unique</strong>
                </li>
                <li>
                  • <strong className="text-foreground">Compte fidélité sécurisé</strong>
                </li>
                <li>
                  • <strong className="text-foreground">Anonymat total</strong>
                </li>
              </ul>
            </div>

            <div className="mb-5">
              <div className="mb-1.5 text-sm text-muted-foreground">Ton pseudo</div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background/60 px-5 py-4">
                <span className="font-mono text-2xl font-bold">{generatedPseudo}</span>
                <button
                  onClick={() => copyToClipboard(generatedPseudo)}
                  className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-secondary-foreground transition-colors hover:bg-muted"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copier
                </button>
              </div>
            </div>

            <div className="mb-7">
              <div className="mb-1.5 text-sm text-muted-foreground">Ta clé secrète</div>
              <div className="flex items-center justify-between rounded-2xl border border-destructive/50 bg-background/60 px-5 py-4">
                <span className="flex-1 break-all pr-4 font-mono text-xs text-destructive">{generatedKey}</span>
                <button
                  onClick={() => copyToClipboard(generatedKey)}
                  className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-secondary-foreground transition-colors hover:bg-muted"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copier
                </button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Si tu la perds, ton compte est irrécupérable.
              </p>
            </div>

            <button
              onClick={closeResultModal}
              className="w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-foreground transition-colors hover:brightness-110"
            >
              Accéder à mon espace
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
