/***************************************************************************************
 * DARB SECURITIES SORT PIPELINE - FULL BUILD (Steps 1-4)
 * Container-bound Google Apps Script - single file, no external dependencies.
 *
 * SETUP
 * 1. In the workbook: Extensions > Apps Script > replace Code.gs with this file.
 * 2. Project Settings > tick "Show appsscript.json manifest file" > replace its
 *    contents with the provided appsscript.json.
 * 3. Reload the workbook. The "DARB Pipeline" menu appears and all tabs scaffold.
 *
 * MENU
 *   Import Pull Files        - upload AlphaSense Search Summary CSV or XLSX exports
 *                              (RAW tabs hidden)
 *   Build Clean Pull         - stack, clean, dedupe all RAW tabs (auto-runs after import)
 *   Refresh DB References    - rebuild Current DB + Watchlist from the Kintone export
 *                              (ticker-less rows go to hidden "No Ticker Reference")
 *   Run Crosscheck           - replicate RunSort: SORT / REVIEW / EXCLUDED
 *   Distribute Selected      - hand checked Sort rows to interns (Date Assigned + Due Date)
 *   Clean-up This Tab        - route reviewed rows on the intern tab you have open
 *   Process Reviews          - sweep ALL intern tabs (backstop)
 *   Build Kintone Upload File- format qualified Adds into the Kintone bulk-upload schema
 *                              (profile + URL subtable + Source Documents subtable)
 *   Download Kintone CSV     - download the Kintone Upload tab as a UTF-8 CSV
 *   Rescaffold Tabs          - force-rewrite headers + formatting + dropdowns
 *
 * CONFIG TAB
 *   "Ticker flag keywords" - comma-separated, default ".IN". The Ticker Flag column
 *   is TRUE when a ticker contains any keyword. Edit the value, no code change needed.
 *
 * ON-SHEET BUTTONS (optional)
 *   Insert > Drawing > draw a button > Save. Click the drawing > three-dot menu >
 *   Assign script > type one of:
 *     cleanupActiveTab     (per intern tab)
 *     buildKintoneUpload   (on the Adds tab)
 *     downloadKintoneProfilesCsv      (on the Kintone Profiles tab)
 *     downloadKintoneSourceDocsCsv    (on the Kintone Source Docs tab)
 ***************************************************************************************/

/* ================================ CONFIG / TAB DEFS ================================ */

var RAW_PREFIX = 'RAW - ';
var INTERN_RE = /^(.+) - Sort$/;
var ASSIGN_OPTIONS = ['Add', 'Watchlist', 'FR Exclude', 'Confirmed Exclude', 'In DB'];
var MOVE_OPTIONS = ['Sort', 'Watchlist', 'FR Exclude', 'Confirmed Exclude', 'Remove'];

/* Tabs that support row reclassification via a trailing Select + Move To pair.
 *   dataCols           = schema width BEFORE the Select / Move To columns.
 *   company / ticker   = 0-based source column indices.
 *   tier/sector/analyst= 0-based indices to carry over when present.
 *   note(rowArray)     = context string carried into the destination's Note.            */
var MOVABLE = {
  'Review': { dataCols: 6, company: 0, ticker: 1, note: function (r) {
    return 'From Review: ' + r[4] + ' vs "' + r[2] + '" (' + r[5] + ', ' + r[3] + ')'; } },
  'Attention - DB Drift': { dataCols: 6, company: 0, ticker: 1, note: function (r) {
    return 'From Attention: ' + r[5] + ' vs "' + r[2] + '" (DB ' + r[3] + ', ' + r[4] + ')'; } },
  'Excluded': { dataCols: 4, company: 0, ticker: 1, note: function (r) {
    return 'From Excluded: ' + r[3] + ' (' + r[2] + ')'; } },
  'Watchlist': { dataCols: 13, company: 0, ticker: 1, tier: 6, sector: 11, analyst: 4,
    note: function (r) { return String(r[8] || r[5] || ''); } },
  'FR Exclude': { dataCols: 10, company: 0, ticker: 1, tier: 6, analyst: 4,
    note: function (r) { return String(r[8] || ''); } },
  'Confirmed Exclude': { dataCols: 10, company: 0, ticker: 1, tier: 6, analyst: 4,
    note: function (r) { return String(r[8] || ''); } }
};
var TIER_OPTIONS = ['1A', '1B', '2', '3'];
var PUREPLAY_OPTIONS = ['Yes', 'No'];
var PROFILE_STATUS_OPTIONS = ['Active', 'Watchlist - Deleted Profile'];
var ACTION_STATUS_OPTIONS = ['Complete', 'JF Approved Active', 'JF Approved Inactive',
  'JF to Confirm Active - New Profiles', 'JF to Review/Mark Inactive',
  'PS to Confirm Active - New Profiles', 'PS to Review/Mark Inactive',
  'TG to Mark PS Confirm - New Profiles', 'TG to Review', 'AlphaSense Macro (New Profiles)'];

/* Profile free-text fields are seeded with these labels so they are consistent regardless
 * of who fills them - interns write after the colon. */
var DESC_PREFIX = 'BUSINESS DESCRIPTION:';
var RATIONALE_PREFIX = 'INCLUSION RATIONALE:';
var TIER_RATIONALE_PREFIX = 'TIER RATIONALE:';
var SECTOR_OPTIONS = [
  'Trademark/Intellectual Property', 'Software Providers', 'Professional Services',
  'Pre-Acquisition SPAC', 'Mining', 'Issuer', 'Holders', 'Hardware Manufacturers',
  'Financial Services/Fintech', 'Exchanges/Platforms', 'Energy Providers',
  'DA - Options Based Strategy ETP', 'DA - Exchange Traded Fund (ETF)',
  'DA - Exchange Traded Note (ETN)', 'DA - Closed-end Fund (CEF)',
  'DA & DARB - Exchange Traded Fund (ETF)', 'DA & DARB - Exchange Traded Note (ETN)',
  'DA & DARB - Closed-end Fund (CEF)', 'DARB - Exchange Traded Fund (ETF)',
  'DARB - Exchange Traded Note (ETN)', 'DARB - Closed-end Fund (CEF)',
  'Custody & Administration', 'Blockchain Developers', 'DA - Futures', 'Fund of Funds'
];
var BORDER_COLOR = '#d9d9d9';
var HEADER_TEAL = '#0e6e6e';   // dark teal header fill (white bold text)
var BAND_TEAL = '#e4f3f1';     // light teal alternating band

/* Sheet-tab colours, grouped by role so the workbook reads at a glance. */
var TAB_COLOR = {
  action: '#0e6e6e',      // weekly working tabs (Clean Pull, Sort, Review, ...)
  reference: '#127a7a',   // reference data (Current DB, Watchlist, exclude lists)
  output: '#0b8043',      // deliverables (Adds, Kintone Upload)
  audit: '#999999',       // logs / settings
  intern: '#1aa39a'       // "<Name> - Sort" tabs
};
var TAB_ROLE = {
  'Clean Pull': 'action', 'Sort': 'action', 'Review': 'action',
  'Excluded': 'action', 'Attention - DB Drift': 'action',
  'Current DB': 'reference', 'Watchlist': 'reference', 'FR Exclude': 'reference',
  'Confirmed Exclude': 'reference', 'No Ticker Reference': 'reference',
  'Adds': 'output', 'Kintone Profiles': 'output', 'Kintone Source Docs': 'output',
  'In DB Log': 'audit', 'Stats': 'audit', 'History Log': 'audit', 'Config': 'audit'
};
/* Audit tabs the Utilities menu can hide (Config kept visible - it holds an editable setting). */
var AUDIT_TAB_NAMES = ['In DB Log', 'Stats', 'History Log'];

var REF_SCHEMA = ['Company Name', 'AlphaSense Ticker', 'Review Assignement',
  'Ticker Reviewed Date', 'Analyst', 'Ps Note', 'If Add Recomended Tier',
  'Source', 'Note', 'Ticker Flag'];

var TABS = {
  currentDb: { name: 'Current DB', header: ['Primary Business Name', 'AlphaSense Ticker',
    'Profile Status', 'CRBM Tier', 'Analyst', 'Ps Note', 'If Add Recomended Tier',
    'Source', 'Note', 'Ticker Flag', 'Record Number', 'Sector', 'ISIN'] },
  watchlist: { name: 'Watchlist', header: REF_SCHEMA.concat(['Record Number', 'Sector', 'ISIN', 'Select', 'Move To']) },
  frExclude: { name: 'FR Exclude', header: REF_SCHEMA.concat(['Select', 'Move To']) },
  confirmedExclude: { name: 'Confirmed Exclude', header: REF_SCHEMA.concat(['Select', 'Move To']) },
  noTicker: { name: 'No Ticker Reference', header: ['Company Name', 'Source Bucket',
    'Record Number', 'Sector'] },
  adds: { name: 'Adds', header: ['Imported?', 'Completed?', 'Analyst',
    'Primary Business Name', 'Alpha Sense Ticker', 'Official Name', 'New Record Flag',
    'Primary Business Name (dup)', 'Folder Name', 'Profile Review - Action Status',
    'Primary Business Description', 'Inclusion Rationale', 'If Add Recomended Tier',
    'Recomended Sector', 'Website URL', 'Exchange 1 URL', 'Exchange 2 URL',
    'Source Documents', 'Pure-Play', 'Profile Status', 'Select', 'Tier Rationale'] },
  kintoneProfiles: { name: 'Kintone Profiles', header: ['New Record Flag',
    'Primary Business Name', 'AlphaSense Ticker', 'Profile Status',
    'Profile Review - Action Status', 'CRBM Tier', 'Pure-Play', 'In CRBM', 'CRBM ID',
    'Sector', 'Primary Business Description', 'Inclusion Rationale', 'Tier Rationale',
    'Folder Name', 'URL Type', 'URL'] },
  kintoneSourceDocs: { name: 'Kintone Source Docs', header: ['Primary Business Name',
    'AlphaSense Ticker', 'Source Document Name', 'Added to BOX', 'Negative News [Yes]',
    'Note Per SD', 'Source Document Note', 'Date'] },
  cleanPull: { name: 'Clean Pull', header: ['Company Name (AlphaSense)',
    'AlphaSense Ticker', 'CIK', 'ISIN', 'MCAP ($)', 'Region', 'Domicile Country'] },
  sort: { name: 'Sort', header: ['Company Name (AlphaSense)', 'Ticker',
    'Review Assignement', 'Ticker Reviewed Date', 'Analyst', 'Inclusion Rationale',
    'If Add Recomended Tier', 'Recomended Sector', 'Source', 'Note', 'Select', 'Assign To'] },
  review: { name: 'Review', header: ['Company Name (AlphaSense)', 'Ticker',
    'Similar Existing Name', 'Source List', 'Match Type', 'Matched DB Ticker',
    'Select', 'Move To'] },
  excluded: { name: 'Excluded', header: ['Company Name (AlphaSense)', 'Ticker',
    'Matched Source List', 'Match Type', 'Select', 'Move To'] },
  attention: { name: 'Attention - DB Drift', header: ['Company Name (AlphaSense)',
    'AlphaSense Ticker', 'DB Name', 'DB Ticker', 'Source List', 'Drift Type',
    'Select', 'Move To'] },
  inDbLog: { name: 'In DB Log', header: ['Company Name (AlphaSense)', 'Ticker',
    'Intern', 'Date'] },
  stats: { name: 'Stats', header: ['Timestamp', 'Run Type', 'Input', 'Sort', 'Review',
    'Excluded', 'Add', 'Watchlist', 'FR Exclude', 'Confirmed Exclude', 'In DB'] },
  history: { name: 'History Log', header: ['Timestamp', 'Action', 'Source', 'Details'] },
  config: { name: 'Config', header: ['Setting', 'Value'] }
};

/* Intern row layout (0-based) - URL/source-doc capture columns sit AFTER Sector so the
   Review Assignement / Tier / Sector dropdown columns keep their positions:
   0 Company | 1 Ticker | 2 RevAssign | 3 RevDate | 4 Analyst | 5 Analyst Note |
   6 Tier | 7 Sector | 8 Website URL | 9 Exchange 1 URL | 10 Exchange 2 URL |
   11 Source Documents | 12 Source | 13 Note | 14 Date Assigned | 15 Due Date          */
var INTERN_HEADER = ['Company Name (AlphaSense)', 'Ticker', 'Review Assignement',
  'Ticker Reviewed Date', 'Analyst', 'Inclusion Rationale', 'If Add Recomended Tier',
  'Recomended Sector', 'Website URL', 'Exchange 1 URL', 'Exchange 2 URL',
  'Source Documents', 'Source', 'Note', 'Date Assigned', 'Due Date'];
var INTERN_WIDTH = INTERN_HEADER.length; // 16

