import { getStaffInvite } from "@/app/actions/staff"
import { StaffOnboarding } from "@/components/staff-onboarding"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Rejoindre l'équipe — BreakingBad33",
  description: "Finalise ton inscription comme membre du staff.",
  robots: { index: false, follow: false },
}

export default async function StaffOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = await getStaffInvite(token)

  return <StaffOnboarding token={token} invite={invite} />
}
