"use server"

import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import {
  claimUltimateSpin,
  getMachineState,
  listActiveVouchers,
  playAdminTrial,
  playSpin,
  quoteMachineVoucher,
  type MachineState,
  type MachineVoucherView,
  type PlayResult,
} from "@/lib/slot-engine"

export type { MachineState, MachineVoucherView, PlayResult }

export async function loadMachine(token: string | null): Promise<{ state: MachineState; admin: boolean }> {
  const [state, admin] = await Promise.all([
    getMachineState(token),
    isAdminAuthenticated().catch(() => false),
  ])
  return { state, admin }
}

export async function spinMachine(token: string): Promise<PlayResult> {
  return playSpin(token)
}

export async function claimFreeSpin(token: string) {
  return claimUltimateSpin(token)
}

export async function spinAdminTrial(): Promise<PlayResult> {
  if (!(await isAdminAuthenticated())) {
    return { ok: false, error: "Accès admin requis." }
  }
  return playAdminTrial()
}

export async function previewMachineVoucher(input: {
  token: string
  code: string
  subtotal: number
  fulfillment: "livraison" | "meetup" | "locker"
  lat?: number | null
  lng?: number | null
  freeDeliveryActive?: boolean
  deliveryAlreadyFree?: boolean
}) {
  return quoteMachineVoucher(input)
}

export async function myMachineVouchers(token: string): Promise<MachineVoucherView[]> {
  if (!token?.trim()) return []
  return listActiveVouchers(token)
}
