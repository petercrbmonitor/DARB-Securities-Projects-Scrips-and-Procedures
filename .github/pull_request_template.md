## Summary
<!-- What changed and why, in a sentence or two. -->

## Type of change
- [ ] `Code.gs` (pipeline logic)
- [ ] Deploy / CI / tooling
- [ ] Docs only

## Checks
- [ ] CI syntax gate is passing.
- [ ] If `Code.gs` changed: reviewed against the column-index contract and the
      "must not break" behaviours in `Macro - DARB Identification/ENGINEERING_HANDOFF.md`
      (section 8) and `CODE_AUDIT.md`.
- [ ] Kintone field names and the intentional misspellings
      (`Review Assignement`, `Recomended Sector`, `If Add Recomended Tier`) left intact.

---
> **Promoting `main` -> `production`?** This deploys to the live workbook. Open the PR with
> the promotion checklist instead: add `?template=promote-to-production.md` to the compare URL,
> e.g. `.../compare/production...main?template=promote-to-production.md`.
