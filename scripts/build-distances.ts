/**
 * Builds src/data/distances.json: driving miles for every installation pair, from the
 * public OSRM demo server (router.project-osrm.org, OpenStreetMap data, car profile).
 * 1 request/second per the server's usage policy; each pair is cached under
 * scripts/.cache/osrm/ so reruns only fetch new pairs. Pairs with no road route
 * (e.g. Hawaii ↔ mainland) are stored as null and the UI asks for DTOD miles.
 * These are planning distances; DTOD is the authoritative source for entitlements.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { UA, sleep } from './lib.ts'

type Inst = { id: string; lat: number; lon: number }
type Route = { code: string; routes?: { distance: number }[] }
type Listed = { id: string; lat: number | null; lon: number | null }
const all: Listed[] = JSON.parse(readFileSync('src/data/installations.json', 'utf8'))
// A post without coordinates (marked unverified) can't be routed; the UI asks for DTOD miles instead.
const insts = all.filter((i): i is Inst => i.lat !== null && i.lon !== null)
for (const i of all) if (!insts.includes(i as Inst)) console.log(`skipped ${i.id}: no coordinates`)
const CACHE = 'scripts/.cache/osrm'
mkdirSync(CACHE, { recursive: true })

const pairs: [Inst, Inst][] = []
for (let i = 0; i < insts.length; i++) for (let j = i + 1; j < insts.length; j++) pairs.push([insts[i], insts[j]])

const out: Record<string, number | null> = {}
let fetched = 0
let oldest = Date.now()
// Coordinates are part of the cache name, so a corrected post is fetched again.
const key = (i: Inst) => `${i.id}@${i.lat},${i.lon}`
for (const [a, b] of pairs) {
  const file = `${CACHE}/${key(a)}__${key(b)}.json`
  if (!existsSync(file)) {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`
    let body: Route | undefined
    for (let attempt = 0; attempt < 5 && !body; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      await sleep(1000)
      const json = (await res.json().catch(() => undefined)) as Route | undefined
      // NoRoute is a real answer (no road between the points); anything else non-Ok is retried.
      if (json?.code === 'Ok' || json?.code === 'NoRoute') body = json
      else await sleep(5000 * (attempt + 1))
    }
    if (!body) throw new Error(`OSRM failed for ${a.id}–${b.id}`)
    writeFileSync(file, JSON.stringify(body))
    if (++fetched % 50 === 0) console.log(`fetched ${fetched}…`)
  }
  oldest = Math.min(oldest, statSync(file).mtimeMs)
  const body = JSON.parse(readFileSync(file, 'utf8'))
  out[`${a.id}|${b.id}`] = body.code === 'Ok' ? Math.round(body.routes[0].distance / 1609.344) : null
}

writeFileSync(
  'src/data/distances.json',
  // `built` is the age of the oldest response used, not the day of this run.
  // shortcut: read from cache file times; store the date in each entry if the cache is ever copied without them.
  JSON.stringify({ source: 'OSRM router.project-osrm.org (OpenStreetMap), driving', built: new Date(oldest).toISOString().slice(0, 10), miles: out }) + '\n',
)
console.log(`wrote ${pairs.length} pairs (${fetched} fetched, ${Object.values(out).filter((v) => v === null).length} without a road route)`)