/* Intern tabs are auto-detected by the "<Name> - Sort" convention, but these names are
 * seeded so their tabs always exist without manual creation - edit this list to add or
 * remove standing reviewers. Any other "<Name> - Sort" tab an operator creates is still
 * picked up automatically. */
var DEFAULT_INTERNS = ['Peter', 'Tamara'];

/* ================================ MENU / SCAFFOLDING ================================ */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('DARB Pipeline')
    .addItem('1. Refresh DB References', 'showRefreshDialog')
    .addItem('2. Import Pull Files (CSV / XLSX)', 'showCsvImportDialog')
    .addItem('3. Run Crosscheck', 'runCrosscheck')
    .addSeparator()
    .addItem('4. Distribute Selected to Interns', 'distributeSelected')
    .addItem('5. Clean-up This Intern Tab', 'cleanupActiveTab')
    .addItem('6. Process Reviews (backstop)', 'processReviews')
    .addSeparator()
    .addItem('Move selected rows between lists', 'moveSelected')
    .addItem('Send all Review + Attention to Sort', 'consolidateToSort')
    .addSeparator()
    .addItem('7. Build Kintone Upload Files', 'buildKintoneUpload')
    .addItem('8. Download Profiles CSV', 'downloadKintoneProfilesCsv')
    .addItem('9. Download Source Docs CSV', 'downloadKintoneSourceDocsCsv')
    .addSeparator()
    .addSubMenu(ui.createMenu('Utilities')
      .addItem('Build Clean Pull (manual rebuild)', 'buildCleanPull')
      .addItem('Import legacy Watchlist (one-time)', 'showWatchlistImportDialog')
      .addItem('Rescaffold / Restyle Tabs', 'rescaffold')
      .addSeparator()
      .addItem('Hide audit + log tabs', 'hideAuditTabs')
      .addItem('Show all tabs', 'showAllTabs'))
    .addToUi();
  scaffoldAll_();
}

function rescaffold() {
  scaffoldAll_(true);
  forceMoveCheckboxes_(Object.keys(MOVABLE));
  toast_('Tabs rescaffolded.');
}

function scaffoldAll_(force) {
  Object.keys(TABS).forEach(function (k) { ensureTab_(TABS[k], force === true); });
  seedConfig_();
  ensureDefaultInternTabs_();
  scaffoldInternSheets_(force === true);
  refreshSortValidations_();
  refreshAddsValidations_();
  scaffoldMoveColumns_();
  colorTabs_();
}

/** Create tab if missing; write header if new / blank / forced. */
function ensureTab_(def, forceHeader) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(def.name);
  var isNew = false;
  if (!sh) { sh = ss.insertSheet(def.name); isNew = true; }
  if (forceHeader || isNew || sh.getRange(1, 1).getValue() === '') {
    sh.getRange(1, 1, 1, def.header.length).setValues([def.header]);
    applyFormat_(sh, def.header.length);
  }
  if (isNew && def.name === TABS.noTicker.name) sh.hideSheet();
  return sh;
}

function seedConfig_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.config.name);
  if (!sh) return;
  var defaults = [
    ['Ticker flag keywords (comma-separated)', '.IN'],
    ['Re-review tickers older than (days)', 365],
    ['Resurface tickers with no reviewed date (Yes/No)', 'No']
  ];
  var existing = {};
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      existing[String(r[0]).toLowerCase().trim()] = true;
    });
  }
  defaults.forEach(function (d) {
    if (!existing[d[0].toLowerCase().trim()]) {
      sh.appendRow(d);
      formatRow_(sh, sh.getLastRow(), 2);
    }
  });
}

/** Read a Config value whose Setting label starts with labelPrefix (case-insensitive). */
function configValue_(labelPrefix, def) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.config.name);
  if (sh && sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).toLowerCase().indexOf(labelPrefix.toLowerCase()) === 0) {
        return vals[i][1];
      }
    }
  }
  return def;
}

/** Re-review threshold in days (Config, default 365). */
function reviewThresholdDays_() {
  var n = parseInt(configValue_('re-review tickers older', 365), 10);
  return (isNaN(n) || n <= 0) ? 365 : n;
}

/** Whether tickers with no reviewed date should also resurface (Config, default No). */
function resurfaceBlank_() {
  var v = String(configValue_('resurface tickers with no reviewed', 'No')).toLowerCase().trim();
  return v === 'yes' || v === 'true' || v === 'y';
}

/** A reviewed-date is stale if older than thresholdDays; blank obeys resurfaceBlank. */
function isStale_(reviewed, thresholdDays, resurfaceBlank) {
  var d = reviewed;
  if (!(d instanceof Date)) {
    if (typeof d === 'string' && isDateish_(d)) { d = new Date(d); }
    else { return resurfaceBlank; }
  }
  if (isNaN(d.getTime())) return resurfaceBlank;
  return (Date.now() - d.getTime()) / 86400000 > thresholdDays;
}

/** Intern tabs are detected by "<Name> - Sort" - never hardcode names. */
function getInternSheets_() {
  return SpreadsheetApp.getActive().getSheets().filter(function (s) {
    var n = s.getName();
    return INTERN_RE.test(n) && n.indexOf(RAW_PREFIX) !== 0;
  });
}

function internName_(sh) { return sh.getName().match(INTERN_RE)[1]; }

/** Ensure a "<Name> - Sort" tab exists for each standing reviewer in DEFAULT_INTERNS.
 *  New tabs get the canonical header + table styling; scaffoldInternSheets_ then adds the
 *  dropdowns and colorTabs_ tints them. Existing tabs are left untouched. */
function ensureDefaultInternTabs_() {
  var ss = SpreadsheetApp.getActive();
  DEFAULT_INTERNS.forEach(function (name) {
    var tabName = name + ' - Sort';
    if (ss.getSheetByName(tabName)) return;
    var sh = ss.insertSheet(tabName);
    sh.getRange(1, 1, 1, INTERN_WIDTH).setValues([INTERN_HEADER]);
    applyFormat_(sh, INTERN_WIDTH);
  });
}

function scaffoldInternSheets_(force) {
  var assignRule = listRule_(ASSIGN_OPTIONS);
  var tierRule = listRule_(TIER_OPTIONS);
  var sectorRule = listRule_(SECTOR_OPTIONS);
  getInternSheets_().forEach(function (sh) {
    var cur = sh.getRange(1, 1, 1, INTERN_WIDTH).getValues()[0];
    var headerOk = cur.every(function (v, i) { return String(v) === String(INTERN_HEADER[i]); });
    if (force || !headerOk) {
      migrateInternTab_(sh);   // rewrites header AND realigns any old-layout rows
    }
    var mr = sh.getMaxRows();
    if (mr > 1) {
      sh.getRange(2, 3, mr - 1, 1).setDataValidation(assignRule); // Review Assignement
      sh.getRange(2, 7, mr - 1, 1).setDataValidation(tierRule);   // If Add Recomended Tier
      sh.getRange(2, 8, mr - 1, 1).setDataValidation(sectorRule); // Recomended Sector
    }
  });
}

/** True for a Date cell, or a string that clearly reads as a date. */
function isDateish_(v) {
  if (v instanceof Date) return true;
  return typeof v === 'string' && /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(v.trim());
}

/**
 * Realign one intern data row to the canonical 16-column layout.
 * Canonical (0-based): 0 Company | 1 Ticker | 2 RevAssign | 3 RevDate | 4 Analyst |
 *   5 Analyst Note | 6 Tier | 7 Sector | 8 Website | 9 Exchange 1 | 10 Exchange 2 |
 *   11 Source Documents | 12 Source | 13 Note | 14 Date Assigned | 15 Due Date
 * Legacy 12-column rows put Source/Note/Date Assigned/Due Date at 8/9/10/11; detect those
 * by a date in col 10 or 11 (with cols 14/15 empty) and shift the trailing four right.
 */
function migrateInternRow_(r) {
  if (isDateish_(r[14]) || isDateish_(r[15])) return r;          // already canonical
  if (isDateish_(r[10]) || isDateish_(r[11])) {                  // legacy 12-col layout
    return [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7],
      '', '', '', '',                                            // Website, Exch 1, Exch 2, Source Docs
      r[8], r[9], r[10], r[11]];                                 // Source, Note, Date Assigned, Due Date
  }
  return r;                                                      // markers / undated rows untouched
}

/** Rewrite an intern tab's header to the canonical schema and realign its rows. */
function migrateInternTab_(sh) {
  var lr = sh.getLastRow();
  var rows = [];
  if (lr >= 2) {
    sh.getRange(2, 1, lr - 1, INTERN_WIDTH).getValues().forEach(function (r) {
      var m = migrateInternRow_(r);
      if (!String(m[0] || '').trim() && !String(m[1] || '').trim()) return; // drop blank spacers
      rows.push(m);
    });
  }
  clearBody_(sh);
  sh.getRange(1, 1, 1, INTERN_WIDTH).setValues([INTERN_HEADER]);
  if (rows.length) sh.getRange(2, 1, rows.length, INTERN_WIDTH).setValues(rows);
  applyFormat_(sh, INTERN_WIDTH);
  reorganizeInternTab_(sh);   // restratify pending vs routed + restore strikethrough
}

/** Dropdowns on the Sort tab: Tier (G), Sector (H), Assign To (L). */
function refreshSortValidations_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.sort.name);
  if (!sh) return;
  var lr = sh.getLastRow();
  if (lr < 2) return;
  var n = lr - 1;
  sh.getRange(2, 7, n, 1).setDataValidation(listRule_(TIER_OPTIONS));
  sh.getRange(2, 8, n, 1).setDataValidation(listRule_(SECTOR_OPTIONS));
  var interns = getInternSheets_().map(internName_);
  if (interns.length) sh.getRange(2, 12, n, 1).setDataValidation(listRule_(interns));
}

/** Dropdowns on the Adds tab: Tier (M), Sector (N), Pure-Play (S), Profile Status (T);
 *  Select checkboxes (U). */
function refreshAddsValidations_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.adds.name);
  if (!sh) return;
  var mr = sh.getMaxRows();
  if (mr < 2) return;
  sh.getRange(2, 10, mr - 1, 1).setDataValidation(listRuleAllowOther_(ACTION_STATUS_OPTIONS)); // Profile Review - Action Status
  sh.getRange(2, 13, mr - 1, 1).setDataValidation(listRule_(TIER_OPTIONS));
  sh.getRange(2, 14, mr - 1, 1).setDataValidation(listRule_(SECTOR_OPTIONS));
  sh.getRange(2, 19, mr - 1, 1).setDataValidation(listRule_(PUREPLAY_OPTIONS));
  sh.getRange(2, 20, mr - 1, 1).setDataValidation(listRule_(PROFILE_STATUS_OPTIONS));
  var lr = sh.getLastRow();
  if (lr >= 2) {
    try { sh.getRange(2, 21, lr - 1, 1).insertCheckboxes(); } catch (e) { /* already present */ }
  }
}

function listRule_(options) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true).setAllowInvalid(false).build();
}

/** Gentle: refresh the Move To dropdown on every movable tab and add Select checkboxes
 *  only where they are missing (never clobbers ticks a user is mid-way through). */
function scaffoldMoveColumns_() {
  var ss = SpreadsheetApp.getActive();
  var moveRule = listRule_(MOVE_OPTIONS);
  Object.keys(MOVABLE).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var lr = sh.getLastRow();
    if (lr < 2) return;
    var dc = MOVABLE[name].dataCols, n = lr - 1;
    sh.getRange(2, dc + 2, n, 1).setDataValidation(moveRule);          // Move To dropdown
    var probe = sh.getRange(2, dc + 1).getValue();
    if (probe === '' || probe === null) sh.getRange(2, dc + 1, n, 1).insertCheckboxes();
  });
}

/** Force: rebuild Select checkboxes + Move To dropdown across the full data range.
 *  Use right after a tab's data is rebuilt or appended (no ticks are pending then). */
function forceMoveCheckboxes_(names) {
  var ss = SpreadsheetApp.getActive();
  var moveRule = listRule_(MOVE_OPTIONS);
  names.forEach(function (name) {
    var cfg = MOVABLE[name];
    if (!cfg) return;
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var lr = sh.getLastRow();
    if (lr < 2) return;
    var n = lr - 1;
    var sel = sh.getRange(2, cfg.dataCols + 1, n, 1);
    try { sel.removeCheckboxes(); } catch (e) { /* none present */ }
    sel.insertCheckboxes();
    sh.getRange(2, cfg.dataCols + 2, n, 1).setDataValidation(moveRule);
  });
}

/** Same dropdown but tolerant of free-typed values (e.g. an unusual Profile Status). */
function listRuleAllowOther_(options) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true).setAllowInvalid(true).build();
}

/* ================================ FORMATTING HELPERS ================================ */

