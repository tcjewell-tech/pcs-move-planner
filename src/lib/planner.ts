/**
 * Form state → plan, as pure functions: no DOM, no storage. App.tsx keeps the state and renders
 * what createMovePlan returns; the URL holds the same state through toSearch / fromSearch.
 */
import { GRADES, bah as bundledBah, bahFor, bahStaleWarning, drivingMiles, installations, isOconus, zipStation, type Bah, type Installation } from './data'
import { DEFAULTS, addDays, buildPlan, inputWarnings, isPlanDate, isWeekend, povTravelDays, type ISODate, type PtdyPlacement } from './rules'

export interface PlannerFormState {
  from: Installation | null
  to: Installation | null
  reportDate: string
  grade: string
  withDeps: boolean
  leaveDays: string
  ptdyDays: string
  ptdyPlacement: PtdyPlacement
  signOutDayWorked: boolean
  signInNotCharged: boolean
  /** Blank when there is no lease. */
  rentDueDay: string
  noticeDate: string
  vacateDate: string
  tleOld: string
  tleNew: string
  /** Official DTOD miles; blank uses the stored distance. */
  dtod: string
  outLead: string
  packLead: string
}

// Input bounds, not regulatory limits: they keep date math in range.
export const MAX_DAYS = 365
export const MAX_MILES = 25_000

const byId = (id: string) => installations.find((i) => i.id === id) ?? null

export const defaultForm = (today: ISODate): PlannerFormState => ({
  from: byId('bragg'), to: byId('leavenworth'), reportDate: addDays(today, 90), grade: 'E-7', withDeps: true,
  leaveDays: String(DEFAULTS.leaveDays), ptdyDays: String(DEFAULTS.ptdyDays), ptdyPlacement: DEFAULTS.ptdyPlacement,
  signOutDayWorked: DEFAULTS.signOutDayWorked, signInNotCharged: DEFAULTS.signInDayNotCharged,
  rentDueDay: '1', noticeDate: '', vacateDate: '', tleOld: String(DEFAULTS.tleOld), tleNew: String(DEFAULTS.tleNew),
  dtod: '', outLead: String(DEFAULTS.outprocessingLeadDays), packLead: String(DEFAULTS.packoutLeadDays),
})

// ─── Number inputs ───────────────────────────────────────────────────────────
// Each returns the text the box should show, which is exactly the value the plan uses.

/** Whole days 0–365; blank or unreadable → 0. */
export const normalizeDays = (v: string) => String(Math.min(MAX_DAYS, Math.max(0, Math.floor(Number(v) || 0))))
/** Whole miles 0–25,000, or blank (use the stored distance). */
export const normalizeMiles = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? '' : String(Math.min(MAX_MILES, Math.max(0, Math.round(Number(v))))))
/** Day of month 1–31, or blank (no lease). */
export const normalizeDueDay = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? '' : String(Math.min(31, Math.max(1, Math.floor(Number(v))))))
/** While typing: only cap the value, so a half-typed number isn't rewritten under the cursor. */
export const capped = (v: string, max = MAX_DAYS) => (Number(v) > max ? String(max) : v)

const days = (v: string) => Number(normalizeDays(v))

// ─── The plan ────────────────────────────────────────────────────────────────

/** One PCS move, for calendar UIDs: the same pair of stations is the same move, whatever the dates. */
export const planKey = (from: Installation, to: Installation) => `${from.id}-to-${to.id}`

