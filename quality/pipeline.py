"""Small deterministic ingestion and retrieval target for stage evaluations.

This is deliberately lexical and in memory. It is not an embedding service or
an implementation of the private product's vault, authentication, or search.
"""
from collections import Counter
from dataclasses import dataclass
import hashlib
import json
import re


def terms(text: str) -> list[str]:
    return re.findall(r"[\w]+", text.casefold())


def parse_document(format_name: str, raw: str) -> str:
    if format_name == "text/plain":
        return raw.strip()
    if format_name == "text/markdown":
        return re.sub(r"(?m)^#{1,6}\s+", "", raw).strip()
    if format_name == "application/json":
        value = json.loads(raw)
        if not isinstance(value, dict) or not isinstance(value.get("text"), str):
            raise ValueError("JSON document requires text")
        return value["text"].strip()
    raise ValueError("Unsupported format")


@dataclass(frozen=True)
class Chunk:
    source_id: str
    owner: str
    revision: int
    ordinal: int
    start_word: int
    end_word: int
    text: str
    digest: str


class SyntheticIndex:
    def __init__(self, *, chunk_words: int = 12, overlap_words: int = 3, fault: str | None = None):
        if not 2 <= chunk_words <= 128 or not 0 <= overlap_words < chunk_words:
            raise ValueError("Invalid chunk configuration")
        self.chunk_words = chunk_words
        self.overlap_words = overlap_words
        if fault not in (None, "acl-bypass"):
            raise ValueError("Unknown synthetic fault")
        self.fault = fault
        self.sources: dict[str, dict] = {}
        self.chunks: dict[str, list[Chunk]] = {}
        self.postings: dict[str, set[tuple[str, int]]] = {}

    def _rebuild(self) -> None:
        postings: dict[str, set[tuple[str, int]]] = {}
        for source_id, chunks in self.chunks.items():
            for chunk in chunks:
                for term in set(terms(chunk.text)):
                    postings.setdefault(term, set()).add((source_id, chunk.ordinal))
        self.postings = postings

    def ingest(self, *, source_id: str, owner: str, format_name: str, raw: str, fail_before_commit: bool = False) -> str:
        if not re.fullmatch(r"[a-z][a-z0-9-]{1,49}", source_id) or owner not in ("mira", "noor"):
            raise ValueError("Invalid synthetic source or owner")
        content = parse_document(format_name, raw)
        if not content or len(content) > 12000:
            raise ValueError("Empty or oversized document")
        digest = hashlib.sha256(content.encode()).hexdigest()
        prior = self.sources.get(source_id)
        if prior and prior["owner"] != owner:
            raise PermissionError("Source owner cannot change")
        if prior and prior["digest"] == digest:
            return "duplicate"
        revision = prior["revision"] + 1 if prior else 1
        words = content.split()
        stride = self.chunk_words - self.overlap_words
        staged = []
        for ordinal, start in enumerate(range(0, len(words), stride)):
            end = min(start + self.chunk_words, len(words))
            piece = " ".join(words[start:end])
            staged.append(Chunk(source_id, owner, revision, ordinal, start, end, piece, hashlib.sha256(piece.encode()).hexdigest()))
            if end == len(words):
                break
        if fail_before_commit:
            raise OSError("Synthetic staged write failed")
        self.sources[source_id] = {"owner": owner, "revision": revision, "digest": digest, "content": content, "format": format_name}
        self.chunks[source_id] = staged
        self._rebuild()
        return "updated" if prior else "created"

    def delete(self, source_id: str, owner: str) -> bool:
        prior = self.sources.get(source_id)
        if prior is None:
            return False
        if prior["owner"] != owner:
            raise PermissionError("Cannot delete another fixture owner's source")
        del self.sources[source_id]
        del self.chunks[source_id]
        self._rebuild()
        return True

    def search(self, query: str, owner: str, *, k: int = 3) -> list[dict]:
        if owner not in ("mira", "noor") or not 1 <= k <= 20:
            raise ValueError("Invalid synthetic owner or result limit")
        counts = Counter(terms(query))
        if not counts:
            return []
        # Filter by owner before ranking and before returning any source text.
        candidates = set().union(*(self.postings.get(term, set()) for term in counts))
        ranked = []
        for source_id, ordinal in candidates:
            chunk = self.chunks[source_id][ordinal]
            if chunk.owner != owner and self.fault != "acl-bypass":
                continue
            score = sum(weight for term, weight in counts.items() if term in set(terms(chunk.text)))
            ranked.append((score, source_id, ordinal, chunk))
        ranked.sort(key=lambda row: (-row[0], row[1], row[2]))
        return [{"sourceId": chunk.source_id, "ordinal": chunk.ordinal, "revision": chunk.revision,
                 "score": score, "text": chunk.text} for score, _, _, chunk in ranked[:k]]

    def integrity_errors(self) -> list[str]:
        errors = []
        for source_id, source in self.sources.items():
            chunks = self.chunks.get(source_id, [])
            if not chunks or any(chunk.source_id != source_id or chunk.owner != source["owner"] or chunk.revision != source["revision"]
                                 or chunk.digest != hashlib.sha256(chunk.text.encode()).hexdigest() for chunk in chunks):
                errors.append(source_id)
        expected = SyntheticIndex(chunk_words=self.chunk_words, overlap_words=self.overlap_words)
        expected.chunks = self.chunks
        expected._rebuild()
        if expected.postings != self.postings:
            errors.append("postings")
        return errors


def retrieval_metrics(found: list[str], expected: set[str], *, k: int) -> dict[str, float]:
    if not 1 <= k <= 20:
        raise ValueError("Invalid k")
    # Labels are source-level; multiple matching chunks from one source count once.
    top = list(dict.fromkeys(found))[:k]
    hits = sum(source in expected for source in top)
    first = next((position for position, source in enumerate(top, start=1) if source in expected), None)
    return {"recallAtK": hits / len(expected) if expected else 1.0 if not top else 0.0,
            "precisionAtK": hits / len(top) if top else 1.0 if not expected else 0.0,
            "reciprocalRank": 1 / first if first else 0.0}
