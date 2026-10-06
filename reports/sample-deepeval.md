# DeepEval synthetic sample

Pinned DeepEval 4.2.3 ran custom deterministic `BaseMetric` checks over the 16 frozen fictional replies from the on-device sample. It executed the checks through `deepeval.assert_test` without a model judge or paid provider call. Nine metric events passed, three failed, and four turns had no declared literal check. The [machine-readable report](sample-deepeval.json) contains only case IDs, turn numbers, metric names, scores, status and provenance hashes; no prompt or reply text. Human semantic labels remain pending.

The two critical generated-text canary failures from the live run remain visible in the DeepEval events. This second implementation confirms the declared literal outcomes; it does not observe account ACLs or validate broad privacy, grounding, action safety, or production readiness.
