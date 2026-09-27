---
id: dgr-cuuy
status: open
deps: []
links: [dgr-h97q]
created: 2026-09-27T00:30:55Z
type: bug
priority: 2
assignee: Scott Schlesier
tags: [stage:captured]
---

# createIndex ignores every option except unique

Running createIndex in the query editor passes all supported index options through to MongoDB, so e.g. db.c.createIndex({createdAt: 1}, {expireAfterSeconds: 3600}) creates a TTL index.

Context: the executor's CreateIndex branch (src-tauri/src/executor.rs, CollectionOperation::CreateIndex) builds IndexOptions from `unique` only and silently drops everything else: expireAfterSeconds, name, sparse, partialFilterExpression, collation, hidden, etc. The query succeeds and returns the index name, so users don't find out the options were lost. Found while manually verifying dgr-h97q: the created index had no TTL.

Related: IndexInfo.expire_after_seconds (src-tauri/src/commands/databases.rs) is Option<i64> with no skip_serializing_if, so it serializes as null while the frontend contract (src/lib/contracts.ts) describes it as optional. dgr-h97q worked around this in IndexTooltip; consider adding skip_serializing_if (or aligning the contract) here.
