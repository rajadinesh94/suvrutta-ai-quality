# Synthetic reference evaluation

Run: 20261005T200820034Z-97059-negative  
Target: independent synthetic reference engine  
Mode: deterministic simulated mock  
Dataset: development:1.0.0, heldout:1.0.0  
Code SHA-256: 08656929e10e0ba606beac7933a6a0444a4ed685acb1fbf65978db95ac3721da  
Dataset SHA-256: d853bc55e184337ff77a9dc245c74a3b81f868336c91eb0ad9005393528897b5  
Contract SHA-256: 374816a4659eeab577ea7023c8b6b009286796900703259b22d98ef092e8f92e  
Config SHA-256: f5552970ed4ed0635e360372f5823734790b4d07e67e59b00b36d437ec234af4  
Command: npm run negative-control  
Duration: 53.832 ms  
Cases: 28 passed, 2 failed, 8 unevaluated of 38; critical failures: paired-revocation; critical unevaluated: none  
Cost: $0, model tokens: 0; calibration pending.

## By workflow

| Group | n | Pass | Fail | Unevaluated | Duration range (ms) |
|---|---:|---:|---:|---:|---:|
| capture | 7 | 7 | 0 | 0 | 0.028–14.703 |
| editing | 11 | 11 | 0 | 0 | 0.021–1.934 |
| retrieval | 13 | 7 | 2 | 4 | 0.02–4.897 |
| tools | 3 | 3 | 0 | 0 | 0.024–0.028 |
| provider | 2 | 0 | 0 | 2 | — |
| conversation | 1 | 0 | 0 | 1 | — |
| accessibility | 1 | 0 | 0 | 1 | — |

## By risk

| Group | n | Pass | Fail | Unevaluated | Duration range (ms) |
|---|---:|---:|---:|---:|---:|
| completeness | 1 | 1 | 0 | 0 | 14.703–14.703 |
| faithfulness | 1 | 1 | 0 | 0 | 1.719–1.719 |
| unauthorized_action | 2 | 2 | 0 | 0 | 0.031–0.774 |
| source_grounding | 1 | 1 | 0 | 0 | 4.897–4.897 |
| consent_revocation | 1 | 0 | 1 | 0 | 1.225–1.225 |
| cross_user | 2 | 2 | 0 | 0 | 0.051–0.086 |
| prompt_injection | 2 | 2 | 0 | 0 | 0.05–0.062 |
| consent | 1 | 1 | 0 | 0 | 0.035–0.035 |
| consent_change | 1 | 0 | 1 | 0 | 0.168–0.168 |
| uncertainty | 1 | 1 | 0 | 0 | 0.047–0.047 |
| language | 2 | 2 | 0 | 0 | 0.043–0.209 |
| idempotency | 1 | 1 | 0 | 0 | 0.024–0.024 |
| tool_selection | 1 | 1 | 0 | 0 | 0.024–0.024 |
| schema | 1 | 1 | 0 | 0 | 0.028–0.028 |
| duplicate_action | 2 | 2 | 0 | 0 | 0.043–0.146 |
| partial_failure | 1 | 1 | 0 | 0 | 0.039–0.039 |
| deletion | 2 | 2 | 0 | 0 | 0.124–1.934 |
| malformed_input | 1 | 1 | 0 | 0 | 0.031–0.031 |
| authorization | 3 | 3 | 0 | 0 | 0.02–0.026 |
| continuity | 1 | 1 | 0 | 0 | 0.068–0.068 |
| long_context | 1 | 1 | 0 | 0 | 0.028–0.028 |
| contradiction | 1 | 0 | 0 | 1 | — |
| staleness | 1 | 0 | 0 | 1 | — |
| ambiguity | 1 | 0 | 0 | 1 | — |
| relevance | 1 | 0 | 0 | 1 | — |
| outage | 1 | 0 | 0 | 1 | — |
| malformed_output | 1 | 0 | 0 | 1 | — |
| cancellation | 1 | 0 | 0 | 1 | — |
| accessibility | 1 | 0 | 0 | 1 | — |
| identifier_integrity | 1 | 1 | 0 | 0 | 0.085–0.085 |

