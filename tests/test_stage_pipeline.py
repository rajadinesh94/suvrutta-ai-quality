"""Deterministic stage checks over versioned, original fictional material."""
import json
import os
from pathlib import Path

import pytest

from quality.pipeline import SyntheticIndex, parse_document, retrieval_metrics


DATA = json.loads((Path(__file__).resolve().parents[1] / "datasets/v3/stages.json").read_text())


@pytest.fixture
def index():
    target = SyntheticIndex(chunk_words=12, overlap_words=3, fault=os.environ.get("QUALITY_STAGE_FAULT"))
    for source in DATA["sources"]:
        assert target.ingest(source_id=source["id"], owner=source["owner"],
                             format_name=source["format"], raw=source["raw"]) == "created"
    return target


def test_dataset_provenance_and_splits():
    assert DATA["version"] == "3.0" and DATA["split"] == "development"
    assert len({source["id"] for source in DATA["sources"]}) == len(DATA["sources"])
    assert {source["owner"] for source in DATA["sources"]} == {"mira", "noor"}
    assert all(case["id"] and case["risk"] and isinstance(case["expectedSources"], list) for case in DATA["queries"])


@pytest.mark.parametrize("format_name,raw,expected", [
    ("text/plain", "  Adult Mara visited a fictional hill.  ", "Adult Mara visited a fictional hill."),
    ("text/markdown", "# Note\nAdult Mara visited a fictional hill.", "Note\nAdult Mara visited a fictional hill."),
    ("application/json", '{"text":"Adult Mara visited a fictional hill."}', "Adult Mara visited a fictional hill."),
])
def test_supported_parsing_preserves_story_words(format_name, raw, expected):
    assert parse_document(format_name, raw) == expected


def test_unsupported_and_malformed_input_rejected():
    with pytest.raises(ValueError, match="Unsupported"):
        parse_document("application/pdf", "%PDF fake")
    with pytest.raises(ValueError, match="requires text"):
        parse_document("application/json", '{"text":4}')


def test_chunk_overlap_provenance_and_index_integrity(index):
    for source_id, chunks in index.chunks.items():
        assert chunks[0].start_word == 0
        assert all(chunk.source_id == source_id and chunk.revision == 1 for chunk in chunks)
        assert all(chunks[i].end_word - chunks[i + 1].start_word == 3 for i in range(len(chunks) - 1))
        assert chunks[-1].end_word == len(index.sources[source_id]["content"].split())
    assert index.integrity_errors() == []
    index.postings["bogus"] = {("mira-ferry", 0)}
    assert index.integrity_errors() == ["postings"]


def test_duplicate_update_partial_failure_recovery_and_deletion(index):
    original = next(source for source in DATA["sources"] if source["id"] == "mira-garden")
    assert index.ingest(source_id=original["id"], owner=original["owner"],
                        format_name=original["format"], raw=original["raw"]) == "duplicate"
    assert index.sources[original["id"]]["revision"] == 1
    updated = "# Garden note\nAdult Mira planted yellow irises in a fictional garden in 1993."
    with pytest.raises(OSError, match="staged write failed"):
        index.ingest(source_id="mira-garden", owner="mira", format_name="text/markdown", raw=updated, fail_before_commit=True)
    assert index.sources["mira-garden"]["revision"] == 1
    assert index.search("blue irises", "mira")
    assert index.ingest(source_id="mira-garden", owner="mira", format_name="text/markdown", raw=updated) == "updated"
    assert index.sources["mira-garden"]["revision"] == 2
    assert index.search("blue", "mira") == []
    assert index.search("yellow", "mira")[0]["revision"] == 2
    with pytest.raises(PermissionError):
        index.delete("mira-garden", "noor")
    assert index.delete("mira-garden", "mira") is True
    assert index.search("yellow", "mira") == []
    assert index.integrity_errors() == []


@pytest.mark.parametrize("case", DATA["queries"], ids=lambda case: case["id"])
def test_labeled_retrieval_and_acl(index, case):
    found = index.search(case["query"], case["owner"], k=case["k"])
    source_ids = list(dict.fromkeys(hit["sourceId"] for hit in found))
    expected = set(case["expectedSources"])
    assert set(source_ids) == expected
    assert all(index.sources[source_id]["owner"] == case["owner"] for source_id in source_ids)
    metrics = retrieval_metrics([hit["sourceId"] for hit in found], expected, k=case["k"])
    assert metrics["recallAtK"] == 1.0
    assert metrics["reciprocalRank"] == (1.0 if expected else 0.0)


def test_ambiguity_and_bounded_ranking(index):
    matches = index.search("fictional", "mira", k=1)
    assert len(matches) == 1
    assert matches[0]["sourceId"] in {"mira-ferry", "mira-garden"}
    assert index.search("nonsense", "mira") == []
    with pytest.raises(ValueError):
        index.search("ferry", "mira", k=0)


def test_controlled_privacy_fault_is_detected_then_restored(index):
    safe = index.search("cedar journal", "mira")
    assert safe == []
    # Fault: substitute the other fixture owner's identity at the search boundary.
    leaked = index.search("cedar journal", "noor")
    assert leaked and leaked[0]["sourceId"] == "noor-archive"
    with pytest.raises(AssertionError):
        assert all(index.sources[hit["sourceId"]]["owner"] == "mira" for hit in leaked)
    assert index.search("cedar journal", "mira") == safe


def test_metric_denominators_are_explicit():
    assert retrieval_metrics(["wrong", "right"], {"right"}, k=2) == {
        "recallAtK": 1.0, "precisionAtK": 0.5, "reciprocalRank": 0.5,
    }
    assert retrieval_metrics([], set(), k=3) == {"recallAtK": 1.0, "precisionAtK": 1.0, "reciprocalRank": 0.0}
    assert retrieval_metrics(["right", "right"], {"right"}, k=3) == {
        "recallAtK": 1.0, "precisionAtK": 1.0, "reciprocalRank": 1.0,
    }
    assert retrieval_metrics(["wrong", "wrong", "right"], {"right"}, k=2) == {
        "recallAtK": 1.0, "precisionAtK": 0.5, "reciprocalRank": 0.5,
    }
