"""Load and validate all regulation records from data/regulations/."""
from __future__ import annotations

from pathlib import Path

import yaml

from .models import Regulation

REPO_ROOT = Path(__file__).resolve().parents[2]
REG_DIR = REPO_ROOT / "data" / "regulations"


def load_all(reg_dir: Path = REG_DIR) -> list[Regulation]:
    """Parse and validate every *.yaml record. Raises on the first invalid file."""
    regs: list[Regulation] = []
    for path in sorted(reg_dir.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        try:
            reg = Regulation(**raw)
        except Exception as exc:  # noqa: BLE001 - re-raise with file context
            raise ValueError(f"{path.name}: {exc}") from exc
        if reg.id != path.stem:
            raise ValueError(f"{path.name}: id '{reg.id}' must match filename stem '{path.stem}'")
        regs.append(reg)
    return regs


def check_integrity(regs: list[Regulation]) -> list[str]:
    """Cross-record checks. Returns a list of human-readable problems."""
    problems: list[str] = []
    ids = [r.id for r in regs]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        problems.append(f"duplicate ids: {sorted(dupes)}")
    idset = set(ids)
    for r in regs:
        for rel in r.related:
            if rel not in idset:
                problems.append(f"{r.id}: related id '{rel}' does not exist")
    return problems
