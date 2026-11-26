import { useEffect, useState, type ReactNode } from 'react'
import { InstallationPicker } from './InstallationPicker'
import { BAH_LOOKUP_URL, GRADES, bah, bahFor, distances, drivingMiles, installations, isOconus, type Installation } from './lib/data'
import { toIcs } from './lib/ics'
import { DEFAULTS, HOUSE_HUNTING_MAX_DAYS, TLE_CONUS_MAX_DAYS, addDays, buildPlan, daysBetween, isWeekend, povTravelDays, type Kind, type PtdyPlacement } from './lib/rules'

const today = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
const byId = (id: string) => installations.find((i) => i.id === id) ?? null
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const num = (s: string) => (s === '' ? 0 : Math.max(0, Number(s)))

function Badge({ kind }: { kind: Kind }) {
  const color = kind === 'regulatory limit' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
    : kind === 'planning default' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
  return <span className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}>{kind}</span>
}

function Field({ label, kind, hint, children }: { label: string; kind?: Kind; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}{kind && <Badge kind={kind} />}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-slate-600 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function useTheme() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try { return (localStorage.getItem('theme') as 'light' | 'dark') ?? 'system' } catch { return 'system' }
  })
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    try { if (theme === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', theme) } catch { /* storage blocked */ }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  return [theme, setTheme] as const
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const [from, setFrom] = useState<Installation | null>(byId('bragg'))
  const [to, setTo] = useState<Installation | null>(byId('leavenworth'))
  const [reportDate, setReportDate] = useState(addDays(today, 90))
  const [grade, setGrade] = useState('E-7')
  const [withDeps, setWithDeps] = useState(true)
  const [leaveDays, setLeaveDays] = useState(String(DEFAULTS.leaveDays))
  const [ptdyDays, setPtdyDays] = useState(String(DEFAULTS.ptdyDays))
  const [ptdyPlacement, setPtdyPlacement] = useState<PtdyPlacement>(DEFAULTS.ptdyPlacement)
  const [signOutDayWorked, setSignOutDayWorked] = useState(DEFAULTS.signOutDayWorked)
  const [signInNotCharged, setSignInNotCharged] = useState(DEFAULTS.signInDayNotCharged)
  const [rentDueDay, setRentDueDay] = useState('1')
  const [noticeDate, setNoticeDate] = useState('')
  const [vacateDate, setVacateDate] = useState('')
  const [tleOld, setTleOld] = useState(String(DEFAULTS.tleOld))
  const [tleNew, setTleNew] = useState(String(DEFAULTS.tleNew))
  const [dtod, setDtod] = useState('')
  const [outLead, setOutLead] = useState(String(DEFAULTS.outprocessingLeadDays))
  const [packLead, setPackLead] = useState(String(DEFAULTS.packoutLeadDays))

  // A DTOD override belongs to one pair of stations, so changing either clears it.
  const pickStation = (set: (i: Installation) => void) => (i: Installation) => { set(i); setDtod('') }

  const computedMiles = from && to ? drivingMiles(from.id, to.id) : null
  const miles = dtod !== '' && Number(dtod) > 0 ? Number(dtod) : computedMiles
  const travelDays = miles === null ? null : povTravelDays(miles) // null = unknown, never 0
  const oconus = !!(from && to && (isOconus(from) || isOconus(to)))
  const reportWeekend = !!reportDate && isWeekend(reportDate)

  const plan = reportDate && travelDays !== null
    ? buildPlan({
        today, reportDate, travelDays, oconus,
        leaveDays: num(leaveDays), ptdyDays: num(ptdyDays), ptdyPlacement,
        signOutDayWorked, signInDayNotCharged: signInNotCharged || reportWeekend,
        tleOld: num(tleOld), tleNew: num(tleNew),
        rentDueDay: rentDueDay === '' ? null : Math.min(31, Math.max(1, Number(rentDueDay))),
        noticeDate: noticeDate || null, vacateDate: vacateDate || null,
        outprocessingLeadDays: num(outLead), packoutLeadDays: num(packLead),
      })
    : null

  const warnings = [
    ...(plan?.warnings ?? []),
    ...(miles === null && from && to ? ['No road distance for this pair (e.g. Hawaii) — enter official DTOD miles; travel days and the timeline are not computed.'] : []),
    ...[from, to].filter((i) => i?.unverified).map((i) => `${i!.name}: data unverified (${i!.unverified}).`),
  ]

  const downloadIcs = () => {
    if (!plan) return
    const url = URL.createObjectURL(new Blob([toIcs(plan.items)], { type: 'text/calendar' }))
    Object.assign(document.createElement('a'), { href: url, download: 'pcs-timeline.ics' }).click()
    URL.revokeObjectURL(url)
  }

  const bahFrom = from && bahFor(from)
  const bahTo = to && bahFor(to)
  const dep = withDeps ? 'with' : 'without'

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">PCS Move Planner</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">U.S. Army CONUS PCS · travel days, BAH comparison and a back-planned timeline</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <label className="text-sm">
            <span className="sr-only">Theme</span>
            <select className="btn" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button className="btn" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn" onClick={downloadIcs} disabled={!plan}>Download .ics</button>
        </div>
      </header>

      <p role="note" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        Planning aid only — not an entitlement determination. Confirm with your S1, Finance, the transportation office and legal assistance.
      </p>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <form className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 print:hidden" onSubmit={(e) => e.preventDefault()}>
          <InstallationPicker label="Current duty station" value={from} onChange={pickStation(setFrom)} />
          <InstallationPicker label="Gaining duty station" value={to} onChange={pickStation(setTo)} />
          <Field label="Report date (from orders)"><input type="date" className="field" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pay grade">
              <select className="field" value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
            </Field>
            <Field label="Dependents">
              <select className="field" value={withDeps ? 'with' : 'without'} onChange={(e) => setWithDeps(e.target.value === 'with')}>
                <option value="with">With</option><option value="without">Without</option>
              </select>
            </Field>
          </div>
          <Field label="En-route leave (chargeable days)" kind="planning default"><input type="number" min={0} className="field" value={leaveDays} onChange={(e) => setLeaveDays(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="House-hunting PTDY days" kind="regulatory limit" hint={`Max ${HOUSE_HUNTING_MAX_DAYS}, commander approval`}>
              <input type="number" min={0} max={HOUSE_HUNTING_MAX_DAYS} className="field" value={ptdyDays} onChange={(e) => setPtdyDays(e.target.value)} />
            </Field>
            <Field label="PTDY placement" kind="planning default">
              <select className="field" value={ptdyPlacement} onChange={(e) => setPtdyPlacement(e.target.value as PtdyPlacement)}>
                <option value="before-report">Just before report date</option>
                <option value="after-departure">Right after departure</option>
                <option value="after-signin">After in-processing</option>
              </select>
            </Field>
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Day charging (AR 600-8-10)</legend>
            <label className="flex gap-2"><input type="checkbox" checked={signOutDayWorked} onChange={(e) => setSignOutDayWorked(e.target.checked)} /> I'll work more than half of a scheduled duty day on sign-out day</label>
            <label className="flex gap-2"><input type="checkbox" checked={signInNotCharged || reportWeekend} disabled={reportWeekend} onChange={(e) => setSignInNotCharged(e.target.checked)} /> Sign-in day not charged (work more than half of it, or non-duty day/holiday){reportWeekend && ' — report date is a weekend'}</label>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="TLE days, old PDS" kind="planning default"><input type="number" min={0} className="field" value={tleOld} onChange={(e) => setTleOld(e.target.value)} /></Field>
            <Field label="TLE days, new PDS" kind="planning default"><input type="number" min={0} className="field" value={tleNew} onChange={(e) => setTleNew(e.target.value)} /></Field>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">TLE: up to {TLE_CONUS_MAX_DAYS} days total for CONUS, split any way<Badge kind="regulatory limit" /></p>
          <Field label="Rent due day (blank if no lease)" hint="Days 29–31 fall on the last day of shorter months">
            <input type="number" min={1} max={31} className="field" value={rentDueDay} onChange={(e) => setRentDueDay(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Notice delivered (optional)"><input type="date" className="field" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} /></Field>
            <Field label="Vacate by" kind="planning default" hint="Default: departure date"><input type="date" className="field" value={vacateDate} onChange={(e) => setVacateDate(e.target.value)} /></Field>
          </div>
          <Field label="Official DTOD miles (override)" hint="DTOD is authoritative for entitlements (CAC required). Replaces the computed distance everywhere.">
            <input type="number" min={0} className="field" value={dtod} onChange={(e) => setDtod(e.target.value)} placeholder={computedMiles?.toString() ?? 'required for this pair'} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Out-processing lead (days)" kind="planning default"><input type="number" min={0} className="field" value={outLead} onChange={(e) => setOutLead(e.target.value)} /></Field>
            <Field label="Pack-out lead (days)" kind="planning default"><input type="number" min={0} className="field" value={packLead} onChange={(e) => setPackLead(e.target.value)} /></Field>
          </div>
        </form>

        <div className="space-y-4">
          {warnings.length > 0 && (
            <section role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100">
              <h2 className="mb-1 font-semibold">Warnings</h2>
              <ul className="list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Travel">
              {miles === null ? <p className="text-sm">Enter official DTOD miles to compute travel days and the timeline.</p> : (
                <dl className="space-y-1 text-sm">
                  <div><dt className="inline font-medium">Distance: </dt><dd className="inline">{miles.toLocaleString()} mi {dtod !== '' && Number(dtod) > 0 ? '(official DTOD)' : '(computed driving distance, OSRM — not DTOD)'}</dd></div>
                  <div>
                    <dt className="font-medium">Formula (JTR par. 050205)</dt>
                    <dd className="font-mono text-xs">
                      {Math.round(miles) <= 400 ? `${Math.round(miles)} mi ≤ 400 → 1 day` : <>
                        {Math.round(miles)} ÷ 350 = {Math.floor(Math.round(miles) / 350)} remainder {Math.round(miles) % 350}<br />
                        remainder {Math.round(miles) % 350} {Math.round(miles) % 350 >= 51 ? '≥ 51 → +1 day' : '< 51 → no extra day'}
                      </>}
                    </dd>
                  </div>
                  <div className="text-base"><dt className="inline font-medium">Authorized travel days: </dt><dd className="inline font-bold">{travelDays}</dd><Badge kind="regulatory limit" /></div>
                  {oconus && <p className="text-xs text-amber-700 dark:text-amber-400">Alaska/Hawaii move: travel time depends on mode and ports; TLE OCONUS rules are out of scope for v1.</p>}
                </dl>
              )}
            </Card>

            <Card title={`BAH${bah ? ` (${bah.year})` : ''}`}>
              {!bah ? (
                <p className="text-sm">BAH data not built yet. Use the <a className="link" href={BAH_LOOKUP_URL} target="_blank" rel="noreferrer">official DoD BAH lookup</a>.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500 dark:text-slate-400"><th scope="col">{grade}</th><th scope="col">With deps</th><th scope="col">Without</th></tr></thead>
                    <tbody>
                      {[{ k: 'Current', inst: from, r: bahFrom }, { k: 'Gaining', inst: to, r: bahTo }].map(({ k, inst, r }) => (
                        <tr key={k} className="border-t border-slate-200 dark:border-slate-700">
                          <th scope="row" className="py-1 text-left font-normal">{k}<span className="block text-xs text-slate-500 dark:text-slate-400">{r ? `${r.mha} · ${r.name}` : inst ? `No MHA found for ZIP ${inst.zip}` : '—'}</span></th>
                          <td className={withDeps ? 'font-bold' : ''}>{r?.with[grade] !== undefined ? usd(r.with[grade]) : '—'}</td>
                          <td className={!withDeps ? 'font-bold' : ''}>{r?.without[grade] !== undefined ? usd(r.without[grade]) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bahFrom && bahTo && bahFrom[dep][grade] !== undefined && bahTo[dep][grade] !== undefined ? (
                    <p className="mt-2 text-sm">
                      Change ({withDeps ? 'with' : 'without'} dependents): <strong>{usd(bahTo[dep][grade] - bahFrom[dep][grade])}/month</strong>, {usd((bahTo[dep][grade] - bahFrom[dep][grade]) * 12)}/year
                    </p>
                  ) : <p className="mt-2 text-sm">Rate not available for one station — see the official lookup.</p>}
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{bah.source} · <a className="link" href={BAH_LOOKUP_URL} target="_blank" rel="noreferrer">Official DoD BAH lookup</a></p>
                </>
              )}
            </Card>
          </div>

          {plan && (
            <Card title="Timeline">
              <p className="mb-3 text-sm">
                Sign out <strong>{plan.signOut}</strong> · report <strong>{reportDate}</strong> · chargeable leave <strong>{plan.leave} day(s)</strong> (departure through report date, inclusive, minus {travelDays} travel{ptdyPlacement !== 'after-signin' && num(ptdyDays) > 0 ? ` and ${num(ptdyDays)} PTDY` : ''} day(s))
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                      <th scope="col" className="pr-2">Date</th><th scope="col" className="pr-2">From today</th><th scope="col" className="pr-2">Category</th><th scope="col" className="pr-2">Event</th><th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((it, n) => (
                      <tr key={n} className="border-t border-slate-200 align-top dark:border-slate-700">
                        <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-xs">{it.date}{it.end && it.end !== it.date && <> –<br />{it.end}</>}</td>
                        <td className="whitespace-nowrap pr-2 text-xs">{(() => { const d = daysBetween(today, it.date); return d === 0 ? 'today' : d > 0 ? `in ${d} d` : `${-d} d ago` })()}</td>
                        <td className="pr-2 text-xs">{it.category}</td>
                        <td className="pr-2">{it.label}<Badge kind={it.kind} /></td>
                        <td className="text-xs text-slate-600 dark:text-slate-400">{it.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <footer className="text-xs text-slate-600 dark:text-slate-400">
            Data: BAH — DoD Defense Travel Management Office rate file{bah ? ` (${bah.year})` : ''}; distances — {distances.source}, built {distances.built}; installations — verified {installations.length} posts (see VERIFY.md).
            Rules: JTR pars. 050205, 050601; AR 600-8-10 (3 Jun 2020); 50 U.S.C. §3955.
          </footer>
        </div>
      </div>
    </div>
  )
}
