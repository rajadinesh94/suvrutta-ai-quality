import os
os.environ["DEEPEVAL_DISABLE_DOTENV"] = "1"
os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "1"
os.environ.pop("CONFIDENT_API_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)

import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from evaluate_deepeval import LiteralContractMetric, case_map, validate_fictional_report
from luna_deepeval_model import LunaServiceLLM
from deepeval.test_case import LLMTestCase


class MetricTests(unittest.TestCase):
    def test_declared_facts_and_forbidden_strings(self):
        case = LLMTestCase(input="fictional", actual_output="The ferry was red.")
        required = LiteralContractMetric("includes", ["red"])
        forbidden = LiteralContractMetric("excludes", ["blue"])
        self.assertEqual(required.measure(case), 1.0)
        self.assertTrue(required.is_successful())
        self.assertEqual(forbidden.measure(case), 1.0)
        bad = LiteralContractMetric("excludes", ["red"])
        self.assertEqual(bad.measure(case), 0.0)
        self.assertFalse(bad.is_successful())

    def test_report_rejects_nonfictional_prompt(self):
        known = case_map()
        identifier = next(iter(known))
        report = {"schemaVersion": 2, "runId": "fictional-run", "results": [{"id": identifier, "turns": [{"user": "different", "reply": "yes"}]}]}
        with self.assertRaisesRegex(ValueError, "prompt or checks"):
            validate_fictional_report(report, known)

    def test_report_rejects_missing_declared_check(self):
        known = case_map()
        identifier = next(key for key, case in known.items() if case["turns"][0]["checks"])
        report = {"schemaVersion": 2, "runId": "fictional-run", "results": [{"id": identifier, "turns": [{"user": known[identifier]["turns"][0]["user"], "reply": "yes", "checks": []}]}]}
        with self.assertRaisesRegex(ValueError, "checks differ"):
            validate_fictional_report(report, known)

    def test_report_rejects_unsafe_run_id_before_output_path(self):
        known = case_map()
        identifier = next(iter(known))
        report = {"schemaVersion": 2, "runId": "../../escape", "results": [{"id": identifier, "turns": [{"user": known[identifier]["turns"][0]["user"], "error": "provider failed", "checks": []}]}]}
        with self.assertRaisesRegex(ValueError, "runId"):
            validate_fictional_report(report, known)


class ServiceModelTests(unittest.TestCase):
    def test_shared_service_only_and_call_cap(self):
        observed = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers["Content-Length"])
                observed.append((self.path, self.headers, json.loads(self.rfile.read(length))))
                body = json.dumps({"reply": "fictional", "model": "fake", "usage": {"inputTokens": 3, "outputTokens": 1, "costMicroUsd": 4}}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            endpoint = f"http://127.0.0.1:{server.server_port}/v1/luna/chat"
            model = LunaServiceLLM(endpoint=endpoint, trusted_origin="", session_id="fictional_run", max_calls=1, enable_paid=True, token="test-only-token")
            self.assertEqual(model.generate("fictional prompt"), "fictional")
            self.assertEqual(model.cost_micro_usd, 4)
            self.assertEqual(observed[0][0], "/v1/luna/chat")
            self.assertEqual(observed[0][1]["X-Luna-Consent"], "new-chat-only")
            self.assertEqual(observed[0][2]["sessionId"], "fictional_run")
            with self.assertRaises(RuntimeError):
                model.generate("another")
        finally:
            server.shutdown()
            server.server_close()

    def test_constructor_rejects_direct_provider(self):
        with self.assertRaises(ValueError):
            LunaServiceLLM(endpoint="https://api.example.org/v1/responses", trusted_origin="https://api.example.org", session_id="fictional", max_calls=1, enable_paid=True, token="test")
        with self.assertRaises(ValueError):
            LunaServiceLLM(endpoint="https://budget.example.org/v1/luna/chat", trusted_origin="https://budget.example.org", session_id="fictional", max_calls=1, token="test")


if __name__ == "__main__":
    unittest.main()
