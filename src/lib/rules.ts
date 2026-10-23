/**
 * PCS business rules as pure functions. Dates are ISO 'YYYY-MM-DD' strings and all
 * math is in whole UTC days, so time zones and DST never shift a date.
 * Planning aid only — S1, Finance (DMPO) and the transportation office make the
 * actual determinations.
 */

export type ISODate = string

const DAY_MS = 86_400_000
const toDate = (s: ISODate) => new Date(`${s}T00:00:00Z`)
const iso = (d: Date): ISODate => d.toISOString().slice(0, 10)
export const addDays = (s: ISODate, n: number): ISODate => iso(new Date(toDate(s).getTime() + n * DAY_MS))
/** b − a in days. */
export const daysBetween = (a: ISODate, b: ISODate) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS)
export const isWeekend = (s: ISODate) => [0, 6].includes(toDate(s).getUTCDay())

// ─── 1. POV travel days ──────────────────────────────────────────────────────

/**
 * Authorized PCS travel days by POV.
 * Source: JTR par. 050205 — one day for the first 400 miles; over 400, divide the
 * official distance by 350: the quotient is days, plus one day if the remainder is
 * 51 miles or more. Official distance is DTOD; non-integer input is rounded.
 */
export function povTravelDays(miles: number): number {
  const m = Math.round(miles)
  if (m <= 0) return 0
  if (m <= 400) return 1
  return Math.floor(m / 350) + (m % 350 >= 51 ? 1 : 0)
}

// ─── 2. TLE ──────────────────────────────────────────────────────────────────

/**
 * CONUS TLE limit. Source: JTR par. 050601 — up to 21 days for a PCS to a CONUS PDS,
 * split between old and new PDS (raised from 14 days effective 27 Nov 2024).
 * Housing-shortage MHAs may be authorized up to 60 days; OCONUS rules differ (out of scope).
 */
export const TLE_CONUS_MAX_DAYS = 21

export function tleCheck(oldDays: number, newDays: number) {
  const total = oldDays + newDays
  return { total, overLimit: total > TLE_CONUS_MAX_DAYS }
}

// ─── 3. House-hunting administrative absence (formerly "PTDY") ───────────────

/**
 * Source: AR 600-8-10 (3 Jun 2020) para 5-12c(9) — house hunting up to 10 days,
 * commander approval: the losing commander may grant up to 10 days to be used before
 * signing in to the new PDS, or the gaining commander up to 10 days after in-processing.
 * Not eligible if not moving the household or immediately occupying Government quarters.
 */
export const HOUSE_HUNTING_MAX_DAYS = 10

export type PtdyPlacement = 'before-report' | 'after-departure' | 'after-signin'

// ─── 4. Chargeable leave ─────────────────────────────────────────────────────

export interface DayCharging {
  /** Soldier works more than half of a regularly scheduled duty day on the sign-out day. */
  signOutDayWorked: boolean
  /** Sign-in day not charged: works more than half of it, or it is a non-duty day/holiday. */
  signInDayNotCharged: boolean
}

/**
 * Chargeable leave for a PCS absence.
 * Counting method (AR 600-8-10, 3 Jun 2020):
 *  - The DA Form 31 covers from the day of departure through the reporting date, both
 *    days included (para 4-7b; the para 4-7h examples count inclusively).
 *  - The departure day is charged unless it is a regularly scheduled duty day and the
 *    Soldier works more than half of it (paras 2-9c, 11-1f, 12-4i).
 *  - The return/sign-in day is charged unless the Soldier works more than half of a
 *    duty day, or it is a regularly scheduled non-duty day or Federal holiday (para 11-1g).
 *  - Non-chargeable absences (authorized travel days, administrative absence such as
 *    house hunting) are subtracted (para 11-2h). DMPO makes the final determination
 *    from the travel voucher (para 11-1d).
 */
export function chargeableLeave(signOut: ISODate, signIn: ISODate, travelDays: number, ptdyDays: number, c: DayCharging): number {
  const absent = daysBetween(signOut, signIn) + 1
  return Math.max(0, absent - travelDays - ptdyDays - (c.signOutDayWorked ? 1 : 0) - (c.signInDayNotCharged ? 1 : 0))
}

/** Inverse of chargeableLeave: the sign-out date that charges exactly `leaveDays`. */
export function signOutDate(report: ISODate, leaveDays: number, travelDays: number, ptdyDays: number, c: DayCharging): ISODate {
  const absent = leaveDays + travelDays + ptdyDays + (c.signOutDayWorked ? 1 : 0) + (c.signInDayNotCharged ? 1 : 0)
  return addDays(report, -(Math.max(1, absent) - 1))
}

// ─── 5. SCRA lease termination ───────────────────────────────────────────────

