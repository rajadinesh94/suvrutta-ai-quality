"""Black-box API and business outcome checks against the local synthetic target."""
import json
import os
import shutil
import socket
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pytest


def post(base: str, path: str, body: dict) -> tuple[int, dict]:
    request = Request(base + path, data=json.dumps(body).encode(),
                      headers={"content-type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=3) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


@pytest.fixture(scope="module")
def server():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node 22.16+ required for the reference target")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    process = subprocess.Popen([node, "src/server.mjs"], cwd=os.path.dirname(os.path.dirname(__file__)),
                               env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(40):
            if process.poll() is not None:
                raise RuntimeError("Reference target exited before health check")
            try:
                with urlopen(base + "/health", timeout=0.25) as response:
                    health = json.load(response)
                    assert health == {"target": "reference", "mode": "simulated-mock"}
                    break
            except (URLError, TimeoutError):
                time.sleep(0.05)
        else:
            raise RuntimeError("Reference target did not become healthy")
        yield base
    finally:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


@pytest.fixture
def fresh(server):
    assert post(server, "/api/reset", {}) == (200, {"reset": True})
    return server


def action(base, actor, tool, **args):
    return post(base, "/api/action", {"actor": actor, "tool": tool, "args": args})


def test_capture_edit_approval_save_retrieve_and_delete(fresh):
    status, draft = action(fresh, "mira", "capture", text="I visited a fictional lake.")
    assert status == 200 and draft["draft"] == "I visited a fictional lake."
    assert draft["clarification"] and draft["simulated"] is True
    assert action(fresh, "mira", "retrieve", query="lake")[1]["sources"] == []
    edited = "I visited a fictional lake because I felt peaceful."
    denied, body = action(fresh, "mira", "save", text=edited, idempotencyKey="edit-1")
    assert (denied, body["code"]) == (409, "confirmation_required")
    status, saved = action(fresh, "mira", "save", text=edited, idempotencyKey="edit-1", confirmed=True)
    assert status == 200 and saved["saved"] is True and saved["duplicate"] is False
    status, result = action(fresh, "mira", "retrieve", query="lake")
    assert status == 200 and result["sources"] == [{"id": saved["storyId"], "text": edited}]
    assert action(fresh, "noor", "retrieve", query="lake")[1]["sources"] == []
    assert action(fresh, "noor", "delete", storyId=saved["storyId"], confirmed=True)[0] == 404
    assert action(fresh, "mira", "delete", storyId=saved["storyId"])[0] == 409
    assert action(fresh, "mira", "delete", storyId=saved["storyId"], confirmed=True)[1]["deleted"] is True
    assert action(fresh, "mira", "retrieve", query="lake")[1]["sources"] == []


def test_duplicate_write_and_conflicting_retry(fresh):
    args = {"text": "A fictional orchard story.", "idempotencyKey": "retry-1", "confirmed": True}
    first = action(fresh, "mira", "save", **args)[1]
    second = action(fresh, "mira", "save", **args)[1]
    assert first["storyId"] == second["storyId"] and second["duplicate"] is True
    assert action(fresh, "mira", "save", text="A different story.", idempotencyKey="retry-1", confirmed=True)[1]["code"] == "idempotency_conflict"
    assert len(action(fresh, "mira", "retrieve", query="orchard")[1]["sources"]) == 1


def test_revocation_and_denied_tool_actions(fresh):
    assert action(fresh, "mira", "save", text="A cedar bridge.", idempotencyKey="k1", confirmed=True)[0] == 200
    assert action(fresh, "mira", "consent", enabled=False)[1]["consent"] is False
    assert action(fresh, "mira", "retrieve", query="cedar")[1]["code"] == "consent_required"
    assert action(fresh, "mira", "save", text="Another bridge.", idempotencyKey="k2", confirmed=True)[0] == 403
    assert action(fresh, "mira", "exfiltrate", url="https://attacker.invalid")[1]["code"] == "unknown_tool"
    assert action(fresh, "__proto__", "retrieve", query="cedar")[0] == 401
    assert action(fresh, "mira", "consent", enabled=True)[1]["consent"] is True
    assert len(action(fresh, "mira", "retrieve", query="cedar")[1]["sources"]) == 1


def test_partial_failure_and_idempotent_recovery(fresh):
    body = {"actor": "mira", "tool": "save", "args": {"text": "A fictional bird.", "idempotencyKey": "recovery", "confirmed": True}}
    assert post(fresh, "/api/action", {**body, "fault": "before"})[1]["code"] == "write_failed"
    assert action(fresh, "mira", "retrieve", query="bird")[1]["sources"] == []
    assert post(fresh, "/api/action", {**body, "fault": "after"})[1]["code"] == "write_uncertain"
    status, retry = post(fresh, "/api/action", body)
    assert status == 200 and retry["duplicate"] is True
    assert len(action(fresh, "mira", "retrieve", query="bird")[1]["sources"]) == 1


def test_controlled_missing_approval_fault_is_caught_and_restored(fresh):
    unapproved = {"actor": "mira", "tool": "save", "args": {"text": "A fictional note.", "idempotencyKey": "control"}}
    status, _ = post(fresh, "/api/action", unapproved)
    assert status == 409
    # A deliberately weakened acceptance condition would accept any server response.
    with pytest.raises(AssertionError):
        assert status == 200
    assert action(fresh, "mira", "retrieve", query="note")[1]["sources"] == []
