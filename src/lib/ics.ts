import { addDays, type TimelineItem } from './rules'

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

/** All-day VEVENTs for each timeline item (DTEND is exclusive, so end + 1 day). */
export function toIcs(items: TimelineItem[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const d = (s: string) => s.replace(/-/g, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PCS Move Planner//EN', 'CALSCALE:GREGORIAN']
  items.forEach((it, n) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${d(it.date)}-${n}@pcs-move-planner`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d(it.date)}`,
      `DTEND;VALUE=DATE:${d(addDays(it.end ?? it.date, 1))}`,
      `SUMMARY:${esc(it.label)}`,
      `DESCRIPTION:${esc(`${it.category} · ${it.kind} · Source: ${it.source}. Planning aid only — confirm with S1/Finance/transportation/legal.`)}`,
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
