# PCS Move Planner

A local web app for U.S. Army soldiers planning a CONUS permanent change of station (PCS). Pick a current and a gaining duty station, enter the report date and a few details, and it shows:

1. **Authorized POV travel days**, with the formula worked out step by step (JTR par. 050205)
2. **A BAH comparison** between the two stations for your pay grade and dependency status
3. **A back-planned timeline**: out-processing, DPS booking, pack-out, TLE windows, sign-out, en-route leave, travel, house hunting, report date, and the SCRA lease-notice deadline. You can export it as an `.ics` calendar file or print it.

There are no API keys, no AI calls and no backend. All data ships with the app.

> **Disclaimer.** This is a planning aid, not an entitlement determination. Confirm travel days, leave, TLE and BAH with your **S1**, **Finance (DMPO)**, the **transportation office**, and **legal assistance** (for lease termination). Official distances come from DTOD, not from this app.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: business rules, lookups, .ics export
npm run build      # static build in dist/
```

## Refresh data each January

BAH rates change on 1 January. To refresh:

1. Download the new **"all locations, all pay grades"** BAH ZIP from the [DoD BAH Rate Lookup](https://militarypay.defense.gov/Pay/Basic-Allowance-for-Housing/BAH-Rate-Lookup/) page into `data-raw/`. The DoD site blocks scripted downloads, so this step is manual. You can leave the file zipped or extract it.
2. Run:

```bash
npm run build:data
```

`build:data` runs three scripts:

| Script | Output | Source |
|---|---|---|
| `build:installations` | `src/data/installations.json` | `scripts/installations.seed.json`. Coordinates and current names come from the Wikipedia API (former names must redirect to the current article). ZIPs are checked against the Census 2024 ZCTA gazetteer. |
| `build:bah` | `src/data/bah/bah.json` | The DoD BAH rate file in `data-raw/` |
| `build:distances` | `src/data/distances.json` | Public OSRM server (router.project-osrm.org), 1 request/s. Responses are cached in `scripts/.cache/osrm/`, so a rerun only fetches new pairs and pairs whose coordinates changed. The `built` date is that of the oldest response used. A first run takes about 35 minutes. |

DoD sometimes reissues rates partway through the year (for example, the Abilene TX270 increase of May 2026). When it does, download the file again and rerun `npm run build:bah`. Keep only one ZIP in `data-raw/`.

Review the reports the scripts print, and update `VERIFY.md`. When a post is renamed, edit `scripts/installations.seed.json`: put the new name in `name` and move the old name into `aliases`.

## Data sources

| Data | Source | As of |
|---|---|---|
| BAH rates, ZIP→MHA crosswalk | DoD BAH rate file (Defense Travel Management Office) | see the year shown in the app |
| Driving distances | OSRM / OpenStreetMap, car profile. **These are not DTOD.** Enter official DTOD miles in the override field. | built 2026-10 |
| Installation names, coordinates | Wikipedia API; Census 2024 ZCTA gazetteer for the ZIP checks | 2026-10 |
| Travel days | JTR par. 050205 (as quoted in DoD UTD/CTD MAP-CAP 46-26(I), 30 Jul 2026) | 2026 |
| TLE | JTR par. 050601: 21 days for CONUS, effective 27 Nov 2024 | 2026 |
| Leave counting, house hunting | AR 600-8-10, *Leaves and Passes*, 3 Jun 2020: paras 2-9, 4-7, 5-12c(9), 11-1 | 2020 (current) |
| Lease termination | 50 U.S.C. §3955 (SCRA) | current |

## How the rules work

All rules live in `src/lib/rules.ts` as pure functions. Each function's doc comment cites its source, and `src/lib/rules.test.ts` covers the boundary cases.

- **Travel days.** ≤ 400 mi = 1 day. Over 400 mi: divide by 350. The quotient is the number of days, plus 1 day if the remainder is ≥ 51 mi.
- **Chargeable leave.** The DA 31 runs from the departure day through the report date, counting both days. Authorized travel days and house-hunting days are subtracted. The sign-out day is not charged if you work more than half of a scheduled duty day. The sign-in day is not charged if you work more than half of it, or if it falls on a non-duty day or holiday; weekends are detected automatically. DMPO makes the final determination from your travel voucher.
- **House hunting.** AR 600-8-10 now calls this an "administrative absence" (formerly PTDY). It is limited to 10 days and needs commander approval. The losing commander may grant it for use before you sign in at the new PDS; the gaining commander may grant it for use after in-processing. By default the app places it immediately before the report date.
- **SCRA.** The lease ends 30 days after the first rent due date that falls *after* written notice and a copy of your orders are delivered. If the due day is 29–31 and the month is shorter, the due date is the month's last day. The app works forward (notice date → termination date) and backward (vacate date → latest notice date).
- **Defaults.** The UI labels every value as a *regulatory limit*, a *planning default* or a *computed* value. Defaults: out-processing starts 60 days before departure, pack-out 7 days before departure, TLE split 7 days old / 14 days new, vacate on the departure date.

Out of scope for v1: OCONUS TLE and travel, DLA, mileage reimbursement amounts, PPM.
