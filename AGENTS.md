# DGrid v2 - MongoDB GUI Application

A clean, modern MongoDB GUI built with Tauri (Rust backend) and Svelte 5 frontend, optimized for AI-assisted development.

## Project Structure

- `src-tauri/` - Tauri v2 Rust backend (commands, executor, storage, keyring)
- `src/` - Svelte 5 frontend (Vite build)
- `.claude/` - Claude Code configuration (agents, skills, rules)

## Development Stack

- **Backend**: Tauri 2 (Rust), MongoDB Rust driver, tokio async runtime
- **Frontend**: Svelte 5 (runes), Vite 7, CodeMirror 6
- **IPC**: Tauri commands (invoke) — no HTTP server
- **Testing**: Vitest 3 (TypeScript), cargo test (Rust), WebdriverIO + `tauri-webdriver` (E2E against the real Tauri app)
- **Package Manager**: pnpm (required)

## Code Style

- ES modules only (no CommonJS) for TypeScript
- TypeScript strict mode enabled
- Named exports preferred over default exports
- camelCase for variables/functions, PascalCase for classes/types
- Rust follows standard conventions (snake_case, clippy)

## Important Commands

```bash
# Development
pnpm dev              # Start Tauri dev (Rust backend + Vite frontend)
pnpm dev:frontend     # Frontend only (http://localhost:5173)

# Verification (use after changes)
pnpm verify           # Run all checks (types, lint, tests, build)
pnpm type-check       # TypeScript compilation check
pnpm lint             # ESLint check
pnpm test             # Run TypeScript test suite (Vitest)
cargo test            # Run Rust test suite (in src-tauri/)

# E2E Testing (WebdriverIO against the Tauri app, tests/webdriver/)
pnpm e2e:install-driver   # Install the pinned tauri-webdriver (rerun when the pin changes)
pnpm e2e                  # Build debug app, start MongoDB + driver, run all specs
pnpm e2e:ci               # Same with --ci (CI runs it on Linux under xvfb-run)
pnpm e2e:smoke            # Run only the smoke spec
node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/smoke.e2e.mjs   # One spec

# Building
pnpm build            # Build Tauri app (Rust + frontend)
pnpm build:frontend   # Build frontend only
```

## Testing Standards

- Write tests alongside implementation (TDD encouraged)
- Use `describe` and `it` for organization
- Focus on behavior, not implementation details
- Rust tests use `#[cfg(test)]` modules with `cargo test`
- Component tests use @testing-library/svelte
- E2E tests use WebdriverIO (mocha `describe`/`it`) in `tests/webdriver/specs/`

## Architecture Patterns

- **Tauri Commands**: `src-tauri/src/commands/{resource}.rs` (thin IPC handlers)
- **Executor**: `src-tauri/src/executor.rs` (MongoDB query execution)
- **BSON Serialization**: `src-tauri/src/bson_ser.rs` (BSON <-> JSON tagged format)
- **Connection Pool**: `src-tauri/src/pool.rs` (MongoDB connection management)
- **Storage**: `src-tauri/src/storage.rs` (JSON file CRUD for connections)
- **Keyring**: `src-tauri/src/keyring.rs` (OS keyring via `keyring` crate)
- **Frontend Stores**: `src/stores/{domain}.svelte.ts` (Svelte 5 runes)
- **Frontend Components**: `src/components/{Component}.svelte`
- **API Client**: `src/api/client.ts` (Tauri invoke wrappers)
- **API Contracts**: `src/lib/contracts.ts` (single source of truth)
- **Query Parser**: `src/lib/queries.ts` (frontend-side mongo shell parser)
- **E2E Tests**: `tests/webdriver/specs/{feature}.e2e.mjs`
- **E2E Helpers**: `tests/webdriver/helpers.mjs` (app actions), `tests/webdriver/runtime.mjs` (MongoDB info, seeding)
- **E2E Selectors**: `tests/webdriver/selectors.mjs`
- **E2E Config / Runner**: `tests/webdriver/wdio.conf.mjs`, `scripts/run-tauri-e2e.mjs`

## Workflow

1. Implement changes with tests (unit/integration)
2. Run `pnpm verify` to validate (types, lint, tests, build)
3. Run `cargo test` in `src-tauri/` for Rust changes
4. Commit to git after successful verification
5. Only push to remote when explicitly requested

