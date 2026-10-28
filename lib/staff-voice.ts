/** Qui parle au client. Le client voit ce nom sous le message. */
export const STAFF_VOICES = [
  { id: "chimiste", label: "Le chimiste" },
  { id: "livreur", label: "Le livreur" },
  { id: "sav", label: "Le SAV" },
] as const

export type StaffVoice = (typeof STAFF_VOICES)[number]["id"]

export function asStaffVoice(value: unknown): StaffVoice | null {
  return STAFF_VOICES.some((v) => v.id === value) ? (value as StaffVoice) : null
}

export function staffVoiceLabel(role: string | null | undefined): string | null {
  return STAFF_VOICES.find((v) => v.id === role)?.label ?? null
}

/** Nom montré au client. Un message sans rôle reste Le chimiste. */
export function clientVoiceLabel(role: string | null | undefined): string {
  return staffVoiceLabel(role) ?? "Le chimiste"
}
