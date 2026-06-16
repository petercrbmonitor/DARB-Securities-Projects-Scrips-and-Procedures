# ETP Holdings Update (Kintone App 106) — Build / Handoff Prompt (v2)

Complete spec + current state for the **ETP Holdings Update** workstation: Kintone
**App 106** plus a JavaScript customization (`ETP_Holdings_Update_2.js`) and CSS
(`ETP_Holdings_Update_1.css`). The JS/CSS files are the source of truth for behavior;
this doc captures intent, the exact schema, field maps, the design decisions/gotchas
that were learned the hard way, and the outstanding manual steps.

> Continuing in a new session: read the two files first, then this doc. Keep `node --check`
> clean on the JS, and keep the source **pure ASCII** (use `\uXXXX` escapes, not literal glyphs).

---

## 1. Purpose

A queue-driven workstation for analysts to review and update the **DA ETP Holdings** of
ETP profiles that live in a master app. Analysts pull qualifying profiles into App 106,
edit the Holdings table (and a few profile fields), and on Save the data is pushed back
into the master app. Profiles are revisited on a review cadence (monthly by default).

App 106 is a **work-item mirror**, not a parallel database. The master app stays the
system of record; App 106 only **reads** it (pull) and **writes back to existing records**
(push). The cryptoasset reference app is **read-only**.

---

## 2. Environment, apps, constraints

- Kintone subdomain: `csl61zqur0t5.kintone.com`
- **App 106** = ETP Holdings Update (this app).
- **Master app** (ETP profiles): **App 23 = live**, **App 86 = test copy** (field-code identical except where noted).
- **Reference app** (cryptoasset classification / BCBS): **App 34 = live**, **App 85 = test copy** (field-code identical).
- **App 54**: irrelevant — do not mention or touch it.

**Environment switch** (top of the JS):
```js
var THIS_APP   = 106;
var APP_MASTER = 86;   // ETP profiles to pull/push   (PROD: 23)
var APP_REF    = 85;   // cryptoasset reference        (PROD: 34)
```
Flip `APP_MASTER = 23` and `APP_REF = 34` to go live. Everything keys off these.

**Hard constraints**
- **Never modify App 23 / 34 / 54.** The master is only read on pull and written back to
  existing records on push; the reference app is read-only.
- A REST write to App 23 does **not** trigger App 23's own client-side form automations, so
  App 106 replicates them on push (see D1/D2/D3 and the derived fields).
- User prefs: Calibri/hyphens (no em dashes), default working dir `C:\crosscheck` (avoid OneDrive).

---

## 3. App 106 schema

Title field = `etp_name`. The native process-management Status is disabled; queue state is the
custom `status` dropdown.

