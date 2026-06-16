# Promote `main` -> `production` (deploy to the live workbook)

Merging this PR runs the **Deploy Apps Script** workflow against `production`, which
pushes `Macro - DARB Identification/Code.gs` + `appsscript.json` to the **live** bound
Apps Script project via clasp.

## What is being promoted
<!-- One-line summary of the changes since the last production release. -->

## Pre-flight checklist
- [ ] CI (syntax gate) is green on `main`.
- [ ] Verified on staging - or, if no staging workbook is configured yet, explain why
      this promotion is safe without it.
- [ ] Reviewed the `Code.gs` diff for column-index / schema changes (a mid-schema
      column insert must update every index reference and the migration logic).
- [ ] No change to the Kintone integration contracts without owner sign-off: field
      names, the intentional misspellings, and the two-table (Profiles / Source Docs)
      export. See ENGINEERING_HANDOFF.md section 8.
- [ ] `appsscript.json` OAuth scopes unchanged - or a re-authorization is expected and
      noted below.

## Post-deploy verification
- [ ] Reloaded the workbook; the DARB Pipeline menu loads.
- [ ] Ran a menu action; authorized if prompted; behaviour as expected.

## Rollback
Revert this PR (or `git revert` the offending commit) and push to `production` to
redeploy the previous script.