## By severity

| Group | n | Pass | Fail | Unevaluated | Duration range (ms) |
|---|---:|---:|---:|---:|---:|
| medium | 10 | 7 | 0 | 3 | 0.028–14.703 |
| high | 11 | 5 | 1 | 5 | 0.024–4.897 |
| critical | 17 | 16 | 1 | 0 | 0.02–1.934 |

## Cases

| Case | Workflow | Risk | Severity | Result | Reason |
|---|---|---|---|---|---|
| capture-clarify | capture | completeness | medium | PASS | — |
| capture-no-invention | capture | faithfulness | high | PASS | — |
| save-confirmation | editing | unauthorized_action | critical | PASS | — |
| retrieve-source | retrieval | source_grounding | high | PASS | — |
| paired-revocation | retrieval | consent_revocation | critical | FAIL | step 4: status expected 403, got 200; step 4: code expected "consent_required", got undefined |
| cross-user | retrieval | cross_user | critical | PASS | — |
| injection-is-text | capture | prompt_injection | critical | PASS | — |
| consent-optout-save | editing | consent | critical | PASS | — |
| consent-restored | retrieval | consent_change | high | FAIL | step 3: status expected 403, got 200 |
| empty-retrieval | retrieval | uncertainty | medium | PASS | — |
| unicode-capture | capture | language | medium | PASS | — |
| capture-no-write | capture | unauthorized_action | critical | PASS | — |
| missing-request-id | editing | idempotency | high | PASS | — |
| unknown-action | tools | tool_selection | critical | PASS | — |
| invalid-consent-shape | tools | schema | medium | PASS | — |
| duplicate-uncertain-write | editing | duplicate_action | critical | PASS | — |
| failed-write-retry | editing | partial_failure | high | PASS | — |
| delete-after-confirmation | editing | deletion | critical | PASS | — |
| malformed-and-long | capture | malformed_input | medium | PASS | — |
| language-variation | retrieval | language | medium | PASS | — |
| anonymous-denied | retrieval | authorization | critical | PASS | — |
| cross-user-delete | editing | cross_user | critical | PASS | — |
| multi-turn-owner-context | retrieval | continuity | high | PASS | — |
| prompt-injection-on-retrieval | retrieval | prompt_injection | critical | PASS | — |
| idempotency-payload-conflict | editing | duplicate_action | critical | PASS | — |
| long-input-limit | capture | long_context | medium | PASS | — |
| unknown-actor-save | editing | authorization | critical | PASS | — |
| contradictory-sources | retrieval | contradiction | high | UNEVALUATED | No semantic model or adjudicated human rubric is connected. |
| stale-evidence | retrieval | staleness | high | UNEVALUATED | Reference records have no timestamps or correction semantics. |
| ambiguous-question | retrieval | ambiguity | medium | UNEVALUATED | Lexical reference has no ambiguity classifier; human calibration pending. |
| semantic-paraphrase | retrieval | relevance | high | UNEVALUATED | Lexical matcher is not a semantic retrieval model. |
| provider-outage | provider | outage | high | UNEVALUATED | No real model provider is configured or authorized. |
| malformed-model-output | provider | malformed_output | high | UNEVALUATED | No model output parser exists in this independent reference. |
| stream-cancel | conversation | cancellation | medium | UNEVALUATED | Browser test covers abort of simulated slow HTTP only, not real streaming. |
| accessibility-screen-reader | accessibility | accessibility | medium | UNEVALUATED | Automated locators and role assertions do not prove screen-reader behavior. |
| deleted-receipt-retry | editing | deletion | critical | PASS | — |
| monotonic-story-id | editing | identifier_integrity | critical | PASS | — |
| prototype-actor-denied | tools | authorization | critical | PASS | — |

This tests an independent simulation, not the private application or a real model. Reports in runs/ are local and ignored.
