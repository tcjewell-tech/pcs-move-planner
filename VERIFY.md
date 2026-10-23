# VERIFY — open items and how each value was checked

Status as of 2026-10-22. Items marked **OPEN** need a human check before you rely on them.

## Installations (`src/data/installations.json`)

`npm run build:installations` re-runs every check below.

- **All 46 entries passed the automated checks.**
  - **Current name:** the Wikipedia article title doesn't redirect, and each former "Fort …" name redirects to it. Confirmed this way: Liberty→Bragg, Cavazos→Hood, Eisenhower→Gordon, Gregg-Adams→Lee, Johnson→Polk, Novosel→Rucker, Walker→A.P. Hill.
  - **Coordinates:** taken from Wikipedia, not typed by hand.
  - **ZIP:** each ZIP's Census 2024 ZCTA centroid lies within 30 km of the post. The largest gap is Fort Hood at 22 km, which is a large post.
- **Fort Benning:** "Fort Moore" is its own Wikipedia page (a disambiguation page), not a redirect. News coverage confirms the reversal: the Secretary of Defense restored "Fort Benning" in March 2025 with a new namesake, Cpl. Fred G. Benning. The Army announced the restorations for Bragg, Hood, Gordon, Lee, Polk, Rucker and A.P. Hill on 10 June 2025.
- **Three PO-box/unique ZIPs** have no Census ZCTA, so I checked them by hand against secondary sources (zip-codes.com, installation guides): Fort Greely 99731, Fort Hamilton 11252, Redstone Arsenal 35898. **OPEN:** confirm each maps to the expected MHA once BAH data is built.
- **The Pentagon:** uses ZIP 22202 (Arlington, VA, where the building is). Its mailing ZIPs (DC 203xx) are unique ZIPs. **OPEN:** confirm 22202 maps to the Washington, DC metro MHA in the BAH file.
- **Joint bases with several cantonments** use their Army or main cantonment: JBLM (Lewis Main, coordinates from the "Fort Lewis (Washington)" article), JBLE (Fort Eustis), JBSA (Fort Sam Houston), JBER (ZIP 99505, Fort Richardson side), JBMDL (ZIP 08640, Fort Dix side).

## BAH (`src/data/bah/bah.json`)

- **OPEN — not built yet.** The DoD site returns HTTP 403 to scripts. Waiting for the manual download into `data-raw/`.
- **OPEN:** how O-7 and above are handled in the file.
- **OPEN:** spot-check one figure per test scenario against the official lookup.

## Distances (`src/data/distances.json`)

- These are OSRM/OpenStreetMap driving distances between the installation coordinates. They are **not DTOD**, and they can differ from DTOD by tens of miles, which can change travel days near a boundary (400, 750, 1100 …). The UI labels them as computed and offers a DTOD override.
- No road route exists to Hawaii, so those pairs are `null`. Alaska routes go through Canada.

## Regulations

- **JTR par. 050205 (travel days):** I could not fetch the JTR directly (travel.dod.mil blocks automated access). The formula is confirmed by DoD UTD/CTD MAP-CAP 46-26(I), 30 Jul 2026, which quotes 050205. It matches the spec.
- **JTR par. 050601 (TLE, 21 days CONUS):** confirmed by the DTMO announcement (effective 27 Nov 2024) and an Army MPO PCS sheet dated 21 Jan 2026. **OPEN:** check against the current JTR text. Housing-shortage MHAs can get up to 60 days; the app shows this as a note only.
- **AR 600-8-10, 3 Jun 2020 (still current):** I read the text directly.
  - **Differs from the spec:** the regulation no longer says "PTDY". House hunting is an *administrative absence*, para 5-12c(9). The UI keeps the familiar "PTDY" label and cites the new term.
  - House-hunting eligibility (not shown as a rule): the soldier must be moving the household and must not be immediately occupying Government quarters.
  - The para 4-7h examples are internally inconsistent. Example (3) and the 70-day case in example (1) count the DA 31 period from the departure day through the report date, both days included, and the app follows that. Two figures don't fit: "2 Oct to 1 Dec" is called 60 days but is 61 counting both ends, and "14 Oct to 1 Dec" is called 50 days but is 49.
  - Federal holidays are not detected for the sign-in-day rule. Check the box if you report on a holiday.
- **50 U.S.C. §3955:** text read from law.cornell.edu. Termination takes effect 30 days after the first rent due date *after* notice is delivered. Rent through termination is prorated (§3955(e)).

## Test scenarios

**OPEN** — waiting on BAH data.
