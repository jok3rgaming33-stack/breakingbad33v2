import { getThreads } from "@/app/actions/messaging"
import { isVendorAuthenticated, vendorLogout } from "@/app/actions/vendor-auth"
import { VendorInbox } from "@/components/vendor-inbox"
import { VendorLogin } from "@/components/vendor-login"
import Link from "next/link"
import { ArrowLeft, LogOut } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Messagerie · BreakingBad33",
  description: "Boîte de réception des commandes",
}

export default async function MessageriePage() {
  const authenticated = await isVendorAuthenticated()

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-background px-4 py-6 text-foreground md:px-8">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Boutique
        </Link>
        <h1 className="text-lg font-bold tracking-tight">Messagerie interne</h1>
        {authenticated && (
          <form action={vendorLogout} className="ml-auto">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Déconnexion
            </button>
          </form>
        )}
      </header>

      {authenticated ? <VendorInbox initialThreads={await getThreads()} /> : <VendorLogin />}
    </main>
  )
}
