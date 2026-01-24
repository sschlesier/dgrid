# Phase 3: Core Frontend - Detailed Implementation Plan

## Overview

**Goal**: Implement Svelte 5 UI with state management, core components, and API integration
**Prerequisites**: Phase 2 complete (backend API fully functional)
**Verification**: Component tests, integration with backend API

---

## Architecture Overview

### File Structure

```
src/frontend/src/
├── App.svelte                    # Root layout
├── main.ts                       # Entry point
├── types.ts                      # Frontend-specific types
├── api/
│   ├── client.ts                 # Typed fetch wrapper
│   └── websocket.ts              # File watching WebSocket
├── stores/
│   ├── app.svelte.ts             # Connections, tabs, UI state
│   └── query.svelte.ts           # Query text, results, history
├── components/
│   ├── Header.svelte
│   ├── Sidebar.svelte
│   ├── TabBar.svelte
│   ├── StatusBar.svelte
│   ├── ConnectionDialog.svelte
│   ├── QueryPanel.svelte
│   └── Notification.svelte
├── styles/
│   ├── global.css
│   └── variables.css
└── utils/
    └── keyboard.ts
```

### State Pattern

Use Svelte 5 runes with class-based stores for reactive state management.

---

## Task 3.1: Frontend Types and Utilities

**Files**: `src/frontend/src/types.ts`, `src/frontend/src/utils/keyboard.ts`

**Types needed**:

- `Tab` - id, title, type (query/results/drilldown), connectionId, database, queryText
- `Notification` - id, type (success/error/info/warning), message, duration
- `Theme` - 'light' | 'dark' | 'system'
- `UIState` - sidebarOpen, theme

**Keyboard utilities**:

- Register/unregister shortcuts
- Handle Mac vs Windows (Cmd vs Ctrl)
- Format shortcut for display

**Acceptance Criteria**:

- [ ] Types defined and exported
- [ ] Keyboard utility handles platform differences
- [ ] Unit tests for keyboard utilities

---

## Task 3.2: API Client

**Files**: `src/frontend/src/api/client.ts`

**Requirements**:

- Typed wrapper around fetch for all backend endpoints
- Custom `ApiError` class with statusCode, errorType, message, details
- Methods for: connections CRUD, test, connect, disconnect
- Methods for: databases list, collections list
- Methods for: query execution
- Methods for: file read/write

**Acceptance Criteria**:

- [ ] All backend endpoints covered
- [ ] Proper error transformation
- [ ] TypeScript types from shared contracts
- [ ] Unit tests with mocked fetch

---

## Task 3.3: WebSocket Client

**Files**: `src/frontend/src/api/websocket.ts`

**Requirements**:

- Connect to backend WebSocket for file watching
- Handle watch/unwatch for file paths
- Callback on file change with new content
- Auto-reconnect on disconnect
- Cleanup function for component unmount

**Acceptance Criteria**:

- [ ] WebSocket connection management
- [ ] Multiple file watches supported
- [ ] Reconnection logic
- [ ] Unit tests with mock WebSocket

---

## Task 3.4: App Store

**Files**: `src/frontend/src/stores/app.svelte.ts`

**State**:

- `connections: ConnectionResponse[]`
- `activeConnectionId: string | null`
- `databases: DatabaseInfo[]`
- `collections: Map<string, CollectionInfo[]>`
- `tabs: Tab[]`
- `activeTabId: string | null`
- `ui: UIState`
- `notifications: Notification[]`

**Derived**:

- `activeConnection` - current connection object
- `activeTab` - current tab object

**Actions**:

- Connection: load, create, update, delete, connect, disconnect
- Database: load databases, load collections
- Tabs: create, close, setActive, update
- UI: toggleSidebar, setTheme
- Notifications: notify, dismiss

**Acceptance Criteria**:

- [ ] All state and actions implemented
- [ ] UI state persisted to localStorage
- [ ] Derived states work correctly
- [ ] Unit tests for state transitions

---

## Task 3.5: Query Store

**Files**: `src/frontend/src/stores/query.svelte.ts`

**State** (per-tab using Maps):

- `queryTexts: Map<string, string>`
- `results: Map<string, ExecuteQueryResponse | null>`
- `isExecuting: Map<string, boolean>`
- `errors: Map<string, string | null>`
- `history: QueryHistoryItem[]` (global, last 20)

**Actions**:

- setQueryText, getQueryText
- executeQuery (calls API, updates results/errors)
- clearResults
- loadPage (pagination)
- addToHistory, clearHistory, loadHistory (localStorage)

**Acceptance Criteria**:

- [ ] Per-tab state management
- [ ] Query execution with loading/error states
- [ ] History persisted to localStorage
- [ ] Unit tests

---

## Task 3.6: App Shell and Layout

**Files**: `src/frontend/src/App.svelte`, `src/frontend/src/main.ts`

**Layout structure**:

- Header (fixed top)
- Main area with optional Sidebar (left) and Content (right)
- Content has TabBar and active panel
- StatusBar (fixed bottom)
- Notification overlay (bottom-right)

**Requirements**:

- Load connections on mount
- Apply theme class to root
- Empty state when no tabs

**Acceptance Criteria**:

- [ ] Layout renders correctly
- [ ] Theme switching works
- [ ] Data loads on mount

---

## Task 3.7: Header Component

**Files**: `src/frontend/src/components/Header.svelte`

**Elements**:

- Sidebar toggle button (left)
- App title
- Connection selector dropdown (center)
- Database selector dropdown (when connected)
- New Tab button (disabled when no connection)
- New Connection button (opens dialog)

