# Kintone Upload Format & Data Flow

How the DARB pipeline builds the **`Kintone Upload`** tab, and which tab/column feeds each
field. The column order on `Kintone Upload` is the integration contract with Kintone -
**do not reorder or rename** without coordinating with the Kintone import.

## The `Kintone Upload` tab (19 columns)

One tab, three colour groups (matching the `KINTONE uPLOAD FORMAT` template):

| # | Column | Group |
|---|--------|-------|
| 1 | New record flag | parent |
| 2 | Primary Business Name | parent |
| 3 | AlphaSense Ticker | parent |
| 4 | Analyst | parent |
| 5 | Profile Review - Action Status | parent |
| 6 | CRBM Tier | parent |
| 7 | Pure-Play | parent |
| 8 | Sector | parent |
| 9 | Primary Business Description | parent |
| 10 | Inclusion Rationale | parent |
| 11 | Tiering Rationale | parent |
| 12 | Folder Name | parent |
| 13 | Website Type | 🩷 Website subtable |
| 14 | Website URL's | 🩷 Website subtable |
| 15 | Added to BOX | 💛 Source Documents subtable |
| 16 | Source Document Name | 💛 Source Documents subtable |
| 17 | Note Per SD | 💛 Source Documents subtable |
| 18 | Source URL | 💛 Source Documents subtable |
| 19 | Date | 💛 Source Documents subtable |

- **Analyst** (col 4) = the assigned reviewer, carried from the Adds tab. Must be an exact
  Kintone user name (the `Assign To` dropdown is restricted to that list).
- **Profile Review - Action Status** (col 5) is always `AlphaSense Macro (New Profiles)`.
- **Inclusion Rationale** (col 10) + **Tiering Rationale** (col 11) are auto-filled from Tier +
  Sector by the rule engine (see *Tier / Sector automation* below).
- **Added to BOX** (col 15) defaults to `No`.

**Row layout per company:** the `New record flag` is `*` on the **first row only**; then one
row per **Source Document** (yellow filled, pink blank), then one row per **Website/Exchange
URL** (pink filled, yellow blank). Parent fields (cols 1-12) are repeated on every row of the
record (1:1 with the template).

## Data flow: Intern tab → Adds → Kintone Upload

Analysts capture everything on their review tab (named by first name, e.g. `Peter`);
**Clean-up / Process Reviews** routes "Add" rows to **Adds**; **Build Kintone Upload** formats
Adds into the upload tab.

### Review tab (`<first name>`) columns
`Company Name (AlphaSense)` · `Ticker` · `Review Assignement` · `Ticker Reviewed Date` ·
`Analyst` · `Primary Business Name` · `Primary Business Description` · `Inclusion Rationale` ·
`Tiering Rationale` · `If Add Recomended Tier` · `Recomended Sector` · `Pure-Play` ·
`Website URLs` · `Source Documents` · `Source` · `Note` · `Date Assigned` · `Due Date`

- **Website URLs** - one entry per line, `Type | URL` (e.g. `Website | https://...`,
  `Exchange | https://...`). A bare URL is treated as `Website`.
- **Source Documents** - one entry per line, `Name | Note | URL | Date`
  (e.g. `PR - Launches TRM | Added Press Release | https://... | 2026-06-09`). Missing
  trailing fields are allowed.

### Adds tab columns (17)
`Imported?` · `Select` · `Analyst` · `New Record Flag` · `AS Business Name` ·
`Primary Business Name` · `AlphaSense Ticker` · `Profile Review - Action Status` ·
`CRBM Tier` · `Pure-Play` · `Sector` · `Primary Business Description` · `Inclusion Rationale` ·
`Tiering Rationale` · `Folder Name` · `Website URLs` · `Source Documents`

- **AS Business Name** = the AlphaSense name (reference). **Primary Business Name** = the
  editable canonical name that flows to Kintone. **Folder Name** mirrors Primary Business Name.
- `Imported?` / `Select` control the build (see below). `Website URLs` / `Source Documents`
  carry the same free-text formats as the intern tab.

### Field mapping (Adds → Kintone Upload)
Analyst→4 · Primary Business Name→2 · AlphaSense Ticker→3 ·
Profile Review - Action Status→5 (always `AlphaSense Macro (New Profiles)`) · CRBM Tier→6 ·
Pure-Play→7 · Sector→8 · Primary Business Description→9 · Inclusion Rationale→10 ·
Tiering Rationale→11 · Folder Name→12 · Website URLs→(13,14) · Source Documents→(15-19, Added to BOX = "No").

## Tier / Sector automation (ported from Kintone)
Live `onEdit` rules run on **Sort**, the **analyst review tabs**, **Adds**, and **Kintone Upload**
(columns resolved by header name). Boilerplate lives in `TIER_RATIONALE_CONFIG` / `SECTOR_TO_TIER`
in `Code.gs` - edit there.

- **Sector → Tier** (Rule 1): picking a Sector auto-sets Tier per the mapping (e.g. `DA - Futures` → `1A`, `Pre-Acquisition SPAC` → `2`).
- **Tier → Pure-Play** (Rule 2): Tier `2` → Pure-Play `Yes`; Tier `3` → Pure-Play `No`. (Sort has no Pure-Play column, so it's skipped there.)
- **Tier + Sector → rationale** (Rule 3): fills `Inclusion Rationale` + `Tiering Rationale` (ETP/Fund and Futures sectors use their own text; everything else uses the company text).
- **Validation** (Rule 5): **Utilities → Check Tier/Sector rules (active tab)** flags rows where Tier/Sector/Pure-Play don't match. **Re-apply Tier/Sector rules (active tab)** re-runs all rules in bulk.
- Drop_down_19/Drop_down_10 (Pre-IPO/Active holdings cascade) stays Kintone-side - the sheets have no holdings subtable.

## Build behaviour
- **Which rows build:** if any `Select` is ticked, only ticked rows; otherwise every row whose
  `Imported?` is unticked **and** that is not already in `Current DB`.
- Rows already in `Current DB` are skipped and their `Imported?` auto-ticked (already in Kintone).
- A pre-flight warns on qualifying rows with a blank ticker (Action Status is auto-filled).
- Output: **DARB Pipeline → Build Kintone Upload**, then **Download Kintone Upload CSV**.

## Sort triage (related change)
The `Attention - DB Drift` tab is retired - drift rows now surface on **Sort** (Source
"DB Drift"). **Sort** has both `Assign To` (distribute to an analyst) and `Move To`
(Watchlist / FR Exclude / Confirmed Exclude / Remove), so an obvious non-DARB name can be
moved straight to a list without assigning anyone.

## Upgrading an existing workbook
This changes tab schemas, so after deploying the new `Code.gs`:
1. Run **Utilities → Rescaffold / Restyle Tabs** to apply the new headers/dropdowns.
2. **Clear any old rows on the `Adds` tab** - they use the previous column layout and would
   misalign under the new headers. Re-route from the intern tabs to repopulate.
3. The old **`Kintone Profiles`** and **`Kintone Source Docs`** tabs are no longer used -
   delete them once you've confirmed the new `Kintone Upload` tab.