/** Style a tab as a filtered table: Calibri 11, frozen teal header (white bold text),
 *  a reset header filter, white / light-teal row banding, faint internal borders, auto-fit.
 *  (Google's native "Insert > Table" isn't scriptable, so a filter + banding is the
 *  reliable equivalent.) */
function applyFormat_(sh, numCols) {
  var lastRow = Math.max(sh.getLastRow(), 1);
  var rng = sh.getRange(1, 1, lastRow, numCols);
  rng.setFontFamily('Calibri').setFontSize(11);
  rng.setBorder(false, false, false, false, true, true,
    BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, numCols)
    .setFontWeight('bold').setBackground(HEADER_TEAL).setFontColor('#ffffff');
  // Reset the header filter so it always spans the current data extent.
  var f = sh.getFilter();
  if (f) f.remove();
  sh.getRange(1, 1, lastRow, numCols).createFilter();
  applyBanding_(sh, numCols, lastRow);
  sh.autoResizeColumns(1, numCols);
}

function removeBandings_(sh) {
  var bs = sh.getBandings();
  for (var i = 0; i < bs.length; i++) bs[i].remove();
}

/** White / light-teal alternating bands on the data rows (header excluded). */
function applyBanding_(sh, numCols, lastRow) {
  removeBandings_(sh);
  if (lastRow < 2) return;
  var b = sh.getRange(2, 1, lastRow - 1, numCols)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  b.setFirstRowColor('#ffffff').setSecondRowColor(BAND_TEAL);
}

/** Colour each sheet tab by role so the workbook reads at a glance. */
function colorTabs_() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(TAB_ROLE).forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s) s.setTabColor(TAB_COLOR[TAB_ROLE[n]]);
  });
  getInternSheets_().forEach(function (s) { s.setTabColor(TAB_COLOR.intern); });
}

/** Header length for a tab name (TABS def or intern width) - used to restyle by name. */
function headerLenByName_(name) {
  var keys = Object.keys(TABS);
  for (var i = 0; i < keys.length; i++) {
    if (TABS[keys[i]].name === name) return TABS[keys[i]].header.length;
  }
  return INTERN_RE.test(name) ? INTERN_WIDTH : null;
}

/** Re-apply table styling to a set of tabs by name (refreshes filter + banding extent
 *  after rows were appended one at a time). */
function restyleTabs_(names) {
  var ss = SpreadsheetApp.getActive();
  names.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) return;
    var cols = headerLenByName_(n);
    if (cols) applyFormat_(sh, cols);
  });
}

function hideAuditTabs() {
  var ss = SpreadsheetApp.getActive();
  AUDIT_TAB_NAMES.forEach(function (n) { var s = ss.getSheetByName(n); if (s) s.hideSheet(); });
  toast_('Audit/log tabs hidden. Utilities > Show all tabs to bring them back.');
}

function showAllTabs() {
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (n.indexOf(RAW_PREFIX) === 0 || n === TABS.noTicker.name) return; // stay hidden (internal)
    s.showSheet();
  });
  toast_('Working tabs shown. RAW imports and No Ticker Reference stay hidden by design.');
}

/** Single-row format. Clears any leftover strikethrough so freshly written rows come in
 *  clean (prevents distributed/appended rows inheriting a previous row's line-through). */
function formatRow_(sh, rowNum, numCols) {
  sh.getRange(rowNum, 1, 1, numCols).setFontFamily('Calibri').setFontSize(11)
    .setFontLine('none')
    .setBorder(false, false, false, false, true, true,
      BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID);
}

/** Clear everything below the header (filter, content, validations, checkboxes, strikethrough). */
function clearBody_(sh) {
  var f = sh.getFilter();
  if (f) f.remove();
  var mr = sh.getMaxRows(), mc = sh.getMaxColumns();
  if (mr < 2) return;
  var rng = sh.getRange(2, 1, mr - 1, mc);
  try { rng.removeCheckboxes(); } catch (e) { /* no checkboxes present */ }
  rng.clearDataValidations();
  rng.clearContent();
  rng.setFontLine('none');
}

/* ============================== NORMALIZATION HELPERS =============================== */

var LEGAL_SUFFIXES = {};
['inc', 'incorporated', 'ltd', 'limited', 'corp', 'corporation', 'llc', 'plc', 'sa',
  'ag', 'nv', 'co', 'company', 'group', 'holdings', 'holding', 'se', 'ab', 'as', 'asa',
  'oyj', 'kk', 'bhd', 'pte', 'nyrt', 'pjsc'
].forEach(function (s) { LEGAL_SUFFIXES[s] = true; });

/** lowercase, strip punctuation, collapse whitespace, strip trailing legal suffixes. */
function normName_(name) {
  var s = String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  var w = s.split(' ');
  while (w.length > 1 && LEGAL_SUFFIXES[w[w.length - 1]]) w.pop();
  return w.join(' ');
}

function normTicker_(t) { return String(t || '').trim().toUpperCase(); }

/**
 * 1-based row of the first data row on `sh` whose ticker (1-based col tCol) matches normT,
 * or whose name (1-based col nCol) matches normN when normT is blank. -1 if none.
 * Used to prevent duplicate rows when routing / moving the same company twice.
 */
function findExistingRow_(sh, nCol, tCol, normT, normN) {
  var lr = sh.getLastRow();
  if (lr < 2) return -1;
  var maxC = Math.max(nCol, tCol);
  var vals = sh.getRange(2, 1, lr - 1, maxC).getValues();
  for (var i = 0; i < vals.length; i++) {
    var t = normTicker_(vals[i][tCol - 1]);
    if (normT) { if (t === normT) return i + 2; }
    else if (normN && normName_(vals[i][nCol - 1]) === normN) return i + 2;
  }
  return -1;
}

/** Configurable ticker keyword flag - keywords read from the Config tab (default .IN). */
var _flagKeywordsCache = null;
function flagKeywords_() {
  if (_flagKeywordsCache) return _flagKeywordsCache;
  var def = ['.IN'];
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.config.name);
  if (sh && sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).toLowerCase().indexOf('ticker flag') === 0) {
        var kws = String(vals[i][1] || '').split(',')
          .map(function (s) { return s.trim().toUpperCase(); })
          .filter(function (s) { return s.length > 0; });
        if (kws.length) { _flagKeywordsCache = kws; return kws; }
      }
    }
  }
  _flagKeywordsCache = def;
  return def;
}

function tickerFlag_(t) {
  var nt = normTicker_(t);
  if (!nt) return false;
  var kws = flagKeywords_();
  for (var i = 0; i < kws.length; i++) {
    if (nt.indexOf(kws[i]) >= 0) return true;
  }
  return false;
}

function sanitizeName_(filename) {
  return String(filename).replace(/\.[^.]*$/, '')
    .replace(/[\\\/\?\*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 85);
}

/* ========================== STEP 1 - CONSOLIDATE & CLEAN PULL ======================= */

function showCsvImportDialog() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:13px">' +
    '<p>Select one or more AlphaSense Search Summary exports - CSV or Excel (.xlsx), ' +
    'one per market-cap range.</p>' +
    '<input type="file" id="f" multiple accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><br><br>' +
    '<button id="go" onclick="go()">Import</button> <span id="st"></span>' +
    '<scr' + 'ipt>' +
    'function go(){var fs=document.getElementById("f").files;if(!fs.length){return;}' +
    'document.getElementById("go").disabled=true;' +
    'document.getElementById("st").textContent="Reading files...";' +
    'var out=[],pending=fs.length;' +
    'Array.prototype.forEach.call(fs,function(f){' +
    'var isX=/\\.xlsx$/i.test(f.name);var r=new FileReader();' +
    'r.onload=function(e){' +
    'if(isX){out.push({name:f.name,kind:"xlsx",data:e.target.result.split(",")[1]});}' +
    'else{out.push({name:f.name,kind:"csv",content:e.target.result});}' +
    'if(--pending===0)send(out);};' +
    'if(isX){r.readAsDataURL(f);}else{r.readAsText(f);}});' +
    'function send(arr){document.getElementById("st").textContent="Importing...";' +
    'google.script.run.withSuccessHandler(function(m){' +
    'document.getElementById("st").textContent=m;' +
    'setTimeout(function(){google.script.host.close();},1500);})' +
    '.withFailureHandler(function(err){document.getElementById("go").disabled=false;' +
    'document.getElementById("st").textContent="Error: "+err.message;})' +
    '.importPullFiles(arr);}}' +
    '</scr' + 'ipt></div>'
  ).setWidth(440).setHeight(190);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import AlphaSense Pulls');
}

/** Each file -> its own hidden RAW tab (re-import replaces in place). Auto Clean Pull.
 *  CSVs are parsed directly; XLSX files are converted via the Drive API and the first
 *  sheet is read (Search Summary exports are single-tab). */
function importPullFiles(files) {
  if (!files || !files.length) throw new Error('No files received.');
  scaffoldAll_();
  var ss = SpreadsheetApp.getActive();
  files.forEach(function (f) {
    var data;
    if (f.kind === 'xlsx') {
      data = readXlsxValues_(Utilities.base64Decode(f.data), f.name);
    } else {
      data = Utilities.parseCsv(f.content);
    }
    if (!data || !data.length) return;
    var width = Math.max.apply(null, data.map(function (r) { return r.length; }));
    data = data.map(function (r) {
      r = r.slice();
      while (r.length < width) r.push('');
      return r;
    });
    var tabName = RAW_PREFIX + sanitizeName_(f.name);
    var sh = ss.getSheetByName(tabName);
    if (sh) { sh.clear(); } else { sh = ss.insertSheet(tabName); }
    sh.getRange(1, 1, data.length, width).setValues(data);
    sh.hideSheet();
    logHistory_('Import Pull (' + (f.kind === 'xlsx' ? 'XLSX' : 'CSV') + ')', f.name,
      data.length + ' rows written to hidden "' + tabName + '"');
  });
  buildCleanPull();
  return files.length + ' file(s) imported - Clean Pull rebuilt.';
}

/** Convert an uploaded xlsx via Drive and return the first sheet's values. */
function readXlsxValues_(bytes, name) {
  var tempId = convertXlsxToSheet_(bytes, name);
  try {
    var sh = SpreadsheetApp.openById(tempId).getSheets()[0];
    var lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (lr < 1 || lc < 1) return [];
    return sh.getRange(1, 1, lr, lc).getValues();
  } finally {
    try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) { /* best effort */ }
  }
}

/* AlphaSense Search Summary header aliases, resolved by name so a column reorder or a
 * change in the metadata-block height does not silently drop rows or disable ISIN
 * matching. If no header row is found we fall back to the historical layout (data from
 * row 10, fixed column positions). */
var RAW_ALIASES = {
  company: ['company', 'company name', 'name', 'primary business name',
    'company name (alphasense)', 'issuer name', 'issuer'],
  ticker: ['ticker', 'alphasense ticker', 'symbol', 'sentieo ticker', 'primary symbol'],
  cik: ['cik'],
  isin: ['isin'],
  mcap: ['mcap', 'mcap ($)', 'market cap', 'market cap ($)', 'market capitalization',
    'market capitalisation', 'mkt cap'],
  region: ['region'],
  domicile: ['domicile', 'domicile country', 'country', 'country of domicile']
};
var RAW_LEGACY_COLS = { company: 0, ticker: 1, cik: 2, isin: 3, mcap: 5, region: 7, domicile: 8 };
var RAW_HEADER_SCAN = 20; // rows to scan for the header before falling back to legacy

/** Find the header row in a RAW grid: the first row (within RAW_HEADER_SCAN) that resolves
 *  both a company and a ticker column by name. Returns {row, idx} or null. */
function findRawHeaderRow_(grid) {
  var scan = Math.min(RAW_HEADER_SCAN, grid.length);
  for (var i = 0; i < scan; i++) {
    var pos = {};
    grid[i].forEach(function (h, c) {
      var key = String(h || '').toLowerCase().trim();
      if (!key) return;
      Object.keys(RAW_ALIASES).forEach(function (field) {
        if (pos[field] === undefined && RAW_ALIASES[field].indexOf(key) >= 0) pos[field] = c;
      });
    });
    if (pos.company !== undefined && pos.ticker !== undefined) return { row: i, idx: pos };
  }
  return null;
}

/** Read a field from a RAW row by the resolved column map (blank if unmapped / out of range). */
function rawCell_(r, col, field) {
  var c = col[field];
  return (c === undefined || c < 0 || c >= r.length) ? '' : r[c];
}

/**
 * Stack data rows from every RAW tab. The header row is detected by column name
 * (RAW_ALIASES); if none is found we fall back to the historical layout (data from
 * row 10, fixed column positions). Keep: real ticker (not blank, not "-") AND MCAP not
 * PRIVATE / ACQUIRED. Dedupe ticker-first (normalized ticker), Company as tiebreak.
 */
