import json
from pathlib import Path

import pytest

from quality.outcomes import evaluate_outcome


DATA = json.loads((Path(__file__).resolve().parents[1] / "datasets/v3/outcome-controls.json").read_text())


def test_baseline_outcome_is_supported():
    assert DATA["version"] == "3.0" and DATA["split"] == "development"
    assert evaluate_outcome(DATA["baseline"]) == []


@pytest.mark.parametrize("control", DATA["controls"], ids=lambda control: control["id"])
def test_required_negative_control_is_detected_and_restored(control):
    observed = {**DATA["baseline"], **control["mutation"]}
    failures = evaluate_outcome(observed)
    assert control["expectedViolation"] in failures
    assert evaluate_outcome(DATA["baseline"]) == []


def test_all_five_required_controls_are_versioned():
    assert {item["id"] for item in DATA["controls"]} == {
        "missing-approval", "unsupported-citation", "cross-user-access", "invented-detail", "duplicate-write"
    }
