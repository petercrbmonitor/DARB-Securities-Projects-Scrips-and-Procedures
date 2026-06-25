"""Validate all records. Exit non-zero on any problem (used by CI)."""
from __future__ import annotations

import sys

from .loader import check_integrity, load_all


def main() -> int:
    try:
        regs = load_all()
    except ValueError as exc:
        print(f"SCHEMA ERROR: {exc}")
        return 1
    problems = check_integrity(regs)
    if problems:
        print("INTEGRITY ERRORS:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"OK: {len(regs)} regulation records valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
