# E2E Testing Conventions (Playwright)

## File Organization

- Test specs: `tests/e2e/specs/{feature}.spec.ts`
- Selectors: `tests/e2e/helpers/selectors.ts`
- Fixtures & helpers: `tests/e2e/fixtures.ts`
- Config: `playwright.config.ts` (project root)

## Imports

Always import `test` and `expect` from the custom fixtures, not from `@playwright/test`:

```typescript
// Good
import { test, expect, createConnection, connectToServer } from '../fixtures';

// Bad — missing app fixtures
import { test, expect } from '@playwright/test';
```

## Test Structure

Use `test.describe` and `test` (not `describe`/`it`):

```typescript
test.describe('Feature Name', () => {
  test('does something specific', async ({ page, s, mongoInfo }) => {
    await page.goto('/');
    // ...
  });
});
```

## Selectors

All selectors live in `tests/e2e/helpers/selectors.ts`. Never inline selectors in specs.

```typescript
// Good — use the `s` fixture
await s.header.newConnectionButton().click();
await expect(s.connectionDialog.overlay()).toBeVisible();

// Bad — hardcoded selector in test
await page.locator('.header-btn.primary').click();
```

When you need a new selector, add it to `helpers/selectors.ts` and use it via the `s` fixture.

## MongoDB Setup

E2E tests run against a mongodb-memory-server instance started in `global-setup.ts`. Connection info is available via the `mongoInfo` fixture:

```typescript
test('connects to mongo', async ({ page, s, mongoInfo }) => {
  await page.goto('/');
  await createConnection(page, {
    name: 'Test',
    host: mongoInfo.host,
    port: mongoInfo.port,
  });
  await connectToServer(page, 'Test');
});
```

## Common Patterns

### Create and connect to MongoDB

```typescript
await createConnection(page, {
  name: 'Test Mongo',
  host: mongoInfo.host,
  port: mongoInfo.port,
});
await connectToServer(page, 'Test Mongo');
```

### Execute a query

```typescript
const editor = s.query.editorContent();
await editor.click();
await page.keyboard.press('Meta+A');
await page.keyboard.type('db.users.find({})');
await s.query.executeButton().click();
```

### Wait for results

```typescript
await expect(s.results.gridViewport()).toBeVisible();
```

### Check grid content

```typescript
await expect(s.results.gridCell().first()).toContainText('Alice');
```

## Coverage Expectations

Every user-facing feature needs E2E coverage. When implementing a new feature:

1. **Add selectors first** — any new UI element gets a selector in `helpers/selectors.ts`
2. **Add or extend a spec** — one spec file per feature area in `tests/e2e/specs/`
3. **Test the happy path at minimum** — user can perform the action and see the expected result
4. **Test error states when meaningful** — invalid input, failed operations, empty states

Existing spec files and what they cover:

- `smoke.spec.ts` — app loads, health check, connection dialog basics
- `connections.spec.ts` — create, test, connect
- `connection-crud.spec.ts` — edit, delete connections
- `sidebar-navigation.spec.ts` — expand tree, click collection, disconnect, refresh
- `query-execution.spec.ts` — find queries, Cmd+Enter, errors, pagination, status bar
- `field-editing.spec.ts` — edit values, change types, cancel
- `tab-management.spec.ts` — create/close tabs, independent state
- `results-views.spec.ts` — table/JSON/tree view switching
- `csv-export.spec.ts` — export buttons visibility and counts
- `query-history.spec.ts` — history entries, reload, clear

When adding a feature that fits an existing area, extend the existing spec. Only create a new spec file for a genuinely new feature area.

## Anti-Patterns

- **Don't use `page.waitForTimeout()`** — use `expect().toBeVisible()` or other auto-waiting assertions
- **Don't inline selectors** — add them to `helpers/selectors.ts`
- **Don't use `page.$()` or `page.$$()`** — use Playwright locators (auto-waiting, auto-retrying)
- **Don't use `retries` to mask flakiness** — fix the root cause

## Debugging

- Add `await page.pause()` to stop execution and open Playwright inspector
- Run `pnpm e2e:headed` to watch tests in a visible browser
- Run `pnpm e2e:ui` for Playwright's interactive test runner
- Failed test screenshots are saved to `test-results/`

## Running Tests

```bash
pnpm e2e              # Run all E2E tests (headless)
pnpm e2e:headed       # Run with visible browser
pnpm e2e:ui           # Interactive Playwright UI
pnpm e2e:report       # View last HTML report
```
