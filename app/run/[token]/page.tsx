import type { Metadata } from "next"
import { RunDeliveryClient } from "@/app/run/[token]/run-delivery-client"

export const metadata: Metadata = {
  title: "Mode tournée — BreakingBad33",
  robots: { index: false, follow: false },
}

export default async function RunDeliveryPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <RunDeliveryClient token={token} />
}
