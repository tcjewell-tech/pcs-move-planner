import { useId, useState } from 'react'
import { bah, bahFor, isZipStation, searchInstallations, type Installation } from './lib/data'

/** Typeahead over installation names, aliases and ZIP codes (ARIA 1.2 combobox pattern). */
export function InstallationPicker({ label, value, onChange }: { label: string; value: Installation | null; onChange: (i: Installation) => void }) {
  const id = useId()
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = searchInstallations(query)
  const pick = (i: Installation) => {
    onChange(i)
    setQuery(i.name)
    setOpen(false)
  }
  const resolved = value && bahFor(value)
  const typedZip = /^\d{5}$/.test(query.trim()) ? query.trim() : null

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-${results[active].id}` : undefined}
        className="field"
        value={query}
        placeholder="Name, former name or ZIP code"
        onFocus={() => setOpen(true)}
        // Unpicked text reverts, so the box never names a station other than the one computed.
        onBlur={() => { setOpen(false); setQuery(value?.name ?? '') }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); pick(results[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && results.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {results.map((i, n) => (
            <li
              key={i.id}
              id={`${id}-${i.id}`}
              role="option"
              aria-selected={n === active}
              className={`cursor-pointer px-3 py-2 text-sm ${n === active ? 'bg-sky-100 dark:bg-sky-900' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(i) }}
              onMouseEnter={() => setActive(n)}
            >
              <span className="font-medium">{i.name}</span>{i.state && `, ${i.state}`}
              {i.aliases.length > 0 && <span className="block text-xs text-slate-500 dark:text-slate-400">{i.aliases.join(' · ')}</span>}
              {isZipStation(i) && <span className="block text-xs text-slate-500 dark:text-slate-400">{bahFor(i)?.name} · not a listed station, so it needs DTOD miles</span>}
            </li>
          ))}
        </ul>
      )}
      {open && results.length === 0 && typedZip && (
        <p role="status" className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          {bah ? `No BAH rate for ZIP ${typedZip} in the ${bah.year} file.` : 'ZIP entry needs the BAH data, which is not built.'}
        </p>
      )}
      {value && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          ZIP {value.zip} · MHA {resolved ? `${resolved.mha} (${resolved.name})` : bah ? 'not found for this ZIP' : 'n/a (BAH data not built)'}
          {value.unverified && <span className="block text-amber-700 dark:text-amber-400">Unverified: {value.unverified}</span>}
        </p>
      )}
    </div>
  )
}