### 3.1 Top-level fields
| Code | Label | Type | Notes |
|---|---|---|---|
| `app23_record_id` | App 23 Record ID | SINGLE_LINE_TEXT | master `$id`; dedupe key + re-pull pointer. **Keep as text — never a lookup.** Read-only. |
| `app23_link` | Master Record | **LINK (URL)** | mirror; URL to the master record. Rendered as a **"Master Profile"** button. Read-only. |
| `box_folder_name` | Box folder name | SINGLE_LINE_TEXT | mirror of master `Text_4`. Read-only. |
| `box_link` | Box folder (link) | **LINK (URL)** | built from master `Text_5`; rendered as an **"Open Box folder"** button. Read-only. |
| `status` | Status | DROP_DOWN | `Not in Queue` / `In Queue` / `Assigned` / `Updated`. Read-only (set by code). |
| `order_seq` | Order | NUMBER | queue ordering. Read-only. |
| `review_cadence` | Review Cadence | DROP_DOWN | `Monthly`(def)/`Quarterly`/`Semi-Annual`/`Annual`/`Hold`. **Editable.** |
| `review_due` | Next Review Due | DATE | computed. Read-only. |
| `profile_status` | Profile Status (App 23) | SINGLE_LINE_TEXT | mirror of master Profile Status. Read-only. |
| `issuer` | Issuer (ETP Provider) | SINGLE_LINE_TEXT | mirror. Read-only. |
| `etp_name` | ETP Name | SINGLE_LINE_TEXT | mirror (title). Read-only. |
| `identifier` | Identifier (Ticker/ISIN) | SINGLE_LINE_TEXT | primary-symbol summary. Read-only. |
| `sector` | Sector | SINGLE_LINE_TEXT | mirror. Read-only. |
| `holds_spot_crypto` | Holds Spot Crypto | DROP_DOWN | `Yes`/`No`. **Derived** from the table; pushed. Read-only. |
| `portfolio_type` | ETP - Portfolio Type | DROP_DOWN | `Single Asset`/`Basket`. **Derived**; pushed. Read-only. |
| `etp_holdings_type` | ETP Holdings Type | SINGLE_LINE_TEXT | **Derived** (asset-class summary); pushed. Read-only. |
| `etp_bcbs_group` | ETP BCBS Group | SINGLE_LINE_TEXT | derived rollup mirror. Read-only. |
| `expense_ratio` | Expense Ratio | SINGLE_LINE_TEXT | pulled; editable+pushed. |
| `staking_yield` | Staking Yield (%) | SINGLE_LINE_TEXT | pulled; editable+pushed. |
| `aum_expense_updated` | ETP AUM/Expense Ratio - Updated | DATE | pulled; editable+pushed. |
| `reconstitution_schedule` | Reconstitution Schedule | DROP_DOWN | pulled; editable+pushed. |
| `reconstitution_note` | Reconstitution Schedule Note | MULTI_LINE_TEXT | pulled; editable+pushed. |
| `holdings_url` | Holdings URL | LINK (WEB) | pulled; editable+pushed. |
| `holding_review_dt` | Holding Review Date and time | DATETIME | derived (stamped on Save). Read-only. |
| `holdings_last_updated_by_a23` | Holdings Last Updated By | SINGLE_LINE_TEXT | App 23 mirror. Read-only. *(Display-only — push stamps App 23 directly; safe to delete.)* |
| `assigned_to` | Assigned To | USER_SELECT | set by round-robin pull + Fetch. Read-only. |
| `assigned_at` | Assigned At | DATETIME | Read-only. |
| `in_edit` | In Edit (lock) | DROP_DOWN | `Yes`/`No`, default `No`. Read-only. |
| `last_updated_by` | Last Updated By | USER_SELECT | App 106 audit, stamped on Save. **Required** by the 24h fetch rule. |
| `last_updated_at` | Last Updated At | DATETIME | App 106 audit. **Required** by the 24h fetch rule. |

**SPACE element:** `pasteAllocSpace` — a blank Space placed **under the Holdings table** on the
edit form. The **Holdings Assistant** button renders here (falls back to the header menu if absent).

### 3.2 `securities_table` (SUBTABLE, read-only reference — mirrors master Table_1)
`sec_security_id`, `sec_type`, `sec_status`, `sec_symbol`, `sec_exchange`, `sec_cusip`,
`sec_isin`, `sec_maturity` (DATE), `sec_futures_expiry`. All text except the date; all locked in edit; never pushed.

### 3.3 `holdings_table` (SUBTABLE — the editable working table)
| Code | Label | Type | Notes |
|---|---|---|---|
| `asset_type` | Asset Type | DROP_DOWN | `Spot`/`Funds`/`Futures`/`Options`/`Permitted Swaps`. |
| `underlying_asset` | Underlying Cryptoasset | **SINGLE_LINE_TEXT** | **plain text, NOT a Kintone lookup** (see §7). |
| `bcbs_group` | BCBS Group | DROP_DOWN | `1A`/`1B`/`2A`/`2B`. |
| `breakdown_pct` | Underlying Asset Breakdown (%) | **NUMBER** | bare number; `%` is added only on push. |
| `as_of_date` | As of Date | DATETIME | |
| `a23_row_id` | A23 Row ID | SINGLE_LINE_TEXT | hidden helper = master subtable row id (in-place push pointer). Hidden via `setFieldShown`. |

---

