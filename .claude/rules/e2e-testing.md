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
