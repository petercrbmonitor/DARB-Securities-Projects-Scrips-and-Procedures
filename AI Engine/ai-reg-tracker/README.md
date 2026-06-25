# AI Regulation Tracker

A **data-as-code** tracker of AI regulation affecting financial institutions. Each
regulation is a versioned YAML record; the repo generates a JSON feed, an xlsx
Regulatory Map, and a change feed from those records. It is the maintained source
behind CRB Monitor's AI Governance & Disclosure Intelligence product.

## Why a repo and not a spreadsheet
- **Point-in-time for free** - git history reproduces the tracker on any past date.
- **Four-eyes review** - regulations change by pull request, gated by CI and CODEOWNERS.
- **Diffable change history** - every edit is an attributable diff; the delta feed is generated.
- **One source, many renders** - xlsx / JSON / changelog are built, never hand-synced.

This mirrors the governance the product itself sells: audit-grade, point-in-time,
provenance-rich, human-reviewed - and AI-assisted intake stays human-attested.

## Quickstart
```bash
make setup      # pip install -e ".[dev]"
make validate   # validate every record
make build      # render dist/: tracker.json, regulatory_map.xlsx, CHANGELOG.md
make test
```

## Layout
- `data/regulations/*.yaml` - one regulation per file (the source of truth)
- `src/ai_reg_tracker/` - schema, loader, validators, builders, ingest
- `docs/methodology.md` - the versioned mapping methodology
- `dist/` - generated outputs (git-ignored)

## Adding a regulation
See `CLAUDE.md` ("How to add a regulation") or open an issue from the New Regulation template.

## Seeded records
EU AI Act, SR 11-7, SEC (principles-based; PDA rule withdrawn), FASB AI-in-financial-
reporting, IOSCO, ESMA algo-trading, AMF/ESMA France, MAS MindForge, OECD due-diligence,
OECD AI Principles, FSB, FINRA, Colorado SB 24-205, NIST AI RMF, ISO/IEC 42001,
BIS FSI 63 & 73, plus adjacent capital/crypto anchors (BCBS SCO60, BCBS 239, MiCA).

Not legal advice; a product-design and monitoring tool.