/** Rent due date in a given month; due days 29–31 fall on the last day of shorter months. */
function dueDateIn(year: number, month0: number, dueDay: number): ISODate {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  return iso(new Date(Date.UTC(year, month0, Math.min(dueDay, last))))
}

/** First rent due date strictly after `date`. */
export function nextDueAfter(date: ISODate, dueDay: number): ISODate {
  const d = toDate(date)
  const thisMonth = dueDateIn(d.getUTCFullYear(), d.getUTCMonth(), dueDay)
  return thisMonth > date ? thisMonth : dueDateIn(d.getUTCFullYear(), d.getUTCMonth() + 1, dueDay)
}

/**
 * Forward: when a monthly-rent lease ends after notice.
 * Source: 50 U.S.C. §3955(d)(1)(A) — termination is effective 30 days after the first
 * date on which the next rental payment is due and payable after the date the notice
 * (written notice plus a copy of orders, §3955(c)) is delivered. Rent owed up to the
 * termination date is prorated (§3955(e)); advance rent is refunded (§3955(f)).
 */
export function scraTermination(notice: ISODate, dueDay: number) {
  const lastRentDue = nextDueAfter(notice, dueDay)
  return { lastRentDue, termination: addDays(lastRentDue, 30) }
}

/**
 * Backward: latest notice delivery date so the lease ends on or before `vacate`.
 * Finds the latest due date D with D + 30 ≤ vacate; notice must be delivered before D,
 * so the answer is D − 1 (notice on D itself rolls to the following due date).
 */
export function scraLatestNotice(vacate: ISODate, dueDay: number): ISODate {
  const target = addDays(vacate, -30)
  const t = toDate(target)
  let due = dueDateIn(t.getUTCFullYear(), t.getUTCMonth(), dueDay)
  if (due > target) due = dueDateIn(t.getUTCFullYear(), t.getUTCMonth() - 1, dueDay)
  return addDays(due, -1)
}

// ─── 6. Back-planned timeline ────────────────────────────────────────────────

export type Kind = 'regulatory limit' | 'planning default' | 'computed'

export interface TimelineItem {
  date: ISODate
  end?: ISODate
  label: string
  category: 'Orders' | 'Out-processing' | 'Household goods' | 'Housing' | 'Departure' | 'En route' | 'Arrival'
  source: string
  kind: Kind
}

export interface PlanInputs extends DayCharging {
  today: ISODate
  reportDate: ISODate
  travelDays: number
  leaveDays: number
  ptdyDays: number
  ptdyPlacement: PtdyPlacement
  tleOld: number
  tleNew: number
  /** OCONUS (incl. Alaska/Hawaii) — TLE rules differ and are out of scope. */
  oconus: boolean
  rentDueDay: number | null
  noticeDate: ISODate | null
  /** Target vacate date for SCRA back-planning; defaults to the sign-out date. */
  vacateDate: ISODate | null
  outprocessingLeadDays: number
  packoutLeadDays: number
}

export const DEFAULTS = {
  leaveDays: 10,
  ptdyDays: 0,
  ptdyPlacement: 'before-report' as PtdyPlacement,
  tleOld: 7,
  tleNew: 14,
  outprocessingLeadDays: 60,
  packoutLeadDays: 7,
  signOutDayWorked: false,
  signInDayNotCharged: false,
}

const AR = 'AR 600-8-10'

