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
pnpm verify           # Run all checks (types, lint, tests, build)
pnpm type-check       # TypeScript compilation check
pnpm lint             # ESLint check
pnpm test             # Run test suite

# Building
pnpm build            # Build both backend and frontend
```

## Testing Standards

- Write tests alongside implementation (TDD encouraged)
- Use `describe` and `it` for organization
- Focus on behavior, not implementation details
- Integration tests use mongodb-memory-server for real MongoDB
- Component tests use @testing-library/svelte

## Architecture Patterns

- **Backend Routes**: `src/backend/routes/{resource}.ts`
- **Backend Services**: `src/backend/services/{domain}.ts`
- **Database Layer**: `src/backend/db/mongodb.ts`, `src/backend/db/queries.ts`
- **Frontend Stores**: `src/frontend/src/stores/{domain}.svelte.ts` (Svelte 5 runes)
- **Frontend Components**: `src/frontend/src/components/{Component}.svelte`
- **API Contracts**: `src/shared/contracts.ts` (single source of truth)

## Workflow

1. Create feature branch: `git checkout -b feature/description`
2. Implement with tests
3. Run `/verify-changes` skill before commit
4. Create PR with descriptive title

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

## Common Patterns

See `.claude/rules/` for detailed guidelines on:

- API endpoint design
- Svelte component structure
- Testing patterns
- TypeScript conventions
