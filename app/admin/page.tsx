import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { AdminGate } from "@/components/admin-gate"
import { AdminPanel } from "@/components/admin-panel"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Panel Admin — BreakingBad33",
  robots: { index: false, follow: false },
}

/**
 * Page admin ULTRA-légère : auth seulement, zéro bulk DB.
 * Les onglets chargent leurs données côté client (évite timeout /
 * "This page could not be loaded" sur mobile/samedi chargé).
 */
export default async function AdminPage() {
  let authed = false
  try {
    authed = await isAdminAuthenticated()
  } catch (e) {
    console.error("[admin] isAdminAuthenticated failed:", e)
  }

  if (!authed) {
    return <AdminGate />
  }

  return <AdminPanel />
}
