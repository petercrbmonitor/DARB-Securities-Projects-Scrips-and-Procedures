# DARB Pipeline - Operating Process

Operator/analyst runbook for the DARB new-securities pipeline (the `Code.gs` in this
folder). Everything is driven from the **DARB Pipeline** menu in the workbook. The
in-sheet **Dashboard** tab is the short version of this doc — it holds the step-status
table (which steps ran this cycle), the editable Settings, and the workflow guide.

## Weekly cycle (run in order)

| # | Menu action | What it does |
|---|-------------|--------------|
| 1 | **Refresh DB References** | Upload the latest Kintone export (`.xlsx`). Rebuilds **Current DB**; merges **Watchlist** (locally added rows kept; rows now Active graduate off). |
| 2 | **Import Pull Files** | Upload AlphaSense Search Summary exports (CSV/XLSX). Builds **Clean Pull**. |
| 3 | **Run Crosscheck** | Classifies Clean Pull into **Sort** (new), **Review** (near-match to **Current DB** only), **Excluded** (already tracked). DB-drift cases (name/ticker changed vs the DB) also land on **Sort**, tagged `DB Drift`. Pull tickers containing the Dashboard's *Exclude pull tickers containing* keywords (default `.IN`) are **skipped entirely** — never added to Sort. |
| 4 | **Distribute Selected to Interns** | On **Sort**: tick `Select`, then set `Assign To` (analyst) and run — hands the row to that analyst's review tab (named by first name, e.g. `Peter`; created on first assign). |
| 5 | **Clean-up This Intern Tab** | On your review tab (your first name): set `Review Assignement` per row, then run to route each row to its destination. |
| 6 | **Process Reviews** | Backstop sweep that routes eligible rows across **all** intern tabs. |
| 7 | **Build Kintone Upload** | Formats qualified **Adds** into the single **Kintone Upload** tab (19 columns, incl. **Analyst** + **Tiering Rationale**). |
| 8 | **Download Kintone Upload CSV** | Download and import into Kintone. |

After step 8, run **Clear Adds (after Kintone import)** to empty the Adds tab for the next batch.
(Alternatively, tick `Imported?` on the rows you imported to keep them but skip them on the next build.)

## Triaging from Sort (no analyst needed)
Sort has both an **Assign To** column and a **Move To** column. For a row that doesn't need
analyst research (e.g. an obvious non-DARB name), tick `Select`, set **Move To**
(`Watchlist` / `FR Exclude` / `Confirmed Exclude` / `Remove`), and run **Move selected rows
between lists** — it files the row directly. `Send all Review to Sort` bulk-moves the Review
tab onto Sort for triage.

## Analyst capture formats (review tabs)
Hover the column headers for a reminder. One entry per line:

- **Website URLs** — `Type | URL`
  - `Website | https://company.com`
  - `Exchange | https://exchange.com/quote/...`
- **Source Documents** — `Name | Note | URL | Date`
  - `PR - Launch | Added Press Release | https://company.com/pr | 2026-06-09`

These flow into the Kintone Upload tab's Website subtable (cols 13-14) and Source Documents
subtable (cols 15-19). See `KINTONE_FORMAT.md` for the full column contract.

## Tier / Sector automation
On **Sort**, the **analyst tabs**, **Adds** and **Kintone Upload**, picking a **Sector** auto-sets
the **Tier**, the **Tier** auto-sets **Pure-Play** (2→Yes, 3→No), and both fill the **Inclusion
Rationale** + **Tiering Rationale** boilerplate. **Utilities → Check Tier/Sector rules** flags
mismatches; **Re-apply Tier/Sector rules** re-runs them in bulk. New names land on **Sort** with
Source `AS Pull`. (Editable text lives in `TIER_RATIONALE_CONFIG` in `Code.gs`.)

## Tracking progress
- **Dashboard** tab (status table at top) — one row per step with **Last Run**, **Result**, and a
  ✓ under **Done This Cycle**, updated automatically as you run each step.
- **Utilities → Start New Cycle** — clears the ✓ marks to begin a fresh week.
- **History Log** tab — full audit trail of every run.

## Utilities
- **Build Clean Pull** - rebuild Clean Pull from the RAW import tabs without re-importing.
- **Import legacy Watchlist** - one-time load of the legacy macro Watchlist.
- **Rescaffold / Restyle Tabs** - repair headers, dropdowns, formatting and tab colours; also
  clears stale validations and deletes retired tabs. Run this after any script update.
- **Start New Cycle** - reset the Dashboard status checkmarks.
- **Hide audit + log tabs** / **Show all tabs**.

## Tabs at a glance
- **Working:** Clean Pull, Sort, Excluded, `<first name>` review tabs (one per analyst).
- **Reference:** Current DB, Watchlist, FR Exclude, Confirmed Exclude, No Ticker Reference (hidden).
- **Output:** Adds, Kintone Upload.
- **Guide:** Dashboard (status table + Settings + workflow guide).
- **Audit:** History Log.

## Notes
- Drift now lives on **Sort** (the old `Attention - DB Drift` tab is retired and auto-deleted).
- The single **Kintone Upload** tab replaces the old `Kintone Profiles` / `Kintone Source Docs`
  tabs (also auto-deleted).
- After a script update, run **Rescaffold / Restyle Tabs** once and reload the workbook.