## 4. Master app field map (App 23 live / App 86 test) — `A23` in CONFIG
```
sector        : Drop_down_3       // Sector (allowlist filter)
profileStatus : Drop_down_22      // Profile Status (Active filter)
issuer        : Text_27           // ETP Issuer (exists in 23 AND 86; 24h grouping key)
etpName       : Text              // Primary Business Name (title)
boxName       : Text_4            // Box folder name
boxRef        : Text_5            // Box folder reference (id or URL) used by the Box plugin

securitiesTable : Table_1   (secPrimarySymbol Text_33, secIsin Text_36, sec_id security_id,
                             sec_type Drop_down_9, sec_status Drop_down_10, sec_maturity Date_8,
                             sec_cusip Text_35, sec_futExpiry Text_47, sec_exchange Text_57)
holdingsTable   : Table_7   (h_assetType Text_30, h_underlying Drop_down_24 [LOOKUP -> ref app],
                             h_bcbs Drop_down_14, h_pct Text_28 [TEXT "NN.NN%"], h_asOf Date_and_time_0)

// profile context mirrors (master code -> App 106 code)
Drop_down_34 -> holds_spot_crypto       (DERIVED by applyDerived, pushed)
Drop_down_36 -> portfolio_type          (DERIVED by applyDerived, pushed)
Text_52      -> etp_holdings_type       (DERIVED by applyDerived, pushed)
Text_53      -> staking_yield           (editable, pushed)
Text_16      -> expense_ratio           (editable, pushed)
Date_2       -> aum_expense_updated     (editable, pushed)
Drop_down_26 -> reconstitution_schedule (editable, pushed)
Text_area_7  -> reconstitution_note     (editable, pushed)
Link         -> holdings_url            (editable, pushed)
BCBS_Lowest_Value     -> etp_bcbs_group               (derived rollup, read-only)
Date_and_time_1       -> holding_review_dt            (derived, read-only)
HoldingsUpdateSummary -> holdings_last_updated_by_a23 (mirror, read-only)

// derived push targets (written on push to replicate App 23 automations)
bcbsRollup : BCBS_Lowest_Value      // worst-of BCBS across rows
updatedBy  : HoldingsUpdateSummary  // analyst name (me().name)
updatedAt  : Date_and_time_1        // now
```
**23 vs 86 differences:** App 86 has no top-level `Text_2` ("ETP Provider") — issuer uses
`Text_27`. Options-strategy sector label differs: `DA - Options Based Strategy Exchange Traded
Fund (ETF)` (86) vs `DA - Options Based Strategy ETP` (23). Both are in the allowlist; the JS
intersects the allowlist with the master's real `Drop_down_3` options at runtime.

## 5. Reference app field map (App 34 live / App 85 test) — `A34`
```
key         : Text_3        // Underlying Cryptoasset Name, e.g. "Bitcoin (BTC)" (unique key)
bcbs        : Drop_down     // BCBS Group
foundInEtps : Drop_down_18  // "Found in ETPs?" (prefer "Yes")
```

---

## 6. Behavior spec (current)

### 6.1 Qualifying / pull
A master profile is pulled only when **both**: `Drop_down_22 = Active` (if `APP23_ACTIVE_ONLY`)
**and** `Drop_down_3` is in `ALLOWLIST_SECTORS` (DA / DA&DARB / DARB × ETF/ETN/CEF, plus both
options-strategy labels), intersected at runtime with the master's real options. Dedupe by
`app23_record_id`. New records: `In Queue`, `in_edit=No`, cadence Monthly, `review_due` from
master last-review + cadence, and **round-robin assigned** (§6.4).

### 6.2 Self-cleaning queue
- **Refresh Queue** (full pull, no provider filter): records whose master no longer qualifies
  (left Active or sector left the allowlist) and are `In Queue`/`Updated`, not in-edit, move to
  `Not in Queue` (profile_status refreshed). Reports "added X, removed Y". Skipped on a
  provider-filtered Add to Queue; never touches Assigned/in-edit records.
- **Queue Due Reviews**: due records re-pull fresh master data; if the master is no longer
  Active they go to `Not in Queue` instead of re-queue.

### 6.3 Auto-sync on open
`app.record.index.show` runs a throttled (`AUTO_SYNC_MIN_MS`, 10 min, localStorage timestamp)
silent full Refresh Queue, and reloads the list if records were added. This is how newly-Active
profiles appear automatically (App 23 itself is never modified — no server-side push exists).

### 6.4 Round-robin assignment
New queued records are auto-assigned across an analyst pool (`ASSIGN_GROUP = 'Research Admins'`
via `/k/v1/group/users`; `FALLBACK_ANALYSTS` if that fails), **load-balanced** by each analyst's
current open (In Queue + Assigned) workload. **Fetch Record** prefers the current user's own
queued records, else the shared pool. If an assignee code is invalid in the environment, the add
**retries unassigned** so the pull never fails. Set `ASSIGN_ENABLED=false` to disable.

### 6.5 Fetch & assign (24h rule)
Fetch assigns the next `In Queue`, `in_edit=No` record to the user, sets `Assigned`+`in_edit=Yes`,
opens edit. Prefers a record from an issuer the user touched in the last 24h (uses
`last_updated_by`/`last_updated_at`), else next by `order_seq`, else own assigned records first.

