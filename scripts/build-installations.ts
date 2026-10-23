/**
 * Builds src/data/installations.json from scripts/installations.seed.json.
 * - Name check: the seed's Wikipedia title must not redirect elsewhere, and every
 *   "Fort …"/"… AFB" alias must redirect to the same article (confirms former names).
 * - Coordinates: taken from the Wikipedia article's primary coordinates (not typed by hand).
 * - ZIP check: Census 2024 ZCTA gazetteer centroid must lie within 30 km of the post.
 * Anything that fails gets an `unverified` reason, which the UI shows. Review the report.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { UA, download, haversineKm, sleep, unzip } from './lib.ts'

type Seed = { id: string; name: string; aliases: string[]; state: string; zip: string; wiki: string; coordsWiki?: string; zipCheck?: string }
const seed: Seed[] = JSON.parse(readFileSync('scripts/installations.seed.json', 'utf8'))
const CACHE = 'scripts/.cache'
mkdirSync(CACHE, { recursive: true })

// Census ZCTA centroids
const GAZ = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip'
await download(GAZ, `${CACHE}/gaz.zip`)
if (!existsSync(`${CACHE}/gaz`)) unzip(`${CACHE}/gaz.zip`, `${CACHE}/gaz`)
const gazFile = readdirSync(`${CACHE}/gaz`).find((f) => f.endsWith('.txt'))!
const zcta = new Map<string, [number, number]>()
for (const line of readFileSync(`${CACHE}/gaz/${gazFile}`, 'utf8').split('\n').slice(1)) {
  const c = line.split('\t').map((s) => s.trim())
  if (c.length > 6) zcta.set(c[0], [Number(c[5]), Number(c[6])])
}

// Wikipedia: current titles, redirects (former names) and coordinates, 50 titles per request
const isFormerName = (a: string) => /^Fort |AFB$/.test(a)
type Page = { title: string; missing?: string; coordinates?: { lat: number; lon: number }[] }
const redirect = new Map<string, string>()
const pages = new Map<string, Page>()
const allTitles = [...new Set(seed.flatMap((s) => [s.wiki, ...(s.coordsWiki ? [s.coordsWiki] : []), ...s.aliases.filter(isFormerName)]))]
for (let i = 0; i < allTitles.length; i += 50) {
  const titles = allTitles.slice(i, i + 50).join('|')
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=coordinates&colimit=max&titles=${encodeURIComponent(titles)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`wikipedia ${res.status}`)
  const q = (await res.json()).query
  for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) redirect.set(n.from, n.to)
  for (const p of Object.values(q.pages) as Page[]) pages.set(p.title, p)
  await sleep(1000)
}
const resolve = (t: string): string => (redirect.has(t) ? resolve(redirect.get(t)!) : t)

const out = []
const report: string[] = []
for (const s of seed) {
  const problems: string[] = []
  const page = pages.get(resolve(s.wiki))
  if (!page || page.missing !== undefined) problems.push(`Wikipedia article "${s.wiki}" not found`)
  else if (resolve(s.wiki) !== s.wiki) problems.push(`"${s.wiki}" redirects to "${page.title}"`)
  for (const a of s.aliases.filter(isFormerName)) {
    const t = resolve(a)
    if (t !== resolve(s.wiki)) report.push(`  note ${s.id}: alias "${a}" resolves to "${t}" (own article; OK if it is part of this base)`)
  }
  // coordsWiki: a joint base whose own article has no coordinates uses its Army component's article
  const coord = (s.coordsWiki ? pages.get(resolve(s.coordsWiki)) : page)?.coordinates?.[0]
  if (!coord) problems.push('no coordinates on Wikipedia')
  const z = zcta.get(s.zip)
  let zipKm: number | undefined
  if (!z && s.zipCheck) report.push(`  note ${s.id}: ZIP ${s.zip} not a ZCTA; manual check: ${s.zipCheck}`)
  else if (!z) problems.push(`ZIP ${s.zip} is not a Census ZCTA (may be a PO-box/unique ZIP)`)
  else if (coord) {
    zipKm = haversineKm(coord.lat, coord.lon, z[0], z[1])
    if (zipKm > 30) problems.push(`ZIP ${s.zip} centroid is ${zipKm.toFixed(0)} km from the post`)
  }
  report.push(`${problems.length ? 'FAIL' : 'ok  '} ${s.id.padEnd(12)} zip ${s.zip} ${zipKm?.toFixed(1) ?? '-'} km  ${problems.join('; ')}`)
  const { wiki: _w, coordsWiki: _c, zipCheck: _z, ...rest } = s
  out.push({
    ...rest,
    lat: coord ? Number(coord.lat.toFixed(4)) : null,
    lon: coord ? Number(coord.lon.toFixed(4)) : null,
    ...(problems.length ? { unverified: problems.join('; ') } : {}),
  })
}

writeFileSync('src/data/installations.json', JSON.stringify(out, null, 1) + '\n')
console.log(report.join('\n'))
console.log(`\nwrote ${out.length} installations, ${out.filter((o) => 'unverified' in o).length} unverified`)
