/** Données inspirées du Guide TripSit des combinaisons (combo.tripsit.me). Guide, pas un avis médical. */

export type ComboLevel = "self" | "synergy" | "safe" | "attenuate" | "caution" | "risk" | "danger"

export type SubstanceGroup =
  | "psychedelic"
  | "dissociative"
  | "cannabis"
  | "stimulant"
  | "depressant"
  | "other"

export type Substance = {
  id: string
  label: string
  group: SubstanceGroup
}

export const SUBSTANCES: Substance[] = [
  { id: "lsd", label: "LSD", group: "psychedelic" },
  { id: "champignons", label: "Champignons", group: "psychedelic" },
  { id: "dmt", label: "DMT", group: "psychedelic" },
  { id: "mescaline", label: "Mescaline", group: "psychedelic" },
  { id: "dox", label: "DOx", group: "psychedelic" },
  { id: "nbomes", label: "NBOMes", group: "psychedelic" },
  { id: "2cx", label: "2C-x", group: "psychedelic" },
  { id: "2ctx", label: "2C-T-x", group: "psychedelic" },
  { id: "5meo", label: "5-MeO-xxT", group: "psychedelic" },
  { id: "cannabis", label: "Cannabis", group: "cannabis" },
  { id: "ketamine", label: "Kétamine", group: "dissociative" },
  { id: "mxe", label: "MXE", group: "dissociative" },
  { id: "dxm", label: "DXM", group: "dissociative" },
  { id: "n2o", label: "Gaz hilarant", group: "dissociative" },
  { id: "amphet", label: "Amphétamines", group: "stimulant" },
  { id: "mdma", label: "MDMA", group: "stimulant" },
  { id: "cocaine", label: "Cocaïne", group: "stimulant" },
  { id: "cafeine", label: "Caféine", group: "stimulant" },
  { id: "alcool", label: "Alcool", group: "depressant" },
  { id: "ghb", label: "GHB/GBL", group: "depressant" },
  { id: "opiaces", label: "Opiacés", group: "depressant" },
  { id: "tramadol", label: "Tramadol", group: "depressant" },
  { id: "benzos", label: "Benzodiazépines", group: "depressant" },
  { id: "imao", label: "IMAOs", group: "other" },
  { id: "isrs", label: "ISRSs", group: "other" },
]

const N = SUBSTANCES.length

const CODE: Record<string, ComboLevel> = {
  x: "self",
  s: "synergy",
  o: "safe",
  a: "attenuate",
  c: "caution",
  r: "risk",
  d: "danger",
}

/**
 * 25 lignes × 25 colonnes, même ordre que SUBSTANCES.
 * x self · s synergie · o peu de risque · a atténuation · c attention · r risque · d danger
 */
const RAW = [
  "xsssssssscsssscscoaaoraaa",
  "sxssssssscsssscscoaaoraaa",
  "ssxsssssscsssscscoaaoraaa",
  "sssxccccccsssscscoaaoraaa",
  "ssscxcccccsccrsccoaaoraca",
  "sssccxccccsccrsccoaaoraca",
  "ssscccxcccsccrsccoaaoraca",
  "sssccccxccsccrsccoaaoraca",
  "ssscccccxcsccrsccoaaorada",
  "cccccccccxsssscsoosssaaoo",
  "ssssssssssxsssocccoddddco",
  "ssscccccccsxsoccccoddddcc",
  "ssssrrrrrsoxsorcrdddddddc",
  "sssssssssssssxs sscocccao",
  "ccccccccccrcrxcccccdccdco",
  "ssscccccccsccdscxcccoddao",
  "ccccccccccrcrcccxcrddddoo",
  "oooooooooooooooocxooooooo",
  "aaaaaaaaasdddcccrxddddddc",
  "aaaaaaaaasdddcccrdxdddddo",
  "ooooooooosdddcodddxdddco",
  "rrrrrrrrrsdddcdeddddxdddr",
  "aaaaaaaaasdddcaddddddxdoo",
  "aaaccccacascccdddddddddxd",
  "aaaaaaaaaoocoooocoroodx",
].map((s) => s.replace(/\s+/g, ""))

