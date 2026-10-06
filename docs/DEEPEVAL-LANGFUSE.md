# Optional DeepEval and local Langfuse

Python/pytest is the primary stage harness. It checks an independent synthetic ingestion/retrieval pipeline, reference HTTP business outcomes, five negative controls, and frozen **fictional** live replies with [DeepEval custom `BaseMetric` checks](https://deepeval.com/docs/metrics-custom). It never invokes DeepEval's built-in model judges by default. The two DeepEval metrics check only declared required and forbidden literals, then leave semantic judgments to independent human review. DeepEval cloud login, dotenv loading, anonymous telemetry and ambient OpenAI credentials are disabled by the script. No model weights or provider runtime are installed.

Use Python 3.12 and a local virtual environment:

```sh
python3.12 -m venv .local/eval-venv
.local/eval-venv/bin/python -m pip install -r scripts/requirements-eval.txt
npm run test:deepeval
npm run evaluate:deepeval -- --report reports/runs/YOUR-LIVE-RUN.json
npm run cycle
```

On Windows, the virtual environment interpreter is `.local/eval-venv/Scripts/python.exe`; the npm wrappers select it automatically. The exact top-level packages are `pytest==9.1.1`, `deepeval==4.2.3` and `langfuse==4.16.0`. Pin and review transitive dependencies for long-term reproducibility in a deployment environment. The output is ignored under `reports/runs/` and has per-turn metric status, source-report hash and an explicit pending human-label marker. The frozen-reply layer is a second, independently implemented literal check, not an independent model judgment. The report run ID is restricted to safe filename characters before deriving an output path.

`scripts/luna_deepeval_model.py` is an optional `DeepEvalBaseLLM` adapter for future model-judge experiments. Its constructor requires explicit `enable_paid=True`, an exact trusted HTTPS shared-budget service endpoint, a bearer token supplied through `LUNA_SERVICE_TOKEN`, a session ID and a 1–24 call cap. It calls only `/v1/luna/chat` with `X-Luna-Consent: new-chat-only`. The shared service enforces the durable combined chat and evaluation budget. This adapter is never constructed by the default DeepEval command; no model judge result or paid judge call is claimed here.

For local traces, `npm run evaluate:deepeval` writes a JSON event stream containing case ID, turn number, metric name, score and status. It contains no model input or reply text. Langfuse export is opt-in. `scripts/setup-langfuse.mjs` downloads the [official v4.50.0 Docker Compose recipe](https://github.com/langfuse/langfuse/blob/v4.50.0/docker-compose.yml), verifies its pinned SHA-256, changes only the two application images to exact `4.50.0` tags, binds published ports to localhost, and generates credentials in ignored `.local/langfuse/.env` with owner-only permissions. It uses Docker named volumes; it does not mount this repository or any private archive. The setup also disables Langfuse telemetry and open sign-up, and initializes a fictional local organization, project, and user so API keys exist without using the UI.

```sh
node scripts/setup-langfuse.mjs
docker compose --env-file .local/langfuse/.env -f .local/langfuse/docker-compose.yml up -d
curl http://127.0.0.1:3000/api/public/health
npm run trace:langfuse -- --report reports/runs/YOUR-LIVE-RUN.json
```

The trace command loads the ignored local project keys internally, sends only synthetic case IDs and metric summaries through the [Langfuse Python v4 OpenTelemetry SDK](https://langfuse.com/docs/observability/sdk/overview), and flushes the client. It never sends prompts, replies, archive content or credentials as trace fields. This local Docker Compose stack is for development; [Langfuse states](https://langfuse.com/self-hosting/deployment/docker-compose) it lacks production high availability, scaling and backup capabilities. Running containers consumes local disk and CPU; no hosted subscription or paid Langfuse plan is configured. Only use fictional data in this repository.

On the validation host, the official Compose file was prepared and validated, six containers started, and the web health endpoint returned HTTP 200. A metadata-only synthetic export completed its SDK flush without exception, but an API read-back did not confirm an observation before disk pressure stopped the run. The local validation stack is stopped and its runtime state is excluded from publication. Local ingestion is unverified until a trace can be read back on a host with enough free space. Detailed runtime evidence is kept in ignored `.local/observability-evidence.json`; no hosted account was used.
