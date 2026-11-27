# VERIFY — open items and how each value was checked

Status as of 2026-10-22. Items marked **OPEN** need a human check before you rely on them.

## Installations (`src/data/installations.json`)

`npm run build:installations` re-runs every check below.

- **All 46 entries passed the automated checks.**
  - **Current name:** the Wikipedia article title doesn't redirect, and each former "Fort …" or "… AFB" name redirects to it. Confirmed this way: Liberty→Bragg, Cavazos→Hood, Eisenhower→Gordon, Gregg-Adams→Lee, Johnson→Polk, Novosel→Rucker, Walker→A.P. Hill.
  - **Joint-base component names** (Richardson, Elmendorf, Lewis, McChord, Myer, McNair, Dix, McGuire) have their own articles, so the check requires those to be within 30 km of the post. The farthest is McChord at 7.9 km (run of 2026-11-26).
  - **Coordinates:** taken from Wikipedia, not typed by hand.
  - **ZIP:** each ZIP's Census 2024 ZCTA centroid lies within 30 km of the post. The largest gap is Fort Hood at 22 km, which is a large post.
- **Fort Benning:** "Fort Moore" is a disambiguation page, so the seed checks "Fort Moore (Georgia)" (`aliasWiki`), which redirects to Fort Benning. News coverage also confirms the reversal: the Secretary of Defense restored "Fort Benning" in March 2025 with a new namesake, Cpl. Fred G. Benning. The Army announced the restorations for Bragg, Hood, Gordon, Lee, Polk, Rucker and A.P. Hill on 10 June 2025.
- **Three PO-box/unique ZIPs** have no Census ZCTA, so I checked them by hand against secondary sources (zip-codes.com, installation guides): Fort Greely 99731, Fort Hamilton 11252, Redstone Arsenal 35898. **OPEN:** confirm each maps to the expected MHA once BAH data is built.
- **The Pentagon:** uses ZIP 22202 (Arlington, VA, where the building is). Its mailing ZIPs (DC 203xx) are unique ZIPs. **OPEN:** confirm 22202 maps to the Washington, DC metro MHA in the BAH file.
- **Joint bases with several cantonments** use their Army or main cantonment: JBLM (Lewis Main, coordinates from the "Fort Lewis (Washington)" article), JBLE (Fort Eustis), JBSA (Fort Sam Houston), JBER (ZIP 99505, Fort Richardson side), JBMDL (ZIP 08640, Fort Dix side).

## BAH (`src/data/bah/bah.json`)

- **Built from `BAH-ASCII-2026.zip`** (DTMO, downloaded manually on 2026-10-29): 338 MHAs and 40,959 ZIPs.
- **The ZIP contains stale copies** (`… - old.txt`, `bahw_26.dat`). `build-bah.ts` reads only the plain `bahwYY.txt` names. Those are byte-identical to the `bahw26.dat` / `bahwo26.dat` files dated 2026-05-13, which include the **Abilene/Dyess AFB (TX270) temporary increase effective 16 May 2026**. If DoD ships a different layout next year, the script stops with an error instead of guessing.
- **O-7 and above:** the files carry 27 rate columns, ending O-1…O-10, even though the 2003 format PDF stops at O-7. O-8, O-9 and O-10 equal O-7 in every MHA, in both files. The official lookup lists the grade as "O-7/O-7+", which matches.
- **Every installation ZIP resolves to the expected MHA**, including the Pentagon (22202 → DC053 Washington DC Metro) and the three PO-box ZIPs (Greely → AK405 Fairbanks, Hamilton → NY219 New York City, Redstone → AL003 Huntsville). This closes the ZIP items above.
- **Spot-checked against the official DoD lookup** (defensetravel.dod.mil/neorates, CY 2026) on 2026-10-29. All four match exactly. See the scenario table below and the TX270 row.

