import { getThreads } from "@/app/actions/messaging"
import { VendorInbox } from "@/components/vendor-inbox"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Messagerie · BreakingBad33",
  description: "Boîte de réception des commandes",
}

export default async function MessageriePage() {
  const threads = await getThreads()

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
      </header>
      <VendorInbox initialThreads={threads} />
    </main>
  )
}
