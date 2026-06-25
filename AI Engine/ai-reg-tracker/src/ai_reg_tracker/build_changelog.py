"""Render dist/CHANGELOG.md - the delta feed.

This aggregates the per-record `changelog` entries so it works without git
history. For a git-native delta instead, see the note at the bottom.
"""
from __future__ import annotations

from pathlib import Path

from .loader import load_all

REPO_ROOT = Path(__file__).resolve().parents[2]
DIST = REPO_ROOT / "dist"


def main() -> int:
    regs = load_all()
    rows = []
    for r in regs:
        for c in r.changelog:
            rows.append((c.date, r.id, c.change, c.by))
    rows.sort(reverse=True)  # newest first

    DIST.mkdir(exist_ok=True)
    lines = ["# Change feed", "", "_Generated from per-record changelog entries._", ""]
    for d, rid, change, by in rows:
        lines.append(f"- **{d}** `{rid}` - {change} ({by})")
    out = DIST / "CHANGELOG.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(rows)} change entries)")
    return 0


# Git-native alternative (point-in-time delta):
#   git log --follow -p data/regulations/<id>.yaml
#   git diff <old-sha> <new-sha> -- data/regulations/
# The repo's git history IS the bitemporal store; `git checkout <sha>` reproduces
# the tracker's state on any past date.

if __name__ == "__main__":
    raise SystemExit(main())
