# Risk to test map

| Risk | Reference case or browser test | Critical gate | Remaining work |
|---|---|---|---|
| Unauthorized save or delete | `save-confirmation`, `delete-after-confirmation` | Yes | Product server integration |
| Consent revocation | `paired-revocation`, browser consent test, negative control | Yes | Product retrieval/tool boundaries |
| Cross-user read | `cross-user`, `cross-user-delete`, `prototype-actor-denied`, browser account switch | Yes | Real authenticated identities |
| Duplicate or uncertain write | `duplicate-uncertain-write`, `idempotency-payload-conflict`, `monotonic-story-id`, `failed-write-retry` | Yes for duplicate | Crash and durable store recovery |
| Unsupported answer | `retrieve-source` | No | Human and model semantic scoring |
| Prompt injection and exfiltration | `injection-is-text` | Yes | Real model/tool adversarial evaluation |
| Deletion | `delete-after-confirmation` | Yes | Backup retention and tombstones |
| Malformed output/input | `malformed-and-long` | No | Model schema parser and long context |
| Cancellation, timeout, error UI | Browser recovery and delayed user-switch tests | No | Product streaming and write uncertainty |
| Language and accessibility | `language-variation`, browser keyboard/mobile profile | No | Language breadth, screen readers, native devices |
| Provider outage and budgets | None | Pending | Real provider adapter with no-spend default |

The coverage map records evidence on the independent reference only. Missing product coverage is a gap, not an implied pass.
