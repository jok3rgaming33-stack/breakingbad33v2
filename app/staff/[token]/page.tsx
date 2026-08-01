import { redirect } from "next/navigation"

export const metadata = {
  title: "Accès membre — BreakingBad33",
  robots: { index: false, follow: false },
}

/**
 * Ancien onboarding staff par lien d'invitation — désactivé.
 * Les membres whitelist se connectent via pseudo + mot de passe sur la page d'accueil.
 */
export default async function StaffOnboardingPage() {
  redirect("/")
}
