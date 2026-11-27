import { useEffect, useState, type ChangeEvent, type FocusEvent, type ReactNode } from 'react'
import { InstallationPicker } from './InstallationPicker'
import { BAH_LOOKUP_URL, GRADES, bah, distances, installations } from './lib/data'
import { removedEvents, replacedEvents, toIcs, toSaved } from './lib/ics'
import { MAX_DAYS, MAX_MILES, capped, createMovePlan, defaultForm, fromSearch, normalizeDays, normalizeDueDay, normalizeMiles, toSearch, type PlannerFormState } from './lib/planner'
import { HOUSE_HUNTING_MAX_DAYS, TLE_CONUS_MAX_DAYS, daysBetween, povTravelSteps, travelBasis, type Kind, type PtdyPlacement } from './lib/rules'

const localToday = () => new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const signedUsd = (n: number) => (n > 0 ? '+' : '') + usd(n)
const fromToday = (today: string, d: string) => { const n = daysBetween(today, d); return n === 0 ? 'today' : n > 0 ? `in ${n} d` : `${-n} d ago` }

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

function Stat({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{children}</dd>
      {note && <dd className="text-xs text-slate-600 dark:text-slate-400">{note}</dd>}
    </div>
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

/** Today's local date, rechecked every minute so a tab left open overnight moves on. */
function useToday() {
  const [today, setToday] = useState(localToday)
  useEffect(() => {
    const t = setInterval(() => setToday(localToday()), 60_000)
    return () => clearInterval(t)
  }, [])
  return today
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const today = useToday()
  // The URL holds the whole form, so a bookmark or a texted link reopens the same plan. It goes in the
  // fragment (#…), which the browser never sends to the web host; older ?query links still open.
  const [form, setForm] = useState(() => fromSearch(window.location.hash.slice(1) || window.location.search, localToday()))
  const [copied, setCopied] = useState('')
  const set = <K extends keyof PlannerFormState>(k: K) => (v: PlannerFormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    const hash = `#${toSearch(form)}`
    if (hash !== window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname + hash)
  }, [form])
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(''), 2000)
    return () => clearTimeout(t)
  }, [copied])

  // A DTOD override belongs to one pair of stations, so changing either clears it.
  const pickStation = (k: 'from' | 'to') => (i: PlannerFormState['from']) => setForm((f) => ({ ...f, [k]: i, dtod: '' }))
  const swap = () => setForm((f) => ({ ...f, from: f.to, to: f.from, dtod: '' }))
  const copyLink = () => {
    const failed = () => setCopied('Copy failed — copy the address bar')
    if (!navigator.clipboard) return failed() // only offered on https and localhost
    navigator.clipboard.writeText(window.location.href).then(() => setCopied('Copied'), failed)
  }
  /** Props for a number box: capped while typing, normalized on leaving it, so it shows the value used. */
  const numberProps = (k: 'leaveDays' | 'ptdyDays' | 'tleOld' | 'tleNew' | 'outLead' | 'packLead' | 'rentDueDay' | 'dtod') => {
    const [max, normalize] = k === 'dtod' ? [MAX_MILES, normalizeMiles] : k === 'rentDueDay' ? [31, normalizeDueDay] : [MAX_DAYS, normalizeDays]
    return {
      type: 'number', inputMode: 'numeric' as const, min: k === 'rentDueDay' ? 1 : 0, max, step: 1, className: 'field', value: form[k],
      onChange: (e: ChangeEvent<HTMLInputElement>) => set(k)(capped(e.target.value, max)),
      onBlur: (e: FocusEvent<HTMLInputElement>) => set(k)(normalize(e.target.value)),
    }
  }

  const m = createMovePlan(form, today)
  const { plan } = m
  const basis = travelBasis(m.oconus)
  const dep = form.withDeps ? 'with' : 'without'

  const downloadIcs = () => {
    if (!plan || !form.from || !form.to || !m.planKey) return
    // The last download of this move, so events since removed from it can be cancelled. Another move keeps its own.
    const storeKey = `icsEvents:${m.planKey}`
    const route = `${form.from.name} → ${form.to.name}`
    let saved: string | null = null
    let last: { planKey?: unknown; route?: unknown } | null = null
    try {
      saved = localStorage.getItem(storeKey)
      last = JSON.parse(localStorage.getItem('icsLastMove') ?? 'null')
    } catch { /* storage blocked or unreadable */ }
    const removed = removedEvents(saved, plan.items)
    // A different pair of stations is either a second PCS or a corrected one; only the user knows which.
    if (last && typeof last.planKey === 'string' && typeof last.route === 'string' && last.planKey !== m.planKey
      && window.confirm(`Your last calendar download was for ${last.route}.\n\nDoes this plan replace it (for example, you corrected a station)?\nOK: this file cancels those events.\nCancel: keep both moves in your calendar.`)) {
      try {
        removed.push(...replacedEvents(localStorage.getItem(`icsEvents:${last.planKey}`), last.planKey))
        localStorage.removeItem(`icsEvents:${last.planKey}`)
      } catch { /* storage blocked */ }
    }
    const ics = toIcs(plan.items, { fromName: form.from.name, toName: form.to.name, planKey: m.planKey }, removed)
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    Object.assign(document.createElement('a'), { href: url, download: 'pcs-timeline.ics' }).click()
    URL.revokeObjectURL(url)
    try {
      localStorage.setItem(storeKey, toSaved(plan.items, removed))
      localStorage.setItem('icsLastMove', JSON.stringify({ planKey: m.planKey, route }))
    } catch { /* storage blocked */ }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">PCS Move Planner</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">U.S. Army CONUS PCS · travel days, BAH comparison and a back-planned timeline</p>
          {/* The form is hidden in print, so the printout names the stations here. */}
          <p className="mt-1 hidden text-sm print:block">Current duty station: <strong>{form.from?.name ?? '—'}</strong> · Gaining duty station: <strong>{form.to?.name ?? '—'}</strong></p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <label className="text-sm">
            <span className="sr-only">Theme</span>
            <select className="btn" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={copyLink}>Copy Share Link</button>
          <button type="button" className="btn" onClick={() => setForm(defaultForm(today))}>Reset</button>
          <button type="button" className="btn" onClick={() => window.print()}>Print / PDF</button>
          <button type="button" className="btn" onClick={downloadIcs} disabled={!plan}>Download .ics</button>
          <span role="status" className="text-xs text-slate-600 dark:text-slate-400">{copied}</span>
        </div>
      </header>

      <p role="note" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        Planning aid only — not an entitlement determination. Confirm with your S1, Finance, the transportation office and legal assistance.
      </p>

      <dl aria-label="PCS snapshot" className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Departure date" note={plan ? `Sign out ${fromToday(today, plan.signOut)} · report ${m.report}` : undefined}>
          {plan ? plan.signOut : <span className="text-sm font-normal">{m.report ? 'Enter official DTOD miles' : 'Enter a report date'}</span>}
        </Stat>
        <Stat label={`BAH change (${form.grade}, ${dep} dependents)`} note={m.bahChange ? `${signedUsd(m.bahChange.annual)}/year` : undefined}>
          {m.bahChange ? `${signedUsd(m.bahChange.monthly)}/month` : <span className="text-sm font-normal">{bah ? 'Rate not available for one station' : 'BAH data not built'}</span>}
        </Stat>
        <Stat label="Chargeable leave / travel days" note={plan ? <>{basis.title} days<Badge kind={basis.kind} /></> : undefined}>
          {plan ? `${plan.leave} leave · ${m.travelDays} travel` : <span className="text-sm font-normal">{m.report ? 'Enter official DTOD miles' : 'Enter a report date'}</span>}
        </Stat>
      </dl>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <form className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 print:hidden" onSubmit={(e) => e.preventDefault()}>
          <InstallationPicker label="Current duty station" value={form.from} onChange={pickStation('from')} />
          <button type="button" className="btn w-full" onClick={swap} disabled={!form.from && !form.to}>⇅ Swap Stations</button>
          <InstallationPicker label="Gaining duty station" value={form.to} onChange={pickStation('to')} />
          {bah && <p className="text-xs text-slate-600 dark:text-slate-400">Station not listed? Type its 5-digit ZIP code in either box.</p>}
          <Field label="Report date (from orders)"><input type="date" className="field" value={form.reportDate} onChange={(e) => set('reportDate')(e.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pay grade">
              <select className="field" value={form.grade} onChange={(e) => set('grade')(e.target.value)}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
            </Field>
            <Field label="Dependents">
              <select className="field" value={dep} onChange={(e) => set('withDeps')(e.target.value === 'with')}>
                <option value="with">With</option><option value="without">Without</option>
              </select>
            </Field>
          </div>
          <Field label="En-route leave (chargeable days)" kind="planning default"><input {...numberProps('leaveDays')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="House-hunting PTDY days" kind="regulatory limit" hint={`Max ${HOUSE_HUNTING_MAX_DAYS}, commander approval`}>
              <input {...numberProps('ptdyDays')} max={HOUSE_HUNTING_MAX_DAYS} />
            </Field>
            <Field label="PTDY placement" kind="planning default">
              <select className="field" value={form.ptdyPlacement} onChange={(e) => set('ptdyPlacement')(e.target.value as PtdyPlacement)}>
                <option value="before-report">Just before report date</option>
                <option value="after-departure">Right after departure</option>
                <option value="after-signin">After in-processing</option>
              </select>
            </Field>
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Day charging (AR 600-8-10)</legend>
            <label className="flex gap-2"><input type="checkbox" checked={form.signOutDayWorked} onChange={(e) => set('signOutDayWorked')(e.target.checked)} /> I'll work more than half of a scheduled duty day on sign-out day</label>
            <label className="flex gap-2"><input type="checkbox" checked={form.signInNotCharged || m.reportWeekend} disabled={m.reportWeekend} onChange={(e) => set('signInNotCharged')(e.target.checked)} /> Sign-in day not charged (work more than half of it, or non-duty day/holiday){m.reportWeekend && ' — report date is a weekend'}</label>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="TLE days, old PDS" kind="planning default"><input {...numberProps('tleOld')} /></Field>
            <Field label="TLE days, new PDS" kind="planning default"><input {...numberProps('tleNew')} /></Field>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">TLE: up to {TLE_CONUS_MAX_DAYS} days total for CONUS, split any way<Badge kind="regulatory limit" /></p>
          <Field label="Rent due day (blank if no lease)" hint="Days 29–31 fall on the last day of shorter months">
            <input {...numberProps('rentDueDay')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Notice delivered (optional)"><input type="date" className="field" value={form.noticeDate} onChange={(e) => set('noticeDate')(e.target.value)} /></Field>
            <Field label="Vacate by" kind="planning default" hint="Default: departure date"><input type="date" className="field" value={form.vacateDate} onChange={(e) => set('vacateDate')(e.target.value)} /></Field>
          </div>
          <Field label="Official DTOD miles (override)" hint="DTOD is authoritative for entitlements (CAC required). Replaces the computed distance everywhere. 0 miles gives 0 travel days (unverified, see VERIFY.md).">
            <input {...numberProps('dtod')} placeholder={m.computedMiles?.toString() ?? 'required for this pair'} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Out-processing lead (days)" kind="planning default"><input {...numberProps('outLead')} /></Field>
            <Field label="Pack-out lead (days)" kind="planning default"><input {...numberProps('packLead')} /></Field>
          </div>
        </form>

        <div className="space-y-4">
          {m.warnings.length > 0 && (
            <section role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100">
              <h2 className="mb-1 font-semibold">Warnings</h2>
              <ul className="list-disc pl-5">{m.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Travel">
              {m.miles === null ? <p className="text-sm">Enter official DTOD miles to compute travel days and the timeline.</p> : (
                <dl className="space-y-1 text-sm">
                  <div><dt className="inline font-medium">Distance: </dt><dd className="inline">{m.miles.toLocaleString()} mi {m.milesFromDtod ? '(official DTOD)' : '(computed driving distance, OSRM — not DTOD)'}</dd></div>
                  <div>
                    <dt className="font-medium">Formula (JTR par. 050205)</dt>
                    <dd className="font-mono text-xs">
                      {povTravelSteps(m.miles).map((line) => <span key={line} className="block">{line}</span>)}
                    </dd>
                  </div>
                  <div className="text-base"><dt className="inline font-medium">{basis.title} days: </dt><dd className="inline font-bold">{m.travelDays}</dd><Badge kind={basis.kind} /></div>
                  {m.oconus && <p className="text-xs text-amber-700 dark:text-amber-400">Alaska/Hawaii move: this count is not verified for it, because travel time depends on mode and ports. TLE OCONUS rules are out of scope for v1.</p>}
                </dl>
              )}
            </Card>

            <Card title={`BAH${bah ? ` (${bah.year})` : ''}`}>
              {!bah ? (
                <p className="text-sm">BAH data not built yet. Use the <a className="link" href={BAH_LOOKUP_URL} target="_blank" rel="noreferrer">official DoD BAH lookup</a>.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500 dark:text-slate-400"><th scope="col">{form.grade}</th><th scope="col">With deps</th><th scope="col">Without</th></tr></thead>
                    <tbody>
                      {[{ k: 'Current', inst: form.from, r: m.bahFrom }, { k: 'Gaining', inst: form.to, r: m.bahTo }].map(({ k, inst, r }) => (
                        <tr key={k} className="border-t border-slate-200 dark:border-slate-700">
                          <th scope="row" className="py-1 text-left font-normal">{k}<span className="block text-xs text-slate-500 dark:text-slate-400">{r ? `${r.mha} · ${r.name}` : inst ? `No MHA found for ZIP ${inst.zip}` : '—'}</span></th>
                          <td className={form.withDeps ? 'font-bold' : ''}>{r?.with[form.grade] !== undefined ? usd(r.with[form.grade]) : '—'}</td>
                          <td className={!form.withDeps ? 'font-bold' : ''}>{r?.without[form.grade] !== undefined ? usd(r.without[form.grade]) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {m.bahChange ? (
                    <p className="mt-2 text-sm">
                      Change ({dep} dependents): <strong>{usd(m.bahChange.monthly)}/month</strong>, {usd(m.bahChange.annual)}/year
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
                Sign out <strong>{plan.signOut}</strong> · report <strong>{m.report}</strong> · chargeable leave <strong>{plan.leave} day(s)</strong> (departure through report date, inclusive, minus {m.travelDays} travel{plan.enRoutePtdy > 0 ? ` and ${plan.enRoutePtdy} PTDY` : ''} day(s))
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                      <th scope="col" className="pr-2">Date</th><th scope="col" className="pr-2">From today</th><th scope="col" className="pr-2">Category</th><th scope="col" className="pr-2">Event</th><th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((it) => (
                      <tr key={it.id} className="border-t border-slate-200 align-top dark:border-slate-700">
                        <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-xs">{it.date}{it.end && it.end !== it.date && <> –<br />{it.end}</>}</td>
                        <td className="whitespace-nowrap pr-2 text-xs">{fromToday(today, it.date)}</td>
                        <td className="pr-2 text-xs">{it.category}</td>
                        <td className="pr-2">{it.label}<Badge kind={it.kind} /></td>
                        <td className="text-xs text-slate-600 dark:text-slate-400">{it.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 print:hidden">Each move between two stations keeps its own calendar events. A new .ics download for the same move updates them and marks events you have removed since your last download in this browser as cancelled. Calendar apps may handle this differently, so check your calendar after importing.</p>
            </Card>
          )}

          <footer className="text-xs text-slate-600 dark:text-slate-400">
            Data: BAH — DoD Defense Travel Management Office rate file{bah ? ` (${bah.year})` : ''}; distances — {distances.source}, built {distances.built}; installations — {installations.filter((i) => !i.unverified).length} of {installations.length} posts passed checks (see VERIFY.md).
            Rules: JTR pars. 050205, 050601; AR 600-8-10 (3 Jun 2020); 50 U.S.C. §3955.
          </footer>
        </div>
      </div>
    </div>
  )
}
