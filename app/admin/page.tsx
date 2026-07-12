import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { getThreads, getActiveOrders, getLockerOrders, getDiscussions } from "@/app/actions/messaging"
import { listUsers } from "@/app/actions/account"
import { listVerifications } from "@/app/actions/verification"
import { listLoginLogs } from "@/app/actions/login-logs"
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

  const [activeOrders, lockerOrders, discussions, threads, usersList, verifications, loginLogs] = await Promise.all([
    getActiveOrders(),
    getLockerOrders(),
    getDiscussions(),
    getThreads(),
    listUsers(),
    listVerifications(),
    listLoginLogs(200),
  ])

  return (
    <AdminPanel
      initialActiveOrders={activeOrders}
      initialLockerOrders={lockerOrders}
      initialDiscussions={discussions}
      initialThreads={threads}
      initialUsers={usersList}
      initialVerifications={verifications}
      initialLoginLogs={loginLogs}
    />
  )
}