function buildCleanPull() {
  var ss = SpreadsheetApp.getActive();
  var rawSheets = ss.getSheets().filter(function (s) {
    return s.getName().indexOf(RAW_PREFIX) === 0;
  });
  if (!rawSheets.length) { toast_('No RAW tabs found - run Import CSVs first.'); return; }

  var byKey = {}, order = [], legacyTabs = 0;
  rawSheets.forEach(function (sh) {
    var lr = sh.getLastRow();
    if (lr < 2) return;
    var lc = Math.max(sh.getLastColumn(), 11);
    var grid = sh.getRange(1, 1, lr, lc).getValues();
    var hdr = findRawHeaderRow_(grid);
    var startRow, col;
    if (hdr) { startRow = hdr.row + 1; col = hdr.idx; }
    else { startRow = 9; col = RAW_LEGACY_COLS; legacyTabs++; }   // legacy: data begins on row 10
    for (var i = startRow; i < grid.length; i++) {
      var r = grid[i];
      var company = String(rawCell_(r, col, 'company') || '').trim();
      var ticker = String(rawCell_(r, col, 'ticker') || '').trim();
      var mcap = String(rawCell_(r, col, 'mcap') || '').trim().toUpperCase();
      if (!company && !ticker) continue;
      if (!ticker || ticker === '-') continue;
      if (mcap === 'PRIVATE' || mcap === 'ACQUIRED') continue;
      var out = [company, ticker, rawCell_(r, col, 'cik'), rawCell_(r, col, 'isin'),
        rawCell_(r, col, 'mcap'), rawCell_(r, col, 'region'), rawCell_(r, col, 'domicile')];
      var key = normTicker_(ticker);
      if (!(key in byKey)) {
        byKey[key] = out;
        order.push(key);
      } else if (String(out[0]).toLowerCase() < String(byKey[key][0]).toLowerCase()) {
        byKey[key] = out; // company tiebreak
      }
    }
  });

  var rows = order.map(function (k) { return byKey[k]; });
  var sh = ensureTab_(TABS.cleanPull);
  clearBody_(sh);
  if (rows.length) sh.getRange(2, 1, rows.length, 7).setValues(rows);
  applyFormat_(sh, 7);
  logHistory_('Build Clean Pull', rawSheets.length + ' RAW tab(s)',
    rows.length + ' rows after clean + dedupe' +
    (legacyTabs ? ' - ' + legacyTabs + ' tab(s) used the legacy row-10 fallback (no header row detected)' : ''));
  toast_('Clean Pull rebuilt: ' + rows.length + ' rows.');
}

/* ====================== STEP 1.5 - REFRESH DB REFERENCES ============================ */

function showRefreshDialog() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:13px">' +
    '<p>Select the latest AlphaSense Ticker export workbook (.xlsx).<br>' +
    'Current DB is rebuilt. Watchlist is merged: export rows refreshed, local rows kept, ' +
    'rows now Active graduate off. FR Exclude / Confirmed Exclude untouched.</p>' +
    '<input type="file" id="f" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><br><br>' +
    '<button id="go" onclick="go()">Refresh</button> <span id="st"></span>' +
    '<scr' + 'ipt>' +
    'function go(){var fs=document.getElementById("f").files;if(!fs.length){return;}' +
    'var f=fs[0];document.getElementById("go").disabled=true;' +
    'document.getElementById("st").textContent="Reading file...";' +
    'var r=new FileReader();' +
    'r.onload=function(e){var b64=e.target.result.split(",")[1];' +
    'document.getElementById("st").textContent="Rebuilding references...";' +
    'google.script.run.withSuccessHandler(function(m){' +
    'document.getElementById("st").textContent=m;' +
    'setTimeout(function(){google.script.host.close();},1800);})' +
    '.withFailureHandler(function(err){document.getElementById("go").disabled=false;' +
    'document.getElementById("st").textContent="Error: "+err.message;})' +
    '.refreshDbReferences({name:f.name,data:b64});};' +
    'r.readAsDataURL(f);}' +
    '</scr' + 'ipt></div>'
  ).setWidth(470).setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(html, 'Refresh DB References');
}

/**
 * Refresh from the Kintone ticker export:
 * - Current DB: full rebuild (overwrite) from the Active tabs.
 * - Watchlist: MERGE - export rows are authoritative; locally routed/pasted rows that
 *   are not in the export are preserved; rows that now appear ACTIVE in the export
 *   graduate off the Watchlist automatically (Current DB takes priority) and are
 *   listed in History Log.
 * Tabs classified by name: contains "Watchlist" -> Watchlist bucket, else Active.
 * Columns resolved by header name - tab count and order not hardcoded.
 * Rows WITHOUT a ticker are kept out of the visible tabs and written to the hidden
 * "No Ticker Reference" tab - the crosscheck still name-matches against them.
 */
function refreshDbReferences(file) {
  if (!file || !file.data) throw new Error('No file received.');
  scaffoldAll_();
  var bytes = Utilities.base64Decode(file.data);
  var tempId = convertXlsxToSheet_(bytes, file.name);
  var activeRows = [], watchRows = [], noTickerRows = [];
  var activeTabs = [], watchTabs = [];
  try {
    var src = SpreadsheetApp.openById(tempId);
    src.getSheets().forEach(function (sh) {
      var lr = sh.getLastRow(), lc = sh.getLastColumn();
      if (lr < 2 || lc < 1) return;
      var vals = sh.getRange(1, 1, lr, lc).getValues();
      var idx = headerIndex_(vals[0]);
      var isWatch = /watchlist/i.test(sh.getName());
      (isWatch ? watchTabs : activeTabs).push(sh.getName());
      var bucket = isWatch ? 'Watchlist' : 'Current DB';
      for (var i = 1; i < lr; i++) {
        var r = vals[i];
        var pbn = pick_(r, idx, 'primary business name');
        var ticker = String(pick_(r, idx, 'alphasense ticker') || '').trim();
        if (!String(pbn || '').trim() && !ticker) continue;
        var rec = pick_(r, idx, 'record number');
        var sector = pick_(r, idx, 'sector');
        var status = pick_(r, idx, 'profile status');
        var tier = pick_(r, idx, 'crbm tier');
        var isin = String(pick_(r, idx, 'isin') || '').trim(); // optional export column
        if (!ticker) {                       // no empties on visible tabs
          noTickerRows.push([pbn, bucket, rec, sector]);
        } else if (isWatch) {
          watchRows.push([pbn, ticker, '', '', '', '', tier, '', '',
            tickerFlag_(ticker), rec, sector, isin]);
        } else {
          activeRows.push([pbn, ticker, status, tier, '', '', '', '', '',
            tickerFlag_(ticker), rec, sector, isin]);
        }
      }
    });
  } finally {
    try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) { /* best effort */ }
  }

  var dbSh = ensureTab_(TABS.currentDb);
  clearBody_(dbSh);
  if (activeRows.length) dbSh.getRange(2, 1, activeRows.length, 13).setValues(activeRows);
  applyFormat_(dbSh, 13);

  // Watchlist MERGE - export rows are authoritative; locally routed/pasted rows not in
  // the export are preserved; rows now Active in the DB graduate off the list.
  var wlSh = ensureTab_(TABS.watchlist);
  var activeTickerSet = {}, activeNameSet = {};
  activeRows.forEach(function (r) {
    var t = normTicker_(r[1]);
    if (t) activeTickerSet[t] = true;
    var nn = normName_(r[0]);
    if (nn) activeNameSet[nn] = true;
  });
  var watchTickerSet = {}, watchNameSet = {};
  watchRows.forEach(function (r) {
    var t = normTicker_(r[1]);
    if (t) watchTickerSet[t] = true;
    var nn = normName_(r[0]);
    if (nn) watchNameSet[nn] = true;
  });
  var preserved = [], graduated = [], seenLocal = {};
  var wlLr = wlSh.getLastRow();
  if (wlLr >= 2) {
    wlSh.getRange(2, 1, wlLr - 1, 13).getValues().forEach(function (r) {
      var name = String(r[0] || '').trim();
      var t = normTicker_(r[1]);
      if (!name && !t) return;
      var nn = normName_(name);
      if (t ? activeTickerSet[t] : (nn && activeNameSet[nn])) {     // now Active in DB
        graduated.push(name + (t ? ' (' + t + ')' : ''));
        return;
      }
      if (t ? watchTickerSet[t] : (nn && watchNameSet[nn])) return; // already in export
      var key = t || ('name:' + nn);
      if (seenLocal[key]) return;
      seenLocal[key] = true;
      preserved.push(r);                                            // keep local row
    });
  }
  clearBody_(wlSh);
  var allWatch = watchRows.concat(preserved);
  if (allWatch.length) wlSh.getRange(2, 1, allWatch.length, 13).setValues(allWatch);
  applyFormat_(wlSh, TABS.watchlist.header.length);
  forceMoveCheckboxes_(['Watchlist']);

  var ntSh = ensureTab_(TABS.noTicker);
  clearBody_(ntSh);
  if (noTickerRows.length) ntSh.getRange(2, 1, noTickerRows.length, 4).setValues(noTickerRows);
  applyFormat_(ntSh, 4);
  if (!ntSh.isSheetHidden()) ntSh.hideSheet();

  var gradDetail = graduated.length
    ? ' - Graduated to Current DB and removed from Watchlist (' + graduated.length + '): ' +
      graduated.slice(0, 15).join('; ') + (graduated.length > 15 ? ' ...' : '')
    : '';
  logHistory_('Refresh DB References', file.name,
    'Current DB: ' + activeRows.length + ' rows from [' + activeTabs.join(', ') + '] - ' +
    'Watchlist: ' + watchRows.length + ' export + ' + preserved.length + ' preserved local - ' +
    'No-ticker (hidden ref): ' + noTickerRows.length + gradDetail);
  return 'Done. Current DB: ' + activeRows.length + '. Watchlist: ' + watchRows.length +
    ' export + ' + preserved.length + ' local kept' +
    (graduated.length ? ', ' + graduated.length + ' graduated off' : '') +
    '. No-ticker reference: ' + noTickerRows.length + '.';
}

/** Upload + convert xlsx to a temp Google Sheet via the Drive REST API (no add-ons). */
function convertXlsxToSheet_(bytes, name) {
  var boundary = '-------darbpipeline314159';
  var meta = JSON.stringify({
    name: 'TEMP DARB import - ' + name,
    mimeType: 'application/vnd.google-apps.spreadsheet'
  });
  var head = '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n';
  var tail = '\r\n--' + boundary + '--';
  var payload = Utilities.newBlob(head).getBytes()
    .concat(bytes)
    .concat(Utilities.newBlob(tail).getBytes());
  var resp = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      payload: payload,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Drive conversion failed (' + resp.getResponseCode() + '): ' +
      resp.getContentText().slice(0, 300));
  }
  return JSON.parse(resp.getContentText()).id;
}

function headerIndex_(headerRow) {
  var idx = {};
  headerRow.forEach(function (h, i) { idx[String(h).toLowerCase().trim()] = i; });
  return idx;
}

function pick_(row, idx, key) { return idx[key] === undefined ? '' : row[idx[key]]; }

/* ===================== ONE-TIME LEGACY WATCHLIST IMPORT ============================= */

function showWatchlistImportDialog() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:13px">' +
    '<p>One-time load of the legacy macro Watchlist (CSV or XLSX). Company name and ' +
    'ticker are matched by header (Issuer/Company name, Sentieo/AlphaSense ticker); rows ' +
    'already on the Watchlist - by ticker or name - are skipped. Safe to re-run.</p>' +
    '<input type="file" id="f" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><br><br>' +
    '<button id="go" onclick="go()">Import</button> <span id="st"></span>' +
    '<scr' + 'ipt>' +
    'function go(){var fs=document.getElementById("f").files;if(!fs.length){return;}' +
    'var f=fs[0];document.getElementById("go").disabled=true;' +
    'document.getElementById("st").textContent="Reading file...";' +
    'var isX=/\\.xlsx$/i.test(f.name);var r=new FileReader();' +
    'r.onload=function(e){var payload=isX' +
    '?{name:f.name,kind:"xlsx",data:e.target.result.split(",")[1]}' +
    ':{name:f.name,kind:"csv",content:e.target.result};' +
    'document.getElementById("st").textContent="Importing...";' +
    'google.script.run.withSuccessHandler(function(m){' +
    'document.getElementById("st").textContent=m;' +
    'setTimeout(function(){google.script.host.close();},1800);})' +
    '.withFailureHandler(function(err){document.getElementById("go").disabled=false;' +
    'document.getElementById("st").textContent="Error: "+err.message;})' +
    '.importLegacyWatchlist(payload);};' +
    'if(isX){r.readAsDataURL(f);}else{r.readAsText(f);}}' +
    '</scr' + 'ipt></div>'
  ).setWidth(470).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import Legacy Watchlist (one-time)');
}

