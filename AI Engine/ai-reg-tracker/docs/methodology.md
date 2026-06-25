# Mapping methodology

Version: AIREG-M v0.1

This document defines how a regulation is recorded and mapped. It is versioned;
every record carries the `methodology_version` it was assessed under, so a change
here does not silently re-interpret old records.

## What gets a record
Any AI-relevant regulation, supervisory expectation, voluntary standard, or
authoritative analysis that a financial institution would track. Adjacent
capital/crypto rules (e.g. BCBS SCO60, MiCA) may be recorded with empty
`field_groups` when they feed the DARB product rather than the AI register.

## How fields are assigned
- **regime_type** - bindingness, not topic. `hard_law` only for binding statutes/
  regulations; supervisory guidance is `supervisory`; standards bodies' analysis is
  `analytical`; drafts are `consultation`.
- **status** - current lifecycle. Use `provisional` for political/provisional
  agreements not yet adopted (e.g. the EU Digital Omnibus deferral). Use
  `withdrawn` for dead proposals (e.g. the SEC predictive-data-analytics rule).
- **field_groups** - which AI System Register groups (A-H) the regulation drives.
  See data/field_groups.yaml. Empty is valid for adjacent regs.
- **confidence** - confidence in the *mapping*, not the regulation.

## Review (four-eyes)
Records change only by pull request. CODEOWNERS routes review to the committee.
CI validates the schema and integrity before merge. This is the human-in-the-loop
control; AI-assisted drafts (`ai_assisted: true`) get the same review, never auto-merge.

## Copyright
`summary` is always a paraphrase in our own words. Never paste regulator text;
store `source_urls` instead. The schema rejects summaries over 150 words.

## Point-in-time
Git history is the bitemporal store. To reproduce the tracker on a past date:
`git checkout <sha>` or `git log --follow data/regulations/<id>.yaml`.
