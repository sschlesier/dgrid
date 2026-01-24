# DGrid Rewrite Plan - Fresh Implementation

**Date**: January 2026
**Purpose**: Extract core architecture and requirements from existing project and build a clean, modern implementation optimized for AI-assisted development

---

## Executive Summary

This plan captures the essential architecture and requirements from the existing DGrid MongoDB GUI application and proposes a simplified, modern implementation. The focus is on:

1. **Core features only** - MongoDB viewer, query editor, connection management
2. **Modern tech stack** - Latest libraries and best practices (2026)
3. **AI-friendly architecture** - Clear structure for sub-agent tasks and verification
4. **Reduced complexity** - Remove unnecessary abstractions while maintaining testability

---

## Core Requirements (From Original)

### 1. MongoDB Data Viewer

- **Grid display** of MongoDB documents with pagination (50/100/250/500 per page)
- **BSON type support**: String, Number, Date, ObjectId, Boolean, Array, Object
- **Visual indicators** for data types (icons, colors, formatting)
- **Drill-down navigation**: Double-click Arrays/Objects to view in new tab
- **Tab-based interface** for multiple views
- **Column operations**: Resizable, sortable columns
- **Data operations**: Copy cell/row data, search/filter

### 2. Query Editor

- **CodeMirror 6** editor with MongoDB query syntax
- **Vim bindings** support (optional toggle)
- **Query execution** with results display in grid
- **Query history** (last 10-20 queries)
- **File operations**: Save/load queries as `.js` or `.mongodb` files
- **External file monitoring**: Watch query files for changes (auto-refresh)

### 3. Connection Management

- **Save connections** with user-defined names
- **Secure password storage** using OS keyring (@napi-rs/keyring)
- **Connection dialog** with both connection string and field-based input
- **Connection persistence** across sessions
- **Active connection indicator** in UI

### 4. Application Shell

- **Header** with connection selector and new connection button
- **Sidebar** with connections list (toggle-able)
- **Tab bar** for multiple query/result tabs
- **Status bar** showing connection status, query stats
- **Notification system** for errors/success messages
- **Keyboard shortcuts** (Cmd/Ctrl+T for new tab, Cmd/Ctrl+W to close, etc.)

---

## Current Architecture Analysis

### What's Working Well ✅

- **Clear separation**: Backend (Fastify) and Frontend (Svelte) are well-separated
- **Type safety**: Comprehensive TypeScript with strict mode
- **Repository pattern**: Abstractions enable easy testing and mocking
- **Security**: Localhost-only, helmet, rate-limiting, keyring integration
- **Testing**: Comprehensive test coverage with Vitest
- **Plugin architecture**: Fastify plugins for modular services

### What's Too Complex ⚠️

1. **Repository duplication**: 3 files per repository (interface + impl + mock) = 30 files
2. **Scattered types**: Types in 4+ locations (backend/types, shared/types, frontend/types, contracts/)
3. **9 separate stores**: Manual cache invalidation, interdependencies
4. **Legacy files**: `-old.ts` files still present causing confusion
5. **Complex initialization**: Conditional logic for test/dev/prod + mock/real services

### File Count Breakdown (Current)

- **Backend**: 60+ TypeScript files (services, routes, repositories, tests)
- **Frontend**: 40+ files (components, stores, utils, tests)
- **Total**: ~100 files

---

## Proposed New Architecture

### Design Principles

1. **Simplicity first**: Fewer abstractions, direct implementations
2. **AI-friendly structure**: Clear file boundaries, single responsibility
3. **Modern patterns**: Use latest language features, avoid over-engineering
4. **Testability**: Easy to test without excessive mocking
5. **Monorepo-ready**: Prepare for potential workspace structure

### Technology Stack (Modern 2026)

#### Backend

- **Framework**: Fastify 5.x (latest)
- **Runtime**: Node.js 22 LTS
- **Language**: TypeScript 5.7+ (strict mode)
- **Database**: MongoDB driver 6.x
- **Security**: Helmet, @fastify/rate-limit, @napi-rs/keyring
- **File watching**: Chokidar 4.x
- **Logging**: Pino 9.x
- **Testing**: Vitest 3.x + mongodb-memory-server

#### Frontend