**Acceptance Criteria**:

- [ ] Connection dropdown populated
- [ ] Database dropdown shows when connected
- [ ] Buttons trigger correct actions

---

## Task 3.8: Sidebar Component

**Files**: `src/frontend/src/components/Sidebar.svelte`

**Elements**:

- Header with title
- Scrollable list of connections
- Each connection shows: name, host:port, status indicator
- Connect/Disconnect button per connection
- Empty state when no connections

**Acceptance Criteria**:

- [ ] Lists all connections
- [ ] Shows connection status
- [ ] Connect/disconnect works
- [ ] Highlights active connection

---

## Task 3.9: TabBar Component

**Files**: `src/frontend/src/components/TabBar.svelte`

**Elements**:

- Horizontal tab strip
- Each tab: title, close button
- New tab button (+)
- Active tab highlighted

**Keyboard shortcuts**:

- Cmd/Ctrl+T: New tab
- Cmd/Ctrl+W: Close current tab

**Acceptance Criteria**:

- [ ] Tab switching works
- [ ] Close button works
- [ ] Keyboard shortcuts work
- [ ] Horizontal scroll for many tabs

---

## Task 3.10: StatusBar Component

**Files**: `src/frontend/src/components/StatusBar.svelte`

**Elements**:

- Left: Connection status indicator and name
- Center: Query results info (count, time, page) or "Executing..."
- Right: Theme toggle

**Acceptance Criteria**:

- [ ] Shows connection status
- [ ] Shows query results info
- [ ] Theme toggle works

---

## Task 3.11: ConnectionDialog Component

**Files**: `src/frontend/src/components/ConnectionDialog.svelte`

**Form fields**:

- Name (required)
- Host (required, default: localhost)
- Port (required, default: 27017)
- Database (optional)
- Username (optional)
- Password (optional)
- Auth Source (default: admin)

**Actions**:

- Test Connection button
- Save button
- Cancel button

**Features**:

- Modal overlay
- Edit mode (pre-fill existing connection)
- Loading states
- Error display
- Test result display

**Acceptance Criteria**:

- [ ] Form validation
- [ ] Test connection works
- [ ] Create/update works
- [ ] Modal closes on save/cancel

---

## Task 3.12: QueryPanel Placeholder

**Files**: `src/frontend/src/components/QueryPanel.svelte`

**Layout**:

- Top: Editor toolbar with Execute button
- Middle: Textarea (placeholder for CodeMirror in Phase 4)
- Bottom: Results area with JSON pre (placeholder for Grid in Phase 5)

**Note**: This is a functional placeholder. CodeMirror editor comes in Phase 4, custom Grid in Phase 5.

**Acceptance Criteria**:

- [ ] Query text editable
- [ ] Execute button triggers query
- [ ] Results display as JSON
- [ ] Error display
- [ ] Pagination info shown

---

## Task 3.13: Notification Component

**Files**: `src/frontend/src/components/Notification.svelte`

**Features**:

- Toast-style notification
- Types: success (green), error (red), info (blue), warning (yellow)
- Auto-dismiss after duration
- Manual dismiss button
- Positioned bottom-right, stacked

**Acceptance Criteria**:

- [ ] Renders with correct style per type
- [ ] Auto-dismisses
- [ ] Manual dismiss works

---

## Task 3.14: CSS Styling Foundation

**Files**: `src/frontend/src/styles/global.css`, `src/frontend/src/styles/variables.css`

**CSS Variables**:

- Colors (bg, text, border, primary, success, error, warning)
- Spacing scale (xs, sm, md, lg, xl)
- Typography (font-family, font-mono, sizes)
- Layout (header-height, sidebar-width, statusbar-height, tab-height)
- Dark theme overrides

**Global styles**:

- Reset/normalize
- Box-sizing border-box
- Base typography

**Acceptance Criteria**:

- [ ] Light theme variables
- [ ] Dark theme variables
- [ ] Layout measurements
- [ ] Clean base styles

---

## Task 3.15: Component Tests

**Files**: `src/frontend/src/__tests__/*.test.ts`

**Coverage**:

- App store: load, create, connect, tabs
- Query store: execute, history
- Header: renders, interactions
- ConnectionDialog: form, test, save
- API client: requests, error handling

**Acceptance Criteria**:

- [ ] Store tests pass
- [ ] Component tests pass
- [ ] API client tests pass
- [ ] Good coverage of critical paths

---

## Execution Order

```
3.1 Types & Utilities ─┬─► 3.4 App Store ─┬─► 3.6 App Shell
3.2 API Client ────────┤                  │
3.3 WebSocket Client ──┘                  ├─► 3.7 Header
                                          ├─► 3.8 Sidebar
3.14 CSS (parallel) ──────────────────────├─► 3.9 TabBar
                                          ├─► 3.10 StatusBar
                       3.5 Query Store ───├─► 3.11 ConnectionDialog
                                          ├─► 3.12 QueryPanel
                                          └─► 3.13 Notification
                                                    │
                                            3.15 Tests
```

---

## Verification Checklist (End of Phase 3)

- [ ] `pnpm test` - All tests passing
- [ ] `pnpm type-check` - No TypeScript errors
- [ ] `pnpm lint` - No linting errors
- [ ] `pnpm build` - Builds successfully
- [ ] Manual test: Create connection, connect, create tab, execute query, switch tabs, toggle sidebar, switch themes
- [ ] Keyboard shortcuts work (Cmd/Ctrl+T, Cmd/Ctrl+W)
