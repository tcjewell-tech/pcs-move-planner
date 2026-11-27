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
const bahModules = import.meta.glob<{ default: Bah }>('../data/bah/*.json', { eager: true })
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
  const typed = zipStation(s)
  // Listed posts at that ZIP come first: they have stored distances.
  if (typed) return [...installations.filter((i) => i.zip === typed.zip), typed]
  return installations.filter((i) => [i.name, ...i.aliases].some((n) => n.toLowerCase().includes(s))).slice(0, limit)
}

export const isZipStation = (i: Installation) => i.id.startsWith('zip:')

/**
 * A duty station that isn't listed, typed as "28310" or "ZIP 28310". Null unless the BAH file has
 * rates for that ZIP. It has no coordinates, so travel miles must come from DTOD.
 */
export function zipStation(q: string, data: Bah | null = bah): Installation | null {
  const zip = /^(?:zip\s*)?(\d{5})$/i.exec(q.trim())?.[1]
  const mha = zip && data?.zipToMha[zip]
  if (!zip || !mha || !data?.rates[mha]) return null
  // County cost group codes (ZZ…) don't name a state. A test checks no Alaska or Hawaii ZIP is in one.
  const state = mha.startsWith('ZZ') ? '' : mha.slice(0, 2)
  return { id: `zip:${zip}`, name: `ZIP ${zip}`, aliases: [], state, zip, lat: null, lon: null }
}

/** Listed posts in the same housing area (MHA) as a typed-ZIP station: picking one gives stored miles. */
export function listedInSameMha(station: Installation, data: Bah | null = bah): Installation[] {
  const mha = isZipStation(station) ? bahFor(station, data)?.mha : undefined
  return mha ? installations.filter((i) => bahFor(i, data)?.mha === mha) : []
}

/** OSRM driving miles; null when there is no road route or the pair is missing. */
export function drivingMiles(a: string, b: string): number | null {
  if (a === b) return 0
  return distances.miles[`${a}|${b}`] ?? distances.miles[`${b}|${a}`] ?? null
}

/** Warning text when the report date is in a later year than the loaded rates; else null. */
export function bahStaleWarning(reportDate: string | null, data: Bah | null = bah) {
  const year = Number(reportDate?.slice(0, 4))
  if (!data || !(year > data.year)) return null
  return `BAH shown is the ${data.year} rate, but your report date is in ${year}. Rates change 1 January — check the official DoD BAH lookup.`
}

/** installation → ZIP → MHA → rates. Null when the ZIP has no MHA (never estimated). */
export function bahFor(i: Installation, data: Bah | null = bah) {
  const mha = data?.zipToMha[i.zip]
  if (!data || !mha || !data.rates[mha]) return null
  return { mha, name: data.mhaNames[mha] ?? mha, ...data.rates[mha] }
}
