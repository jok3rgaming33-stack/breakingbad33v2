"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, CheckCircle2, Copy, AlertTriangle, Loader2, History, HelpCircle, KeyRound, X, Send, MessageCircleWarning, Eye, EyeOff, ShieldCheck, Fingerprint, ScanFace } from "lucide-react"
import { adminLogin } from "@/app/actions/admin-auth"
import { createAccount, ensureAccount, getAccount, getCustomerStats } from "@/app/actions/account"
import { resolveClientLogin } from "@/app/actions/staff"
import { verifyHuman } from "@/app/actions/security"
import { TurnstileWidget } from "@/components/turnstile-widget"
import { HowItWorksModal } from "@/components/how-it-works-modal"
import { loginWithRestoreToken, setPasswordAfterRestore } from "@/app/actions/restore-access"
import { submitLostKeyClaim } from "@/app/actions/lost-key"
import { normalizeSecretKey } from "@/lib/normalize-token"
import { PASSWORD_RULES } from "@/lib/password-rules"
import {
  startWebAuthnRegistration,
  finishWebAuthnRegistration,
  startWebAuthnAuthentication,
  finishWebAuthnAuthentication,
} from "@/app/actions/webauthn"
import { loadWebAuthnBrowser } from "@/lib/webauthn-browser"
import {
  biometryLabel,
  clearLocalWebAuthn,
  getLocalCredentialIds,
  hasLocalWebAuthn,
  platformAuthenticatorAvailable,
  rememberLocalCredential,
} from "@/lib/webauthn-client"

const CRYSTAL_COUNT = 4

