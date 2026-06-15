import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { getThreads } from "@/app/actions/messaging"
import { listUsers } from "@/app/actions/account"
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

  const [threads, usersList] = await Promise.all([getThreads(), listUsers()])

  return <AdminPanel initialThreads={threads} initialUsers={usersList} />
}