/**
 * One-time import of the legacy macro Watchlist into the Watchlist tab. Rows are tagged
 * Source = "Legacy Watchlist" and land as LOCAL rows, so the Refresh DB References merge
 * preserves them on every future upload (and supersedes any that later appear in the
 * Kintone export). Deduplicated against whatever is already on the Watchlist, by
 * normalized ticker first, then normalized name. Re-running adds only genuinely new names.
 * Column resolution is by header; if no recognizable header is found, column A is treated
 * as the company name and column B as the ticker.
 */
function importLegacyWatchlist(file) {
  if (!file) throw new Error('No file received.');
  scaffoldAll_();
  var data = (file.kind === 'xlsx')
    ? readXlsxValues_(Utilities.base64Decode(file.data), file.name)
    : Utilities.parseCsv(file.content);
  if (!data || !data.length) throw new Error('Empty file.');

  var idx = headerIndex_(data[0]);
  function find_(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (idx[keys[i]] !== undefined) return idx[keys[i]];
    }
    return -1;
  }
  var cCompany = find_(['issuer name', 'company name', 'primary business name', 'company',
    'name', 'company name (alphasense)']);
  var cTicker = find_(['alphasense ticker', 'sentieo ticker', 'ticker', 'sentieo',
    'primary symbol', 'symbol']);
  var cSector = find_(['sector']);
  var cTier = find_(['crbm tier', 'tier']);
  var cNote = find_(['task type/comment', 'comment', 'comments', 'note', 'ps note', 'notes']);

  var hasHeader = (cCompany >= 0 || cTicker >= 0);
  var startRow = hasHeader ? 1 : 0;
  if (!hasHeader) { cCompany = 0; cTicker = 1; } // assume A = company, B = ticker

  var ss = SpreadsheetApp.getActive();
  var wl = ensureTab_(TABS.watchlist);
  var existTick = {}, existName = {};
  var lr = wl.getLastRow();
  if (lr >= 2) {
    wl.getRange(2, 1, lr - 1, 2).getValues().forEach(function (r) {
      var t = normTicker_(r[1]); if (t) existTick[t] = true;
      var nn = normName_(r[0]); if (nn) existName[nn] = true;
    });
  }

  var rows = [], added = 0, skipped = 0, seen = {};
  for (var i = startRow; i < data.length; i++) {
    var r = data[i];
    var company = cCompany >= 0 ? String(r[cCompany] || '').trim() : '';
    var ticker = (cTicker >= 0 ? String(r[cTicker] || '') : '').replace(/\s+/g, '');
    if (!company && !ticker) continue;
    var nt = normTicker_(ticker), nn = normName_(company);
    var key = nt || ('name:' + nn);
    if (seen[key]) { skipped++; continue; }
    seen[key] = true;
    if ((nt && existTick[nt]) || (!nt && nn && existName[nn])) { skipped++; continue; } // already listed
    var sector = cSector >= 0 ? String(r[cSector] || '').trim() : '';
    var tier = cTier >= 0 ? String(r[cTier] || '').trim() : '';
    var note = cNote >= 0 ? String(r[cNote] || '').trim() : '';
    // Watchlist schema: Company|Ticker|RevAssign|RevDate|Analyst|Ps Note|Tier|Source|Note|Flag|Record#|Sector|ISIN
    rows.push([company, ticker, 'Watchlist', '', '', note, tier, 'Legacy Watchlist',
      '', tickerFlag_(ticker), '', sector, '']);
    added++;
  }

  if (rows.length) {
    wl.getRange(wl.getLastRow() + 1, 1, rows.length, 13).setValues(rows);
  }
  applyFormat_(wl, TABS.watchlist.header.length);
  forceMoveCheckboxes_(['Watchlist']);
  logHistory_('Import Legacy Watchlist', file.name,
    added + ' added, ' + skipped + ' skipped (duplicate or blank)');
  return 'Done. ' + added + ' legacy Watchlist row(s) added, ' + skipped +
    ' skipped (already present or blank).';
}

/* ===================== STEP 2 - CROSSCHECK & CATEGORISE (RunSort) =================== */

/**
 * Replicates the legacy RunSort logic, extended for changed tickers / names:
 *   a. exact ticker in any reference list       -> EXCLUDED (Match Type: Ticker)
 *        name drifted vs DB name                -> also logged to Attention - DB Drift
 *   b. ISIN match (when ISINs exist in the DB)  -> EXCLUDED (Match Type: ISIN)
 *        same security, ticker changed          -> also logged to Attention - DB Drift
 *   c. exact normalized-name match              -> REVIEW (Exact name)
 *   d. first word (>=4 chars) + fuzzy-confirm
 *      (first-5-chars OR containment OR
 *       first-two-words)                        -> REVIEW (Fuzzy name)
 *   e. ticker root match (same symbol, other
 *      exchange suffix, root >= 3 chars)        -> REVIEW (Ticker root)
 *   f. otherwise                                -> SORT (definitely new)
 * Name matching also covers the hidden No Ticker Reference rows.
 * ISIN matching activates automatically once the Kintone export includes an ISIN column.
 */
function runCrosscheck() {
  scaffoldAll_();
  var ss = SpreadsheetApp.getActive();
  var tickerMap = {};    // normalized ticker -> { source, name }
  var rootMap = {};      // ticker root       -> { ticker, name, source }
  var isinMap = {};      // ISIN              -> { name, ticker, source }
  var nameMap = {};      // normalized name   -> { orig, source, ticker }
  var firstWordIdx = {}; // first word        -> [{ norm, orig, source, ticker }]

  function addName_(n, source, ticker) {
    var nn = normName_(n);
    if (!nn) return;
    if (nameMap[nn] === undefined) nameMap[nn] = { orig: n, source: source, ticker: ticker || '' };
    var fw = nn.split(' ')[0];
    if (fw.length >= 4) {
      (firstWordIdx[fw] = firstWordIdx[fw] || [])
        .push({ norm: nn, orig: n, source: source, ticker: ticker || '' });
    }
  }

  var thresholdDays = reviewThresholdDays_();
  var resurfaceBlank = resurfaceBlank_();
  var tz = Session.getScriptTimeZone();

  var refDefs = [
    { name: 'Current DB', isin: true, reviewable: false },
    { name: 'Watchlist', isin: true, reviewable: true },
    { name: 'FR Exclude', isin: false, reviewable: true },
    { name: 'Confirmed Exclude', isin: false, reviewable: true }
  ];
  refDefs.forEach(function (def) {
    var sh = ss.getSheetByName(def.name);
    if (!sh) return;
    var lr = sh.getLastRow();
    if (lr < 2) return;
    var width = def.isin ? Math.min(13, sh.getMaxColumns()) : Math.min(10, sh.getMaxColumns());
    sh.getRange(2, 1, lr - 1, width).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim();
      var t = normTicker_(r[1]);
      if (t) {
        if (tickerMap[t] === undefined) {
          tickerMap[t] = {
            source: def.name, name: n, reviewable: def.reviewable,
            reviewed: r[3], tier: r[6], analyst: r[4], note: r[8],
            sector: def.isin ? (r[11] || '') : ''
          };
        }
        var root = tickerRoot_(t);
        if (root.length >= 3 && rootMap[root] === undefined) {
          rootMap[root] = { ticker: t, name: n, source: def.name };
        }
      }
      if (def.isin && width >= 13) {
        var isin = String(r[12] || '').trim().toUpperCase();
        if (isin && isin !== '-' && isinMap[isin] === undefined) {
          isinMap[isin] = { name: n, ticker: t, source: def.name };
        }
      }
      if (n) addName_(n, def.name, t);
    });
  });

  // No-ticker names from the hidden reference tab (name matching only)
  var ntSh = ss.getSheetByName(TABS.noTicker.name);
  if (ntSh && ntSh.getLastRow() >= 2) {
    ntSh.getRange(2, 1, ntSh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim();
      if (n) addName_(n, String(r[1] || 'No Ticker') + ' (no ticker)', '');
    });
  }

  var cp = ss.getSheetByName(TABS.cleanPull.name);
  var lr = cp ? cp.getLastRow() : 0;
  if (lr < 2) { toast_('Clean Pull is empty - run Build Clean Pull first.'); return; }
  var input = cp.getRange(2, 1, lr - 1, 4).getValues(); // Company | Ticker | CIK | ISIN

  var sortRows = [], reviewRows = [], exclRows = [], attnRows = [], considered = 0;
  var resurrected = 0, resurrectedByTab = {};
  input.forEach(function (r) {
    var company = String(r[0] || '').trim();
    var ticker = String(r[1] || '').trim();
    if (!company || !ticker) return;
    considered++;
    var nt = normTicker_(ticker);
    var nn = normName_(company);
    var isin = String(r[3] || '').trim().toUpperCase();
    if (isin === '-') isin = '';

    if (tickerMap[nt] !== undefined) {                       // a. exact ticker
      var ex = tickerMap[nt];
      if (ex.reviewable && isStale_(ex.reviewed, thresholdDays, resurfaceBlank)) {
        var dstr = (ex.reviewed instanceof Date)
          ? Utilities.formatDate(ex.reviewed, tz, 'yyyy-MM-dd') : 'no date';
        var rnote = 'Re-review: was on ' + ex.source + ', last reviewed ' + dstr +
          ' (> ' + thresholdDays + 'd)' + (ex.note ? ' - ' + ex.note : '');
        sortRows.push([company, ticker, '', '', '', '', ex.tier || '', ex.sector || '',
          ex.source, rnote]);                                //    stale -> back to Sort
        (resurrectedByTab[ex.source] = resurrectedByTab[ex.source] || {})[nt] = true;
        resurrected++;
        return;
      }
      exclRows.push([company, ticker, ex.source, 'Ticker']);
      var en = normName_(ex.name);
      if (nn && en && nn !== en && !fuzzyPair_(nn, en)) {    //    but name drifted
        attnRows.push([company, ticker, ex.name, nt, ex.source,
          'Name changed - same ticker. Check if the DB name needs updating.']);
      }
      return;
    }
    if (isin && isinMap[isin] !== undefined) {               // b. same ISIN, new ticker
      var im = isinMap[isin];
      exclRows.push([company, ticker, im.source, 'ISIN']);
      attnRows.push([company, ticker, im.name, im.ticker, im.source,
        'Ticker changed - same ISIN. Update the DB ticker.']);
      return;
    }
    if (nn && nameMap[nn] !== undefined) {                   // c. exact name
      var nm = nameMap[nn];
      reviewRows.push([company, ticker, nm.orig, nm.source, 'Exact name', nm.ticker]);
      return;
    }
    var fw = nn ? nn.split(' ')[0] : '';
    if (fw.length >= 4 && firstWordIdx[fw]) {                // d. fuzzy name
      var m = fuzzyConfirm_(nn, firstWordIdx[fw]);
      if (m) {
        reviewRows.push([company, ticker, m.orig, m.source, 'Fuzzy name', m.ticker]);
        return;
      }
    }
    var root = tickerRoot_(nt);                              // e. ticker root
    if (root.length >= 3 && rootMap[root] !== undefined && rootMap[root].ticker !== nt) {
      var rm = rootMap[root];
      reviewRows.push([company, ticker, rm.name, rm.source,
        'Ticker root - possible listing/ticker change', rm.ticker]);
      return;
    }
    sortRows.push([company, ticker, '', '', '', '', '', '', '', '']); // f. definitely new
  });

  // Rebuild outputs (script-owned tabs only)
  var sortSh = ensureTab_(TABS.sort);
  clearBody_(sortSh);
  if (sortRows.length) {
    sortSh.getRange(2, 1, sortRows.length, 10).setValues(sortRows);
    sortSh.getRange(2, 11, sortRows.length, 1).insertCheckboxes();
  }
  applyFormat_(sortSh, 12);
  refreshSortValidations_();

  var revSh = ensureTab_(TABS.review);
  clearBody_(revSh);
  if (reviewRows.length) revSh.getRange(2, 1, reviewRows.length, 6).setValues(reviewRows);
  applyFormat_(revSh, TABS.review.header.length);

  var exSh = ensureTab_(TABS.excluded);
  clearBody_(exSh);
  if (exclRows.length) exSh.getRange(2, 1, exclRows.length, 4).setValues(exclRows);
  applyFormat_(exSh, TABS.excluded.header.length);

  var atSh = ensureTab_(TABS.attention);
  clearBody_(atSh);
  if (attnRows.length) atSh.getRange(2, 1, attnRows.length, 6).setValues(attnRows);
  applyFormat_(atSh, TABS.attention.header.length);

  forceMoveCheckboxes_(['Review', 'Excluded', 'Attention - DB Drift']);

  // Resurrected stale tickers now live on Sort - drop them from their reference list.
  Object.keys(resurrectedByTab).forEach(function (tn) {
    removeTickersFromRefTab_(tn, resurrectedByTab[tn]);
  });

  logStats_(['Crosscheck', considered, sortRows.length, reviewRows.length,
    exclRows.length, '', '', '', '', '']);
  logHistory_('Run Crosscheck', 'Clean Pull', considered + ' in - ' + sortRows.length +
    ' SORT (incl ' + resurrected + ' re-review), ' + reviewRows.length + ' REVIEW, ' +
    exclRows.length + ' EXCLUDED, ' + attnRows.length + ' DB drift flag(s)');
  toast_('Crosscheck: ' + sortRows.length + ' SORT' +
    (resurrected ? ' (' + resurrected + ' re-review)' : '') + ', ' + reviewRows.length +
    ' REVIEW, ' + exclRows.length + ' EXCLUDED, ' + attnRows.length + ' drift flag(s).');
}

