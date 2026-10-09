"use server"

import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import {
  adjustAvailableSpins,
  claimUltimateSpin,
  getMachineState,
  listActiveVouchers,
  playAdminTrial,
  playSpin,
  quoteMachineVoucher,
} from "@/lib/slot-engine"
import type { MachineState, MachineVoucherView, PlayResult } from "@/lib/slot-public"

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

/** Crédite (delta > 0) ou retire (delta < 0) des tours jouables. Réservé à l'admin. */
export async function adjustClientSpins(userId: number, delta: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "Non autorisé." }
  const id = Math.trunc(userId)
  const n = Math.trunc(delta)
  if (!id || !Number.isFinite(n) || n === 0) return { ok: false as const, error: "Montant invalide." }
  const rows = await db.select({ token: users.token }).from(users).where(eq(users.id, id)).limit(1)
  const token = rows[0]?.token
  if (!token) return { ok: false as const, error: "Compte introuvable." }
  const res = await adjustAvailableSpins(token, n)
  if (!res.ok) return { ok: false as const, error: res.error }
  return { ok: true as const, available: res.available, changed: res.changed }
}