export function LoginPage({
  onSuccess,
}: {
  onSuccess: (opts?: { openOrders?: boolean; openMessaging?: boolean; openKyc?: boolean }) => void
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [generatedPseudo, setGeneratedPseudo] = useState("")
  const [generatedKey, setGeneratedKey] = useState("")
  const [loginInput, setLoginInput] = useState("")
  const [error, setError] = useState("")         // erreur formulaire login (connexion avec clé)
  const [errorCreate, setErrorCreate] = useState("") // erreur formulaire création
  const [creating, setCreating] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [stats, setStats] = useState<{ points: number; active: number; past: number } | null>(null)
  // Biométrie (WebAuthn) — déverrouillage rapide sur cet appareil
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioReady, setBioReady] = useState(false) // credential déjà enregistré en local
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState("")
  const [bioEnrolling, setBioEnrolling] = useState(false)
  const [bioEnrollMsg, setBioEnrollMsg] = useState<string | null>(null)
  // Forcer la lecture du guide avant de créer un accès
  const [hasReadGuide, setHasReadGuide] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    setHasReadGuide(localStorage.getItem("bb33_guide_read") === "1")
    setBioReady(hasLocalWebAuthn())
    // Détection biométrie 100 % isolée : un échec ne bloque jamais la page de login.
    ;(async () => {
      try {
        const api = await loadWebAuthnBrowser()
        if (!api?.browserSupportsWebAuthn()) {
          setBioAvailable(false)
          return
        }
        const ok = await platformAuthenticatorAvailable()
        setBioAvailable(ok)
      } catch {
        setBioAvailable(false)
      }
    })()
  }, [])
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
      setErrorCreate("Merci de valider le test anti-robot avant de continuer.")
      return
    }
    setCreating(true)
    setErrorCreate("")
    const pseudo = generateShortPseudo()
    const key = generateSecretKey()
    try {
      // Vérification serveur du token Turnstile AVANT toute action.
      const human = await verifyHuman(createCaptchaValue)
      if (!human.ok) {
        setErrorCreate(human.error ?? "Vérification anti-robot échouée.")
        setResetCreate((n) => n + 1) // token consommé : on réinitialise le widget
        return
      }
      // Persiste le compte en base : la clé secrète devient l'identifiant durable.
      const res = await createAccount(key, pseudo)
      // Blocage VPN / limite mensuelle par IP : on affiche le motif et on s'arrête.
      if (!res.ok) {
        setErrorCreate(res.error ?? "Impossible de créer le compte. Réessaie dans un instant.")
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
      setErrorCreate("Impossible de créer le compte. Réessaie dans un instant.")
      setResetCreate((n) => n + 1)
    } finally {
      setCreating(false)
    }
  }

  const loginWithKey = async () => {
    const token = normalizeSecretKey(loginInput)
    if (token.length < 20) {
      setError("Colle ta clé secrète complète (sans espace ni retour à la ligne).")
      return
    }
    if (loggingIn) return
    // CAPTCHA requis, sauf s'il est indisponible (on bascule alors sur l'anti-abus serveur).
    if (hasTurnstile && !captchaLogin && !captchaLoginError) {
      setError("Merci de valider le test anti-robot avant de continuer.")
      return
    }
    setError("")
    setBioError("")
    setLoggingIn(true)

    try {
      // Vérification serveur du token Turnstile AVANT toute action.
      const human = await verifyHuman(loginCaptchaValue)
      if (!human.ok) {
        setError(human.error ?? "Vérification anti-robot échouée. Réessaie le captcha.")
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

      // Compte classique OU whitelist : un seul user, bon pseudo, fils rattachés
      const resolved = await resolveClientLogin(token)

      // Token inconnu ou compte supprimé — on refuse sans recréer.
      if (!resolved.ok) {
        setError(
          ("error" in resolved && resolved.error) ||
            "Clé secrète invalide ou compte inexistant. Si tu n'as pas changé de clé, utilise « Clé perdue ».",
        )
        setResetLogin((n) => n + 1)
        return
      }

      const pseudo = resolved.pseudo || token.slice(0, 8)

      localStorage.removeItem("isAdmin")
      localStorage.setItem("authToken", resolved.token)
      localStorage.setItem("userPseudo", pseudo)
      setGeneratedPseudo(pseudo)
      setIsLoggedIn(true)
    } catch {
      setError("Connexion impossible (réseau). Réessaie dans un instant.")
      setResetLogin((n) => n + 1)
    } finally {
      setLoggingIn(false)
    }
  }

  /** Déverrouillage rapide — échec toujours soft : la clé reste utilisable. */
  const loginWithBiometrics = async () => {
    if (bioBusy || loggingIn) return
    setBioError("")
    setError("")
    setBioBusy(true)
    try {
      const api = await loadWebAuthnBrowser()
      if (!api) {
        setBioError("Biométrie indisponible sur cet appareil. Utilise ta clé secrète.")
        setBioAvailable(false)
        return
      }
      const ids = getLocalCredentialIds()
      const start = await startWebAuthnAuthentication(ids.length ? ids : undefined)
      if (!start.ok) {
        if ("clearLocal" in start && start.clearLocal) {
          clearLocalWebAuthn()
          setBioReady(false)
        }
        setBioError(start.error)
        return
      }
      const assertion = (await api.startAuthentication({
        optionsJSON: start.options,
      })) as { id: string }
      const done = await finishWebAuthnAuthentication({
        challengeId: start.challengeId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: assertion as any,
      })
      if (!done.ok) {
        if ("clearLocal" in done && done.clearLocal) {
          clearLocalWebAuthn()
          setBioReady(false)
        }
        setBioError(done.error)
        return
      }
      localStorage.removeItem("isAdmin")
      localStorage.setItem("authToken", done.token)
      localStorage.setItem("userPseudo", done.pseudo)
      if (assertion?.id) rememberLocalCredential(assertion.id)
      setGeneratedPseudo(done.pseudo)
      setIsLoggedIn(true)
      setBioReady(true)
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : ""
      if (name === "NotAllowedError") {
        setBioError("Annulé. Tu peux te connecter avec ta clé ci-dessous.")
      } else {
        setBioError("Déverrouillage impossible. Utilise ta clé secrète ci-dessous.")
      }
    } finally {
      setBioBusy(false)
    }
  }

  /** Active la biométrie (optionnel). Échec soft — le compte reste connecté. */
  const enrollBiometrics = async () => {
    if (bioEnrolling) return
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!token) {
      setBioEnrollMsg("Session introuvable. Reconnecte-toi avec ta clé.")
      return
    }
    setBioEnrolling(true)
    setBioEnrollMsg(null)
    try {
      const api = await loadWebAuthnBrowser()
      if (!api) {
        setBioEnrollMsg("Biométrie indisponible ici. Ta clé reste valable.")
        setBioAvailable(false)
        return
      }
      const start = await startWebAuthnRegistration(token)
      if (!start.ok) {
        setBioEnrollMsg(start.error)
        return
      }
      const attestation = await api.startRegistration({ optionsJSON: start.options })
      const done = await finishWebAuthnRegistration({
        userToken: token,
        challengeId: start.challengeId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: attestation as any,
        deviceLabel: biometryLabel(),
      })
      if (!done.ok) {
        setBioEnrollMsg(done.error)
        return
      }
      rememberLocalCredential(done.credentialId)
      setBioReady(true)
      setBioEnrollMsg(`Déverrouillage ${biometryLabel()} activé. Ta clé reste ton secours.`)
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : ""
      if (name === "NotAllowedError") {
        setBioEnrollMsg("Activation annulée — aucun souci, ta clé fonctionne toujours.")
      } else if (name === "InvalidStateError") {
        setBioEnrollMsg("Déjà enregistré sur cet appareil.")
        setBioReady(true)
      } else {
        setBioEnrollMsg("Activation impossible ici. Continue avec ta clé, sans impact.")
      }
    } finally {
      setBioEnrolling(false)
    }
  }

  const closeResultModal = () => {
    setShowResultModal(false)
    setIsLoggedIn(true)
  }

  // Rétablissement d'accès : token one-time dans l'URL (?restore=xxx)
  const [restoreStep, setRestoreStep] = useState<"idle" | "checking" | "set-password" | "done">("idle")
  const [restoreError, setRestoreError] = useState("")
  const [restoreUserToken, setRestoreUserToken] = useState("") // token courant avant changement
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

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

  const [lostKeyProvisional, setLostKeyProvisional] = useState<{
    token: string
    pseudo: string
  } | null>(null)

  const sendLostKeyRequest = async () => {
    const pseudo = lostKeyPseudo.trim()
    const msg = lostKeyMessage.trim()
    if (!pseudo) {
      setLostKeyError("Indique ton pseudo pour qu'on te retrouve.")
      return
    }
    setLostKeySending(true)
    setLostKeyError("")
    setLostKeyProvisional(null)
    try {
      // Compte provisoire + fil messagerie + alerte admin (KYC ensuite)
      const res = await submitLostKeyClaim({
        claimedPseudo: pseudo,
        message: msg || undefined,
      })
      if (!res.ok) {
        setLostKeyError(res.error)
        return
      }
      // Connexion immédiate avec la clé provisoire → le client voit la messagerie
      localStorage.removeItem("isAdmin")
      localStorage.setItem("authToken", res.provisionalToken)
      localStorage.setItem("userPseudo", res.provisionalPseudo)
      setLostKeyProvisional({
        token: res.provisionalToken,
        pseudo: res.provisionalPseudo,
      })
      setLostKeySent(true)
    } catch {
      setLostKeyError("Envoi impossible, réessaie dans un instant.")
    } finally {
      setLostKeySending(false)
    }
  }

  // Intercepte ?restore=xxx dans l'URL pour connexion one-time
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rt = params.get("restore")
    if (!rt) return
    // Nettoie l'URL immédiatement (sécurité — le token ne doit pas rester visible)
    window.history.replaceState({}, "", window.location.pathname)
    setRestoreStep("checking")
    setRestoreError("")
    loginWithRestoreToken(rt).then((res) => {
      if (!res.ok) {
        setRestoreStep("idle")
        setRestoreError(res.error ?? "Lien invalide ou expiré.")
        return
      }
      // Connecte temporairement avec l'ancien token pour pouvoir appeler setPasswordAfterRestore
      setRestoreUserToken(res.userToken!)
      localStorage.setItem("authToken", res.userToken!)
      localStorage.setItem("userPseudo", res.pseudo ?? "")
      setRestoreStep("set-password")
    }).catch(() => {
      setRestoreStep("idle")
      setRestoreError("Impossible de traiter ce lien. Réessaie.")
    })
  }, [])

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

  const handleSetPassword = async () => {
    if (savingPassword) return
    setRestoreError("")
    if (!newPassword || !confirmPassword) {
      setRestoreError("Remplis les deux champs.")
      return
    }
    if (newPassword !== confirmPassword) {
      setRestoreError("Les deux mots de passe ne correspondent pas.")
      return
    }
    setSavingPassword(true)
    try {
      const res = await setPasswordAfterRestore(restoreUserToken, newPassword, confirmPassword)
      if (!res.ok) {
        setRestoreError(res.error ?? "Erreur lors de la sauvegarde.")
        return
      }
      // Le token a changé — on met à jour localStorage avec le nouveau
      localStorage.setItem("authToken", res.newToken!)
      setRestoreStep("done")
      // Connexion effective après un court délai
      setTimeout(() => {
        const pseudo = localStorage.getItem("userPseudo") ?? ""
        setGeneratedPseudo(pseudo)
        setIsLoggedIn(true)
      }, 1800)
    } finally {
      setSavingPassword(false)
    }
  }

  // Écran intermédiaire : définir le mot de passe après rétablissement d'accès
  if (restoreStep === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-accent" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Verification du lien de retablissement...</p>
        </div>
      </div>
    )
  }

  if (restoreStep === "set-password" || restoreStep === "done") {
    return (
      <div className="relative min-h-screen bg-background text-foreground pt-16">
        <div className="mx-auto max w-md max-w-md px-6 py-16">
          <div className="rounded-3xl border border-border bg-card p-8">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
                <ShieldCheck className="h-7 w-7 text-accent" aria-hidden="true" />
              </span>
              <h1 className="text-2xl font-bold">Definir ton mot de passe</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Choisis un mot de passe securise que tu memoriseras. Il remplacera ta cle d&apos;acces.
              </p>
              <p className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                {PASSWORD_RULES.hint}
              </p>
            </div>

            {restoreStep === "done" ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-accent" aria-hidden="true" />
                <p className="font-semibold text-accent">Mot de passe enregistre !</p>
                <p className="text-sm text-muted-foreground">Connexion en cours...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Nouveau mot de passe */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 caracteres..."
                      className="w-full rounded-xl border border-border bg-background/60 py-3 pl-4 pr-11 text-sm outline-none transition-colors focus:border-accent"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showNewPw ? "Masquer" : "Afficher"}
                    >
                      {showNewPw ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {/* Confirmation */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Confirmer le mot de passe</label>
                  <div className="relative">
                    <input
                      type={showConfirmPw ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSetPassword()
                      }}
                      placeholder="Resaisir le mot de passe..."
                      className="w-full rounded-xl border border-border bg-background/60 py-3 pl-4 pr-11 text-sm outline-none transition-colors focus:border-accent"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirmPw ? "Masquer" : "Afficher"}
                    >
                      {showConfirmPw ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {/* Indicateurs de force */}
                {newPassword.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs">
                    {[
                      { ok: newPassword.length >= 8, label: "8 caracteres minimum" },
                      { ok: /[A-Z]/.test(newPassword), label: "Une lettre majuscule" },
                      { ok: /[0-9]/.test(newPassword), label: "Un chiffre" },
                      { ok: /[-_/*ù]/.test(newPassword), label: "Un symbole parmi : - _ / * u" },
                      { ok: confirmPassword.length > 0 && newPassword === confirmPassword, label: "Mots de passe identiques" },
                    ].map((r) => (
                      <li key={r.label} className={`flex items-center gap-1.5 ${r.ok ? "text-accent" : "text-muted-foreground/60"}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${r.ok ? "border-accent bg-accent/10" : "border-border"}`}>
                          {r.ok && <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />}
                        </span>
                        {r.label}
                      </li>
                    ))}
                  </ul>
                )}

                {restoreError && (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {restoreError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSetPassword}
                  disabled={savingPassword}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {savingPassword
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  }
                  Enregistrer et se connecter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
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

          {/* Proposition biométrie — purement optionnelle, jamais bloquante */}
          {bioAvailable && (
            <div className="mb-8 rounded-3xl border border-border bg-card/80 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                    <Fingerprint className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold">
                      {bioReady
                        ? `${biometryLabel()} déjà actif sur cet appareil`
                        : `Déverrouillage rapide — ${biometryLabel()}`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {bioReady
                        ? "À la prochaine ouverture, tu pourras te connecter sans retaper ta clé. Ta clé reste toujours le secours."
                        : "Optionnel : active Face ID / empreinte pour te reconnecter plus vite. Si ça échoue un jour, ta clé secrète fonctionne toujours."}
                    </p>
                    {bioEnrollMsg && (
                      <p className="mt-2 text-xs text-accent">{bioEnrollMsg}</p>
                    )}
                  </div>
                </div>
                {!bioReady && (
                  <button
                    type="button"
                    onClick={() => void enrollBiometrics()}
                    disabled={bioEnrolling}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {bioEnrolling ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ScanFace className="h-4 w-4" aria-hidden="true" />
                    )}
                    {bioEnrolling ? "Activation..." : "Activer (optionnel)"}
                  </button>
                )}
              </div>
            </div>
          )}

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

          {/* Bouton principal — verrouillé tant que le guide n'a pas été consulté */}
          <div className="mb-4">
            {hasReadGuide ? (
              <div className="flex flex-col items-center gap-3">
                {/* Widget Turnstile pour la création — affiché uniquement quand le guide est lu */}
                {hasTurnstile && (
                  <div className="flex flex-col items-center gap-2">
                    <TurnstileWidget
                      onVerify={(t) => {
                        setCaptchaCreate(t)
                        if (t) setCaptchaCreateError(false)
                      }}
                      onError={() => setCaptchaCreateError(true)}
                      resetSignal={resetCreate}
                    />
                    {captchaCreateError && (
                      <p className="text-center text-xs text-muted-foreground">
                        Le test anti-robot n&apos;a pas pu se charger. Tu peux continuer normalement.
                      </p>
                    )}
                  </div>
                )}
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
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowHowItWorks(true)}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-accent py-5 text-xl font-semibold text-accent-foreground transition-colors hover:brightness-110"
                >
                  <HelpCircle className="h-6 w-6" aria-hidden="true" />
                  <span>Lire le guide avant de continuer</span>
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  La création de ton accès sera déverrouillée après avoir consulté le guide.
                </p>
              </div>
            )}
            {errorCreate && !showResultModal && (
              <p className="mt-3 flex items-start gap-1.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{errorCreate}</span>
              </p>
            )}
          </div>

          {/* Comment ça marche — entre les deux sections, toujours visible */}
          {hasReadGuide && (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowHowItWorks(true)}
                className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-5 py-2.5 text-sm font-medium text-muted-foreground backdrop-blur transition-colors hover:border-accent/50 hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
                Relire le guide
              </button>
            </div>
          )}

          <div className="rounded-3xl border border-border bg-background/40 p-8 backdrop-blur-xl">
            <h2 className="mb-5 text-center text-2xl font-semibold">{"J'ai déjà une clé"}</h2>

            {/* Biométrie en plus — la zone clé ci-dessous reste TOUJOURS visible */}
            {bioAvailable && bioReady && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => void loginWithBiometrics()}
                  disabled={bioBusy || loggingIn}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-accent/15 py-4 text-base font-semibold text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bioBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Fingerprint className="h-5 w-5" aria-hidden="true" />
                  )}
                  {bioBusy ? "Vérification..." : `Déverrouiller avec ${biometryLabel()}`}
                </button>
                {bioError && (
                  <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                    {bioError}
                    <p className="mt-1 text-xs opacity-90">
                      Pas de panique : colle ta clé secrète juste en dessous.
                    </p>
                  </div>
                )}
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">ou avec ta clé (toujours possible)</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            )}

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
            {error && !showResultModal && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {!bioReady && bioError && (
              <p className="mb-3 text-sm text-destructive">{bioError}</p>
            )}
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
      <HowItWorksModal
        isOpen={showHowItWorks}
        requireRead={!hasReadGuide}
        onClose={() => {
          setShowHowItWorks(false)
          if (typeof window !== "undefined") localStorage.setItem("bb33_guide_read", "1")
          setHasReadGuide(true)
        }}
        onConfirm={() => {
          // Marquer comme lu + fermer la modale + lancer directement la création
          if (typeof window !== "undefined") localStorage.setItem("bb33_guide_read", "1")
          setHasReadGuide(true)
          setShowHowItWorks(false)
          createAnonymousAccess()
        }}
      />

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
                  <p className="font-semibold text-lg">Dossier ouvert — une étape : identité</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Tu es connecté avec une <strong>clé provisoire</strong>.{" "}
                    <strong>Fais le KYC maintenant</strong> pour que l&apos;admin valide en direct
                    le rattachement de {lostKeyPseudo ? `« ${lostKeyPseudo} »` : "ton compte"}.
                    Tu peux aussi <strong>écrire et recevoir des réponses</strong> dans la messagerie
                    pendant ce temps.
                  </p>
                  {lostKeyProvisional && (
                    <div className="w-full rounded-2xl border border-border bg-background/60 p-3 text-left">
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                        Ta clé provisoire (conserve-la) :
                      </p>
                      <code className="block break-all font-mono text-xs">
                        {lostKeyProvisional.token}
                      </code>
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-accent"
                        onClick={() => {
                          navigator.clipboard?.writeText(lostKeyProvisional.token)
                        }}
                      >
                        Copier la clé
                      </button>
                    </div>
                  )}
                  <div className="mt-2 flex w-full flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowLostKey(false)
                        // KYC immédiat + messagerie dispo via bannière
                        window.location.href = "/verification?from=recovery"
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground hover:brightness-110"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      Faire le KYC maintenant
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLostKey(false)
                        onSuccess({ openMessaging: true })
                      }}
                      className="w-full rounded-2xl border border-border px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
                    >
                      Écrire dans la messagerie
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                    Indique le pseudo du compte à récupérer. On te connecte tout de suite avec une{" "}
                    <strong>clé provisoire</strong>, tu fais le <strong>KYC</strong> (selfie), et
                    l&apos;admin valide en direct. Messagerie ouverte dans les deux sens pendant
                    tout le dossier.
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