/** Rewrite a reference list excluding rows whose normalized ticker is in tickerSet. */
function removeTickersFromRefTab_(tabName, tickerSet) {
  var sh = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sh) return;
  var lr = sh.getLastRow();
  if (lr < 2) return;
  var dataCols = MOVABLE[tabName] ? MOVABLE[tabName].dataCols : (headerLenByName_(tabName) || sh.getLastColumn());
  var kept = sh.getRange(2, 1, lr - 1, dataCols).getValues().filter(function (r) {
    var t = normTicker_(r[1]);
    return !(t && tickerSet[t]);
  });
  clearBody_(sh);
  if (kept.length) sh.getRange(2, 1, kept.length, dataCols).setValues(kept);
  applyFormat_(sh, headerLenByName_(tabName));
  forceMoveCheckboxes_([tabName]);
}

/** Ticker root: symbol with any exchange suffix stripped (ABC.L -> ABC). */
function tickerRoot_(t) {
  var nt = normTicker_(t);
  var i = nt.indexOf('.');
  return i > 0 ? nt.slice(0, i) : nt;
}

/** Pairwise fuzzy test - do not alter thresholds, intentionally conservative:
 *  first-5-chars OR containment OR first-two-words. */
function fuzzyPair_(a, b) {
  if (!a || !b) return false;
  if (a.slice(0, 5) === b.slice(0, 5)) return true;
  if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
  var a2 = a.split(' ').slice(0, 2).join(' ');
  var b2 = b.split(' ').slice(0, 2).join(' ');
  return a2.indexOf(' ') > 0 && a2 === b2;
}

function fuzzyConfirm_(candNorm, entries) {
  for (var i = 0; i < entries.length; i++) {
    if (fuzzyPair_(candNorm, entries[i].norm)) return entries[i];
  }
  return null;
}

/* ===================== CONCURRENCY - DOCUMENT LOCK ================================== */

/* The routing / move / distribute actions append to shared tabs (Watchlist, Adds,
 * FR / Confirmed Exclude, In DB Log) one row at a time, and the duplicate guard
 * (findExistingRow_ then appendRow) is a check-then-act. Two interns running Clean-up at
 * the same time could interleave those appends and double-create a row. withDocLock_
 * serialises these entry points on a document-wide lock. The _holdingDocLock flag
 * (module-level, reset each execution) keeps it reentrant-safe should one wrapped action
 * ever call another within the same run. If the lock cannot be taken in 20s the action is
 * a no-op and the operator is asked to retry - nothing is half-written. */
var _holdingDocLock = false;
function withDocLock_(fn) {
  if (_holdingDocLock) return fn();
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    toast_('Another DARB action is running - please retry in a moment.');
    return;
  }
  _holdingDocLock = true;
  try { return fn(); } finally { _holdingDocLock = false; lock.releaseLock(); }
}

/* Public entry points (menu / on-sheet buttons) -> locked wrappers around the _impl_ body. */
function distributeSelected() { return withDocLock_(distributeSelected_impl_); }
function cleanupActiveTab()   { return withDocLock_(cleanupActiveTab_impl_); }
function processReviews()     { return withDocLock_(processReviews_impl_); }
function consolidateToSort()  { return withDocLock_(consolidateToSort_impl_); }
function moveSelected()       { return withDocLock_(moveSelected_impl_); }

/* ===================== STEP 3 - DISTRIBUTE, REVIEW & ROUTE ========================== */

/** Move checked Sort rows to the chosen intern tab. Stamps Date Assigned + Due Date.
 *  Sort row: 0 Company | 1 Ticker | 2 RevAssign | 3 RevDate | 4 Analyst | 5 Analyst Note |
 *            6 Tier | 7 Sector | 8 Source | 9 Note | 10 Select | 11 Assign To           */
function distributeSelected_impl_() {
  scaffoldAll_();
  var ss = SpreadsheetApp.getActive();
  var sortSh = ss.getSheetByName(TABS.sort.name);
  var lr = sortSh.getLastRow();
  if (lr < 2) { toast_('Sort tab is empty.'); return; }

  var interns = {};
  getInternSheets_().forEach(function (sh) { interns[internName_(sh)] = sh; });
  if (!Object.keys(interns).length) {
    SpreadsheetApp.getUi().alert('No intern tabs found. Create a tab named "<Name> - Sort" first - it will be picked up automatically.');
    return;
  }

  var vals = sortSh.getRange(2, 1, lr - 1, 12).getValues();
  var today = new Date();
  var due = addBusinessDays_(today, 5);
  var moved = 0, skipped = 0, toDelete = [], touched = {};

  vals.forEach(function (r, i) {
    if (r[10] !== true) return;                      // Select checkbox
    var who = String(r[11] || '').trim();            // Assign To
    if (!who || !interns[who]) { skipped++; return; }
    var sh = interns[who];
    // Intern row (16 cols): carry tier/sector/source/note; seed Inclusion Rationale with
    // its label so interns write consistently. URL + source-doc columns start blank.
    sh.appendRow([r[0], r[1], '', '', who, withPrefix_(r[5], RATIONALE_PREFIX),
      r[6] || '', r[7] || '',
      '', '', '', '',                                // Website, Exch 1, Exch 2, Source Docs
      r[8] || '', r[9] || '', today, due]);
    formatRow_(sh, sh.getLastRow(), INTERN_WIDTH);
    touched[who] = sh;
    toDelete.push(i + 2);
    moved++;
  });

  for (var j = toDelete.length - 1; j >= 0; j--) sortSh.deleteRow(toDelete[j]); // no double-handout
  Object.keys(touched).forEach(function (k) { reorganizeInternTab_(touched[k]); }); // new rows above Completed block
  scaffoldInternSheets_();                            // refresh dropdowns on new rows
  Object.keys(touched).forEach(function (k) { applyFormat_(touched[k], INTERN_WIDTH); });
  restyleTabs_([TABS.sort.name]);                     // refresh Sort filter/banding after row deletes

  logHistory_('Distribute Selected', 'Sort', moved + ' row(s) distributed' +
    (skipped ? ' - ' + skipped + ' skipped (no valid Assign To)' : ''));
  toast_('Distributed ' + moved + ' row(s).' +
    (skipped ? ' ' + skipped + ' checked row(s) skipped - set Assign To.' : ''));
}

/** Clean-up button: route reviewed rows on the intern tab currently open. */
function cleanupActiveTab_impl_() {
  scaffoldAll_();
  var sh = SpreadsheetApp.getActiveSheet();
  var name = sh.getName();
  if (!INTERN_RE.test(name) || name.indexOf(RAW_PREFIX) === 0) {
    toast_('Open an intern "<Name> - Sort" tab, then run Clean-up.');
    return;
  }
  var counts = { 'Add': 0, 'Watchlist': 0, 'FR Exclude': 0, 'Confirmed Exclude': 0, 'In DB': 0 };
  var skipped = routeSheetRows_(sh, counts);
  reorganizeInternTab_(sh);
  scaffoldInternSheets_();
  restyleTabs_(['Watchlist', 'FR Exclude', 'Confirmed Exclude', TABS.adds.name, TABS.inDbLog.name]);
  forceMoveCheckboxes_(['Watchlist', 'FR Exclude', 'Confirmed Exclude']);
  var total = counts['Add'] + counts['Watchlist'] + counts['FR Exclude'] +
    counts['Confirmed Exclude'] + counts['In DB'];
  logStats_(['Clean-up: ' + name, '', '', '', '', '', counts['Add'], counts['Watchlist'],
    counts['FR Exclude'], counts['Confirmed Exclude'], counts['In DB']]);
  logHistory_('Clean-up This Tab', name, total + ' routed' +
    (counts._dups ? ' - ' + counts._dups + ' already present (deduped)' : '') +
    (skipped ? ' - ' + skipped + ' skipped (incomplete)' : ''));
  toast_('Clean-up "' + name + '": ' + total + ' routed.' +
    (counts._dups ? ' ' + counts._dups + ' already present (deduped).' : '') +
    (skipped ? ' ' + skipped + ' skipped - fill required fields.' : ''));
}

/** Backstop: sweep ALL intern tabs and route eligible rows. */
function processReviews_impl_() {
  scaffoldAll_();
  var counts = { 'Add': 0, 'Watchlist': 0, 'FR Exclude': 0, 'Confirmed Exclude': 0, 'In DB': 0 };
  var skipped = 0;
  getInternSheets_().forEach(function (sh) {
    skipped += routeSheetRows_(sh, counts);
    reorganizeInternTab_(sh);
  });
  scaffoldInternSheets_();
  restyleTabs_(['Watchlist', 'FR Exclude', 'Confirmed Exclude', TABS.adds.name, TABS.inDbLog.name]);
  forceMoveCheckboxes_(['Watchlist', 'FR Exclude', 'Confirmed Exclude']);
  logStats_(['Process Reviews', '', '', '', '', '', counts['Add'], counts['Watchlist'],
    counts['FR Exclude'], counts['Confirmed Exclude'], counts['In DB']]);
  logHistory_('Process Reviews', 'All intern tabs',
    'Add ' + counts['Add'] + ', Watchlist ' + counts['Watchlist'] +
    ', FR Exclude ' + counts['FR Exclude'] + ', Confirmed Exclude ' + counts['Confirmed Exclude'] +
    ', In DB ' + counts['In DB'] +
    (counts._dups ? ' - ' + counts._dups + ' already present (deduped)' : '') +
    (skipped ? ' - ' + skipped + ' row(s) skipped (incomplete)' : ''));
  toast_('Routed - Add: ' + counts['Add'] + ', Watchlist: ' + counts['Watchlist'] +
    ', FR Excl: ' + counts['FR Exclude'] + ', Conf Excl: ' + counts['Confirmed Exclude'] +
    ', In DB: ' + counts['In DB'] +
    (counts._dups ? '. ' + counts._dups + ' deduped' : '') +
    (skipped ? '. Skipped ' + skipped + ' incomplete row(s).' : '.'));
}

/** Route all eligible rows on one intern sheet. Returns skipped count. */
function routeSheetRows_(sh, counts) {
  var lr = sh.getLastRow();
  if (lr < 2) return 0;
  var skipped = 0;
  var vals = sh.getRange(2, 1, lr - 1, INTERN_WIDTH).getValues();
  vals.forEach(function (r, i) {
    var assignment = String(r[2] || '').trim();
    if (!assignment) return;
    if (r[3]) return;                                 // already routed (date stamped)
    if (ASSIGN_OPTIONS.indexOf(assignment) < 0) { skipped++; return; }
    if (!requiredOk_(assignment, r)) { skipped++; return; }
    if (routeRow_(sh, i + 2, r, assignment)) counts[assignment]++;
    else counts._dups = (counts._dups || 0) + 1;       // already on destination
  });
  return skipped;
}

var COMPLETED_MARKER = 'Completed - routed (audit)';

/** Pending rows on top, routed rows under a Completed block at the bottom. */
function reorganizeInternTab_(sh) {
  var lr = sh.getLastRow();
  if (lr < 2) return;
  var vals = sh.getRange(2, 1, lr - 1, INTERN_WIDTH).getValues();
  var pending = [], done = [];
  vals.forEach(function (r) {
    var a = String(r[0] || '').trim();
    if (!a && !String(r[1] || '').trim()) return;     // blank spacer rows
    if (a === COMPLETED_MARKER) return;               // old marker rows
    (r[3] ? done : pending).push(r);                  // routed = Ticker Reviewed Date set
  });
  if (!done.length) return;                           // nothing routed yet
  clearBody_(sh);
  if (pending.length) sh.getRange(2, 1, pending.length, INTERN_WIDTH).setValues(pending);
  var markerRow = 2 + pending.length + 1;             // one blank spacer row
  sh.getRange(markerRow, 1).setValue(COMPLETED_MARKER);
  sh.getRange(markerRow + 1, 1, done.length, INTERN_WIDTH).setValues(done);
  applyFormat_(sh, INTERN_WIDTH);
  sh.getRange(markerRow, 1, 1, INTERN_WIDTH).setFontWeight('bold');
  sh.getRange(markerRow + 1, 1, done.length, INTERN_WIDTH).setFontLine('line-through');
}

