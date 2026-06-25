from ai_reg_tracker.loader import check_integrity, load_all


def test_all_records_valid():
    regs = load_all()
    assert regs, "no regulation records found"


def test_integrity():
    regs = load_all()
    problems = check_integrity(regs)
    assert not problems, f"integrity problems: {problems}"


def test_ids_unique():
    regs = load_all()
    ids = [r.id for r in regs]
    assert len(ids) == len(set(ids))
