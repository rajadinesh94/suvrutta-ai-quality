#!/usr/bin/env python3
"""Execute one versioned, fictional outcome fault against the deterministic oracle."""
import argparse
import json
from pathlib import Path

from quality.outcomes import evaluate_outcome


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--control", required=True)
    args = parser.parse_args()
    data = json.loads((ROOT / "datasets/v3/outcome-controls.json").read_text())
    control = next((item for item in data["controls"] if item["id"] == args.control), None)
    if control is None:
        parser.error("Unknown versioned control")
    if evaluate_outcome(data["baseline"]):
        raise RuntimeError("The unfaulted baseline already violates the outcome contract")
    faulted = {**data["baseline"], **control["mutation"]}
    failures = evaluate_outcome(faulted)
    if control["expectedViolation"] not in failures:
        print(f"FAULT_NOT_DETECTED:{control['id']}")
        return 2
    print(f"EXPECTED_FAULT_DETECTED:{control['id']}:{control['expectedViolation']}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