/** Required fields per choice - rows missing them are skipped, never mis-routed. */
function requiredOk_(assignment, r) {
  if (!String(r[0] || '').trim() || !String(r[1] || '').trim()) return false; // name + ticker
  if (assignment === 'Add' && !String(r[6] || '').trim()) return false;       // tier when Add
  return true;
}

/**
 * Route one reviewed intern row to its destination. Routed rows are NOT deleted -
 * Ticker Reviewed Date is stamped and the row is struck through for audit.
 * Skips creating a duplicate when the company (by ticker, or name if ticker blank) is
 * already on the destination list. Returns true if a destination row was appended, false
 * if it was a duplicate skip. (In DB is an audit log and always appends.)
 * Intern row (16 cols):
 *   0 Company | 1 Ticker | 2 RevAssign | 3 RevDate | 4 Analyst | 5 Inclusion Rationale |
 *   6 Tier | 7 Sector | 8 Website | 9 Exchange 1 | 10 Exchange 2 | 11 Source Documents |
 *   12 Source | 13 Note | 14 Date Assigned | 15 Due Date
 */
function routeRow_(internSh, rowNum, r, assignment) {
  var ss = SpreadsheetApp.getActive();
  var today = new Date();
  var company = r[0], ticker = r[1];
  var nT = normTicker_(ticker), nN = normName_(company);
  var analyst = String(r[4] || '').trim() || internName_(internSh);
  var analystNote = r[5], tier = r[6], sector = r[7];
  var website = r[8], exch1 = r[9], exch2 = r[10], sourceDocs = r[11];
  var source = r[12], note = r[13];
  var appended = true;

  if (assignment === 'Watchlist') {
    var wl = ss.getSheetByName('Watchlist');
    if (findExistingRow_(wl, 1, 2, nT, nN) > 0) {
      appended = false;                              // already on Watchlist - no duplicate
    } else {
      wl.appendRow([company, ticker, assignment, today, analyst, analystNote,
        tier, source, note, tickerFlag_(ticker), '', sector]); // sector -> Watchlist Sector col
      formatRow_(wl, wl.getLastRow(), TABS.watchlist.header.length);
    }
  } else if (assignment === 'FR Exclude' || assignment === 'Confirmed Exclude') {
    var dest = ss.getSheetByName(assignment);
    if (findExistingRow_(dest, 1, 2, nT, nN) > 0) {
      appended = false;
    } else {
      dest.appendRow([company, ticker, assignment, today, analyst, analystNote,
        tier, source, note, tickerFlag_(ticker)]);
      formatRow_(dest, dest.getLastRow(),
        TABS[assignment === 'FR Exclude' ? 'frExclude' : 'confirmedExclude'].header.length);
    }
  } else if (assignment === 'Add') {
    var addsSh = ss.getSheetByName(TABS.adds.name);
    if (findExistingRow_(addsSh, 4, 5, nT, nN) > 0) {
      appended = false;                              // already staged on Adds - no duplicate
    } else {
      // Adds row (22 cols): Imported?, Completed?, Analyst, PBN, Ticker, Official Name,
      // New Record Flag, PBN (dup), Folder Name, Profile Review - Action Status,
      // Primary Business Description, Inclusion Rationale, Tier, Sector, Website, Exch 1,
      // Exch 2, Source Documents, Pure-Play, Profile Status, Select, Tier Rationale.
      // Description / Inclusion Rationale / Tier Rationale are seeded with their labels.
      addsSh.appendRow([false, false, analyst, company, ticker, '', '*', '', '', '',
        DESC_PREFIX, withPrefix_(analystNote, RATIONALE_PREFIX), tier, sector,
        website, exch1, exch2, sourceDocs, '', '', false, TIER_RATIONALE_PREFIX]);
      var ar = addsSh.getLastRow();
      // Official Name, PBN (dup) and Folder Name mirror Primary Business Name (col D)
      addsSh.getRange(ar, 6).setFormula('=D' + ar);
      addsSh.getRange(ar, 8).setFormula('=D' + ar);
      addsSh.getRange(ar, 9).setFormula('=D' + ar);
      addsSh.getRange(ar, 1, 1, 2).insertCheckboxes(); // Imported? / Completed? = False
      addsSh.getRange(ar, 21).insertCheckboxes();      // Select = False
      formatRow_(addsSh, ar, TABS.adds.header.length);
      // Hold on Watchlist until it appears Active in a DB refresh (then it graduates off).
      var wlAdd = ss.getSheetByName('Watchlist');
      if (findExistingRow_(wlAdd, 1, 2, nT, nN) <= 0) {
        var pendNote = String(note || '').trim();
        pendNote = pendNote ? pendNote + ' - Pending Kintone Add' : 'Pending Kintone Add';
        wlAdd.appendRow([company, ticker, 'Add', today, analyst, analystNote, tier,
          source, pendNote, tickerFlag_(ticker), '', sector, '']);
        formatRow_(wlAdd, wlAdd.getLastRow(), TABS.watchlist.header.length);
      }
    }
  } else if (assignment === 'In DB') {
    var logSh = ss.getSheetByName(TABS.inDbLog.name);  // audit log - always append
    logSh.appendRow([company, ticker, internName_(internSh), today]);
    formatRow_(logSh, logSh.getLastRow(), 4);
  }

  internSh.getRange(rowNum, 4).setValue(today);
  internSh.getRange(rowNum, 1, 1, INTERN_WIDTH).setFontLine('line-through');
  return appended;
}

/* ============ MOVE BETWEEN LISTS (reclassification, incl. back to Sort) ============= */

/** Prepend a label prefix unless the text already starts with it. Blank -> just the label. */
function withPrefix_(text, prefix) {
  var t = String(text || '').trim();
  if (!t) return prefix;
  if (t.toUpperCase().indexOf(prefix.toUpperCase()) === 0) return t;
  return prefix + ' ' + t;
}

/**
 * Bulk-merge every Review and Attention - DB Drift row onto the Sort tab so interns can
 * review them alongside the genuinely new names. Each row carries its match / drift context
 * in the Note column; the source tabs are then cleared. (Excluded stays manual - those are
 * confirmed already-tracked, so use per-row Move To if any need to go to interns.)
 */
function consolidateToSort_impl_() {
  var ss = SpreadsheetApp.getActive();
  var names = ['Review', 'Attention - DB Drift'];
  var today = new Date();
  var moved = 0, dups = 0;
  names.forEach(function (name) {
    var cfg = MOVABLE[name];
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var lr = sh.getLastRow();
    if (lr < 2) return;
    sh.getRange(2, 1, lr - 1, cfg.dataCols).getValues().forEach(function (r) {
      var company = String(r[cfg.company] || '').trim();
      var ticker = String(r[cfg.ticker] || '').trim();
      if (!company && !ticker) return;
      var ap = moveWriteDest_('Sort', {
        company: company, ticker: ticker, source: name,
        note: cfg.note ? cfg.note(r) : '',
        tier: cfg.tier !== undefined ? r[cfg.tier] : '',
        sector: cfg.sector !== undefined ? r[cfg.sector] : '',
        analyst: ''
      }, today);
      if (ap) moved++; else dups++;
    });
    clearBody_(sh);
    applyFormat_(sh, headerLenByName_(name));
  });
  refreshSortValidations_();
  restyleTabs_([TABS.sort.name]);
  logHistory_('Consolidate to Sort', 'Review + Attention', moved + ' row(s) sent to Sort' +
    (dups ? ' - ' + dups + ' already on Sort (deduped)' : ''));
  toast_('Sent ' + moved + ' Review / Attention row(s) to Sort for intern review.' +
    (dups ? ' ' + dups + ' already on Sort (deduped).' : ''));
}

/**
 * Reclassify rows from the ACTIVE list. On a movable tab (Review, Excluded,
 * Attention - DB Drift, Watchlist, FR Exclude, Confirmed Exclude) tick Select, choose a
 * Move To destination, then run this. Each selected row is copied to the destination and
 * removed from the source.
 *   Sort                -> re-enters the intern pipeline (context kept in the Note);
 *                          tick Select + Assign To on Sort, then Distribute.
 *   Watchlist / FR / Confirmed -> moves straight onto that reference list.
 *   Remove              -> deletes from the source only (no destination).
 * Does NOT scaffold first, so it never clears the ticks you just set.
 */
function moveSelected_impl_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getActiveSheet();
  var name = sh.getName();
  var cfg = MOVABLE[name];
  if (!cfg) {
    toast_('Open a list with a Move To column (Review, Excluded, Attention, Watchlist, ' +
      'FR Exclude, Confirmed Exclude), tick rows, choose Move To, then run this.');
    return;
  }
  var lr = sh.getLastRow();
  if (lr < 2) { toast_('Nothing to move on "' + name + '".'); return; }

  var dc = cfg.dataCols;
  var vals = sh.getRange(2, 1, lr - 1, dc + 2).getValues();
  var today = new Date();
  var moved = { 'Sort': 0, 'Watchlist': 0, 'FR Exclude': 0, 'Confirmed Exclude': 0, 'Remove': 0 };
  var skipped = 0, dups = 0, toDelete = [], touchedDest = {};

  vals.forEach(function (r, i) {
    if (r[dc] !== true) return;                              // Select checkbox
    var dest = String(r[dc + 1] || '').trim();              // Move To
    if (MOVE_OPTIONS.indexOf(dest) < 0) { skipped++; return; }
    var company = String(r[cfg.company] || '').trim();
    var ticker = String(r[cfg.ticker] || '').trim();
    if (!company && !ticker) { skipped++; return; }
    if (dest !== 'Remove') {
      var ap = moveWriteDest_(dest, {
        company: company, ticker: ticker, source: name,
        note: cfg.note ? cfg.note(r) : '',
        tier: cfg.tier !== undefined ? r[cfg.tier] : '',
        sector: cfg.sector !== undefined ? r[cfg.sector] : '',
        analyst: cfg.analyst !== undefined ? r[cfg.analyst] : ''
      }, today);
      if (!ap) dups++;                                       // already on destination
      touchedDest[dest] = true;
    }
    moved[dest]++;
    toDelete.push(i + 2);
  });

  for (var j = toDelete.length - 1; j >= 0; j--) sh.deleteRow(toDelete[j]);

  // Restyle source + every touched destination, then refresh their controls.
  applyFormat_(sh, headerLenByName_(name));
  forceMoveCheckboxes_([name]);
  Object.keys(touchedDest).forEach(function (d) {
    var tn = (d === 'Sort') ? TABS.sort.name : d;
    var ds = ss.getSheetByName(tn);
    if (ds) applyFormat_(ds, headerLenByName_(tn));
  });
  if (touchedDest['Sort']) refreshSortValidations_();
  var movableDest = Object.keys(touchedDest).filter(function (d) { return MOVABLE[d]; });
  if (movableDest.length) forceMoveCheckboxes_(movableDest);

  var total = moved['Sort'] + moved['Watchlist'] + moved['FR Exclude'] +
    moved['Confirmed Exclude'] + moved['Remove'];
  logHistory_('Move Selected', name, total + ' moved - Sort ' + moved['Sort'] +
    ', Watchlist ' + moved['Watchlist'] + ', FR Exclude ' + moved['FR Exclude'] +
    ', Confirmed Exclude ' + moved['Confirmed Exclude'] + ', Removed ' + moved['Remove'] +
    (dups ? ' - ' + dups + ' already on destination (deduped)' : '') +
    (skipped ? ' - ' + skipped + ' skipped (no Move To set)' : ''));
  toast_('Moved ' + total + ' row(s) from "' + name + '".' +
    (dups ? ' ' + dups + ' already on destination (deduped).' : '') +
    (skipped ? ' ' + skipped + ' skipped - set Move To.' : ''));
}

/** Write one reclassified row to its destination list. Returns true if appended, false if
 *  the company was already on that list (duplicate skip). */