### 6.6 Edit screen
- **Holdings Assistant** button (in `pasteAllocSpace`). **Master Profile** / **Open Box folder**
  buttons render from the `app23_link`/`box_link` LINK fields (detail + edit + list view).
  No injected Cancel — Kintone's native Cancel is used; the lock is released on `detail.show`
  (`releaseIfCancelled`) if an edit was cancelled (keeps the owner).
- System/derived/mirror fields locked read-only; securities cells locked; `a23_row_id` hidden.

### 6.7 Save / push (replicates App 23 automations)
On `edit.submit`: normalize `breakdown_pct` to a bare number (strip stray `%`), stamp per-row
`as_of_date`, **sort desc by %**, **dedupe** by Asset Type + Underlying, run `applyDerived`,
schedule next `review_due`, stamp `last_updated_*`, release lock. On `edit.submit.success`:
`pushToApp23` updates the master record —
- D1: `Text_28` written as `"NN.NN%"`, `as_of_date` stamped per row.
- D2: `BCBS_Lowest_Value` = worst BCBS across rows (`1A<1B<2A<2B`).
- D3: `HoldingsUpdateSummary` = saver name, `Date_and_time_1` = now.
- Holdings rows updated **by `a23_row_id`** (only analyst-edited columns; underlying lookup left
  untouched for existing rows; included for new rows where it resolves to a valid ref key).
- Editable profile fields + the derived fields pushed.
- On push failure: record kept `Assigned`/locked, error surfaced (no silent data loss).
Then status flips to `Updated`.

### 6.8 Derived fields (`applyDerived`)
From the holdings table (only when it has weighted rows; empty/parked tables keep App 23 values):
- `etp_holdings_type` = distinct asset classes present (+ `Equities` for equity sectors), `"; "`-joined (mirrors App 23 Text_52).
- `holds_spot_crypto` = `Yes` if any Spot row has non-zero %, else `No`.
- `portfolio_type` = `Single Asset` (1 distinct underlying) / `Basket` (2+).
Recomputed on table change, after paste/Extract, on open, and on save before push.

### 6.9 BCBS auto-fill (synchronous)
On `underlying_asset` change, BCBS Group is filled from a **cached** reference map
(`loadRefByKey`, warmed on edit.show). **Synchronous** — a change handler must NOT return a
Promise (Kintone forbids "Thenable"; this was a bug). Non-blocking on a name miss.

### 6.10 Holdings Assistant (paste + Gemini AI)
One **Holdings Assistant** button → modal with: a textarea, **Attach image** + paste-image,
**Extract Holdings** (Gemini), As-of date / Asset breakdown / Replace, and **Add rows**.
- **Extract Holdings** calls Gemini (`AI_MODEL = gemini-3.5-flash`) with the "Holdings" instruction
  → `Name (TICKER) - weight%` lines into the textarea. Per-user key in `localStorage` under
  `darbAiGeminiKey` (shared with the standalone DARB assistant; reused automatically); inline key
  entry when missing; key sent directly to Google. If unsure the AI writes `UNVERIFIED (weight%)`/`[missing]`.
- **Add rows** runs `parseSource` → matches tickers to the reference app (`loadRefKeyMap`,
  prefer Found-in-ETPs=Yes, break collisions by name), auto-fills BCBS, dedupes, sorts desc,
  writes rows via `kintone.app.record.set()` for review (nothing written to the server here).
- **Parser** auto-detects: per-line bullet/colon lists (`* Bitcoin (BTC): 50.03%`); delimited
  tables incl. **Markdown/pipe** (`| Name | Symbol | … | Weighting |` — picks the
  weight/ponderazione column, not price; strips outer pipes; skips the `|:---|` rule row and
  trailing prose); tab/semicolon/comma columns with a header; and a loose whitespace stream.

### 6.11 In-app Guide
A **Guide** toolbar button opens a modal (`GUIDE_HTML`, tweakable) describing how the app works,
what it references, and how to run it — replaces the long app-description blurb.

### 6.12 Review cadence
`review_cadence` per record (Monthly default; `Hold` excludes from auto re-queue).
`CADENCE_MONTHS = { Monthly:1, Quarterly:3, Semi-Annual:6, Annual:12, Hold:null }`. `review_due`
= base review + cadence (rolling, end-of-month clamp); recomputed on Save. "Queue Due Reviews (N)"
shows the live due count.

---

## 7. Key design decisions & gotchas (do not regress)
1. **`underlying_asset` is plain text, never a lookup.** The master `Drop_down_24` lookup
   validates against the ref app on every write and broke pull/push (`GAIA_LO04`). Same reason:
   **`app23_record_id` must stay text, not a lookup.**
