# Kintone Upload Format & Data Flow

How the DARB pipeline builds the **`Kintone Upload`** tab, and which tab/column feeds each
field. The column order on `Kintone Upload` is the integration contract with Kintone -
**do not reorder or rename** without coordinating with the Kintone import.

## The `Kintone Upload` tab (17 columns)

One tab, three colour groups (matching the `KINTONE uPLOAD FORMAT` template):

| # | Column | Group |
|---|--------|-------|
| 1 | New record flag | parent |
| 2 | Primary Business Name | parent |
| 3 | AlphaSense Ticker | parent |
| 4 | Profile Review - Action Status | parent |
| 5 | CRBM Tier | parent |
| 6 | Pure-Play | parent |
| 7 | Sector | parent |
| 8 | Primary Business Description | parent |
| 9 | Inclusion Rationale | parent |
| 10 | Folder Name | parent |
| 11 | Website Type | 🩷 Website subtable |
| 12 | Website URL's | 🩷 Website subtable |
| 13 | Added to BOX | 💛 Source Documents subtable |
| 14 | Source Document Name | 💛 Source Documents subtable |
| 15 | Note Per SD | 💛 Source Documents subtable |
| 16 | Source URL | 💛 Source Documents subtable |
| 17 | Date | 💛 Source Documents subtable |

**Row layout per company:** the `New record flag` is `*` on the **first row only**; then one
row per **Source Document** (yellow filled, pink blank), then one row per **Website/Exchange
URL** (pink filled, yellow blank). Parent fields (cols 1-10) are repeated on every row of the
record (1:1 with the template).

## Data flow: Intern tab → Adds → Kintone Upload

Analysts capture everything on their `<Name> - Sort` tab; **Clean-up / Process Reviews**
routes "Add" rows to **Adds**; **Build Kintone Upload** formats Adds into the upload tab.

### Intern tab (`<Name> - Sort`) columns
`Company Name (AlphaSense)` · `Ticker` · `Review Assignement` · `Ticker Reviewed Date` ·
`Analyst` · `Primary Business Name` · `Primary Business Description` · `Inclusion Rationale` ·
`If Add Recomended Tier` · `Recomended Sector` · `Pure-Play` · `Website URLs` ·
`Source Documents` · `Source` · `Note` · `Date Assigned` · `Due Date`

- **Website URLs** - one entry per line, `Type | URL` (e.g. `Website | https://...`,
  `Exchange | https://...`). A bare URL is treated as `Website`.
- **Source Documents** - one entry per line, `Name | Note | URL | Date`
  (e.g. `PR - Launches TRM | Added Press Release | https://... | 2026-06-09`). Missing
  trailing fields are allowed.

### Adds tab columns (16)
`Imported?` · `Select` · `Analyst` · `New Record Flag` · `AS Business Name` ·
`Primary Business Name` · `AlphaSense Ticker` · `Profile Review - Action Status` ·
`CRBM Tier` · `Pure-Play` · `Sector` · `Primary Business Description` · `Inclusion Rationale` ·
`Folder Name` · `Website URLs` · `Source Documents`

- **AS Business Name** = the AlphaSense name (reference). **Primary Business Name** = the
  editable canonical name that flows to Kintone. **Folder Name** mirrors Primary Business Name.
- `Imported?` / `Select` control the build (see below). `Website URLs` / `Source Documents`
  carry the same free-text formats as the intern tab.

### Field mapping (Adds → Kintone Upload)
Primary Business Name→2 · AlphaSense Ticker→3 · Profile Review - Action Status→4 ·
CRBM Tier→5 · Pure-Play→6 · Sector→7 · Primary Business Description→8 · Inclusion Rationale→9 ·
Folder Name→10 · Website URLs→(11,12) · Source Documents→(13-17, Added to BOX = "Yes").

## Build behaviour
- **Which rows build:** if any `Select` is ticked, only ticked rows; otherwise every row whose
  `Imported?` is unticked **and** that is not already in `Current DB`.
- Rows already in `Current DB` are skipped and their `Imported?` auto-ticked (already in Kintone).
- A pre-flight warns on qualifying rows with a blank ticker or blank Action Status.
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
