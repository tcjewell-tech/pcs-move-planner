import { describe, expect, it } from 'vitest'
import { bah, bahFor, bahStaleWarning, drivingMiles, installations, isOconus, searchInstallations, zipStation, type Bah } from './data'
import { removedEvents, toIcs, toSaved } from './ics'
import type { TimelineItem } from './rules'

describe('installation search', () => {
  it('finds posts by former name (2023 renames)', () => {
    expect(searchInstallations('liberty')[0].id).toBe('bragg')
    expect(searchInstallations('Cavazos')[0].id).toBe('hood')
    expect(searchInstallations('JBLM')[0].id).toBe('jblm')
  })
  it('every installation has a 5-digit ZIP and coordinates', () => {
    for (const i of installations) {
      expect(i.zip).toMatch(/^\d{5}$/)
      expect(i.lat).not.toBeNull()
    }
  })
})

describe('drivingMiles', () => {
  it('is symmetric and zero for the same post', () => {
    expect(drivingMiles('bragg', 'leavenworth')).toBe(drivingMiles('leavenworth', 'bragg'))
    expect(drivingMiles('bragg', 'bragg')).toBe(0)
  })
  it('has no road route between Hawaii and the mainland', () => {
    expect(drivingMiles('schofield', 'jblm')).toBeNull()
  })
})

describe('bahFor', () => {
  const data: Bah = {
    year: 2099, source: 'test', mhaNames: { NC182: 'FORT BRAGG/POPE AFB' }, zipToMha: { '28310': 'NC182' },
    rates: { NC182: { with: { 'E-7': 2000 }, without: { 'E-7': 1500 } } },
  }
  it('follows installation → ZIP → MHA → rate', () => {
    expect(bahFor(installations.find((i) => i.id === 'bragg')!, data)).toMatchObject({ mha: 'NC182', with: { 'E-7': 2000 } })
  })
  it('returns null (never estimates) when the ZIP has no MHA', () => {
    expect(bahFor(installations.find((i) => i.id === 'hood')!, data)).toBeNull()
    expect(bahFor(installations[0], null)).toBeNull()
  })
})

describe('zipStation', () => {
  const data: Bah = {
    year: 2099, source: 'test', mhaNames: {}, zipToMha: { '02108': 'MA120', '12345': 'ZZ510', '00901': 'XX499' },
    rates: { MA120: { with: {}, without: {} }, ZZ510: { with: {}, without: {} } },
  }
  it('builds a station for a ZIP with rates, keeping leading zeros', () => {
    expect(zipStation(' 02108 ', data)).toMatchObject({ id: 'zip:02108', name: 'ZIP 02108', zip: '02108', state: 'MA', lat: null })
    expect(zipStation('ZIP 02108', data)?.zip).toBe('02108') // the name it shows can be searched again
  })
  it('gives a county cost group no state', () => expect(zipStation('12345', data)?.state).toBe(''))
  it.each(['00901', '99999', '2108', '021089', 'fort 02108', '__proto__', ''])('rejects "%s"', (q) => expect(zipStation(q, data)).toBeNull())
  it('rejects everything without BAH data', () => expect(zipStation('02108', null)).toBeNull())
  it('offers listed posts at that ZIP first, and has no stored miles', () => {
    const found = searchInstallations('28310')
    expect(found.map((i) => i.id)).toEqual(['bragg', 'zip:28310'])
    expect(drivingMiles('bragg', 'zip:28310')).toBeNull()
  })
  it('marks exactly the Alaska and Hawaii ZIPs as OCONUS in the bundled data', () => {
    const wrong = Object.keys(bah!.zipToMha).filter((z) => {
      const s = zipStation(z)
      return s && isOconus(s) !== /^(99[5-9]|96[78])/.test(z) // USPS ZIP ranges for AK and HI
    })
    expect(wrong).toEqual([])
  })
})