- **Framework**: Svelte 5.x (runes API)
- **Build tool**: Vite 7.x
- **Editor**: CodeMirror 6 (latest) + vim bindings
- **Grid**: Custom implementation using Svelte (drop AG-Grid for simplicity)
- **State**: Svelte 5 runes ($state, $derived, $effect)
- **API**: Fetch API with typed contracts
- **Testing**: Vitest + @testing-library/svelte

#### Development

- **Package manager**: pnpm (faster, more efficient)
- **Linting**: ESLint 9.x + @typescript-eslint
- **Formatting**: Prettier 4.x + prettier-plugin-svelte
- **Git hooks**: Husky + lint-staged

### Simplified Architecture

```
dgrid-v2/
├── src/
│   ├── backend/
│   │   ├── server.ts              # Entry point
│   │   ├── app.ts                 # Fastify app setup
│   │   ├── config.ts              # Centralized configuration
│   │   ├── types.ts               # All backend types
│   │   ├── db/
│   │   │   ├── mongodb.ts         # MongoDB operations
│   │   │   └── queries.ts         # Query parsing and execution
│   │   ├── storage/
│   │   │   ├── connections.ts     # Connection CRUD
│   │   │   ├── keyring.ts         # Password management
│   │   │   └── files.ts           # File operations
│   │   ├── routes/
│   │   │   ├── index.ts           # Route registration
│   │   │   ├── connections.ts     # Connection endpoints
│   │   │   ├── databases.ts       # Database endpoints
│   │   │   ├── collections.ts     # Collection endpoints
│   │   │   ├── query.ts           # Query execution
│   │   │   └── files.ts           # File operations
│   │   └── __tests__/
│   │       ├── setup.ts
│   │       ├── connections.test.ts
│   │       ├── query.test.ts
│   │       └── integration.test.ts
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── main.ts            # Entry point
│   │   │   ├── App.svelte         # Root component
│   │   │   ├── types.ts           # All frontend types
│   │   │   ├── api/
│   │   │   │   ├── client.ts      # API client
│   │   │   │   └── contracts.ts   # Shared API types
│   │   │   ├── stores/
│   │   │   │   ├── app.svelte.ts  # App state (runes)
│   │   │   │   └── query.svelte.ts # Query state (runes)
│   │   │   ├── components/
│   │   │   │   ├── Header.svelte
│   │   │   │   ├── Sidebar.svelte
│   │   │   │   ├── TabBar.svelte
│   │   │   │   ├── ConnectionDialog.svelte
│   │   │   │   ├── Editor.svelte
│   │   │   │   ├── Grid.svelte
│   │   │   │   ├── GridCell.svelte
│   │   │   │   └── StatusBar.svelte
│   │   │   └── __tests__/
│   │   │       ├── setup.ts
│   │   │       └── components.test.ts
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── shared/
│       └── contracts.ts           # Shared API contracts (single source)
├── package.json
├── tsconfig.json
├── tsconfig.backend.json
├── tsconfig.frontend.json
├── vitest.config.ts
├── .eslintrc.js
└── .prettierrc.js
```

**Key Simplifications**:

- **Single type file** per layer (no scattered definitions)
- **No repository abstraction** - direct implementations with conditional mocking via factory
- **2 stores instead of 9** - app state and query state using Svelte 5 runes
- **Shared contracts** - single source of truth for API types
- **Flat structure** - no deep nesting, easier to navigate

**File Count Estimate**: ~35-40 files (60% reduction)

---

## Implementation Strategy for AI-Assisted Development

### Phase 1: Foundation Setup (1-2 sessions)

**Goal**: Project scaffolding, tooling, and configuration

#### Tasks (Sub-agent friendly):

1. **Project initialization**
   - Initialize pnpm workspace
   - Setup TypeScript configs (root, backend, frontend)
   - Configure ESLint + Prettier
   - Setup Vitest

2. **Backend scaffold**
   - Create basic Fastify app
   - Setup config management
   - Add security middleware (helmet, cors, rate-limit)
   - Health check endpoint

3. **Frontend scaffold**
   - Initialize Vite + Svelte 5
   - Setup basic routing/layout
   - Configure build

4. **Verification**: Run build, lint, and basic health check test

