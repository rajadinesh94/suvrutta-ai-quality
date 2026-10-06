#!/usr/bin/env python3
"""Offline DeepEval checks for original fictional v2 conversations."""
import os

# Set before importing DeepEval so local dotenv, anonymous telemetry, and cloud
# result upload cannot be activated by ambient developer credentials.
os.environ["DEEPEVAL_DISABLE_DOTENV"] = "1"
os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "1"
os.environ.pop("CONFIDENT_API_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)

import argparse
import contextlib
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from deepeval import assert_test
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

ROOT = Path(__file__).resolve().parents[1]


class LiteralContractMetric(BaseMetric):
    """Check only declared exact literals; no claim of semantic faithfulness."""

    def __init__(self, kind: str, values: list[str]):
        self.kind = kind
        self.values = values
        self.threshold = 1.0
        self.async_mode = False
        self.score = None
        self.success = False
        self.error = None
        self.reason = None

    def measure(self, test_case: LLMTestCase) -> float:
        answer = test_case.actual_output.casefold()
        matches = [value.casefold() in answer for value in self.values]
        passed = [match if self.kind == "includes" else not match for match in matches]
        self.score = sum(passed) / len(passed)
        self.success = self.score == 1.0
        self.reason = f"{sum(passed)}/{len(passed)} declared {self.kind} literals satisfied"
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return self.error is None and self.success

    @property
    def __name__(self) -> str:
        return f"Declared {self.kind} literal"


def case_map() -> dict[str, dict]:
    result = {}
    for split in ("development", "heldout"):
        data = json.loads((ROOT / "datasets" / "v2" / f"{split}.json").read_text())
        for case in data["cases"]:
            result[case["id"]] = case
    return result


def validate_fictional_report(report: dict, known: dict[str, dict]) -> None:
    if report.get("schemaVersion") != 2 or not isinstance(report.get("results"), list) or not report["results"]:
        raise ValueError("A complete v2 live run report is required")
    if not isinstance(report.get("runId"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", report["runId"]):
        raise ValueError("Report runId must contain 1–80 safe characters")
    for result in report["results"]:
        case = known.get(result.get("id"))
        turns = result.get("turns")
        if case is None or not isinstance(turns, list) or not turns or len(turns) > len(case["turns"]):
            raise ValueError("Report contains an unknown or malformed case")
        for actual, expected in zip(turns, case["turns"]):
            if not isinstance(actual, dict) or actual.get("user") != expected["user"]:
                raise ValueError("Report prompt or checks differ from the original fictional dataset")
            observed_checks = actual.get("checks", [])
            if actual.get("error") and not observed_checks:
                continue
            if not isinstance(observed_checks, list) or len(observed_checks) != len(expected["checks"]):
                raise ValueError("Report checks differ from the original fictional dataset")
            if any(not isinstance(check, dict) or check.get("kind") != item["kind"] or check.get("value") != item["value"]
                   for check, item in zip(observed_checks, expected["checks"])):
                raise ValueError("Report checks differ from the original fictional dataset")


def export_langfuse(events: list[dict], run_id: str) -> None:
    base_url = os.environ.get("LANGFUSE_BASE_URL", "")
    parsed = urlsplit(base_url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost") or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Langfuse export is restricted to an explicit local instance")
    if not os.environ.get("LANGFUSE_PUBLIC_KEY") or not os.environ.get("LANGFUSE_SECRET_KEY"):
        raise ValueError("Langfuse local export requires public and secret keys in the environment")
    from langfuse import get_client

    client = get_client()
    for event in events:
        with client.start_as_current_observation(
            as_type="evaluator",
            name="fictional-deepeval-literal",
            input={"caseId": event["caseId"], "turn": event["turn"]},
            metadata={"runId": run_id, "metric": event["metric"], "synthetic": True},
        ) as observation:
            observation.update(output={"status": event["status"], "score": event["score"]})
    client.flush()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--trace", choices=("local", "langfuse"), default="local")
    parser.add_argument("--allow-export", action="store_true")
    args = parser.parse_args()
    if args.trace == "langfuse" and not args.allow_export:
        parser.error("Langfuse export needs explicit --allow-export")
    report_bytes = args.report.read_bytes()
    report = json.loads(report_bytes)
    known = case_map()
    validate_fictional_report(report, known)
    events = []
    for result in report["results"]:
        case = known[result["id"]]
        for index, turn in enumerate(result["turns"]):
            if not isinstance(turn.get("reply"), str):
                events.append({"caseId": result["id"], "repeat": result["repeat"], "turn": index + 1, "metric": "provider", "score": None, "status": "error"})
                continue
            checks = case["turns"][index]["checks"]
            for kind in ("includes", "excludes"):
                values = [check["value"] for check in checks if check["kind"] == kind]
                if not values:
                    continue
                metric = LiteralContractMetric(kind, values)
                test_case = LLMTestCase(input=turn["user"], actual_output=turn["reply"])
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    try:
                        assert_test(test_case, [metric], run_async=False)
                    except AssertionError:
                        pass
                events.append({"caseId": result["id"], "repeat": result["repeat"], "turn": index + 1, "metric": kind, "score": metric.score, "status": "pass" if metric.is_successful() else "fail"})
            if not checks:
                events.append({"caseId": result["id"], "repeat": result["repeat"], "turn": index + 1, "metric": "none", "score": None, "status": "unevaluated"})
    summary = {status: sum(event["status"] == status for event in events) for status in ("pass", "fail", "error", "unevaluated")}
    output = {
        "schemaVersion": 1,
        "sourceRunId": report["runId"],
        "sourceReportSha256": hashlib.sha256(report_bytes).hexdigest(),
        "tool": "deepeval 4.2.3 custom BaseMetric; no model judge",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "traceMode": args.trace,
        "summary": summary,
        "humanLabels": "pending",
        "events": events,
        "limitations": "Declared literal checks only; no semantic judgment, backend action verification, or release claim.",
    }
    destination = args.output or ROOT / "reports" / "runs" / f"deepeval-{report['runId']}.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2) + "\n")
    if args.trace == "langfuse":
        export_langfuse(events, report["runId"])
    print(json.dumps({"output": str(destination), "summary": summary, "traceMode": args.trace}))
    return 1 if summary["fail"] or summary["error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
