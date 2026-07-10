"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, CheckCircle2, Copy, AlertTriangle, Loader2, History, HelpCircle, KeyRound, X, Send, MessageCircleWarning } from "lucide-react"
import { adminLogin } from "@/app/actions/admin-auth"
import { createAccount, ensureAccount, getAccount, getCustomerStats } from "@/app/actions/account"
import { verifyHuman } from "@/app/actions/security"
import { TurnstileWidget } from "@/components/turnstile-widget"
import { HowItWorksModal } from "@/components/how-it-works-modal"
import { createGeneralInquiryThread } from "@/app/actions/messaging"

const CRYSTAL_COUNT = 4

export function LoginPage({ onSuccess }: { onSuccess: (opts?: { openOrders?: boolean }) => void }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [generatedPseudo, setGeneratedPseudo] = useState("")
  const [generatedKey, setGeneratedKey] = useState("")
  const [loginInput, setLoginInput] = useState("")
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [stats, setStats] = useState<{ points: number; active: number; past: number } | null>(null)
  // Tokens Turnstile (un par formulaire) + signaux de réinitialisation.
  const [captchaCreate, setCaptchaCreate] = useState("")
  const [captchaLogin, setCaptchaLogin] = useState("")
  const [resetCreate, setResetCreate] = useState(0)
  const [resetLogin, setResetLogin] = useState(0)
  // Le widget anti-robot n'a pas pu se charger (blocage navigateur, réseau, domaine non autorisé).
  const [captchaCreateError, setCaptchaCreateError] = useState(false)
  const [captchaLoginError, setCaptchaLoginError] = useState(false)
  const hasTurnstile = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  // Valeur envoyée au serveur : token réel, ou sentinel si le widget est indisponible.
  const createCaptchaValue = captchaCreateError ? "unavailable" : captchaCreate
  const loginCaptchaValue = captchaLoginError ? "unavailable" : captchaLogin
  const createCaptchaReady = !hasTurnstile || Boolean(captchaCreate) || captchaCreateError
  const loginCaptchaReady = !hasTurnstile || Boolean(captchaLogin) || captchaLoginError
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

  const createAnonymousAccess = async () => {
    if (creating) return
    // CAPTCHA requis, sauf s'il est indisponible (on bascule alors sur l'anti-abus serveur).
    if (hasTurnstile && !captchaCreate && !captchaCreateError) {
      setError("Merci de valider le test anti-robot avant de continuer.")
      return
    }
    setCreating(true)
    setError("")
    const pseudo = generateShortPseudo()
    const key = generateSecretKey()
    try {
      // Vérification serveur du token Turnstile AVANT toute action.
      const human = await verifyHuman(createCaptchaValue)
      if (!human.ok) {
        setError(human.error ?? "Vérification anti-robot échouée.")
        setResetCreate((n) => n + 1) // token consommé : on réinitialise le widget
        return
      }
      // Persiste le compte en base : la clé secrète devient l'identifiant durable.
      const res = await createAccount(key, pseudo)
      // Blocage VPN / limite mensuelle par IP : on affiche le motif et on s'arrête.
      if (!res.ok) {
        setError(res.error ?? "Impossible de créer le compte. Réessaie dans un instant.")
        setResetCreate((n) => n + 1)
        return
      }
      const finalPseudo = res.pseudo ?? pseudo
      setGeneratedPseudo(finalPseudo)
      setGeneratedKey(key)
      localStorage.setItem("authToken", key)
      localStorage.setItem("userPseudo", finalPseudo)
      localStorage.removeItem("isAdmin")
      setShowResultModal(true)
    } catch {
      setError("Impossible de créer le compte. Réessaie dans un instant.")
      setResetCreate((n) => n + 1)
    } finally {
      setCreating(false)
    }
  }

  const loginWithKey = async () => {
    const token = loginInput.trim()
    if (token.length < 30) {
      setError("Veuillez entrer votre clé secrète complète.")
      return
    }
    if (loggingIn) return
    // CAPTCHA requis, sauf s'il est indisponible (on bascule alors sur l'anti-abus serveur).
    if (hasTurnstile && !captchaLogin && !captchaLoginError) {
      setError("Merci de valider le test anti-robot avant de continuer.")
      return
    }
    setError("")
    setLoggingIn(true)

    try {
      // Vérification serveur du token Turnstile AVANT toute action.
      const human = await verifyHuman(loginCaptchaValue)
      if (!human.ok) {
        setError(human.error ?? "Vérification anti-robot échouée.")
        setResetLogin((n) => n + 1)
        return
      }
      // Vérifie côté serveur si ce token correspond à l'accès admin (Heisenberg)
      const res = await adminLogin(token)
      if (res.ok && res.pseudo) {
        localStorage.setItem("authToken", token)
        localStorage.setItem("userPseudo", res.pseudo)
        localStorage.setItem("isAdmin", "1")
        // L'admin ne passe pas de commande : on l'envoie directement vers le panel,
        // sans afficher le tableau de bord client (points / suivi de commandes).
        window.location.href = "/admin"
        return
      }

      // Connexion utilisateur standard : on retrouve le pseudo réel depuis la base.
      const account = await getAccount(token)
      let pseudo = account?.pseudo ?? ""

      if (!pseudo) {
        // Compte hérité (créé avant la base de données) ou nouvel appareil :
        // on migre/crée le compte à partir du pseudo local s'il existe.
        const localPseudo = localStorage.getItem("userPseudo") || generateShortPseudo()
        const ensured = await ensureAccount(token, localPseudo)
        pseudo = ensured.ok && ensured.pseudo ? ensured.pseudo : localPseudo
      }

      localStorage.removeItem("isAdmin")
      localStorage.setItem("authToken", token)
      localStorage.setItem("userPseudo", pseudo)
      setGeneratedPseudo(pseudo)
      setIsLoggedIn(true)
    } catch {
      setError("Connexion impossible. Réessaie dans un instant.")
      setResetLogin((n) => n + 1)
    } finally {
      setLoggingIn(false)
    }
  }

  const closeResultModal = () => {
    setShowResultModal(false)
    setIsLoggedIn(true)
  }

  const [copiedField, setCopiedField] = useState<"pseudo" | "key" | null>(null)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [showLostKey, setShowLostKey] = useState(false)
  const [lostKeyPseudo, setLostKeyPseudo] = useState("")
  const [lostKeyMessage, setLostKeyMessage] = useState("")
  const [lostKeySending, setLostKeySending] = useState(false)
  const [lostKeySent, setLostKeySent] = useState(false)
  const [lostKeyError, setLostKeyError] = useState("")

  const copyToClipboard = async (text: string, field: "pseudo" | "key") => {
    let success = false
    // 1) API Clipboard moderne (peut être bloquée dans une iframe / hors HTTPS)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        success = true
      }
    } catch {
      success = false
    }
    // 2) Repli universel via un textarea temporaire + execCommand
    if (!success) {
      try {
        const textarea = document.createElement("textarea")
        textarea.value = text
        textarea.setAttribute("readonly", "")
        textarea.style.position = "fixed"
        textarea.style.top = "-9999px"
        document.body.appendChild(textarea)
        textarea.select()
        success = document.execCommand("copy")
        document.body.removeChild(textarea)
      } catch {
        success = false
      }
    }
    if (success) {
      setCopiedField(field)
      window.setTimeout(() => setCopiedField(null), 2000)
    }
  }

  const sendLostKeyRequest = async () => {
    const pseudo = lostKeyPseudo.trim()
    const msg = lostKeyMessage.trim()
    if (!pseudo) { setLostKeyError("Indique ton pseudo pour qu'on te retrouve."); return }
    setLostKeySending(true)
    setLostKeyError("")
    try {
      await createGeneralInquiryThread({
        customerName: pseudo,
        message: `[CLE PERDUE] Pseudo : ${pseudo}\n\n${msg || "Le client a perdu sa clé et demande de l'aide."}`,
      })
      setLostKeySent(true)
    } catch {
      setLostKeyError("Envoi impossible, réessaie dans un instant.")
    } finally {
      setLostKeySending(false)
    }
  }

  // Charge les statistiques réelles du client dès l'affichage du tableau de bord
  useEffect(() => {
    if (!isLoggedIn) return
    const token = localStorage.getItem("authToken")
    if (!token) return
    setStats(null)
    getCustomerStats(token)
      .then((s) => setStats(s))
      .catch(() => setStats({ points: 0, active: 0, past: 0 }))
  }, [isLoggedIn])

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
                <div className="text-4xl font-bold text-accent">
                  {stats ? stats.points : <Loader2 className="mx-auto h-8 w-8 animate-spin" aria-hidden="true" />}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">Points fidélité</div>
              </div>
              <div className="rounded-2xl bg-background/40 p-6">
                <div className="text-4xl font-bold text-primary">
                  {stats ? stats.active : <Loader2 className="mx-auto h-8 w-8 animate-spin" aria-hidden="true" />}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">Commandes en cours</div>
              </div>
              <div className="rounded-2xl bg-background/40 p-6">
                <div className="text-4xl font-bold text-muted-foreground">
                  {stats ? stats.past : <Loader2 className="mx-auto h-8 w-8 animate-spin" aria-hidden="true" />}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">Commandes passées</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={() => onSuccess({ openOrders: true })}
              className="flex items-center justify-center gap-2 rounded-2xl bg-secondary px-8 py-3 font-semibold text-secondary-foreground transition-colors hover:bg-muted"
            >
              <History className="h-5 w-5" aria-hidden="true" />
              Historique
            </button>
            <button
              onClick={() => onSuccess()}
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

          <div className="mb-4">
            <button
              onClick={createAnonymousAccess}
              disabled={creating || !createCaptchaReady}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-accent py-5 text-xl font-semibold text-accent-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-6 w-6" aria-hidden="true" />
              )}
              <span>{creating ? "Création..." : "Créer mon accès anonyme"}</span>
            </button>
            {error && !showResultModal && (
              <p className="mt-3 flex items-start gap-1.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}
          </div>

          {/* Comment ça marche — entre les deux sections, bien visible */}
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => setShowHowItWorks(true)}
              className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-5 py-2.5 text-sm font-medium text-muted-foreground backdrop-blur transition-colors hover:border-accent/50 hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              Comment ça marche
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
            <div className="mb-3 flex flex-col items-center justify-center gap-2">
              <TurnstileWidget
                onVerify={(t) => {
                  setCaptchaLogin(t)
                  if (t) setCaptchaLoginError(false)
                }}
                onError={() => setCaptchaLoginError(true)}
                resetSignal={resetLogin}
              />
              {captchaLoginError && (
                <p className="text-center text-xs text-muted-foreground">
                  Le test anti-robot n&apos;a pas pu se charger sur ton appareil. Tu peux continuer normalement.
                </p>
              )}
            </div>
            <button
              onClick={loginWithKey}
              disabled={loggingIn || !loginCaptchaReady}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-lg font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingIn && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {loggingIn ? "Connexion..." : "Se connecter avec ma clé"}
            </button>
            <button
              type="button"
              onClick={() => { setShowLostKey(true); setLostKeySent(false); setLostKeyError("") }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Clé perdue
            </button>
          </div>
        </div>
      </div>

      {/* Modale Comment ça marche */}
      <HowItWorksModal isOpen={showHowItWorks} onClose={() => setShowHowItWorks(false)} />

      {/* Modale Clé perdue */}
      {showLostKey && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
                  <MessageCircleWarning className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-bold leading-tight">Clé perdue</h2>
                  <p className="text-xs text-muted-foreground">Contacte l&apos;admin pour obtenir de l&apos;aide</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLostKey(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6">
              {lostKeySent ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <CheckCircle2 className="h-14 w-14 text-accent" aria-hidden="true" />
                  <p className="font-semibold text-lg">Demande envoyée !</p>
                  <p className="text-sm text-muted-foreground">
                    L&apos;admin a reçu ta demande et te répondra dès que possible via la messagerie.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowLostKey(false)}
                    className="mt-2 rounded-2xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground hover:brightness-110"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                    Si tu as perdu ta clé secrète, indique ton pseudo ci-dessous et décris ta situation.
                    L&apos;admin sera notifié immédiatement et pourra vérifier ton compte.
                  </p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium" htmlFor="lostKeyPseudo">
                        Ton pseudo
                      </label>
                      <input
                        id="lostKeyPseudo"
                        type="text"
                        value={lostKeyPseudo}
                        onChange={(e) => setLostKeyPseudo(e.target.value)}
                        placeholder="Ex: CoolFox"
                        className="w-full rounded-2xl border border-input bg-background/60 px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium" htmlFor="lostKeyMessage">
                        Message (optionnel)
                      </label>
                      <textarea
                        id="lostKeyMessage"
                        value={lostKeyMessage}
                        onChange={(e) => setLostKeyMessage(e.target.value)}
                        placeholder="Décris ta situation, date de dernière connexion, etc."
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-input bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                      />
                    </div>
                    {lostKeyError && (
                      <p className="flex items-center gap-1.5 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {lostKeyError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={sendLostKeyRequest}
                      disabled={lostKeySending}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-110 disabled:opacity-60"
                    >
                      {lostKeySending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden="true" />
                      )}
                      {lostKeySending ? "Envoi..." : "Envoyer ma demande"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal création compte */}
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
                  type="button"
                  onClick={() => copyToClipboard(generatedPseudo, "pseudo")}
                  aria-label="Copier le pseudo"
                  className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-secondary-foreground transition-colors hover:bg-muted"
                >
                  {copiedField === "pseudo" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Copié !
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copier
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mb-7">
              <div className="mb-1.5 text-sm text-muted-foreground">Ta clé secrète</div>
              <div className="flex items-center justify-between rounded-2xl border border-destructive/50 bg-background/60 px-5 py-4">
                <span className="flex-1 break-all pr-4 font-mono text-xs text-destructive">{generatedKey}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedKey, "key")}
                  aria-label="Copier la clé secrète"
                  className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-secondary-foreground transition-colors hover:bg-muted"
                >
                  {copiedField === "key" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Copié !
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copier
                    </>
                  )}
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
