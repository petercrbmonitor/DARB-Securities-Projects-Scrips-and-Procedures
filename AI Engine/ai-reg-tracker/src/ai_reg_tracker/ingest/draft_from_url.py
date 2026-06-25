"""Draft a regulation record from a source URL.

This is the AI-assisted, human-in-the-loop intake path. It writes a DRAFT
YAML with `ai_assisted: true` and low confidence, for a human to review via
pull request. It deliberately does NOT auto-merge anything.

Two modes:
  * --no-ai : write a skeleton stub to fill in by hand (works offline).
  * (default): TODO - call an LLM to propose summary/field_groups/jurisdiction
    from the fetched page, then still require human review.

Usage:
    python -m ai_reg_tracker.ingest.draft_from_url \\
        --id eu-ai-liability-directive \\
        --name "EU AI Liability Directive" \\
        --url https://example.eu/... --no-ai
"""
from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
REG_DIR = REPO_ROOT / "data" / "regulations"

SKELETON = """\
id: {id}
name: {name}
body: TODO
jurisdiction: Other          # Global | EU | US | UK | FR | SG | Other
regime_type: consultation    # hard_law | supervisory | voluntary | consultation | analytical
domain: [cross_sector]
status: consultation         # in_force | proposed | provisional | consultation | withdrawn | final_guidance
dates:
  published: null
  effective: null
  deadlines: []
  last_reviewed: {today}
applies_to: []
field_groups: []             # subset of A-H (see data/field_groups.yaml); [] if adjacent
summary: >
  TODO - paraphrase in your own words. NEVER paste regulator text.
source_urls:
  - {url}
confidence: low
reviewer: TODO
methodology_version: AIREG-M v0.1
ai_assisted: {ai_assisted}
changelog:
  - date: {today}
    change: "Draft created via ingest; needs review"
    by: ingest-bot
related: []
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--no-ai", action="store_true", help="write a hand-fill skeleton, no LLM")
    args = ap.parse_args()

    ai_assisted = not args.no_ai
    if ai_assisted:
        # TODO (Claude Code): fetch the URL, call the Anthropic API to propose
        # summary / jurisdiction / regime_type / field_groups, fill the skeleton,
        # and STILL open a PR for human review. Keep ai_assisted: true.
        print("AI mode not implemented yet - falling back to skeleton. Run with --no-ai.")
        ai_assisted = False

    out = REG_DIR / f"{args.id}.yaml"
    if out.exists():
        print(f"refusing to overwrite existing {out.name}")
        return 1
    out.write_text(
        SKELETON.format(
            id=args.id, name=args.name, url=args.url,
            today=dt.date.today().isoformat(), ai_assisted=str(ai_assisted).lower(),
        ),
        encoding="utf-8",
    )
    print(f"wrote draft {out} - review, complete the TODOs, then open a PR.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
