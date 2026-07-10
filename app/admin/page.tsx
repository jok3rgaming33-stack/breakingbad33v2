import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { getThreads, getActiveOrders, getDiscussions } from "@/app/actions/messaging"
import { listUsers } from "@/app/actions/account"
import { listVerifications } from "@/app/actions/verification"
import { AdminGate } from "@/components/admin-gate"
import { AdminPanel } from "@/components/admin-panel"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Panel Admin — BreakingBad33",
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const authed = await isAdminAuthenticated()

  if (!authed) {
    return <AdminGate />
  }

  const [activeOrders, discussions, threads, usersList, verifications] = await Promise.all([
    getActiveOrders(),
    getDiscussions(),
    getThreads(),
    listUsers(),
    listVerifications(),
  ])

  return (
    <AdminPanel
      initialActiveOrders={activeOrders}
      initialDiscussions={discussions}
      initialThreads={threads}
      initialUsers={usersList}
      initialVerifications={verifications}
    />
  )
}
