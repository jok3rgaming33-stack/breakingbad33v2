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
export function deliveryStartStillAhead(dateStr: string, startHour: number, now = new Date()): boolean {
  const start = parisWallTime(dateStr, startHour, 0)
  return Number.isFinite(start.getTime()) && start.getTime() > now.getTime()
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
  slot: { label: string; startHour: number; days?: string[] },
  dateStr: string,
  now = new Date(),
): boolean {
  if (!dateStr) return true
  if (!slotMatchesDay(slot, frDayName(dateStr))) return false
  return deliveryStartStillAhead(dateStr, slot.startHour, now)
}