function moveWriteDest_(dest, d, today) {
  var ss = SpreadsheetApp.getActive();
  var nT = normTicker_(d.ticker), nN = normName_(d.company);
  if (dest === 'Sort') {
    var sortSh = ss.getSheetByName(TABS.sort.name);
    if (findExistingRow_(sortSh, 1, 2, nT, nN) > 0) return false;
    // Sort: Company|Ticker|RevAssign|RevDate|Analyst|Inclusion Rationale|Tier|Sector|Source|Note|Select|Assign To
    sortSh.appendRow([d.company, d.ticker, '', '', '', '', d.tier || '', d.sector || '',
      d.source, d.note || '', false, '']);
    var sr = sortSh.getLastRow();
    sortSh.getRange(sr, 11).insertCheckboxes();              // Select
    formatRow_(sortSh, sr, TABS.sort.header.length);
  } else if (dest === 'Watchlist') {
    var wl = ss.getSheetByName('Watchlist');
    if (findExistingRow_(wl, 1, 2, nT, nN) > 0) return false;
    wl.appendRow([d.company, d.ticker, 'Watchlist', today, d.analyst || '', d.note || '',
      d.tier || '', d.source, d.note || '', tickerFlag_(d.ticker), '', d.sector || '', '']);
    formatRow_(wl, wl.getLastRow(), TABS.watchlist.header.length);
  } else if (dest === 'FR Exclude' || dest === 'Confirmed Exclude') {
    var ex = ss.getSheetByName(dest);
    if (findExistingRow_(ex, 1, 2, nT, nN) > 0) return false;
    ex.appendRow([d.company, d.ticker, dest, today, d.analyst || '', d.note || '',
      d.tier || '', d.source, d.note || '', tickerFlag_(d.ticker)]);
    formatRow_(ex, ex.getLastRow(),
      TABS[dest === 'FR Exclude' ? 'frExclude' : 'confirmedExclude'].header.length);
  }
  return true;
}

/* =============== STEP 4 - KINTONE BULK-UPLOAD FORMATTER (TWO TABLES) ================ */

/**
 * Build the Kintone bulk-upload from qualified Adds into TWO separate tables, because the
 * URL list and the Source Documents list are distinct subtables in Kintone and import as
 * separate files:
 *   "Kintone Profiles"    - one PARENT row per profile (New Record Flag "*") plus a
 *                           CONTINUATION row (blank flag + blank parent fields) for each
 *                           extra URL, tagged Website / Exchange. Creates the records and
 *                           their URL subtable.
 *   "Kintone Source Docs" - one row per source document, keyed by Primary Business Name +
 *                           AlphaSense Ticker so Kintone can match the record and append to
 *                           its Source Documents subtable. The key is on the first row of a
 *                           record's block; continuation rows leave it blank.
 * Import order: Profiles first (creates the records), then Source Docs (matched by ticker).
 * Which rows qualify: if any Adds "Select" box is ticked, only ticked rows; otherwise every
 * Adds row whose "Imported?" box is unticked.
 */
function buildKintoneUpload() {
  scaffoldAll_();
  var ss = SpreadsheetApp.getActive();
  var adds = ss.getSheetByName(TABS.adds.name);
  var lr = adds.getLastRow();
  if (lr < 2) { toast_('Adds tab is empty - nothing to format.'); return; }
  var width = TABS.adds.header.length; // 22
  var vals = adds.getRange(2, 1, lr - 1, width).getValues();
  var anySel = vals.some(function (r) { return r[20] === true; });

  // Current DB membership = "already a record in Kintone" - the source of truth (populated by
  // Refresh DB References). Used to skip re-exporting tracked profiles.
  var dbTick = {}, dbName = {};
  var dbSh = ss.getSheetByName(TABS.currentDb.name);
  if (dbSh && dbSh.getLastRow() >= 2) {
    dbSh.getRange(2, 1, dbSh.getLastRow() - 1, 2).getValues().forEach(function (d) {
      var t = normTicker_(d[1]); if (t) dbTick[t] = true;
      var nn = normName_(d[0]); if (nn) dbName[nn] = true;
    });
  }

  // Build-time validation: a blank ticker breaks the Source Docs key-match (Primary
  // Business Name + AlphaSense Ticker) and a blank Profile Status imports an empty
  // picklist value. Warn - with the offending names - before writing the output tabs.
  var problems = [];
  vals.forEach(function (r) {
    var imported = r[0] === true, sel = r[20] === true;
    if (anySel ? !sel : imported) return;            // same qualifying set as the build loop below
    var nm = String(r[3] || '').trim();
    if (!nm) return;
    if (!anySel) {
      var vT = normTicker_(r[4]), vN = normName_(nm);
      if (vT ? dbTick[vT] : (vN ? dbName[vN] : false)) return; // already in DB - will be skipped
    }
    var issues = [];
    if (!String(r[4] || '').trim()) issues.push('blank ticker');
    if (!String(r[19] || '').trim()) issues.push('blank Profile Status');
    if (issues.length) problems.push(nm + ' (' + issues.join(', ') + ')');
  });
  if (problems.length) {
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert('Kintone Upload - check these rows',
      problems.length + ' qualifying Add row(s) have issues that affect the Kintone import:\n\n' +
      problems.slice(0, 20).join('\n') + (problems.length > 20 ? '\n...' : '') +
      '\n\nBlank ticker breaks the Source Documents key-match; blank Profile Status imports ' +
      'an empty value.\n\nBuild anyway?', ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) { toast_('Kintone build cancelled - fix the flagged rows.'); return; }
  }

  var profileRows = [], sdRows = [], profiles = 0, sdCount = 0, skippedInDb = 0;
  vals.forEach(function (r, i) {
    var imported = r[0] === true;
    var sel = r[20] === true;
    if (anySel ? !sel : imported) return;            // selected-only, else all not imported
    var name = String(r[3] || '').trim();
    if (!name) return;

    // Already in Kintone? In default (non-Select) mode, skip rows whose ticker (name fallback)
    // is already in Current DB so a tracked profile is never re-exported, and auto-tick
    // Imported? since DB presence confirms the import. A Select tick is an explicit override.
    if (!anySel) {
      var nT = normTicker_(r[4]), nN = normName_(name);
      var inDb = nT ? !!dbTick[nT] : (nN ? !!dbName[nN] : false);
      if (inDb) {
        if (r[0] !== true) adds.getRange(i + 2, 1).setValue(true); // mark Imported? (DB-confirmed)
        skippedInDb++;
        return;
      }
    }

    var ticker = r[4], status = r[19] || '', actionStatus = r[9] || '',
        tier = r[12], pureplay = r[18] || '', sector = r[13],
        desc = r[10], rationale = r[11], tierRationale = r[21] || '', folder = name;

    // --- Table 1: profile + URL subtable ---
    var urls = [];
    if (String(r[14] || '').trim()) urls.push(['Website', String(r[14]).trim()]);
    if (String(r[15] || '').trim()) urls.push(['Exchange', String(r[15]).trim()]);
    if (String(r[16] || '').trim()) urls.push(['Exchange', String(r[16]).trim()]);
    var pn = Math.max(urls.length, 1);
    for (var i = 0; i < pn; i++) {
      var first = (i === 0);
      var u = urls[i] || ['', ''];
      profileRows.push([
        first ? '*' : '',
        first ? name : '',
        first ? ticker : '',
        first ? status : '',
        first ? actionStatus : '',
        first ? tier : '',
        first ? pureplay : '',
        first ? 'No' : '',          // In CRBM - new profiles default to No
        '',                          // CRBM ID - blank for new records
        first ? sector : '',
        first ? desc : '',
        first ? rationale : '',
        first ? tierRationale : '',
        first ? folder : '',
        u[0], u[1]                   // URL Type, URL
      ]);
    }

    // --- Table 2: Source Documents subtable (keyed by name + ticker) ---
    var sds = parseSourceDocs_(r[17]);
    sds.forEach(function (sd, k) {
      var first = (k === 0);
      sdRows.push([
        first ? name : '',           // key: Primary Business Name (first row of block)
        first ? ticker : '',         // key: AlphaSense Ticker
        sd.name, 'No', '', '', sd.note, '' // Name, Added to BOX, Neg News, Note Per SD, SD Note, Date
      ]);
      sdCount++;
    });

    profiles++;
  });

  var pSh = ensureTab_(TABS.kintoneProfiles, true);
  clearBody_(pSh);
  if (profileRows.length) {
    pSh.getRange(2, 1, profileRows.length, TABS.kintoneProfiles.header.length).setValues(profileRows);
  }
  applyFormat_(pSh, TABS.kintoneProfiles.header.length);

  var sSh = ensureTab_(TABS.kintoneSourceDocs, true);
  clearBody_(sSh);
  if (sdRows.length) {
    sSh.getRange(2, 1, sdRows.length, TABS.kintoneSourceDocs.header.length).setValues(sdRows);
  }
  applyFormat_(sSh, TABS.kintoneSourceDocs.header.length);

  logHistory_('Build Kintone Upload', 'Adds', profiles + ' profile(s), ' +
    profileRows.length + ' profile row(s), ' + sdCount + ' source-doc row(s)' +
    (skippedInDb ? ' - ' + skippedInDb + ' skipped (already in Current DB, marked Imported)' : '') +
    (anySel ? ' (selected)' : ' (all not imported)'));
  toast_('Built ' + profiles + ' profile(s): ' + profileRows.length + ' Profiles row(s), ' +
    sdCount + ' Source Docs row(s).' +
    (skippedInDb ? ' Skipped ' + skippedInDb + ' already in DB.' : '') +
    ' Use Download Profiles / Source Docs CSV.');
}

/**
 * Parse the free-text Source Documents cell into entries. One source per line (split on
 * newlines or ";"). Within a line, "Name | note" splits the document name from an optional
 * note (extra "|" segments fold into the note). Returns [{name, note}].
 */
function parseSourceDocs_(cell) {
  var s = String(cell || '').trim();
  if (!s) return [];
  return s.split(/\r?\n|;/)
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line.length; })
    .map(function (line) {
      var parts = line.split('|').map(function (p) { return p.trim(); });
      return { name: parts[0] || '', note: parts.slice(1).join(' | ') };
    });
}

/** Build a CSV string from a tab (header + data rows), RFC-4180 quoting. */
function tabToCsv_(tabName, cols) {
  var sh = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sh) return '';
  var lr = sh.getLastRow();
  if (lr < 2) return '';
  var vals = sh.getRange(1, 1, lr, cols).getValues();
  return vals.map(function (row) { return row.map(csvCell_).join(','); }).join('\r\n');
}

function csvCell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v);
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Show a download dialog for a CSV string (UTF-8 with BOM for accented names). */
function downloadCsvDialog_(csv, fname, title) {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:13px">' +
    '<p>' + title + ' is ready.</p>' +
    '<button id="dl">Download CSV</button> <span id="st"></span>' +
    '<scr' + 'ipt>' +
    'var csv=' + JSON.stringify(csv) + ';var fn=' + JSON.stringify(fname) + ';' +
    'document.getElementById("dl").onclick=function(){' +
    'var blob=new Blob(["\\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});' +
    'var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;' +
    'document.body.appendChild(a);a.click();document.body.removeChild(a);' +
    'document.getElementById("st").textContent="Downloaded.";' +
    'setTimeout(function(){google.script.host.close();},900);};' +
    '</scr' + 'ipt></div>'
  ).setWidth(380).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

function downloadKintoneProfilesCsv() {
  var csv = tabToCsv_(TABS.kintoneProfiles.name, TABS.kintoneProfiles.header.length);
  if (!csv) { toast_('Kintone Profiles tab is empty - run Build Kintone Upload Files first.'); return; }
  downloadCsvDialog_(csv, 'Kintone_Profiles_' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.csv',
    'Profiles CSV');
}

function downloadKintoneSourceDocsCsv() {
  var csv = tabToCsv_(TABS.kintoneSourceDocs.name, TABS.kintoneSourceDocs.header.length);
  if (!csv) { toast_('Kintone Source Docs tab is empty - run Build Kintone Upload Files first.'); return; }
  downloadCsvDialog_(csv, 'Kintone_SourceDocs_' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.csv',
    'Source Docs CSV');
}

/* ================================ SHARED UTILITIES ================================== */

function addBusinessDays_(d, n) {
  var r = new Date(d.getTime());
  var added = 0;
  while (added < n) {
    r.setDate(r.getDate() + 1);
    var day = r.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return r;
}

var HISTORY_MAX = 100;   // keep only the most recent N rows on these audit tabs
var STATS_MAX = 60;

/** Keep a tab to its last maxRows data rows (trims oldest). */
function trimTab_(sh, maxRows) {
  var dataRows = sh.getLastRow() - 1;
  if (dataRows > maxRows) sh.deleteRows(2, dataRows - maxRows);
}

function logHistory_(action, source, details) {
  var sh = ensureTab_(TABS.history);
  sh.appendRow([new Date(), action, source, details]);
  trimTab_(sh, HISTORY_MAX);
  formatRow_(sh, sh.getLastRow(), TABS.history.header.length);
}

function logStats_(rowAfterTimestamp) {
  var sh = ensureTab_(TABS.stats);
  sh.appendRow([new Date()].concat(rowAfterTimestamp));
  trimTab_(sh, STATS_MAX);
  formatRow_(sh, sh.getLastRow(), TABS.stats.header.length);
}

function toast_(msg) {
  SpreadsheetApp.getActive().toast(msg, 'DARB Pipeline', 6);
}
