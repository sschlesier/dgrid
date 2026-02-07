import { type Page } from '@playwright/test';

/** Centralized UI selectors for E2E tests. Add new selectors here, don't inline them in specs. */
export function selectors(page: Page) {
  return {
    header: {
      root: () => page.locator('header.header'),
      newConnectionButton: () => page.getByTitle('Add new connection'),
      title: () => page.locator('.app-title'),
    },

    sidebar: {
      root: () => page.locator('aside.sidebar'),
      tree: () => page.locator('[role="tree"]'),
      treeItem: (name: string) =>
        page.locator('[role="treeitem"]', { hasText: name }),
      emptyState: () => page.locator('aside.sidebar .empty-state'),
    },

    connectionDialog: {
      overlay: () => page.locator('.dialog-overlay'),
      dialog: () => page.locator('.dialog'),
      heading: () => page.locator('.dialog-header h2'),
      nameInput: () => page.locator('input#name'),
      hostInput: () => page.locator('input#host'),
      portInput: () => page.locator('input#port'),
      databaseInput: () => page.locator('input#database'),
      testButton: () => page.getByRole('button', { name: 'Test Connection' }),
      saveButton: () => page.getByRole('button', { name: 'Save' }),
      cancelButton: () => page.getByRole('button', { name: 'Cancel' }),
      deleteButton: () => page.getByRole('button', { name: 'Delete' }),
      testResultSuccess: () => page.locator('.test-result.success'),
      testResultFailure: () => page.locator('.test-result.failure'),
      errorMessage: () => page.locator('.error-message'),
    },

    tabs: {
      bar: () => page.locator('.tabbar'),
      tab: (name: string) => page.getByRole('tab', { name: new RegExp(name, 'i') }),
      activeTab: () => page.locator('.tab.active'),
      newTabButton: () => page.locator('.new-tab-btn'),
    },

    query: {
      editor: () => page.locator('.cm-editor'),
      editorContent: () => page.locator('.cm-content'),
      executeButton: () => page.locator('.execute-btn'),
      cancelButton: () => page.locator('.cancel-btn'),
      errorDisplay: () => page.locator('.error-display'),
    },

    results: {
      gridViewport: () => page.locator('.grid-viewport'),
      gridHeader: () => page.locator('.grid-header'),
      gridRow: (index: number) => page.locator('.grid-row').nth(index),
      gridCell: () => page.locator('.grid-cell'),
      viewSelector: () => page.locator('.view-selector'),
      pagination: () => page.locator('.grid-pagination'),
    },

    notifications: {
      container: () => page.locator('.notifications'),
      notification: () => page.locator('.notification'),
    },

    statusBar: {
      root: () => page.locator('.statusbar'),
    },
  };
}

export type Selectors = ReturnType<typeof selectors>;
