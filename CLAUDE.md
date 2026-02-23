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
- **Testing**: Vitest 3 (TypeScript), cargo test (Rust), Playwright (E2E)
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

# E2E Testing
pnpm e2e              # Run Playwright E2E tests
pnpm e2e:headed       # Run E2E tests with visible browser
pnpm e2e:ui           # Playwright interactive UI mode

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
- E2E tests use Playwright with real Tauri app
- E2E test MongoDB is provided by mongodb-memory-server (no external DB needed)

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
- **E2E Tests**: `tests/e2e/specs/{feature}.spec.ts`
- **E2E Fixtures**: `tests/e2e/fixtures.ts`
- **E2E Selectors**: `tests/e2e/helpers/selectors.ts`

## Workflow

1. Implement changes with tests (unit/integration AND E2E — see below)
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
| **E2E** (Playwright)                    | Complete user journeys that cross frontend and backend              | Slow   |

### E2E tests should cover user journeys, not widget details

A good E2E test: "User creates a connection, connects, navigates to a collection, and runs a query."

A bad E2E test: "Password field disables when save-password checkbox is unchecked." (This is component-level behavior — test it with @testing-library/svelte.)

**Rule of thumb**: If the test never touches the backend or navigates between pages, it probably belongs at the component level.

### When adding a feature

1. Add selectors to `tests/e2e/helpers/selectors.ts` for any new UI elements
2. Add or extend a spec in `tests/e2e/specs/{feature}.spec.ts`
3. Run `pnpm e2e` to verify before committing

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

**IMPORTANT: No Attribution**

Do NOT add any attribution to commits. This means:

- No `Co-Authored-By` lines
- No `Signed-off-by` lines
- No mentions of AI, Claude, or any contributor in commit messages
- Just the commit message itself, nothing else

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

## Common Patterns

See `.claude/rules/` for detailed guidelines on:

- Svelte component structure
- Testing patterns
- TypeScript conventions
- E2E testing patterns
