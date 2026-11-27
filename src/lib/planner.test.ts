import { describe, expect, it } from 'vitest'
import { bahFor, drivingMiles, installations, zipStation } from './data'
import { createMovePlan, defaultForm, fromSearch, normalizeDays, normalizeDueDay, normalizeMiles, toSearch, type PlannerFormState } from './planner'

const today = '2026-11-26'
const post = (id: string) => installations.find((i) => i.id === id)!
const form = (f: Partial<PlannerFormState> = {}): PlannerFormState => ({ ...defaultForm(today), ...f })

describe('createMovePlan', () => {
  it('uses the stored driving distance when no DTOD miles are entered', () => {
    const m = createMovePlan(form(), today)
    expect(m.miles).toBe(drivingMiles('bragg', 'leavenworth'))
    expect(m.milesFromDtod).toBe(false)
    expect(m.plan).not.toBeNull()
    // The default report date (today + 90) may fall in a later year than the bundled rates.
    expect(m.warnings.filter((w) => !w.startsWith('BAH shown'))).toEqual([])
  })
  it('accepts 0 DTOD miles as a local move with no travel days', () => {
    const m = createMovePlan(form({ dtod: '0' }), today)
    expect([m.miles, m.travelDays, m.milesFromDtod]).toEqual([0, 0, true])
    expect(m.plan!.items.some((i) => i.id === 'travel')).toBe(false)
  })
  it('builds no plan for a typed ZIP until DTOD miles are entered', () => {
    const zip = zipStation('28310')!
    const m = createMovePlan(form({ to: zip }), today)
    expect([m.miles, m.plan]).toEqual([null, null])
    expect(m.warnings.join('\n')).toMatch(/No stored road distance/)
    expect(createMovePlan(form({ to: zip, dtod: '500' }), today).travelDays).toBe(2)
  })
  it('marks Alaska/Hawaii travel as an estimate', () => {
    const m = createMovePlan(form({ from: post('schofield'), to: post('jblm'), dtod: '2700' }), today)
    expect(m.oconus).toBe(true)
    expect(m.plan!.items.find((i) => i.id === 'travel')!.kind).toBe('planning default')
  })
  it('builds no plan for an impossible report date, and says why', () => {
    const m = createMovePlan(form({ reportDate: '2027-02-30' }), today)
    expect(m.plan).toBeNull()
    expect(m.warnings.join('\n')).toMatch(/Enter a report date/)
  })
  it('computes the BAH change from the rates it shows, never an estimate', () => {
    const m = createMovePlan(form({ grade: 'O-3', withDeps: false }), today)
    const monthly = bahFor(post('leavenworth'))!.without['O-3'] - bahFor(post('bragg'))!.without['O-3']
    expect(m.bahChange).toEqual({ monthly, annual: monthly * 12 })
    expect(createMovePlan(form(), today, null).bahChange).toBeNull()
  })
  it('uses the clamped numbers the inputs show', () => {
    const a = createMovePlan(form({ leaveDays: '-4', rentDueDay: '45' }), today)
    const b = createMovePlan(form({ leaveDays: '0', rentDueDay: '31' }), today)
    expect(a.plan).toEqual(b.plan)
  })
  it('keys a move by its stations, not its dates', () => {
    expect(createMovePlan(form(), today).planKey).toBe('bragg-to-leavenworth')
    expect(createMovePlan(form({ reportDate: '2027-06-01' }), today).planKey).toBe('bragg-to-leavenworth')
  })
})

describe('number inputs', () => {
  it.each([['', '0'], ['-3', '0'], ['2.7', '2'], ['999', '365'], ['abc', '0'], ['12', '12']])('days "%s" → "%s"', (v, out) => expect(normalizeDays(v)).toBe(out))
  it.each([['', ''], ['0', '0'], ['350.6', '351'], ['-5', '0'], ['abc', ''], ['99999', '25000']])('miles "%s" → "%s"', (v, out) => expect(normalizeMiles(v)).toBe(out))
  it.each([['', ''], ['0', '1'], ['45', '31'], ['15.5', '15'], ['x', '']])('rent due day "%s" → "%s"', (v, out) => expect(normalizeDueDay(v)).toBe(out))
})

describe('share links', () => {
  it('round-trips every field, including a typed ZIP station', () => {
    const f = form({
      from: zipStation('28310'), to: post('jblm'), reportDate: '2027-03-01', grade: 'W-2', withDeps: false,
      leaveDays: '5', ptdyDays: '3', ptdyPlacement: 'after-departure', signOutDayWorked: true, signInNotCharged: true,
      rentDueDay: '', noticeDate: '2027-01-10', vacateDate: '2027-02-20', tleOld: '0', tleNew: '21', dtod: '0', outLead: '45', packLead: '10',
    })
    expect(fromSearch(toSearch(f), today)).toEqual(f)
  })
  it('falls back to defaults for invalid values without throwing', () => {
    const d = defaultForm(today)
    const f = fromSearch('?report=2026-02-30&leave=-10&tleOld=999&from=invalid&grade=Z-9&ptdyAt=x&deps=maybe&notice=soon&rent=abc', today)
    expect(f.reportDate).toBe(d.reportDate)
    expect(f.leaveDays).toBe(d.leaveDays)
    expect(f.tleOld).toBe('365')
    expect(f.from).toBe(d.from)
    expect([f.grade, f.ptdyPlacement, f.withDeps, f.noticeDate, f.rentDueDay]).toEqual([d.grade, d.ptdyPlacement, d.withDeps, '', ''])
    expect(fromSearch('%%%&&==', today)).toEqual(d)
    expect(fromSearch('', today)).toEqual(d)
  })
  it('reads a ZIP station with 0 DTOD miles', () => {
    const f = fromSearch('?from=zip:28310&dtod=0', today)
    expect([f.from?.id, f.dtod]).toEqual(['zip:28310', '0'])
    expect(createMovePlan(f, today).travelDays).toBe(0)
  })
})
