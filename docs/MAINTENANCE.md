# On-demand maintenance roles

These are work templates, not agents running in the background. Each role prepares reviewable evidence and stops at its boundary. A separate owner reviews any change; no role approves itself, weakens a gate silently, publishes, spends money, or runs indefinitely. Scheduling requires separate approval.

| Role | Inputs | Allowed actions | Required evidence/output | Stop and escalate when |
|---|---|---|---|---|
| Regression triage | Failed run ID, code/dataset hashes, reproduction command | Reproduce, isolate cause, propose patch | Minimal reproduction, affected scenario IDs, before/after report | Critical privacy/action failure, unavailable fixture, or product-only behavior |
| Dataset curation | Gap report, fictional case proposal, version | Add original synthetic cases and rubrics | Provenance statement, split choice, schema check, peer review | Real/private data enters a fixture or expectation changes without rationale |
| Judge calibration | Frozen semantic sample, rubric, reviewer permissions | Organize blinded review and compute agreement | Reviewer/date provenance, disagreements, adjudication, limits | No human labels, hidden model configuration, or disagreement affecting gate |
| Dependency/security review | Lockfile, official advisories and license sources | Inspect versions, test an update in a branch | Source links, license inventory, audit output, behavior regression | New service, credential, license conflict, or unresolved vulnerability |
| Playwright flake investigation | CI failure, browser/version, trace after content review | Reproduce, classify, repair bounded selector/state issue | Failing step, trace pointer, fix result or expiring quarantine | Failure hides privacy/action defect or requires secret artifact export |
| Release-readiness reporting | All current reports and product gates | Summarize evidence and gaps | Target-specific pass/fail/unexecuted matrix, residual risk, reviewer signoff | Any critical gate fails, calibration missing, or deployment authority required |

The synthetic reference evidence can support a portfolio discussion. It cannot certify the private product, a model, native devices, or production readiness.
