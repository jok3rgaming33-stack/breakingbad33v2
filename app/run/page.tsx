import type { Metadata } from "next"
import { RunHubClient } from "@/app/run/run-hub-client"

export const metadata: Metadata = {
  title: "Tournée — BreakingBad33",
  robots: { index: false, follow: false },
}

export default function RunHubPage() {
  return <RunHubClient />
}
