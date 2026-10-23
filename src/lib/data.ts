import installationsJson from '../data/installations.json'
import distancesJson from '../data/distances.json'

export interface Installation {
  id: string
  name: string
  aliases: string[]
  state: string
  zip: string
  lat: number | null
  lon: number | null
  unverified?: string
}

export interface Bah {
  year: number
  source: string
  mhaNames: Record<string, string>
  zipToMha: Record<string, string>
  rates: Record<string, { with: Record<string, number>; without: Record<string, number> }>
}

export const installations = installationsJson as Installation[]
export const distances = distancesJson as { source: string; built: string; miles: Record<string, number | null> }

// BAH data is built from the DoD download (npm run build:bah); the app still runs without it.
const bahModules = import.meta.glob<{ default: Bah }>('../data/bah/bah.json', { eager: true })
export const bah: Bah | null = Object.values(bahModules)[0]?.default ?? null

export const BAH_LOOKUP_URL = 'https://militarypay.defense.gov/Pay/Basic-Allowance-for-Housing/BAH-Rate-Lookup/'

export const GRADES = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `E-${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `W-${n}`),
  'O-1E', 'O-2E', 'O-3E',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `O-${n}`),
]

export const isOconus = (i: Installation) => i.state === 'AK' || i.state === 'HI'

export function searchInstallations(q: string, limit = 8): Installation[] {
  const s = q.trim().toLowerCase()
  if (!s) return installations.slice(0, limit)
  return installations.filter((i) => [i.name, ...i.aliases].some((n) => n.toLowerCase().includes(s))).slice(0, limit)
}

/** OSRM driving miles; null when there is no road route or the pair is missing. */
export function drivingMiles(a: string, b: string): number | null {
  if (a === b) return 0
  return distances.miles[`${a}|${b}`] ?? distances.miles[`${b}|${a}`] ?? null
}

/** installation → ZIP → MHA → rates. Null when the ZIP has no MHA (never estimated). */
export function bahFor(i: Installation, data: Bah | null = bah) {
  const mha = data?.zipToMha[i.zip]
  if (!data || !mha || !data.rates[mha]) return null
  return { mha, name: data.mhaNames[mha] ?? mha, ...data.rates[mha] }
}
