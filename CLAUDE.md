# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

U.S. Army PCS Move Planner: a static Vite + React 19 + TypeScript + Tailwind v4 app with no backend, no API keys and no runtime network calls. All data ships as JSON in `src/data/`, built by scripts from official or reproducible sources. It is a planning aid, not an entitlement determination.

## Commands

```bash
npm run dev                    # http://localhost:5173
npm test                       # vitest run (all tests)
npx vitest run src/lib/rules.test.ts      # one file
npx vitest run -t "SCRA"                  # tests whose name matches
npx tsc -b                     # typecheck (npm run build also typechecks)
npm run lint                   # oxlint
npm run build:data             # installations → bah → distances (each also runnable alone: build:installations, build:bah, build:distances)
```

The data scripts run with `tsx` and are not in the TypeScript project (`tsconfig.app.json` includes only `src/`).

## Architecture

**Data pipeline (`scripts/` → `src/data/`).** Each generated JSON file is committed. Don't edit it by hand; change the script or its input and rerun.
- `build-installations.ts` reads `scripts/installations.seed.json`, which you edit by hand: current name, former names in `aliases`, ZIP, and the Wikipedia title in `wiki`, plus optional `coordsWiki`, `zipCheck` and `aliasWiki` (the specific article for a former name whose bare title is a disambiguation page). Coordinates come from the Wikipedia API. The script verifies two things: each `Fort …`/`… AFB` alias must redirect to the same article or have its own article within 30 km, and each ZIP must be within 30 km of its Census ZCTA centroid. Failures are written into the output as `unverified`, and the UI displays them.
- `build-bah.ts` needs the DoD BAH ASCII ZIP in `data-raw/` (gitignored). DoD blocks scripted downloads, so a human must download the file from travel.dod.mil. The ZIP contains stale `… - old` and `_YY.dat` copies; the script reads only the plain `bahwYY.txt`, `bahwoYY.txt`, `sorted_zipmhaYY.txt` and `mhanamesYY.txt`. It exits with an error on any unexpected layout. Rates have 27 columns in the `GRADES` order: E1–9, W1–5, O1E–O3E, O1–O10. O-8 through O-10 equal O-7.
- `build-distances.ts` gets OSRM driving miles for every installation pair at 1 request/s, caching each pair in `scripts/.cache/osrm/` under both IDs and coordinates, so a moved post is refetched. `built` is the date of the oldest cached response used. Pairs with no road route (Hawaii) are `null`. Keys are `"idA|idB"` in installation order; `drivingMiles()` checks both orders.
- `scripts/lib.ts` provides the shared User-Agent (Wikimedia returns 429 without a URL in the UA), `unzip` (bsdtar, falling back to unzip), and `haversineKm`.

**Runtime (`src/lib/`).**
- `rules.ts` holds all regulatory logic as pure functions on ISO `YYYY-MM-DD` strings using whole-day UTC math. Each rule's doc comment cites its source: JTR 050205/050601, AR 600-8-10 (3 Jun 2020), and 50 U.S.C. §3955. `buildPlan()` combines the rules into the back-planned timeline and the warnings. Every `TimelineItem` has a `kind` of `'regulatory limit' | 'planning default' | 'computed'`, which the UI shows as a badge. Keep that labeling on anything you add. Each item also has a fixed `id` (`TimelineId`); match on it, not on label text, and don't rename one.
- `data.ts` loads the JSON and does lookups: installation → ZIP → MHA → rate (`bahFor`). It returns `null` rather than estimate. BAH is loaded through `import.meta.glob('../data/bah/*.json')` so the app still builds without BAH data; a literal file path there doesn't work.
- `ics.ts` exports all-day VEVENTs with an exclusive DTEND and RFC 5545 line folding. The UID comes from the item's `id`, so a re-exported event keeps its UID when dates move.
- `App.tsx` holds all form state and calls `buildPlan()` on each render. `InstallationPicker.tsx` is an ARIA combobox that searches names and aliases.

**Key domain conventions** (details in `README.md`, open questions in `VERIFY.md`):
- The DA 31 period counts inclusively from the sign-out date through the report date. `signOutDate()` is the exact inverse of `chargeableLeave()`, and a test checks this.
- SCRA: the lease ends 30 days after the first rent due date strictly after notice delivery. For due days 29–31, short months use their last day. `scraLatestNotice` and `scraTermination` are round-trip tested across 800 days.
- AR 600-8-10 calls "PTDY" for house hunting an *administrative absence* (para 5-12c(9)). The UI keeps the PTDY label.
- Dark mode is a `.dark` class on `<html>`. The Tailwind `dark` variant is wrapped in `@media screen`, so print output is always light. Hide UI from print with `print:hidden`.

## Working rules (from the project spec)

- Never invent regulatory numbers or estimate a BAH rate. Record anything unverified in `VERIFY.md` and flag it in the UI.
- Ask the user before changing the stack, adding a paid API or key, or substituting an unofficial data source.
- Commit after each step.
- Refresh data each January: new BAH ZIP in `data-raw/`, run `npm run build:data`, then review the script reports and update `VERIFY.md`. DoD can reissue rates mid-year (e.g. the TX270 Abilene increase in May 2026).
