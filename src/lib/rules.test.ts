import { describe, expect, it } from 'vitest'
import {
  DEFAULTS, addDays, buildPlan, chargeableLeave, daysBetween, isPlanDate, nextDueAfter, povTravelDays,
  scraLatestNotice, scraTermination, signOutDate, tleCheck, type PlanInputs,
} from './rules'

describe('isPlanDate', () => {
  it.each(['2026-11-26', '1999-01-01', '2099-12-31'])('accepts %s', (d) => expect(isPlanDate(d)).toBe(true))
  // A date input emits values like these while the year is being typed.
  it.each(['', '0002-02-24', '202700-02-24', '2026-13-01'])('rejects "%s"', (d) => expect(isPlanDate(d)).toBe(false))
})

describe('povTravelDays (JTR 050205)', () => {
  it.each([
    [400, 1], [401, 2], [750, 2], [751, 3], [1100, 3], [1101, 4],
    [1, 1], [420, 2], [700, 2], [1573, 5], [0, 0], [-5, 0], [400.4, 1], [400.5, 2],
  ])('%d mi → %d days', (miles, days) => expect(povTravelDays(miles)).toBe(days))
})

describe('tleCheck (JTR 050601)', () => {
  it('allows any split up to 21', () => {
    expect(tleCheck(7, 14).overLimit).toBe(false)
    expect(tleCheck(0, 21).overLimit).toBe(false)
    expect(tleCheck(10, 12)).toEqual({ total: 22, overLimit: true })
  })
})

describe('chargeableLeave (AR 600-8-10)', () => {
  const both = { signOutDayWorked: false, signInDayNotCharged: false }
  it('counts sign-out through sign-in inclusive, minus travel and PTDY', () => {
    // 20 Nov – 1 Dec = 12 days; 2 travel → 10 leave
    expect(chargeableLeave('2026-11-20', '2026-12-01', 2, 0, both)).toBe(10)
    expect(chargeableLeave('2026-11-20', '2026-12-01', 2, 5, both)).toBe(5)
  })
  it('does not charge a worked sign-out day or an uncharged sign-in day', () => {
    expect(chargeableLeave('2026-11-20', '2026-12-01', 2, 0, { signOutDayWorked: true, signInDayNotCharged: false })).toBe(9)
    expect(chargeableLeave('2026-11-20', '2026-12-01', 2, 0, { signOutDayWorked: true, signInDayNotCharged: true })).toBe(8)
  })
  it('matches the AR 600-8-10 para 4-7h(3) example: 30 leave + 10 house hunting, report 1 Dec → depart 23 Oct', () => {
    expect(signOutDate('2026-12-01', 30, 0, 10, both)).toBe('2026-10-23')
    expect(chargeableLeave('2026-10-23', '2026-12-01', 0, 10, both)).toBe(30)
  })
  it('same-day sign-out and sign-in with one travel day charges nothing', () => {
    expect(chargeableLeave('2026-12-01', '2026-12-01', 1, 0, both)).toBe(0)
  })
  it('never goes negative', () => {
    expect(chargeableLeave('2026-12-01', '2026-12-01', 3, 0, both)).toBe(0)
  })
  it('signOutDate is the inverse of chargeableLeave', () => {
    for (const c of [both, { signOutDayWorked: true, signInDayNotCharged: true }])
      for (const [l, t, p] of [[0, 1, 0], [10, 3, 0], [30, 4, 10], [5, 2, 7]]) {
        const out = signOutDate('2027-06-15', l, t, p, c)
        expect(chargeableLeave(out, '2027-06-15', t, p, c)).toBe(l)
      }
  })
})

describe('SCRA §3955 forward', () => {
  it('notice on the due day rolls to the next month', () => {
    expect(scraTermination('2026-03-01', 1)).toEqual({ lastRentDue: '2026-04-01', termination: '2026-05-01' })
  })
  it('notice the day before the due day uses that due day', () => {
    expect(scraTermination('2026-02-28', 1)).toEqual({ lastRentDue: '2026-03-01', termination: '2026-03-31' })
  })
  it('February: due day 30 falls on Feb 28', () => {
    expect(scraTermination('2026-02-10', 30)).toEqual({ lastRentDue: '2026-02-28', termination: '2026-03-30' })
  })
  it('leap-year February: due day 31 falls on Feb 29', () => {
    expect(scraTermination('2028-02-15', 31)).toEqual({ lastRentDue: '2028-02-29', termination: '2028-03-30' })
  })
  it('notice on a clamped due day (Feb 28, due 31) rolls to Mar 31', () => {
    expect(nextDueAfter('2026-02-28', 31)).toBe('2026-03-31')
  })
  it('due day 31 in a 30-day month', () => {
    expect(nextDueAfter('2026-04-10', 31)).toBe('2026-04-30')
  })
})