### Phase 2: Core Backend (2-3 sessions)

**Goal**: MongoDB operations and connection management

#### Tasks:

1. **MongoDB integration**
   - Connection manager with pool
   - Query parser (MongoDB shell syntax)
   - Query executor with pagination
   - BSON type serialization

2. **Connection storage**
   - File-based connection persistence
   - Keyring integration for passwords
   - Connection CRUD operations

3. **API routes**
   - Connections endpoints
   - Database/collection listing
   - Query execution endpoint
   - File operations endpoints

4. **Verification**: Integration tests with mongodb-memory-server

### Phase 3: Core Frontend (2-3 sessions)

**Goal**: UI components and state management

#### Tasks:

1. **State management**
   - App store (connections, UI state, tabs)
   - Query store (query text, results, history)

2. **Core components**
   - Header with connection selector
   - Sidebar with connections list
   - Tab bar with keyboard shortcuts
   - Status bar and notifications

3. **API client**
   - Typed fetch wrapper
   - Error handling
   - WebSocket for file watching

4. **Verification**: Component tests, manual UI testing

### Phase 4: Query Editor (1-2 sessions)

**Goal**: CodeMirror integration and query execution

#### Tasks:

1. **Editor component**
   - CodeMirror 6 setup
   - JavaScript/MongoDB syntax highlighting
   - Vim bindings (optional toggle)
   - Execute query (Cmd/Ctrl+Enter)

2. **Query management**
   - Query history (localStorage)
   - Save query to file
   - Load query from file
   - External file watching

3. **Verification**: Editor interaction tests, file watching test

### Phase 5: Results Grid (2-3 sessions)

**Goal**: Custom grid implementation for MongoDB documents

#### Tasks:

1. **Grid component**
   - Virtual scrolling for performance
   - Dynamic column generation from documents
   - BSON type rendering (ObjectId, Date, etc.)
   - Column resize and sort

2. **Drill-down navigation**
   - Array/Object cell click handling
   - New tab creation with breadcrumb
   - Navigation state management

3. **Grid features**
   - Pagination controls
   - Cell copy functionality
   - Search/filter

4. **Verification**: Grid rendering tests, drill-down test, performance test (10k rows)

### Phase 6: Polish & Testing (1-2 sessions)

**Goal**: Complete test coverage and UX refinement

#### Tasks:

1. **Comprehensive testing**
   - Unit tests for all backend services
   - Integration tests for API routes
   - Component tests for UI
   - E2E tests for critical flows

2. **Error handling**
   - Graceful connection failures
   - Query error display
   - Retry logic for transient failures

3. **UX improvements**
   - Loading states
   - Empty states
   - Keyboard shortcut help
   - Theme support (light/dark)

4. **Verification**: Full test suite run, manual QA session

---

## AI-Assisted Development Guidelines

### File Organization for Sub-Agents

Each task should be scoped to 1-3 files maximum. Examples:

**Good task scope**:

- "Implement connection CRUD in `backend/storage/connections.ts` and add tests in `backend/__tests__/connections.test.ts`"
- "Create Grid component in `frontend/components/Grid.svelte` with basic rendering"
- "Add query execution endpoint in `backend/routes/query.ts`"

**Too broad** (split into multiple tasks):

- "Implement entire query system" (spans 5+ files)
- "Build complete frontend" (spans 10+ files)

### Verification Strategy

Every phase should end with a verification task that:

1. Runs the full test suite
2. Executes build to check for TypeScript errors
3. Runs linter and formatter
4. Performs manual testing of new features

Use a verification sub-agent that:

- Runs `pnpm test` and checks exit code
- Runs `pnpm build` and checks for errors
- Runs `pnpm lint` and checks for violations
- Reports any issues found

### Test-Driven Development

For each feature:

1. Write tests first (or alongside implementation)
2. Implement feature
3. Run tests to verify
4. Commit only when tests pass

### Code Quality Gates

Before marking a phase complete:

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Code formatted with Prettier
- [ ] No console.log statements (use proper logging)
- [ ] All TODOs addressed or documented

---

## Migration Strategy

### Reusing from Current Implementation

#### Keep and Adapt:

1. **Test cases** - Copy test logic, update to new structure
2. **Type definitions** - Consolidate into new type files
3. **BSON type handling** - Reuse serialization logic
4. **Security middleware** - Keep helmet, cors, rate-limit setup
5. **Query parser** - Adapt existing query parsing logic
6. **UI components** - Reference styling and structure, rewrite for Svelte 5

#### Leave Behind:

1. Repository abstraction layer (impl + mock + interface pattern)
2. Old service files (`-old.ts` files)
3. Scattered type definitions
4. Complex store interdependencies
5. AG-Grid integration (build custom grid instead)

### Data Migration

No data migration needed:

- Connection files will use same format (can be read by new version)
- Keyring entries use same service name (compatible)
- Query files are plain text (fully compatible)

---

## Success Criteria

### Functional Requirements ✅

- [ ] Connect to MongoDB with saved connections
- [ ] Execute queries and display results in grid
- [ ] Drill down into Arrays and Objects
- [ ] Save and load query files
- [ ] Watch external query files for changes
- [ ] Store passwords securely in OS keyring
- [ ] Navigate multiple tabs
- [ ] Dark/light theme support

### Non-Functional Requirements ✅

- [ ] <100ms response time for queries <1000 results
- [ ] <2s initial load time
- [ ] Handles 10,000 row results without lag
- [ ] Zero TypeScript errors in strict mode
- [ ] > 80% test coverage
- [ ] All linting rules pass
- [ ] No security vulnerabilities in dependencies

### Developer Experience ✅

- [ ] Clear file structure (new developer can navigate in <5min)
- [ ] All components have tests
- [ ] README with setup instructions
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Git hooks prevent bad commits
- [ ] Sub-agent tasks can be executed independently

---

## Risks & Mitigations

| Risk                              | Mitigation                                                       |
| --------------------------------- | ---------------------------------------------------------------- |
| **Custom grid performance**       | Use virtual scrolling from start, performance test with 10k rows |
| **CodeMirror 6 complexity**       | Start with minimal setup, add features incrementally             |
| **Svelte 5 runes learning curve** | Reference official docs, use simple patterns first               |
| **Scope creep**                   | Strict adherence to core features list, defer nice-to-haves      |
| **Testing overhead**              | Write tests alongside code, not after (TDD)                      |

---

## Timeline Estimate

**Total effort**: 10-15 focused development sessions (20-30 hours)

- Phase 1 (Foundation): 2-3 hours
- Phase 2 (Backend): 4-6 hours
- Phase 3 (Frontend): 4-6 hours
- Phase 4 (Editor): 2-3 hours
- Phase 5 (Grid): 4-6 hours
- Phase 6 (Polish): 2-3 hours

**Velocity assumption**: 2-3 hours per session with AI assistance

---

## Next Steps

1. **Review this plan** - Confirm approach and priorities
2. **Create new directory** - `dgrid-v2/` alongside existing project
3. **Initialize project** - Run Phase 1 tasks
4. **Iterative development** - Execute phases with verification between each
5. **Parallel reference** - Keep old project for reference during development
6. **Cutover** - Replace old project once new version reaches feature parity

---

## Appendix: Key Learnings from Current Implementation

### What Worked Well

1. **Repository pattern for testing** - Easy to swap real/mock implementations
2. **Fastify plugins** - Clean service registration
3. **TypeScript strict mode** - Caught many bugs early
4. **Comprehensive tests** - Gave confidence in refactoring
5. **Keyring integration** - Secure password storage worked flawlessly

### What Caused Pain

1. **Too many abstraction layers** - Repository + Service + Route = 3 layers for simple operations
2. **Scattered types** - Hard to find canonical type definitions
3. **Manual store cache invalidation** - Error-prone, required careful coordination
4. **Complex server initialization** - Conditional logic was fragile
5. **AG-Grid integration** - Heavy dependency, customization was difficult

### Patterns to Keep

- Result<T, E> pattern for error handling
- Fastify plugin architecture
- Clear backend/frontend separation
- WebSocket for file watching
- Comprehensive input validation

### Patterns to Change

- Remove repository abstraction (use conditional factories instead)
- Consolidate type definitions (single source per layer)
- Use Svelte 5 runes instead of manual stores
- Simplify server initialization (strategy pattern)
- Build custom grid (drop AG-Grid)
