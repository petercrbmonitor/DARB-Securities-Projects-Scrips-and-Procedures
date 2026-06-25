"""Render dist/tracker.json - the machine-readable feed for downstream products."""
from __future__ import annotations

import json
from pathlib import Path

from .loader import load_all

REPO_ROOT = Path(__file__).resolve().parents[2]
DIST = REPO_ROOT / "dist"


def main() -> int:
    regs = load_all()
    DIST.mkdir(exist_ok=True)
    payload = {
        "schema_version": "0.1.0",
        "count": len(regs),
        "regulations": [r.model_dump(mode="json") for r in regs],
    }
    out = DIST / "tracker.json"
    out.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    print(f"wrote {out} ({len(regs)} records)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