describe('SCRA §3955 backward', () => {
  it('finds the latest notice date', () => {
    // vacate 15 Jun, rent due 1st → due 1 May + 30 = 31 May ≤ 15 Jun; notice by 30 Apr
    expect(scraLatestNotice('2026-06-15', 1)).toBe('2026-04-30')
  })
  it('vacate exactly 30 days after a due date allows notice the day before it', () => {
    expect(scraLatestNotice('2026-05-31', 1)).toBe('2026-04-30')
    expect(scraLatestNotice('2026-05-30', 1)).toBe('2026-03-31')
  })
  it('February with due day 30', () => {
    // due Feb 28 + 30 = Mar 30
    expect(scraLatestNotice('2026-03-30', 30)).toBe('2026-02-27')
  })
  it('round-trips: latest notice ends on/before vacate, one day later does not', () => {
    let v = '2026-01-01'
    for (let i = 0; i < 800; i++, v = addDays(v, 1))
      for (const due of [1, 15, 28, 29, 30, 31]) {
        const n = scraLatestNotice(v, due)
        expect(scraTermination(n, due).termination <= v).toBe(true)
        expect(scraTermination(addDays(n, 1), due).termination > v).toBe(true)
      }
  })
})

describe('buildPlan', () => {
  const base: PlanInputs = {
    ...DEFAULTS, today: '2026-10-22', reportDate: '2027-01-15', travelDays: 3, leaveDays: 10,
    oconus: false, rentDueDay: 1, noticeDate: null, vacateDate: null,
  }
  it('back-plans the chain report ← PTDY ← travel ← leave ← sign-out', () => {
    const r = buildPlan({ ...base, ptdyDays: 5 })
    // absent days = 10 + 3 + 5 = 18 → sign out 18 days counting the report day
    expect(daysBetween(r.signOut, '2027-01-15') + 1).toBe(18)
    expect(r.leave).toBe(10)
    const travel = r.items.find((i) => i.label.startsWith('Authorized travel'))!
    expect(travel.date).toBe('2027-01-07')
    expect(travel.end).toBe('2027-01-09')
    const ptdy = r.items.find((i) => i.label.startsWith('House-hunting'))!
    expect([ptdy.date, ptdy.end]).toEqual(['2027-01-10', '2027-01-14'])
  })
  it('PTDY after sign-in does not shorten the en-route period', () => {
    const r = buildPlan({ ...base, ptdyDays: 5, ptdyPlacement: 'after-signin' })
    expect(daysBetween(r.signOut, '2027-01-15') + 1).toBe(13)
  })
  it('defaults pack-out to 7 and out-processing to 60 days before departure', () => {
    const r = buildPlan(base)
    expect(r.items.find((i) => i.label === 'Target pack-out date')!.date).toBe(addDays(r.signOut, -7))
    expect(r.items.find((i) => i.label.startsWith('Start out-processing'))!.date).toBe(addDays(r.signOut, -60))
  })
  it('SCRA deadline defaults to vacating on the departure date', () => {
    const r = buildPlan(base)
    expect(r.scra!.vacate).toBe(r.signOut)
    expect(r.scra!.latestNotice).toBe(scraLatestNotice(r.signOut, 1))
  })
  it('warns on past report date, PTDY > 10, TLE > 21 and passed SCRA deadline', () => {
    const w = buildPlan({ ...base, today: '2027-02-01', ptdyDays: 11, tleOld: 10, tleNew: 12 }).warnings.join('\n')
    expect(w).toMatch(/Report date is in the past/)
    expect(w).toMatch(/before today/)
    expect(w).toMatch(/limited to 10 days/)
    expect(w).toMatch(/CONUS limit is 21/)
    expect(w).toMatch(/SCRA notice deadline/)
  })
  it('a clean plan has no warnings', () => {
    expect(buildPlan(base).warnings).toEqual([])
  })
  it('omits the travel item when there are no travel days, so no item ends before it starts', () => {
    const r = buildPlan({ ...base, travelDays: 0 })
    expect(r.items.some((i) => i.label.startsWith('Authorized travel'))).toBe(false)
    for (const i of r.items) expect((i.end ?? i.date) >= i.date, i.label).toBe(true)
  })
  it('omits TLE windows for OCONUS', () => {
    expect(buildPlan({ ...base, oconus: true }).items.some((i) => i.label.startsWith('TLE'))).toBe(false)
  })
})
