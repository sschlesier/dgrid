import { type Page } from '@playwright/test';

/** Centralized UI selectors for E2E tests. Add new selectors here, don't inline them in specs. */
export function selectors(page: Page) {
  return {
    header: {
      root: () => page.locator('header.header'),
      newConnectionButton: () => page.getByTitle('Add new connection'),
      helpButton: () => page.getByTitle('Keyboard Shortcuts (?)'),
      title: () => page.locator('.app-title'),
    },

    sidebar: {
      root: () => page.locator('aside.sidebar'),
      tree: () => page.locator('[role="tree"]'),
      treeItem: (name: string) => page.locator('[role="treeitem"]', { hasText: name }),
      emptyState: () => page.locator('aside.sidebar .empty-state'),
      actionButton: (title: string) => page.locator(`.action-btn[title="${title}"]`),
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
      closeButton: (name: string) =>
        page.getByRole('tab', { name: new RegExp(name, 'i') }).locator('.tab-close'),
      newTabButton: () => page.locator('.new-tab-btn'),
    },

    query: {
      editor: () => page.locator('.cm-editor'),
      editorContent: () => page.locator('.cm-content'),
      executeButton: () => page.locator('.execute-btn'),
      cancelButton: () => page.locator('.cancel-btn'),
      errorDisplay: () => page.locator('.error-display'),
      autocomplete: () => page.locator('.cm-tooltip-autocomplete'),
      autocompleteOption: (label: string) =>
        page.locator('.cm-tooltip-autocomplete .cm-completionLabel', { hasText: label }),
    },

    results: {
      gridViewport: () => page.locator('.grid-viewport'),
      gridHeader: () => page.locator('.grid-header'),
      gridRow: (index: number) => page.locator('.grid-row').nth(index),
      gridCell: () => page.locator('.grid-cell'),
      viewSelector: () => page.locator('.view-selector'),
      viewButton: (name: string) => page.locator(`.view-btn[title="${name} View"]`),
      pagination: () => page.locator('.pagination'),
      paginationCount: () => page.locator('.pagination .count'),
      pageInfo: () => page.locator('.page-info'),
      nextPageButton: () => page.locator('.page-nav .nav-btn[title="Next page"]'),
      prevPageButton: () => page.locator('.page-nav .nav-btn[title="Previous page"]'),
      jsonView: () => page.locator('.json-view'),
      treeView: () => page.locator('.tree-view'),
      exportButton: () => page.locator('.export-csv-btn', { hasText: 'Export CSV' }),
    },

    notifications: {
      container: () => page.locator('.notifications'),
      notification: () => page.locator('.notification'),
    },

    statusBar: {
      root: () => page.locator('.statusbar'),
      center: () => page.locator('.statusbar-center'),
    },

    shortcutsModal: {
      overlay: () => page.locator('.modal-overlay'),
      modal: () => page.locator('.modal-overlay .modal'),
      heading: () => page.locator('.modal-header h2'),
      closeButton: () => page.locator('.modal-header .close-btn'),
    },

    editDialog: {
      overlay: () =>
        page
          .locator('.dialog-overlay')
          .filter({ has: page.locator('h2', { hasText: 'Edit Field' }) }),
      fieldPath: () => page.locator('.field-path-display'),
      typeSelect: () => page.locator('#field-type'),
      valueInput: () => page.locator('#field-value'),
      saveButton: () => page.locator('.save-btn'),
      cancelButton: () => page.locator('.dialog-footer .cancel-btn'),
    },

    exportOverlay: {
      overlay: () => page.locator('.export-overlay'),
      status: () => page.locator('.export-status'),
      cancelButton: () => page.locator('.export-overlay .cancel-btn'),
    },

    history: {
      toolbarButton: () => page.locator('.toolbar-btn', { hasText: 'History' }),
      dropdown: () => page.locator('.history-dropdown'),
      item: () => page.locator('.history-item'),
      itemQuery: () => page.locator('.item-query'),
      clearButton: () => page.locator('.clear-btn'),
      emptyState: () => page.locator('.empty-history'),
    },
  };
}

export type Selectors = ReturnType<typeof selectors>;