export function createMovePlan(form: PlannerFormState, today: ISODate, data: Bah | null = bundledBah) {
  const { from, to } = form
  const computedMiles = from && to ? drivingMiles(from.id, to.id) : null
  const dtod = normalizeMiles(form.dtod)
  const milesFromDtod = dtod !== '' // 0 is a real DTOD answer: a local move
  const miles = milesFromDtod ? Number(dtod) : computedMiles
  const travelDays = miles === null ? null : povTravelDays(miles) // null = unknown, never 0
  const oconus = !!(from && to && (isOconus(from) || isOconus(to)))
  const report = isPlanDate(form.reportDate) ? form.reportDate : null
  const reportWeekend = !!report && isWeekend(report)
  const rent = normalizeDueDay(form.rentDueDay)

  const plan = report && travelDays !== null
    ? buildPlan({
        today, reportDate: report, travelDays, oconus,
        leaveDays: days(form.leaveDays), ptdyDays: days(form.ptdyDays), ptdyPlacement: form.ptdyPlacement,
        signOutDayWorked: form.signOutDayWorked, signInDayNotCharged: form.signInNotCharged,
        tleOld: days(form.tleOld), tleNew: days(form.tleNew),
        rentDueDay: rent === '' ? null : Number(rent),
        noticeDate: isPlanDate(form.noticeDate) ? form.noticeDate : null,
        vacateDate: isPlanDate(form.vacateDate) ? form.vacateDate : null,
        outprocessingLeadDays: days(form.outLead), packoutLeadDays: days(form.packLead),
      })
    : null

  const staleBah = bahStaleWarning(report, data)
  const warnings = [
    ...(plan?.warnings ?? []),
    ...(staleBah ? [staleBah] : []),
    ...inputWarnings({ reportDate: form.reportDate, noticeDate: form.noticeDate, vacateDate: form.vacateDate, milesUnknown: miles === null && !!from && !!to, stations: [from, to].filter((i) => i !== null) }),
  ]

  const bahFrom = from && bahFor(from, data)
  const bahTo = to && bahFor(to, data)
  const dep = form.withDeps ? 'with' : 'without'
  const a = bahFrom?.[dep][form.grade]
  const b = bahTo?.[dep][form.grade]
  const bahChange = a !== undefined && b !== undefined ? { monthly: b - a, annual: (b - a) * 12 } : null

  return { computedMiles, miles, milesFromDtod, travelDays, oconus, report, reportWeekend, plan, warnings, bahFrom, bahTo, bahChange, planKey: from && to ? planKey(from, to) : null }
}

// ─── Share links ─────────────────────────────────────────────────────────────

const PLACEMENTS: PtdyPlacement[] = ['before-report', 'after-departure', 'after-signin']

/** The whole form as a query string, so a link reopens the same plan. */
export function toSearch(f: PlannerFormState): string {
  const p = new URLSearchParams({
    from: f.from?.id ?? '', to: f.to?.id ?? '', report: f.reportDate, grade: f.grade, deps: f.withDeps ? '1' : '0',
    leave: f.leaveDays, ptdy: f.ptdyDays, ptdyAt: f.ptdyPlacement, soWorked: f.signOutDayWorked ? '1' : '0', siFree: f.signInNotCharged ? '1' : '0',
    rent: f.rentDueDay, notice: f.noticeDate, vacate: f.vacateDate, tleOld: f.tleOld, tleNew: f.tleNew, dtod: f.dtod, outLead: f.outLead, packLead: f.packLead,
  })
  return p.toString()
}

/**
 * Reads a share link. Anything missing or invalid keeps its default, except a station the link names
 * that no longer exists (a renamed post, a ZIP without rates): that box is left empty rather than
 * showing a plan for the wrong move. Nothing here throws.
 */
export function fromSearch(search: string, today: ISODate, data: Bah | null = bundledBah): PlannerFormState {
  const d = defaultForm(today)
  const p = new URLSearchParams(search)
  const get = (k: string) => p.get(k)
  const station = (v: string | null, fallback: Installation | null) =>
    v === null || v === '' ? fallback : (byId(v) ?? (v.startsWith('zip:') ? zipStation(v.slice(4), data) : null))
  const count = (v: string | null, fallback: string) => (v !== null && v.trim() !== '' && Number(v) >= 0 ? normalizeDays(v) : fallback)
  const date = (v: string | null, fallback: string) => (v !== null && isPlanDate(v) ? v : fallback)
  const flag = (v: string | null, fallback: boolean) => (v === '1' ? true : v === '0' ? false : fallback)
  const rent = get('rent')
  const dtod = get('dtod')
  return {
    from: station(get('from'), d.from),
    to: station(get('to'), d.to),
    reportDate: date(get('report'), d.reportDate),
    grade: GRADES.includes(get('grade') ?? '') ? get('grade')! : d.grade,
    withDeps: flag(get('deps'), d.withDeps),
    leaveDays: count(get('leave'), d.leaveDays),
    ptdyDays: count(get('ptdy'), d.ptdyDays),
    ptdyPlacement: PLACEMENTS.find((x) => x === get('ptdyAt')) ?? d.ptdyPlacement,
    signOutDayWorked: flag(get('soWorked'), d.signOutDayWorked),
    signInNotCharged: flag(get('siFree'), d.signInNotCharged),
    // Blank means no lease; anything else unreadable keeps the default.
    rentDueDay: rent === null || (rent.trim() !== '' && !Number.isFinite(Number(rent))) ? d.rentDueDay : normalizeDueDay(rent),
    noticeDate: date(get('notice'), ''),
    vacateDate: date(get('vacate'), ''),
    tleOld: count(get('tleOld'), d.tleOld),
    tleNew: count(get('tleNew'), d.tleNew),
    dtod: dtod === null ? '' : normalizeMiles(dtod),
    outLead: count(get('outLead'), d.outLead),
    packLead: count(get('packLead'), d.packLead),
  }
}
