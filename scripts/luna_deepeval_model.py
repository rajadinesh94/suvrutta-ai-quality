"""Optional DeepEval judge adapter; all requests go through the shared budget service."""
import asyncio
import json
import os
import threading
import uuid
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from deepeval.models import DeepEvalBaseLLM


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


class LunaServiceLLM(DeepEvalBaseLLM):
    """Opt-in custom judge. It cannot call a provider API directly."""

    def __init__(self, *, endpoint: str, trusted_origin: str, session_id: str, max_calls: int, enable_paid: bool = False, token: str | None = None, timeout: int = 30):
        parsed = urlsplit(endpoint)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        loopback = parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1")
        trusted_tls = parsed.scheme == "https" and origin == trusted_origin and parsed.hostname not in ("127.0.0.1", "localhost", "::1")
        if not (loopback or trusted_tls) or parsed.path != "/v1/luna/chat" or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Exact loopback or explicitly trusted HTTPS budget-service URL required")
        if not enable_paid or not isinstance(max_calls, int) or not 1 <= max_calls <= 24:
            raise ValueError("Judge calls require explicit enable_paid and a 1–24 call cap")
        self.token = token or os.environ.get("LUNA_SERVICE_TOKEN")
        if not self.token or not session_id or not session_id.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Bearer token and simple session ID are required")
        self.endpoint = endpoint
        self.session_id = session_id
        self.max_calls = max_calls
        self.timeout = timeout
        self.calls = 0
        self.cost_micro_usd = 0
        self._lock = threading.Lock()
        self._opener = build_opener(_NoRedirect())

    def load_model(self):
        return self

    def get_model_name(self) -> str:
        return "Luna via shared budget service"

    def generate(self, prompt: str, schema=None):
        with self._lock:
            if self.calls >= self.max_calls:
                raise RuntimeError("Judge call cap reached")
            self.calls += 1
        body = json.dumps({"sessionId": self.session_id, "requestId": f"judge-{uuid.uuid4()}", "messages": [{"role": "user", "content": prompt}]}).encode()
        request = Request(self.endpoint, data=body, headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "X-Luna-Consent": "new-chat-only"}, method="POST")
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                if int(response.headers.get("Content-Length", "0")) > 1048576:
                    raise ValueError("Budget service response exceeds byte cap")
                raw = response.read(1048577)
                if len(raw) > 1048576:
                    raise ValueError("Budget service response exceeds byte cap")
        except HTTPError as error:
            raise RuntimeError(f"Budget service HTTP {error.code}") from error
        result = json.loads(raw)
        usage = result.get("usage") or {}
        if not isinstance(result.get("reply"), str) or not result["reply"].strip() or not all(isinstance(usage.get(key), int) and usage[key] >= 0 for key in ("inputTokens", "outputTokens", "costMicroUsd")):
            raise ValueError("Budget service omitted reply or metered usage")
        with self._lock:
            self.cost_micro_usd += usage["costMicroUsd"]
        return schema.model_validate_json(result["reply"]) if schema else result["reply"]

    async def a_generate(self, prompt: str, schema=None):
        return await asyncio.to_thread(self.generate, prompt, schema)
