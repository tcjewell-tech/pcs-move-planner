import { describe, expect, it } from 'vitest'
import { bah, bahFor, bahStaleWarning, distances, drivingMiles, installations, isOconus, listedInSameMha, searchInstallations, zipStation, type Bah } from './data'
import { removedEvents, replacedEvents, toIcs, toSaved } from './ics'
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
  it('has an entry for every pair of posts with coordinates', () => {
    // Check the key, not the value: pairs with no road route are stored as null.
    const placed = installations.filter((i) => i.lat !== null && i.lon !== null)
    const missing = placed.flatMap((a, n) => placed.slice(n + 1)
      .filter((b) => !(`${a.id}|${b.id}` in distances.miles) && !(`${b.id}|${a.id}` in distances.miles))
      .map((b) => `${a.id}|${b.id}`))
    expect(missing).toEqual([])
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
  it('names the listed posts in a typed ZIP\'s housing area, and nothing for a listed post', () => {
    const bragg = installations.find((i) => i.id === 'bragg')!
    const sameArea = Object.keys(bah!.zipToMha).find((z) => z !== bragg.zip && bah!.zipToMha[z] === bahFor(bragg)!.mha)!
    expect(listedInSameMha(zipStation(sameArea)!).map((i) => i.id)).toContain('bragg')
    expect(listedInSameMha(bragg)).toEqual([])
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
  const move = { fromName: 'Fort Bragg', toName: 'Fort Leavenworth', planKey: 'bragg-to-leavenworth' }
  const ics = toIcs(
    [
      { id: 'travel', date: '2027-01-07', end: '2027-01-09', label: 'Travel; 3 days, by POV', category: 'En route', source: 'JTR par. 050205', kind: 'regulatory limit' },
      { id: 'report', date: '2027-01-15', label: 'Report', category: 'Arrival', source: 'orders', kind: 'computed' },
    ],
    move,
    [],
    new Date('2026-10-22T12:00:00Z'),
  )
  const unfolded = ics.replace(/\r\n /g, '')
  it('writes all-day events with exclusive DTEND and escaped text', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270107\r\nDTEND;VALUE=DATE:20270110')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270115\r\nDTEND;VALUE=DATE:20270116')
    expect(unfolded).toContain('SUMMARY:PCS to Fort Leavenworth: Travel\\; 3 days\\, by POV')
    expect(ics).toContain('DTSTAMP:20261022T120000Z')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })
  it('names both stations in each description', () => {
    expect(unfolded.match(/DESCRIPTION:PCS Fort Bragg → Fort Leavenworth\. /g)).toHaveLength(2)
  })
  it('takes the UID from the move and the item ID, not its date or position', () => {
    expect(ics.match(/UID:.*/g)).toEqual(['UID:bragg-to-leavenworth-travel@pcs-move-planner', 'UID:bragg-to-leavenworth-report@pcs-move-planner'])
    const other = toIcs([{ id: 'travel', date: '2028-05-01', label: 'x', category: 'En route', source: 's', kind: 'computed' }], { ...move, planKey: 'jblm-to-hood' })
    expect(other).toContain('UID:jblm-to-hood-travel@pcs-move-planner') // another PCS leaves these events alone
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
    const next = toIcs([travel], move, gone, new Date('2026-10-23T12:00:00Z')).replace(/\r\n /g, '')
    expect(next).toMatch(/UID:bragg-to-leavenworth-ptdy@pcs-move-planner[^]*DTSTART;VALUE=DATE:20270110\r\nDTEND;VALUE=DATE:20270111\r\nSTATUS:CANCELLED/)
    expect(next).toContain('SUMMARY:Removed from PCS plan: House hunting')
    expect(removedEvents(toSaved([travel], gone), [travel])).toEqual(gone) // still cancelled next time
    expect(removedEvents(toSaved([travel], gone), [travel, ptdy])).toEqual([])
  })
  it('cancels a replaced move\'s events under that move\'s UIDs, and keeps cancelling them', () => {
    const travel: TimelineItem = { id: 'travel', date: '2027-01-07', label: 'Travel', category: 'En route', source: 's', kind: 'computed' }
    const old = replacedEvents(toSaved([travel], []), 'leavenworth-to-bragg')
    expect(old).toEqual([{ id: 'travel', date: '2027-01-07', label: 'Travel', planKey: 'leavenworth-to-bragg' }])
    const out = toIcs([travel], move, old).replace(/\r\n /g, '')
    expect(out).toMatch(/UID:bragg-to-leavenworth-travel@[^]*STATUS:CONFIRMED/)
    expect(out).toMatch(/UID:leavenworth-to-bragg-travel@[^]*STATUS:CANCELLED/)
    // Saved with the new move, the replaced event is cancelled again next time, though its ID is in the plan.
    expect(removedEvents(toSaved([travel], old), [travel])).toEqual(old)
  })
  it.each([null, '', 'not json', '{}', '[null, 1, "x"]', '[{"id":"ptdy","date":"soon","label":"x"}]', '[{"id":"a\\r\\nB:1","date":"2027-01-10","label":"x"}]'])(
    'ignores unreadable saved events: %s', (saved) => expect(removedEvents(saved, [])).toEqual([]))
  it('folds lines to 75 octets, long station names included', () => {
    const long = toIcs([{ id: 'report', date: '2027-01-15', label: 'Report to gaining unit (DA 31 "to" date = report date in orders)', category: 'Arrival', source: 'orders', kind: 'computed' }],
      { fromName: 'Walter Reed National Military Medical Center', toName: 'Joint Base Myer-Henderson Hall', planKey: 'walterreed-to-jbmhh' })
    for (const line of [...ics.split('\r\n'), ...long.split('\r\n')]) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
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