describe('bahStaleWarning', () => {
  const data = { year: 2026 } as Bah
  it('warns when the report date falls after the rate year', () => {
    expect(bahStaleWarning('2027-01-01', data)).toMatch(/2026.*2027/)
  })
  it('is silent within the rate year, without a date, or without data', () => {
    expect(bahStaleWarning('2026-12-31', data)).toBeNull()
    expect(bahStaleWarning(null, data)).toBeNull()
    expect(bahStaleWarning('2027-01-01', null)).toBeNull()
  })
})

describe('toIcs', () => {
  const ics = toIcs(
    [
      { id: 'travel', date: '2027-01-07', end: '2027-01-09', label: 'Travel; 3 days, by POV', category: 'En route', source: 'JTR par. 050205', kind: 'regulatory limit' },
      { id: 'report', date: '2027-01-15', label: 'Report', category: 'Arrival', source: 'orders', kind: 'computed' },
    ],
    [],
    new Date('2026-10-22T12:00:00Z'),
  )
  it('writes all-day events with exclusive DTEND and escaped text', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270107\r\nDTEND;VALUE=DATE:20270110')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270115\r\nDTEND;VALUE=DATE:20270116')
    expect(ics).toContain('SUMMARY:Travel\\; 3 days\\, by POV')
    expect(ics).toContain('DTSTAMP:20261022T120000Z')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })
  it('takes the UID from the item ID, not its date or position', () => {
    expect(ics.match(/UID:.*/g)).toEqual(['UID:travel@pcs-move-planner', 'UID:report@pcs-move-planner'])
  })
  it('numbers each download higher, so a later one outranks it', () => {
    expect(ics.match(/SEQUENCE:\d+/g)).toEqual(['SEQUENCE:1792670400', 'SEQUENCE:1792670400'])
    expect(ics.match(/STATUS:\w+/g)).toEqual(['STATUS:CONFIRMED', 'STATUS:CONFIRMED'])
  })
  it('cancels an event dropped since the last download, until it returns', () => {
    const travel: TimelineItem = { id: 'travel', date: '2027-01-07', label: 'Travel', category: 'En route', source: 's', kind: 'computed' }
    const ptdy: TimelineItem = { ...travel, id: 'ptdy', date: '2027-01-10', label: 'House hunting' }
    const first = toSaved([travel, ptdy], [])
    const gone = removedEvents(first, [travel])
    expect(gone).toEqual([{ id: 'ptdy', date: '2027-01-10', label: 'House hunting' }])
    const next = toIcs([travel], gone, new Date('2026-10-23T12:00:00Z')).replace(/\r\n /g, '')
    expect(next).toMatch(/UID:ptdy@pcs-move-planner[^]*DTSTART;VALUE=DATE:20270110\r\nDTEND;VALUE=DATE:20270111\r\nSTATUS:CANCELLED/)
    expect(next).toContain('SUMMARY:Removed from PCS plan: House hunting')
    expect(removedEvents(toSaved([travel], gone), [travel])).toEqual(gone) // still cancelled next time
    expect(removedEvents(toSaved([travel], gone), [travel, ptdy])).toEqual([])
  })
  it.each([null, '', 'not json', '{}', '[null, 1, "x"]', '[{"id":"ptdy","date":"soon","label":"x"}]', '[{"id":"a\\r\\nB:1","date":"2027-01-10","label":"x"}]'])(
    'ignores unreadable saved events: %s', (saved) => expect(removedEvents(saved, [])).toEqual([]))
  it('folds lines to 75 octets', () => {
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})

describe('bundled BAH data', () => {
  it('resolves every installation to an MHA with rates for every grade', async () => {
    const { GRADES } = await import('./data')
    expect(bah).not.toBeNull()
    for (const i of installations) {
      const r = bahFor(i)
      expect(r, i.id).not.toBeNull()
      for (const g of GRADES) expect(r!.with[g] > 0 && r!.without[g] > 0, `${i.id} ${g}`).toBe(true)
    }
  })
})
