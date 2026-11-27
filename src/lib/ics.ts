import { addDays, isPlanDate, type TimelineItem } from './rules'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

/** RFC 5545 line folding: lines longer than 75 octets continue with a leading space. */
function fold(line: string): string {
  const parts: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ''
    }
    cur += ch
  }
  return [...parts, cur].join('\r\n ')
}

/** What a download remembers about an event, enough to cancel it later. */
export type SentEvent = Pick<TimelineItem, 'id' | 'date' | 'label'>

/**
 * Events from an earlier download that the current plan no longer has. `saved` is what `toSaved`
 * put in browser storage; anything unreadable is ignored.
 */
export function removedEvents(saved: string | null, items: TimelineItem[]): SentEvent[] {
  let list: unknown
  try { list = JSON.parse(saved ?? '[]') } catch { return [] }
  if (!Array.isArray(list)) return []
  const current = new Set<string>(items.map((i) => i.id))
  return list.filter((e): e is SentEvent =>
    typeof e?.id === 'string' && /^[a-z-]+$/.test(e.id) && !current.has(e.id)
    && typeof e.date === 'string' && isPlanDate(e.date) && typeof e.label === 'string')
}

/** Cancelled events stay saved, so the next download cancels them again if this one is never imported. */
export const toSaved = (items: TimelineItem[], removed: SentEvent[]) =>
  JSON.stringify([...items, ...removed].map(({ id, date, label }) => ({ id, date, label })))

/**
 * All-day VEVENTs for each timeline item (DTEND is exclusive, so end + 1 day), plus a cancelled
 * one for each event in `removed`.
 */
export function toIcs(items: TimelineItem[], removed: SentEvent[] = [], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  // A later download must outrank an earlier one. shortcut: a 32-bit SEQUENCE overflows in 2038.
  const sequence = Math.floor(now.getTime() / 1000)
  const d = (s: string) => s.replace(/-/g, '')
  const event = (id: string, start: string, end: string, ...rest: string[]) => [
    'BEGIN:VEVENT',
    // Same event, same UID, so a re-import can update it instead of adding a copy.
    // shortcut: one UID set per calendar, so a later PCS replaces these events; add a plan ID if both must be kept.
    `UID:${id}@pcs-move-planner`,
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;VALUE=DATE:${d(start)}`,
    `DTEND;VALUE=DATE:${d(addDays(end, 1))}`,
    ...rest,
    'END:VEVENT',
  ]
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PCS Move Planner//EN', 'CALSCALE:GREGORIAN',
    ...items.flatMap((it) => event(it.id, it.date, it.end ?? it.date,
      'STATUS:CONFIRMED',
      `SUMMARY:${esc(it.label)}`,
      `DESCRIPTION:${esc(`${it.category} · ${it.kind} · Source: ${it.source}. Planning aid only — confirm with S1/Finance/transportation/legal.`)}`,
    )),
    ...removed.flatMap((it) => event(it.id, it.date, it.date,
      'STATUS:CANCELLED',
      'TRANSP:TRANSPARENT',
      `SUMMARY:${esc(`Removed from PCS plan: ${it.label}`)}`,
      `DESCRIPTION:${esc('This event is no longer in your PCS plan. Delete it if your calendar still shows it.')}`,
    )),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