2. **`fetchAll(appId, query, fields)` appends `order by $id asc limit 500 offset N`** — callers
   pass a **condition or `''`**, never an `order by`. (A double `order by` caused `CB_VA01`
   "unsupported query format" and broke every pull.)
3. **Change handlers must NOT return a Promise** (Kintone "...not allowed to return Thenable").
   Async work (BCBS) must be synchronous off a cache, or fire-and-forget.
4. **`kintone.app.record.set()` requires a valid `type` on every new subtable cell** (use
   `hcell`/`HOLDINGS_CELL_TYPES`). REST writes don't.
5. **`coerceToA106(body)`** makes every pull write safe: drops fields not in App 106 and blanks
   invalid dropdown options, so a master/106 mismatch never fails the pull. `a106Fields()` caches
   the form fields (warmed on index/detail show; awaited in `pullQueue`).
6. **`go()` forces a full reload when navigating to edit from a `/show` page** — a hash-only
   change made Kintone reuse a cached, stale-revision record → `GAIA_UN03` on save.
7. **`breakdown_pct` is a NUMBER**; `%` is added only on push (`formatPercent`); stray `%` is
   stripped on save. App 23's `Text_28` is text — handled by the push.
8. **Keep source pure ASCII** (`file` should say "ASCII text"); use `\uXXXX` in regex/strings.
9. **`msgOf(e)`** surfaces `e.code` + `e.errors` — keep it; it's how the `CB_VA01` bug was found.

---

## 8. Deploy steps (manual, Kintone UI)
1. App 106 → Settings → JavaScript and CSS Customization → upload `ETP_Holdings_Update_2.js`
   (Desktop JS) and `ETP_Holdings_Update_1.css` (Desktop CSS) → **Update App**. Re-upload on every change.
2. **Create these App 106 fields** if not present: `app23_link` (Link/URL), `box_folder_name`
   (Text), `box_link` (Link/URL); a Space with element id **`pasteAllocSpace`** under the Holdings
   table. (`profile_status` already exists.) The JS tolerates their absence (coercion drops them).
3. Permissions: analysts view/add/edit App 106; view+edit-records on the master app; field-level
   view-only on the read-only fields.
4. App 106 lives in the master app's space.

## 9. CSS (`ETP_Holdings_Update_1.css`)
"Teal workstation" theme for the **injected** DOM: `.etp-bar` toolbar, `.etp-btn`/`-primary`/`-ghost`,
`.etp-busy` banner (with progress sweep), the `.etp-modal*` paste/guide modal, focus-visible rings,
`prefers-reduced-motion`. Optional native block: larger record-form fonts + **"bubble" fields**
(soft shadow + springy hover/focus lift), sticky tinted subtable headers, zebra/hover rows.
Hanken Grotesk w/ Calibri fallback.

## 10. Files
- `ETP_Holdings_Update_2.js` — the customization (CONFIG block at top: env switch, A23/A34/F maps,
  allowlist, cadence, assignment, auto-sync, AI). One file (Holdings Assistant folded in).
- `ETP_Holdings_Update_1.css` — theme.

## 11. Git / PR state (at handoff)
- Branch: `claude/eloquent-mccarthy-GWdkC`.
- **PR #18** — merged (early: CSS theme, self-cleaning, derived fields, paste normalization).
- Most subsequent work is already in `master`.
- **PR #25** — open: the **Holdings Assistant** merge (+ "Extract Holdings" rename). Watched for CI/reviews.
- The repo has **no CI configured** (0 checks).

## 12. Outstanding / verify / optional next
- **Verify `Text_5`** is a Box folder **id** or **URL** (`boxUrl` handles both); if it's
  plugin-specific, share a sample value to fix the URL.
- **Confirm the analyst pool** (`ASSIGN_GROUP`/`FALLBACK_ANALYSTS`) matches App 106's team.
- **Go live**: set `APP_MASTER=23`, `APP_REF=34`.
- Existing records backfill `app23_link`/`box_link` on next re-pull (Queue Due Reviews / Refresh
  from master); new pulls get them immediately. (Optional: make Refresh Queue refresh existing records too.)
- Optional: gate the AI to `Research Admins`; embed the live Box folder (needs the Box plugin
  installed+configured on App 106 — option b); load `GUIDE_HTML` from a record/Box doc for non-dev editing.
- Replace the App-settings description with one line (the Guide button covers the detail).
