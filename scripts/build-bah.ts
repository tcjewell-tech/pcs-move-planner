/**
 * Builds src/data/bah/bah.json from the DoD BAH ASCII download in data-raw/
 * (ZIP or extracted). Files, per the bundled ASCII-FILE-FORMAT.pdf:
 *   bahwYY.txt / bahwoYY.txt  MHA,E1..E9,W1..W5,O1E..O3E,O1..  (comma-delimited, with/without dependents)
 *   sorted_zipmhaYY.txt       "ZIP MHA"                         (space-delimited)
 *   mhanamesYY.txt            "MHA;NAME"                        (semicolon-delimited)
 * The 2003 format PDF stops at O7; the 2026 files carry 27 rates (O8–O10 appended).
 * Fails loudly on any layout it does not recognise. Never estimates a rate.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { unzip } from './lib.ts'

const RAW = 'data-raw'
const OUT_DIR = 'scripts/.cache/bah'
const GRADES = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `E-${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `W-${n}`),
  'O-1E', 'O-2E', 'O-3E',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `O-${n}`),
]
const fail = (msg: string): never => {
  console.error(`build-bah: ${msg}`)
  process.exit(1)
}

if (!existsSync(RAW)) fail(`no ${RAW}/ folder. Download the BAH ASCII ZIP from the DoD BAH Rate Lookup page into ${RAW}/.`)
const zips = readdirSync(RAW).filter((f) => /\.zip$/i.test(f))
let dir = RAW
if (zips.length) {
  if (zips.length > 1) fail(`more than one ZIP in ${RAW}/ (${zips.join(', ')}); keep only the current year`)
  dir = OUT_DIR
  rmSync(dir, { recursive: true, force: true }) // last year's files would match the patterns below
  unzip(`${RAW}/${zips[0]}`, dir)
}
const files = readdirSync(dir)
// The DoD ZIP also ships "… - old.txt" and "_26.dat" copies; only the plain names are current.
const pick = (re: RegExp) => {
  const m = files.filter((f) => re.test(f))
  if (m.length !== 1) fail(`expected one file matching ${re}, found: ${m.join(', ') || 'none'}`)
  return { file: m[0], yy: m[0].match(re)![1] }
}
const w = pick(/^bahw(\d\d)\.txt$/i)
const wo = pick(/^bahwo(\d\d)\.txt$/i)
const zm = pick(/^sorted_zipmha(\d\d)\.txt$/i)
const mn = pick(/^mhanames(\d\d)\.txt$/i)
if (new Set([w.yy, wo.yy, zm.yy, mn.yy]).size !== 1) fail('files are from different years')
const year = 2000 + Number(w.yy)
const lines = (f: string) => readFileSync(`${dir}/${f}`, 'utf8').split(/\r?\n/).filter((l) => l.trim())

function rates(file: string) {
  const out: Record<string, Record<string, number>> = {}
  for (const line of lines(file)) {
    const [mha, ...vals] = line.split(',').map((s) => s.trim())
    if (!/^[A-Z]{2}\d{3}$/.test(mha)) fail(`${file}: bad MHA "${mha}"`)
    if (vals.length !== GRADES.length) fail(`${file}: ${mha} has ${vals.length} rates, expected ${GRADES.length}`)
    const nums = vals.map(Number)
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) fail(`${file}: ${mha} has a non-positive or non-numeric rate`)
    out[mha] = Object.fromEntries(GRADES.map((g, i) => [g, nums[i]]))
  }
  return out
}
const withDeps = rates(w.file)
const without = rates(wo.file)
const mhas = Object.keys(withDeps)
if (mhas.length < 300) fail(`only ${mhas.length} MHAs in ${w.file}`)
if (mhas.length !== Object.keys(without).length || mhas.some((m) => !without[m])) fail('with/without files list different MHAs')

const mhaNames: Record<string, string> = {}
for (const line of lines(mn.file)) {
  const [mha, name] = line.split(';').map((s) => s.trim())
  if (!mha || !name) fail(`${mn.file}: bad line "${line}"`)
  mhaNames[mha] = name
}
const zipToMha: Record<string, string> = {}
for (const line of lines(zm.file)) {
  const m = line.match(/^(\d{5}) ([A-Z]{2}\d{3})$/)
  if (!m) fail(`${zm.file}: bad line "${line}"`)
  zipToMha[m![1]] = m![2]
}
if (Object.keys(zipToMha).length < 30000) fail(`only ${Object.keys(zipToMha).length} ZIPs in ${zm.file}`)

// O-7 and above: report how the file treats them rather than assuming.
const o7up = mhas.filter((m) => ['O-8', 'O-9', 'O-10'].some((g) => withDeps[m][g] !== withDeps[m]['O-7'] || without[m][g] !== without[m]['O-7']))
console.log(o7up.length ? `O-8..O-10 differ from O-7 in ${o7up.length} MHAs` : 'O-8, O-9, O-10 equal O-7 in every MHA (both files)')

const rateTable = Object.fromEntries(mhas.map((m) => [m, { with: withDeps[m], without: without[m] }]))
mkdirSync('src/data/bah', { recursive: true })
writeFileSync(
  'src/data/bah/bah.json',
  JSON.stringify({ year, source: `DoD BAH ASCII rate file ${year} (${w.file}, ${wo.file}, ${zm.file}, ${mn.file})`, mhaNames, zipToMha, rates: rateTable }) + '\n',
)

// Every installation ZIP must resolve to an MHA with rates.
const insts: { id: string; zip: string }[] = JSON.parse(readFileSync('src/data/installations.json', 'utf8'))
for (const i of insts) {
  const mha = zipToMha[i.zip]
  console.log(`${mha && rateTable[mha] ? 'ok  ' : 'MISS'} ${i.id.padEnd(12)} ${i.zip} → ${mha ?? '-'} ${mha ? mhaNames[mha] ?? '(no name)' : ''}`)
}
console.log(`\nwrote ${year}: ${mhas.length} MHAs, ${Object.keys(zipToMha).length} ZIPs`)
