# Marine-Guardian — QA Re-Verify (2026-06-25)

**Scope:** Re-verify the 6 fixes from the earlier sweep after dev stack rebuild from `main` @ `8e00acf`
(merged PRs #22 / #23 / #24 + distance backfill of 1270 patrols).
**Env:** LOCAL DEV ONLY — http://localhost:45204 · login `admin@mail.com` / `admin` · tenant `demo-site`.
**Method:** Playwright MCP (single shared browser, sequential). Coverage PDF downloaded via authenticated
in-browser fetch, decoded, rendered with poppler (`pdftoppm` / `pdftotext`).
**HEAD verified:** `8e00acf Merge pull request #24 … fix/alerts-event-links-and-seed-canonical`
(parents: #23 `2580094`, #22 `d4c63c1`).

---

## Verdict Table

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| P1-A | Alert/Notification event links no longer 404 | **FIXED** | `/alerts/history` + `/notifications` rows now link to `/events?eventId=…` (not `/events/{id}`). Clicking from both surfaces navigates to `/events?eventId=…` and the event-detail **dialog auto-opens** ("Marine Entry #29047"). **0 console errors, no `/events/{id}` network request, no 404.** Screenshots: `p1a-alerts-history-event-dialog.png`, `p1a-notifications-event-dialog.png` |
| P1-B | Seed alert rules show canonical trigger summary | **FIXED** | `/alerts` trigger summaries are now canonical, no more "Matches all events": "QA Sweep Low-Priority Catch-All" → **Priority ≥ 0 (Low+)**; "Critical SOS Alerts" → **Event type ID: cmoruuc19000egmx3egalcb8a**; "High Priority Events" → **Priority ≥ 200 (High+)**. Reflects `{minPriority/eventTypeId}` model. Screenshot: `p1b-alert-rules-canonical-triggers.png` |
| P1-C | Patrol Schedule calendar aligned to current window | **FIXED** | Grid spans Jan-2025→Dec-2027 in the DOM but **auto-scrolls to the active period** (scrollLeft ≈ 49%). Visible viewport shows **July 2026** with a "Today / Jun 25 2026" marker and columns 25-30 Jun + 1-2 Jul, aligned with the header "Jun 25 – Jul 8, 2026". Toggling to **Monthly** recomputes the header to "July 2026". Assignments (Ranger Delta 6/26–6/27, Ranger Echo 6/29–6/30/2026) align under the grid. Screenshots: `p1c-patrol-schedule-biweekly.png`, `p1c-patrol-schedule-monthly.png` |
| P1-D | Coverage Report PDF readable + populated | **PARTIAL** | **Contrast = FIXED:** PDF is now a light theme (white bg, dark text, light-gray zebra striping). Every row readable — no dark-on-dark invisible rows. **Location/Time columns = POPULATED:** Start/End Location (lat/long) and Start/End Time are real values. **Duration + KMS columns = STILL EMPTY ("—") on all 235 rows**, and header/subtotals read **0.0 km · 0.0 hrs** (Foot 0.0, Seaborne 0.0, Total 0.0). 38-page A4 PDF saved. Artifacts: `p1d-coverage-report.pdf`, `p1d-coverage-pdf-page1-summary.png`, `p1d-coverage-pdf-page2-table.png` |
| P2-A | Dashboard labels not truncated | **PARTIAL** | **Municipality Coverage** + **Protected Zones** municipality labels now show full names (Sablayan, Puerto Galera, Taytay, Aborlan, San Teodoro) — fixed. **Event-category labels STILL truncated** with ellipsis and **no tooltip / no aria-label fallback**: "Community Sup…", "Research and …", "Infrastructur…", "Marine wildli…", "Threats on Ha…". Screenshot: `p2a-p2b-dashboard.png` |
| P2-B | Distance (KM) populated | **STILL-BROKEN** | `/dashboard` Recent Patrols **KM column = "—" for every row** (8/8 visible). Cross-check in Coverage PDF: **all 235 detail rows KMS = "—"**, every aggregate **0.0 km**. The 1270-patrol distance backfill is **not reflected** in either surface. Screenshots: `p2a-p2b-dashboard.png` (Recent Patrols), `p1d-coverage-pdf-page1-summary.png` |

---

## No-Regression Spot-Check (rebuild sanity)

| Surface | Result |
|---------|--------|
| Login → `/dashboard` | OK — redirects, renders, 0 errors |
| `/events` list | OK — 35,478 total, list + dialog deep-link work |
| `/map` | OK — MapLibre canvas renders (719×841), 0 console errors |
| `/alerts`, `/alerts/history`, `/notifications`, `/patrols`, `/exports` | OK — all render |
| Alert create→fire path | OK — 3 fired alerts from "QA Sweep Low-Priority Catch-All" present in history + notifications |

No app-origin console errors observed across the pass (favicon 404 / MapLibre-WebGL warnings ignored per scope).

---

## Items NOT Fully Fixed (action needed)

### P2-B — Distance (KM) STILL empty everywhere — STILL-BROKEN
The distance backfill (reportedly 1270 patrols) does not surface on **either** the dashboard Recent Patrols
KM column **or** the Coverage PDF KMS column / subtotals (all "—" / 0.0 km). The earlier root-cause
hypothesis still holds: closed/historic patrols never got a materialized track distance, OR the
read path (dashboard query + coverage-report aggregator) is not reading the backfilled value.
This also drags **P1-D to PARTIAL** (Duration + KMS empty) — the two are the same underlying data gap.
**Recommend:** confirm the backfill actually wrote `distance`/`durationSeconds` onto the June-2026
tenant patrols, and confirm the dashboard + coverage-report queries select that column.

### P1-D — Coverage PDF Duration + KMS columns empty — PARTIAL
Contrast/readability and Location/Time population are fixed. Duration + KMS remain "—" on all rows
and 0.0 in subtotals — same data gap as P2-B.

### P2-A — Event-category chart labels still truncated — PARTIAL
Municipality labels fixed; the **event-category** axis labels still ellipsis-truncate with no
tooltip/aria fallback (5 labels). Apply the same widen/rotate/wrap/tooltip treatment used on the
municipality charts to the event-category chart.

---

*Screenshots + PDF: `docs/qa-screenshots/reverify/`*