- **Typed ZIP codes** (a station that isn't listed) use the same file. Only ZIPs with rates are accepted; the rest (including those mapped to XX499 "UNKNOWN") are refused. Codes starting `ZZ` are county cost groups and carry no state. A test confirms that exactly the ZIPs in the Alaska and Hawaii ranges are treated as OCONUS.
- **OPEN:** no county cost group rate has been spot-checked against the official lookup. Check ZIP 59301 (ZZ830): the app shows $2,670 with and $2,103 without dependents for E-7.

## Distances (`src/data/distances.json`)

- These are OSRM/OpenStreetMap driving distances between the installation coordinates. They are **not DTOD**, and they can differ from DTOD by tens of miles, which can change travel days near a boundary (400, 750, 1100 …). The UI labels them as computed and offers a DTOD override.
- No road route exists to Hawaii, so those pairs are `null`. Alaska routes go through Canada.

## Regulations

- **JTR par. 050205 (travel days):** I could not fetch the JTR directly (travel.dod.mil blocks automated access). The formula is confirmed by DoD UTD/CTD MAP-CAP 46-26(I), 30 Jul 2026, which quotes 050205. It matches the spec.
- **OPEN:** whether par. 050205's driving formula applies to Alaska and Hawaii moves has not been checked against the JTR. For those moves the app labels the count "Estimated travel" (planning default) and warns the user.
- **JTR par. 050601 (TLE, 21 days CONUS):** confirmed by the DTMO announcement (effective 27 Nov 2024) and an Army MPO PCS sheet dated 21 Jan 2026. **OPEN:** check against the current JTR text. Housing-shortage MHAs can get up to 60 days; the app shows this as a note only.
- **AR 600-8-10, 3 Jun 2020 (still current):** I read the text directly.
  - **Differs from the spec:** the regulation no longer says "PTDY". House hunting is an *administrative absence*, para 5-12c(9). The UI keeps the familiar "PTDY" label and cites the new term.
  - House-hunting eligibility (not shown as a rule): the soldier must be moving the household and must not be immediately occupying Government quarters.
  - The para 4-7h examples are internally inconsistent. Example (3) and the 70-day case in example (1) count the DA 31 period from the departure day through the report date, both days included, and the app follows that. Two figures don't fit: "2 Oct to 1 Dec" is called 60 days but is 61 counting both ends, and "14 Oct to 1 Dec" is called 50 days but is 49.
  - Federal holidays are not detected for the sign-in-day rule. Check the box if you report on a holiday.
  - **OPEN (planning assumption):** with house hunting "Right after departure" and a worked sign-out day, the app starts house hunting the next day, so one day isn't counted as both. The timeline item says "confirm with S1".
  - **OPEN (planning assumption):** with no leave to charge on the report day (0 leave days), the timeline runs travel or house hunting through the report date.
- **50 U.S.C. §3955:** text read from law.cornell.edu. Termination takes effect 30 days after the first rent due date *after* notice is delivered. Rent through termination is prorated (§3955(e)).

## Calendar export

- **OPEN:** importing an `.ics` again has not been tried in Google Calendar, Outlook or Apple Calendar. Re-exports keep each event's UID, raise `SEQUENCE`, and mark events removed since the last download in the same browser as `STATUS:CANCELLED`. A client may ignore any of these, and downloads from another browser or from before this change can't be cancelled. Since 2026-11-26 the UID also names the two stations, so events imported before that are a separate set: delete them by hand after importing a new download. When a download's stations differ from the last one, the app asks whether the new plan replaces the old move; if so, it cancels the old move's events too.
- **OPEN:** 0 official DTOD miles gives 0 travel days (`povTravelDays(0)`), so a local move's timeline has no travel day. The JTR par. 050205 text quoted here starts at "one day for the first 400 miles" and doesn't address 0 miles; confirm how a local PCS is handled.

## Test scenarios

All three scenarios ran end to end in the app on 2026-10-29: report date 2027-01-27, 10 days of leave, no PTDY, default day charging.

| # | Move | Miles (OSRM) | Travel days | BAH current → gaining | Δ/month (Δ/year) | Official lookup spot-check |
|---|---|---|---|---|---|---|
| 1 | Fort Bragg → Fort Leavenworth, E-7 with deps | 1,108 | 4 (rem. 58 ≥ 51) | NC182 $2,094 → KS102 $2,229 | +$135 (+$1,620) | ZIP 28310, E-7: $2,094 / $1,722 ✅ |
| 2 | Fort Belvoir → Fort Bragg, O-4 with deps | 315 | 1 | DC053 $4,410 → NC182 $2,427 | −$1,983 (−$23,796) | ZIP 22060, O-4: $4,410 / $3,855 ✅ |
| 3 | Fort Campbell → JBLM, E-5 without deps | 2,370 | 7 (rem. 270) | KY106 $1,593 → WA311 $2,121 | +$528 (+$6,336) | ZIP 42223, E-5: $1,815 / $1,593 ✅ |
| — | Mid-year correction check: Abilene TX270, E-7 | — | — | — | — | ZIP 79601: $2,844 / $2,133 ✅ (matches May file, not the stale copies) |

Scenario 2 entered the gaining post by its former name, "Liberty", and the search resolved it to Fort Bragg.

**Caution:** scenario 1 is only 7 miles above a travel-day boundary. If DTOD measures 1,100 miles or less, it drops to 3 days.
