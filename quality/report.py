"""Emit measured, small-sample synthetic stage metrics for a quality cycle."""
import argparse
import json
from pathlib import Path
from statistics import median
from time import perf_counter_ns

from quality.pipeline import SyntheticIndex, retrieval_metrics


ROOT = Path(__file__).resolve().parents[1]


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = fraction * (len(ordered) - 1)
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return round(ordered[low] + (ordered[high] - ordered[low]) * (position - low), 3)


def summary(values: list[float]) -> dict:
    return {"samples": len(values), "p50Ms": round(median(values), 3) if values else None,
            "p95Ms": percentile(values, 0.95)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads((ROOT / "datasets/v3/stages.json").read_text())
    index = SyntheticIndex(chunk_words=12, overlap_words=3)
    ingest_times = []
    for source in data["sources"]:
        started = perf_counter_ns()
        index.ingest(source_id=source["id"], owner=source["owner"], format_name=source["format"], raw=source["raw"])
        ingest_times.append((perf_counter_ns() - started) / 1e6)
    retrieval_times = []
    query_results = []
    for case in data["queries"]:
        started = perf_counter_ns()
        found = index.search(case["query"], case["owner"], k=case["k"])
        retrieval_times.append((perf_counter_ns() - started) / 1e6)
        source_ids = list(dict.fromkeys(hit["sourceId"] for hit in found))
        metrics = retrieval_metrics([hit["sourceId"] for hit in found], set(case["expectedSources"]), k=case["k"])
        query_results.append({"id": case["id"], "risk": case["risk"], "foundSourceIds": source_ids, **metrics})
    metrics = ["recallAtK", "precisionAtK", "reciprocalRank"]
    report = {
        "target": "independent in-memory lexical synthetic stage target", "datasetVersion": data["version"],
        "sampleCounts": {"sources": len(data["sources"]), "queries": len(query_results)},
        "ingestionLatency": summary(ingest_times), "retrievalLatency": summary(retrieval_times),
        "retrievalMeans": {key: round(sum(row[key] for row in query_results) / len(query_results), 3) for key in metrics},
        "queries": query_results, "indexIntegrityErrors": index.integrity_errors(),
        "notApplicable": ["OCR: no OCR input supported", "embedding generation and vector integrity: lexical index only",
                          "generation latency, tokens, and cost: no model call", "judge variability: no judge run"],
        "limitations": "Five labeled queries are too few for production performance or broad retrieval quality claims. Empty-result precision uses the declared convention 1.0 when no source is expected."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(args.output)


if __name__ == "__main__":
    main()
