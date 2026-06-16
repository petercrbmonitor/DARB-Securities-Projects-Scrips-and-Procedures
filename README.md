# DARB - Securities Projects, Scrips, and Procedures

CRB Monitor working repository for DARB (Digital Asset-Related Business)
securities projects, scrips, and operating procedures.

## Repository structure

### `Macro - DARB Identification/`
The current, canonical DARB new-securities identification pipeline.

- `Code.gs` - the single-file, container-bound Google Apps Script that runs
  the end-to-end DARB new-securities sort pipeline (consolidate AlphaSense
  exports, crosscheck against the live database and exclude lists, route
  reviewed companies, and format qualified additions for Kintone bulk upload).
- `ENGINEERING_HANDOFF.md` - engineering handoff covering runtime, OAuth
  scopes, recommended repo layout, `clasp` deployment, architecture map,
  data contract, conventions, testing/CI, and the prioritised backlog.

### `archive/`
Legacy and superseded Kintone app customizations and supporting docs, kept
for reference (ETP Holdings Update views, audit-escalation apps, CRB clean
view styling, the DARB assistant, task-button and projects-app enhancements,
and the earlier setup/quick-reference guides).

## Ownership

Product owner / primary operator: Peter Simcox (CRB Monitor).
