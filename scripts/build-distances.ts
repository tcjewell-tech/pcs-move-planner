/**
 * Builds src/data/distances.json: driving miles for every installation pair, from the
 * public OSRM demo server (router.project-osrm.org, OpenStreetMap data, car profile).
 * 1 request/second per the server's usage policy; each pair is cached under
 * scripts/.cache/osrm/ so reruns only fetch new pairs. Pairs with no road route
 * (e.g. Hawaii ↔ mainland) are stored as null and the UI asks for DTOD miles.
 * These are planning distances; DTOD is the authoritative source for entitlements.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { UA, sleep } from './lib.ts'

type Inst = { id: string; lat: number; lon: number }
const insts: Inst[] = JSON.parse(readFileSync('src/data/installations.json', 'utf8'))
const CACHE = 'scripts/.cache/osrm'
mkdirSync(CACHE, { recursive: true })

const pairs: [Inst, Inst][] = []
for (let i = 0; i < insts.length; i++) for (let j = i + 1; j < insts.length; j++) pairs.push([insts[i], insts[j]])

const out: Record<string, number | null> = {}
let fetched = 0
for (const [a, b] of pairs) {
  const file = `${CACHE}/${a.id}__${b.id}.json`
  if (!existsSync(file)) {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`
    let body: { code: string; routes?: { distance: number }[] } | undefined
    for (let attempt = 0; attempt < 5 && !body; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      await sleep(1000)
      const json = await res.json().catch(() => undefined)
      // NoRoute is a real answer (no road between the points); anything else non-Ok is retried.
      if (json?.code === 'Ok' || json?.code === 'NoRoute') body = json
      else await sleep(5000 * (attempt + 1))
    }
    if (!body) throw new Error(`OSRM failed for ${a.id}–${b.id}`)
    writeFileSync(file, JSON.stringify(body))
    if (++fetched % 50 === 0) console.log(`fetched ${fetched}…`)
  }
  const body = JSON.parse(readFileSync(file, 'utf8'))
  out[`${a.id}|${b.id}`] = body.code === 'Ok' ? Math.round(body.routes[0].distance / 1609.344) : null
}

writeFileSync(
  'src/data/distances.json',
  JSON.stringify({ source: 'OSRM router.project-osrm.org (OpenStreetMap), driving', built: new Date().toISOString().slice(0, 10), miles: out }) + '\n',
)
console.log(`wrote ${pairs.length} pairs (${fetched} fetched, ${Object.values(out).filter((v) => v === null).length} without a road route)`)
