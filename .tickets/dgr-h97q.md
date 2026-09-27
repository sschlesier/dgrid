---
id: dgr-h97q
status: open
deps: []
links: []
created: 2026-09-26T22:53:23Z
type: feature
priority: 3
assignee: Scott Schlesier
tags: [stage:agent-ready]
---

# Show index TTL as human-readable duration

When users hover a TTL index in the sidebar, the tooltip shows the expiry as a
readable duration with the raw seconds alongside (e.g. `TTL: 1.5m (92s)`,
`TTL: 22d (1900800s)`) instead of only raw seconds.

Context: today `IndexTooltip.svelte` renders `TTL: 86400s`, so users do the
arithmetic themselves. This is the only place in the app that shows TTL.

Out of scope:

- Showing TTL anywhere else (tree node labels, collection tooltip, index editing)
- Changing how index info is fetched (no Tauri command or Rust changes)
- Reusing the formatter for other durations (query timings, etc.)

## Design

Decision: add `formatTtl(seconds: number): string` to `src/lib/format.ts` (next to
`formatBytes`) and use it in `IndexTooltip.svelte`.
Decision: pick the largest unit (`s`, `m`, `h`, `d`) that the value is at least 1 of.
Divide, round to tenths (Math.round), and drop a trailing `.0`: 92 → `1.5m`,
5400 → `1.5h`, 10800 → `3h`. Days is the largest unit (no weeks, months or years),
so a year is `365d`.
Decision: if rounding reaches the next unit, use that unit instead: 3599 → `1h`, not
`60m`.
Decision: under 60 seconds, show seconds only: 45 → `45s`, 0 → `0s`. From 60 seconds
up, append the raw seconds in brackets, with no thousands separators (the same number
you'd pass to createIndex): 92 → `1.5m (92s)`, 31536000 → `365d (31536000s)`.
Decision: `expireAfterSeconds: 0` (MongoDB's "expire at the date in the field") shows
as `TTL: 0s`, with no extra wording.
Decision: non-integer or negative input returns `${seconds}s` unchanged (guard only;
MongoDB doesn't produce these).

## Acceptance Criteria

- [ ] `formatTtl` returns: 0 → `0s`, 45 → `45s`, 60 → `1m (60s)`, 90 → `1.5m (90s)`,
      92 → `1.5m (92s)`, 300 → `5m (300s)`, 3599 → `1h (3599s)`, 5400 → `1.5h (5400s)`,
      10800 → `3h (10800s)`, 86400 → `1d (86400s)`, 129600 → `1.5d (129600s)`,
      1900800 → `22d (1900800s)`, 31536000 → `365d (31536000s)`
- [ ] Hovering a TTL index with `expireAfterSeconds: 3600` shows `TTL: 1h (3600s)`
- [ ] Indexes without a TTL show no TTL flag (unchanged)

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/format.test.ts` (new `formatTtl` cases, one per example in
  the acceptance criteria)
- Manual: `pnpm dev`, run `db.sessions.createIndex({createdAt: 1}, {expireAfterSeconds: 3600})`,
  refresh the sidebar, expand the collection's indexes and hover `createdAt_1`; the
  tooltip shows `TTL: 1h (3600s)`

## Boundaries

Don't touch: `src-tauri/`, `CHANGES.md`.

## Notes

**2026-09-26T22:59:05Z**

Refined: formatTtl in format.ts; largest unit s/m/h/d rounded to tenths (days max, round-up promotes unit); raw seconds appended in brackets from 60s up, e.g. 1.5m (92s); tooltip only.

**2026-09-27T00:07:56Z**

Approved for agent pickup by Scott Schlesier. Preview cold read: not run.