## Testing Strategy

Choose the right test level for what you're verifying:

| Level                                   | Use for                                                             | Speed  |
| --------------------------------------- | ------------------------------------------------------------------- | ------ |
| **Rust unit** (cargo test)              | Backend logic, BSON serialization, query execution, storage         | Fast   |
| **TS unit/integration** (Vitest)        | Query parser, frontend stores, data transforms                      | Fast   |
| **Component** (@testing-library/svelte) | UI widget behavior: toggles, form validation, conditional rendering | Medium |
| **E2E** (WebdriverIO)                   | Complete user journeys that cross frontend and backend              | Slow   |

### E2E tests should cover user journeys, not widget details

A good E2E test: "User creates a connection, connects, navigates to a collection, and runs a query."

A bad E2E test: "Password field disables when save-password checkbox is unchecked." (This is component-level behavior — test it with @testing-library/svelte.)

**Rule of thumb**: If the test never touches the backend or navigates between pages, it probably belongs at the component level.

### When adding a feature

> Extend the matching spec in `tests/webdriver/specs/` (or add one for a genuinely new feature area). Add selectors to `tests/webdriver/selectors.mjs` and use them via `s` from `helpers.mjs` rather than inlining them. See `.claude/rules/e2e-testing.md` for the full conventions.

## Tickets

This project uses `br` (beads_rust) for tickets. The workspace lives on the `tickets`
branch, and `BEADS_DIR` (set in `.claude/settings.json`) points every checkout and worktree
at it, so `br` works from anywhere. Never commit ticket changes; the user does that on the
`tickets` branch. Run `br --help` for commands. Ticket pipeline conventions, the Definition
of Ready and the cold read are in `.agents/tickets/`; helpers are in `scripts/tickets/`.

Only pick up tickets from `br ready -l stage:agent-ready`. Plain `br ready` also lists
tickets nobody has approved for agent pickup.

When talking to people, refer to tickets by title or a short form of it ("the pnpm audit
ticket", "Filter query history"), not by ID alone. IDs like `dgr-x91` mean nothing to a
reader. Include the ID only where tooling needs it: `br` commands, commit messages, ticket
cross-references.

## Security Principles

- No network exposure — Tauri IPC is in-process (no HTTP server)
- Passwords stored in OS keyring only
- Input validation on all Tauri commands
- File path validation for read/write operations

## Sub-agent Usage

- **explorer**: Investigate codebase before implementing
- **test-runner**: Run tests in isolation
- **code-reviewer**: Review changes after implementation
- **type-checker**: Fix TypeScript errors

## Commit Guidelines

- Use git conventional commits
- Keep commits small and focused (one logical change per commit)
- Commit regularly as you progress through tasks
- Each commit should leave the codebase in a working state
- Run `cargo fmt` in `src-tauri/` for Rust changes and let it reformat every file it touches,
  including files you didn't otherwise change. Don't revert its changes to unrelated files.
  Commit those formatting-only changes on their own (`style: apply cargo fmt`), separate from
  the feature or fix commits

## Releasing

Follow [semver](https://semver.org/) when choosing the increment:

- **patch** — bug fixes, minor UI tweaks, internal refactors with no behavior change
- **minor** — new features, new UI capabilities, non-breaking additions
- **major** — breaking changes to data formats, config, or workflows that require user action

Steps:

1. Update `CHANGES.md` — add a section for the new version with user-facing changes on the top of the file
2. Run `pnpm version patch` (or `minor` / `major`) — bumps `package.json`, commits, and creates the `v*` tag
3. `git push origin main && git push origin <tag>` — triggers the release workflow

```bash
pnpm version patch    # or minor / major — bumps version, commits, and creates v* tag
git push origin main && git push origin <tag>   # triggers release workflow
```

- Always update `CHANGES.md` before running `pnpm version`
- Always use `pnpm version` — never manually edit the version in `package.json`
- The `v*` tag push triggers the GitHub Actions release workflow (build, GitHub release, Homebrew cask update)
- **Do NOT edit `CHANGES.md` during ordinary feature development** — it is curated only at release time (step 1 above)

## Common Patterns

See `.claude/rules/` for detailed guidelines on:

- Svelte component structure
- Testing patterns
- TypeScript conventions
- E2E testing patterns (WebdriverIO suite in `tests/webdriver/`)