function cell(i: number, j: number, ch: string): ComboLevel {
  if (i === j) return "self"
  return CODE[ch] ?? "caution"
}

function buildGrid(): ComboLevel[][] {
  const g: ComboLevel[][] = Array.from({ length: N }, () => Array<ComboLevel>(N).fill("caution"))
  for (let i = 0; i < N; i++) {
    const row = (RAW[i] ?? "").padEnd(N, "c").slice(0, N)
    for (let j = 0; j < N; j++) g[i][j] = cell(i, j, row[j] ?? "c")
  }
  // Symétrie : on privilégie le danger le plus élevé si conflit
  const rank: Record<ComboLevel, number> = {
    self: 0,
    synergy: 1,
    safe: 2,
    attenuate: 3,
    caution: 4,
    risk: 5,
    danger: 6,
  }
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = g[i][j]
      const b = g[j][i]
      const worst = rank[a] >= rank[b] ? a : b
      g[i][j] = worst
      g[j][i] = worst
    }
  }
  return g
}

export const COMBO_GRID = buildGrid()

export function comboOf(a: number, b: number): ComboLevel {
  if (a === b) return "self"
  return COMBO_GRID[a]?.[b] ?? "caution"
}

export const COMBO_META: Record<
  ComboLevel,
  { label: string; hint: string; color: string; bg: string; symbol: string }
> = {
  self: {
    label: "Même substance",
    hint: "Pas un mélange — reste sur le dosage.",
    color: "#a1a1aa",
    bg: "#141414",
    symbol: "·",
  },
  synergy: {
    label: "Peu de risque · synergie",
    hint: "Les effets se renforcent. Commence plus bas que d'habitude.",
    color: "#9ec5b4",
    bg: "#1a3d2e",
    symbol: "↑",
  },
  safe: {
    label: "Peu de risque",
    hint: "Pas d'interaction majeure connue. La prudence reste de mise.",
    color: "#86efac",
    bg: "#14532d",
    symbol: "○",
  },
  attenuate: {
    label: "Peu de risque · atténuation",
    hint: "L'un peut masquer l'autre. Risque de surdosage si tu compenses.",
    color: "#7dd3fc",
    bg: "#0c4a6e",
    symbol: "↓",
  },
  caution: {
    label: "Attention",
    hint: "Interaction possible. Doses très basses, ne sois pas seul.",
    color: "#fde047",
    bg: "#422006",
    symbol: "▲",
  },
  risk: {
    label: "Risque",
    hint: "Mélange déconseillé (cœur, serotoninergie, tension…).",
    color: "#fdba74",
    bg: "#7c2d12",
    symbol: "♥",
  },
  danger: {
    label: "Danger",
    hint: "À éviter : dépression respiratoire, crise, décès possible.",
    color: "#fca5a5",
    bg: "#7f1d1d",
    symbol: "✕",
  },
}

export const GROUP_LABEL: Record<SubstanceGroup, string> = {
  psychedelic: "Psychédéliques",
  cannabis: "Cannabis",
  dissociative: "Dissociatifs",
  stimulant: "Stimulants",
  depressant: "Dépresseurs",
  other: "Médicaments",
}

export const HARM_TIPS = [
  "Bois de l'eau régulièrement — sans te forcer en litres.",
  "Veille sur tes potes, et désigne quelqu'un sobre.",
  "Préservatifs : les substances baissent les inhibitions.",
  "Protège tes oreilles en milieu sonore.",
  "Prévois du repos après la session.",
  "Écoute ton corps : malaise = stop.",
  "Informe-toi (dosage, set & setting, tests si possible).",
  "Teste par petites quantités, surtout un nouveau batch.",
  "Planifie ta conso — pas l'estomac vide, pas au volant.",
  "Évite les mélanges, surtout les dépresseurs entre eux.",
  "Ne partage pas ton matériel (pipe, paille, seringue).",
  "Ne conduis pas. Point.",
]
