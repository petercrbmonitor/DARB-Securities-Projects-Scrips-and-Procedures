# CLAUDE.md

Project memory for Claude Code. Read this before doing anything in this repo.

## What this is
A **data-as-code tracker of AI regulation** for financial institutions. Each
regulation is one YAML file in `data/regulations/`, validated against a pydantic
schema, versioned in git. The repo generates downstream artifacts (a JSON feed, an
xlsx Regulatory Map, a changelog) from those records. It feeds CRB Monitor's
**AI Governance & Disclosure Intelligence** product, whose register has eight field
groups (A-H) that each regulation maps to.

## Golden rules (do not break these)
1. **The schema is `src/ai_reg_tracker/models.py`.** Change the model there, never
   work around it. `data/regulations/*.yaml` must validate against it.
2. **One file per regulation.** Filename stem == the record `id` (a lowercase-hyphen slug).
3. **Human-in-the-loop.** Records change only by pull request with review (CODEOWNERS).
   AI-assisted drafts are allowed but set `ai_assisted: true`, `confidence: low`, and
   still require human review. Never auto-merge.
4. **Copyright.** `summary` is always a paraphrase in our own words. NEVER paste
   regulator/source text. Store `source_urls`, not copied passages. The schema rejects
   summaries over 150 words.
5. **Point-in-time is git.** Do not build a separate history mechanism; git history is
   the bitemporal store.
6. **Generated files are generated.** Do not hand-edit anything in `dist/`.

## Repo map
```
data/regulations/*.yaml   SOURCE OF TRUTH - one regulation each
data/field_groups.yaml    the A-H register groups regulations map to
data/vocab.yaml           controlled vocabularies (mirror of the enums)
src/ai_reg_tracker/
  models.py               the schema (pydantic v2)
  loader.py               load + cross-record integrity checks
  validate.py             CLI gate (used by CI)
  build_json.py           -> dist/tracker.json (the feed)
  build_xlsx.py           -> dist/regulatory_map.xlsx
  build_changelog.py      -> dist/CHANGELOG.md (delta feed)
  ingest/draft_from_url.py  AI-assisted/skeleton draft intake
docs/methodology.md       versioned mapping methodology (the attestation basis)
tests/test_schema.py      validates every record + integrity
```

## Commands
- `make setup` - install (`pip install -e ".[dev]"`)
- `make validate` - validate every record (the CI gate)
- `make test` - run pytest
- `make build` - validate, then render all `dist/` outputs

Run a single builder: `python -m ai_reg_tracker.build_xlsx`

## How to add a regulation (the common task)
1. Pick a slug `id`, e.g. `eu-ai-liability-directive`.
2. Create `data/regulations/<id>.yaml`. Copy the shape of an existing record
   (e.g. `eu-ai-act.yaml`).
3. Fill every required field. `field_groups` is a subset of A-H (see
   `data/field_groups.yaml`); use `[]` for adjacent capital/crypto regs.
4. Write `summary` in your own words. Add a `changelog` entry with today's date.
5. `make validate` then `make build` to confirm it renders.
6. Open a PR. CI validates; a reviewer merges.

To scaffold a stub:
`python -m ai_reg_tracker.ingest.draft_from_url --id <slug> --name "<name>" --url <url> --no-ai`

## Field groups (A-H)
A system identity · B role & sourcing · C AI classification · D regulatory
applicability · E disclosure obligations · F model risk & governance · G provenance/
audit · H change/monitoring. Full text in `data/field_groups.yaml`.

## Good first tasks (if asked to extend)
- Implement the LLM step in `ingest/draft_from_url.py` (fetch URL -> propose
  summary/jurisdiction/field_groups via the Anthropic API), keeping `ai_assisted:true`
  and human review.
- Add a `fetch_tracker.py` poller that opens draft issues from the ICMA AI tracker /
  regulator RSS feeds.
- Add a Streamlit dashboard reading `dist/tracker.json`.
- Add a push step into Kintone or a Google Sheet (CRB Monitor already runs Apps Script
  automations) so records land where the team works.

## Don'ts
- Don't paste source text into records.
- Don't add a database; files-in-git is the design until scale forces otherwise.
- Don't bypass validation or relax the schema to make a bad record pass.
- Don't mark a withdrawn proposal as in force (see `sec-ai-disclosure.yaml` for the
  pattern: status `withdrawn` proposals are noted in the summary, not treated as live).
