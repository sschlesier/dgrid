# DGrid v2 - MongoDB GUI Application

A clean, modern MongoDB GUI built with Fastify and Svelte, optimized for AI-assisted development.

## Project Structure

- `src/backend/` - Fastify API server (Node.js/TypeScript)
- `src/frontend/` - Svelte 5 UI (Vite build)
- `src/shared/` - Shared types and contracts
- `.claude/` - Claude Code configuration (agents, skills, rules)

## Development Stack

- **Backend**: Fastify 5.x, MongoDB driver, TypeScript 5.7
- **Frontend**: Svelte 5 (runes), Vite 7, CodeMirror 6
- **Testing**: Vitest 3, mongodb-memory-server
- **E2E Testing**: Playwright (Chromium)
- **Package Manager**: pnpm (required)

## Code Style

- ES modules only (no CommonJS)
- TypeScript strict mode enabled
- Named exports preferred over default exports
- camelCase for variables/functions, PascalCase for classes/types

## Important Commands

```bash
# Development
pnpm dev              # Start both backend and frontend
pnpm dev:backend      # Backend only (http://localhost:3001)
pnpm dev:frontend     # Frontend only (http://localhost:5173)

# Verification (use after changes)
pnpm verify           # Run all checks (types, lint, tests, build, e2e)
pnpm type-check       # TypeScript compilation check
pnpm lint             # ESLint check
pnpm test             # Run test suite

# E2E Testing
pnpm e2e              # Run Playwright E2E tests
pnpm e2e:headed       # Run E2E tests with visible browser
pnpm e2e:ui           # Playwright interactive UI mode

# Building
pnpm build            # Build both backend and frontend
```

## Testing Standards

- Write tests alongside implementation (TDD encouraged)
- Use `describe` and `it` for organization
- Focus on behavior, not implementation details
- Integration tests use mongodb-memory-server for real MongoDB
- Component tests use @testing-library/svelte
- E2E tests use Playwright with real backend/frontend servers
- E2E test MongoDB is provided by mongodb-memory-server (no external DB needed)

## Architecture Patterns

- **Backend Routes**: `src/backend/routes/{resource}.ts`
- **Backend Services**: `src/backend/services/{domain}.ts`
- **Database Layer**: `src/backend/db/mongodb.ts`, `src/backend/db/queries.ts`
- **Frontend Stores**: `src/frontend/src/stores/{domain}.svelte.ts` (Svelte 5 runes)
- **Frontend Components**: `src/frontend/src/components/{Component}.svelte`
- **API Contracts**: `src/shared/contracts.ts` (single source of truth)
- **E2E Tests**: `tests/e2e/specs/{feature}.spec.ts`
- **E2E Fixtures**: `tests/e2e/fixtures.ts`
- **E2E Selectors**: `tests/e2e/helpers/selectors.ts`

## Workflow

1. Implement changes with tests (unit/integration AND E2E — see below)
2. Run `pnpm verify` to validate (types, lint, tests, build, **E2E**)
3. Commit to git after successful verification
4. Only push to remote when explicitly requested

## E2E Coverage Requirement

Every user-facing feature or behavior change **must** include E2E test coverage. This includes:

- New UI features (buttons, dialogs, views, interactions)
- Changes to existing UI behavior
- New or modified API endpoints that affect the frontend
- Bug fixes for issues that a user could observe

When adding a feature:

1. Add selectors to `tests/e2e/helpers/selectors.ts` for any new UI elements
2. Add or extend a spec in `tests/e2e/specs/{feature}.spec.ts`
3. Run `pnpm e2e` to verify before committing

## Security Principles

- Localhost-only (127.0.0.1 binding)
- Passwords stored in OS keyring only
- Input validation on all API endpoints
- Rate limiting enabled
- Helmet security headers

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

```bash
pnpm version patch    # or minor / major — bumps version, commits, and creates v* tag
git push origin main && git push origin <tag>   # triggers release workflow
```

- Always use `pnpm version` — never manually edit the version in `package.json`
- The `v*` tag push triggers the GitHub Actions release workflow (build, GitHub release, Homebrew cask update)

## Common Patterns

See `.claude/rules/` for detailed guidelines on:

- API endpoint design
- Svelte component structure
- Testing patterns
- TypeScript conventions
- E2E testing patterns
