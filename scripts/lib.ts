import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

// Wikimedia rejects User-Agents without a URL or contact; OSRM and Census accept this too.
export const UA = 'pcs-move-planner-build/1.0 (https://www.mediawiki.org/wiki/API:Etiquette; local data build script)'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Extract a .zip with whatever the OS has: bsdtar (Windows, macOS) or unzip (Linux). */
export function unzip(zip: string, dir: string) {
  mkdirSync(dir, { recursive: true })
  try {
    execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'ignore' })
  } catch {
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
  }
}

export async function download(url: string, dest: string) {
  if (existsSync(dest)) return
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}