export function buildPlan(p: PlanInputs) {
  const enRoutePtdy = p.ptdyPlacement === 'after-signin' ? 0 : p.ptdyDays
  const signOut = signOutDate(p.reportDate, p.leaveDays, p.travelDays, enRoutePtdy, p)
  const leave = chargeableLeave(signOut, p.reportDate, p.travelDays, enRoutePtdy, p)

  // Order inside the DA 31 period: sign-out → [PTDY if after-departure] → leave → travel → [PTDY if before-report] → report.
  const ptdyBefore = p.ptdyPlacement === 'before-report' ? p.ptdyDays : 0
  const travelStart = addDays(p.reportDate, -(ptdyBefore + p.travelDays))
  const arrival = addDays(travelStart, p.travelDays)
  const ptdyStart =
    p.ptdyPlacement === 'before-report' ? addDays(p.reportDate, -p.ptdyDays)
    : p.ptdyPlacement === 'after-departure' ? signOut
    : addDays(p.reportDate, 1)
  const leaveStart = p.ptdyPlacement === 'after-departure' ? addDays(signOut, p.ptdyDays) : signOut
  const vacate = p.vacateDate ?? signOut

  const items: TimelineItem[] = [
    { date: p.today, label: 'Book household goods move in DPS (move.mil) as soon as orders are in hand', category: 'Orders', source: 'DPS / transportation office', kind: 'planning default' },
    { date: addDays(signOut, -p.outprocessingLeadDays), label: 'Start out-processing (clearing)', category: 'Out-processing', source: 'Local installation clearing policy', kind: 'planning default' },
    { date: addDays(signOut, -p.packoutLeadDays), label: 'Target pack-out date', category: 'Household goods', source: 'Transportation office scheduling', kind: 'planning default' },
    { date: p.signOutDayWorked ? signOut : addDays(signOut, -1), label: 'Last duty day', category: 'Departure', source: `${AR} paras 2-9c, 11-1f`, kind: 'computed' },
    { date: signOut, label: 'Sign out / depart (DA 31 "from" date)', category: 'Departure', source: `${AR} para 4-7b`, kind: 'computed' },
    { date: travelStart, end: addDays(arrival, -1), label: `Authorized travel: ${p.travelDays} day(s)`, category: 'En route', source: 'JTR par. 050205', kind: 'regulatory limit' },
    { date: p.reportDate, label: 'Report to gaining unit (DA 31 "to" date = report date in orders)', category: 'Arrival', source: `PCS orders; ${AR} para 4-7b`, kind: 'regulatory limit' },
  ]
  const leaveEnd = addDays(travelStart, -1)
  if (leaveEnd >= leaveStart)
    items.push({ date: leaveStart, end: leaveEnd, label: `En-route leave (${leave} chargeable day(s) incl. sign-out/sign-in day charging)`, category: 'En route', source: `${AR} paras 4-7, 11-1`, kind: 'planning default' })
  if (p.ptdyDays > 0)
    items.push({ date: ptdyStart, end: addDays(ptdyStart, p.ptdyDays - 1), label: `House-hunting administrative absence (PTDY), ${p.ptdyDays} day(s)${p.ptdyPlacement === 'after-signin' ? ' — after in-processing, gaining commander' : ''}`, category: 'Housing', source: `${AR} para 5-12c(9) (max 10, commander approval)`, kind: 'regulatory limit' })
  if (!p.oconus) {
    if (p.tleOld > 0)
      items.push({ date: addDays(signOut, -p.tleOld), end: addDays(signOut, -1), label: `TLE at old PDS (${p.tleOld} day(s))`, category: 'Housing', source: 'JTR par. 050601 (21-day CONUS total)', kind: 'planning default' })
    if (p.tleNew > 0)
      items.push({ date: arrival, end: addDays(arrival, p.tleNew - 1), label: `TLE at new PDS (${p.tleNew} day(s))`, category: 'Housing', source: 'JTR par. 050601 (21-day CONUS total)', kind: 'planning default' })
  }

  let scra: { latestNotice: ISODate; vacate: ISODate; forward?: ReturnType<typeof scraTermination> } | null = null
  if (p.rentDueDay) {
    scra = { latestNotice: scraLatestNotice(vacate, p.rentDueDay), vacate }
    items.push({ date: scra.latestNotice, label: `Deliver SCRA lease-termination notice + copy of orders by this date (lease ends by ${vacate})`, category: 'Housing', source: '50 U.S.C. §3955(c), (d)(1)', kind: 'regulatory limit' })
    if (p.noticeDate) {
      scra.forward = scraTermination(p.noticeDate, p.rentDueDay)
      items.push({ date: p.noticeDate, label: 'SCRA notice delivered', category: 'Housing', source: '50 U.S.C. §3955(c)', kind: 'computed' })
      items.push({ date: scra.forward.lastRentDue, label: 'Last rent payment due (prorated to termination)', category: 'Housing', source: '50 U.S.C. §3955(d)(1), (e)', kind: 'computed' })
      items.push({ date: scra.forward.termination, label: 'Lease termination effective', category: 'Housing', source: '50 U.S.C. §3955(d)(1)', kind: 'computed' })
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date))

  const warnings: string[] = []
  if (p.reportDate < p.today) warnings.push('Report date is in the past.')
  if (signOut < p.today) warnings.push(`Computed departure (${signOut}) is before today — reduce en-route leave or check the report date.`)
  if (p.ptdyDays > HOUSE_HUNTING_MAX_DAYS) warnings.push(`House hunting is limited to ${HOUSE_HUNTING_MAX_DAYS} days (AR 600-8-10 para 5-12c(9)).`)
  if (!p.oconus && tleCheck(p.tleOld, p.tleNew).overLimit) warnings.push(`TLE split totals ${p.tleOld + p.tleNew} days; CONUS limit is ${TLE_CONUS_MAX_DAYS} (JTR par. 050601).`)
  if (scra && scra.latestNotice < p.today && !p.noticeDate) warnings.push(`SCRA notice deadline (${scra.latestNotice}) has passed — the lease will run past ${vacate}. Talk to legal assistance.`)
  if (scra?.forward && scra.forward.termination > vacate) warnings.push(`With notice on ${p.noticeDate}, the lease ends ${scra.forward.termination}, after the vacate date ${vacate}.`)

  return { signOut, leave, arrival, items, warnings, scra }
}
