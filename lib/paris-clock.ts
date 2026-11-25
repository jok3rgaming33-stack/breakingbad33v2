const PARIS = "Europe/Paris"

export function parisParts(now: Date) {
  const bag: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now)) {
    if (part.type !== "literal") bag[part.type] = part.value
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  }
}

/** Instant réel d'une heure affichée à Paris (yyyy-mm-dd + heure 0–23). */
export function parisWallTime(dateStr: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d || hour < 0 || hour > 23) return new Date(NaN)
  let utc = Date.UTC(y, m - 1, d, hour, minute, 0, 0)
  for (let i = 0; i < 4; i++) {
    const p = parisParts(new Date(utc))
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    const want = Date.UTC(y, m - 1, d, hour, minute)
    const delta = want - got
    if (delta === 0) break
    utc += delta
  }
  return new Date(utc)
}

/** Le créneau est encore choisissable seulement si son heure de début n'a pas commencé. */
export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) return dateStr
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function deliveryStartStillAhead(dateStr: string, startHour: number, now = new Date()): boolean {
  // 00h–05h continue la soirée : le créneau « 00h-01h » du lundi a lieu dans la nuit de lundi à mardi.
  const day = startHour < 6 ? addDaysStr(dateStr, 1) : dateStr
  const start = parisWallTime(day, startHour, 0)
  return Number.isFinite(start.getTime()) && start.getTime() > now.getTime()
}

/** Un créneau reste proposé jusqu'à cette marge (min) avant sa fin. Créneau d'1h : jusqu'à son début. */
export const SLOT_CLOSE_BEFORE_END_MIN = 60

/** "19h-01h" → 1. null si le label n'est pas une plage horaire. */
export function slotEndHourFromLabel(label: string): number | null {
  const m = label.match(/(\d{1,2})\s*h\s*[-–—]\s*(\d{1,2})\s*h/i)
  if (!m) return null
  const h = Number(m[2])
  if (!Number.isInteger(h) || h < 0 || h > 24) return null
  return h === 24 ? 0 : h
}

/**
 * Le créneau est-il encore proposable ?
 * Oui jusqu'à (fin − 1h), et au minimum jusqu'à son début.
 * 13h-19h reste ouvert jusqu'à 18h ; 19h-01h jusqu'à minuit ; un créneau d'1h jusqu'à son début.
 */
export function deliverySlotStillOpen(
  dateStr: string,
  startHour: number,
  endHour?: number | null,
  now = new Date(),
): boolean {
  const startDay = startHour < 6 ? addDaysStr(dateStr, 1) : dateStr
  const start = parisWallTime(startDay, startHour, 0)
  if (!Number.isFinite(start.getTime())) return false
  let cutoff = start.getTime()
  if (endHour != null && Number.isFinite(endHour)) {
    const h = ((Math.trunc(endHour) % 24) + 24) % 24
    const endDay = h <= startHour ? addDaysStr(startDay, 1) : startDay
    const end = parisWallTime(endDay, h, 0)
    if (Number.isFinite(end.getTime())) {
      cutoff = Math.max(cutoff, end.getTime() - SLOT_CLOSE_BEFORE_END_MIN * 60_000)
    }
  }
  return cutoff > now.getTime()
}

const FR_DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]

export function frDayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) return ""
  return FR_DAYS[new Date(y, m - 1, d).getDay()] ?? ""
}

/** Jour du créneau : days[] admin, sinon le premier mot du label ("Lundi 12h-13h"). */
export function slotMatchesDay(slot: { label: string; days?: string[] }, dayName: string): boolean {
  if (!dayName) return true
  if (slot.days && slot.days.length > 0) return slot.days.includes(dayName)
  const first = (slot.label.split(/\s+/)[0] ?? "").trim()
  if (FR_DAYS.includes(first)) return first === dayName
  return true
}

export function deliverySlotChoosable(
  slot: { label: string; startHour: number; endHour?: number; days?: string[] },
  dateStr: string,
  now = new Date(),
): boolean {
  if (!dateStr) return true
  if (!slotMatchesDay(slot, frDayName(dateStr))) return false
  return deliverySlotStillOpen(dateStr, slot.startHour, slot.endHour ?? slotEndHourFromLabel(slot.label), now)
}
