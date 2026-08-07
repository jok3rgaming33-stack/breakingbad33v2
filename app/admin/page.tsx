import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { getThreads, getActiveOrders, getLockerOrders, getDiscussions, getPastOrders } from "@/app/actions/messaging"
import { listUsers } from "@/app/actions/account"
import { listVerifications } from "@/app/actions/verification"
import { listLoginLogs } from "@/app/actions/login-logs"
import { getProfitData } from "@/app/actions/profit"
import { listBroadcastNotifications } from "@/app/actions/notifications"
import { listStaff } from "@/app/actions/staff"
import { AdminGate } from "@/components/admin-gate"
import { AdminPanel } from "@/components/admin-panel"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Panel Admin — BreakingBad33",
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  // Ne jamais faire planter /admin si la session / DB échoue
  let authed = false
  try {
    authed = await isAdminAuthenticated()
  } catch (e) {
    console.error("[admin] isAdminAuthenticated failed:", e)
  }

  if (!authed) {
    return <AdminGate />
  }

  const empty = {
    activeOrders: [] as Awaited<ReturnType<typeof getActiveOrders>>,
    lockerOrders: [] as Awaited<ReturnType<typeof getLockerOrders>>,
    discussions: [] as Awaited<ReturnType<typeof getDiscussions>>,
    threads: [] as Awaited<ReturnType<typeof getThreads>>,
    pastOrders: [] as Awaited<ReturnType<typeof getPastOrders>>,
    usersList: [] as Awaited<ReturnType<typeof listUsers>>,
    verifications: [] as Awaited<ReturnType<typeof listVerifications>>,
    loginLogs: [] as Awaited<ReturnType<typeof listLoginLogs>>,
    profitData: {
      products: [],
      totalRevenue: 0,
      totalCost: 0,
      totalNetProfit: 0,
    } as Awaited<ReturnType<typeof getProfitData>>,
    notifHistory: [] as Awaited<ReturnType<typeof listBroadcastNotifications>>,
    staffList: [] as Awaited<ReturnType<typeof listStaff>>,
  }

  let data = empty
  try {
    // Prépare le schéma AVANT les lectures parallèles (évite listes vides
    // si une colonne optionnelle manque encore — données toujours en base).
    try {
      const { ensureFeatureSchema } = await import("@/lib/feature-schema")
      await ensureFeatureSchema()
    } catch (e) {
      console.error("[admin] ensureFeatureSchema", e)
    }

    const [
      activeOrders,
      lockerOrders,
      discussions,
      threads,
      pastOrders,
      usersList,
      verifications,
      loginLogs,
      profitData,
      notifHistory,
      staffList,
    ] = await Promise.all([
      getActiveOrders().catch((e) => {
        console.error("[admin] getActiveOrders", e)
        return empty.activeOrders
      }),
      getLockerOrders().catch((e) => {
        console.error("[admin] getLockerOrders", e)
        return empty.lockerOrders
      }),
      getDiscussions().catch((e) => {
        console.error("[admin] getDiscussions", e)
        return empty.discussions
      }),
      getThreads().catch((e) => {
        console.error("[admin] getThreads", e)
        return empty.threads
      }),
      getPastOrders().catch((e) => {
        console.error("[admin] getPastOrders", e)
        return empty.pastOrders
      }),
      listUsers().catch((e) => {
        console.error("[admin] listUsers", e)
        return empty.usersList
      }),
      listVerifications().catch((e) => {
        console.error("[admin] listVerifications", e)
        return empty.verifications
      }),
      listLoginLogs(200).catch((e) => {
        console.error("[admin] listLoginLogs", e)
        return empty.loginLogs
      }),
      getProfitData().catch((e) => {
        console.error("[admin] getProfitData", e)
        return empty.profitData
      }),
      listBroadcastNotifications(50).catch((e) => {
        console.error("[admin] listBroadcastNotifications", e)
        return empty.notifHistory
      }),
      listStaff().catch((e) => {
        console.error("[admin] listStaff", e)
        return empty.staffList
      }),
    ])
    data = {
      activeOrders,
      lockerOrders,
      discussions,
      threads,
      pastOrders,
      usersList,
      verifications,
      loginLogs,
      profitData,
      notifHistory,
      staffList,
    }
  } catch (e) {
    console.error("[admin] Promise.all failed:", e)
  }

  return (
    <AdminPanel
      initialActiveOrders={data.activeOrders}
      initialLockerOrders={data.lockerOrders}
      initialDiscussions={data.discussions}
      initialThreads={data.threads}
      initialPastOrders={data.pastOrders}
      initialUsers={data.usersList}
      initialVerifications={data.verifications}
      initialLoginLogs={data.loginLogs}
      initialProfitData={data.profitData}
      initialNotificationsHistory={data.notifHistory}
      initialStaff={data.staffList}
    />
  )
}
