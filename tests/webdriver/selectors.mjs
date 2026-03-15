function quoteXPath(text) {
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  return `concat('${text.split("'").join(`', "'", '`)}')`;
}

export const selectors = {
  header: {
    root: () => $('header.header'),
    newConnectionButton: () => $('[title="Add new connection"]'),
    helpButton: () => $('.help-btn'),
    updateBadge: () => $('.update-badge'),
  },

  sidebar: {
    emptyState: () => $('aside.sidebar .empty-state'),
    treeItem: (name) =>
      $(`//*[@role="treeitem"][contains(normalize-space(.), ${quoteXPath(name)})]`),
  },

  connectionDialog: {
    overlay: () => $('.dialog-overlay'),
    nameInput: () => $('#name'),
    hostInput: () => $('#host'),
    portInput: () => $('#port'),
    testButton: () => $('button=Test Connection'),
    saveButton: () => $('button=Save'),
    uriTab: () => $('[data-testid="uri-tab"]'),
    uriInput: () => $('[data-testid="uri-input"]'),
    testResultSuccess: () => $('.test-result.success'),
    testResultFailure: () => $('.test-result.failure'),
  },

  shortcutsModal: {
    modal: () => $('.modal-overlay .modal'),
    heading: () => $('.modal-header h2'),
  },

  query: {
    editorContainer: () => $('.editor-container'),
    editorContent: () => $('.cm-content'),
    executeButton: () => $('.execute-btn.split-main'),
    errorDisplay: () => $('.error-display'),
    autocomplete: () => $('.cm-tooltip-autocomplete'),
    autocompleteOption: (label) =>
      $(
        `//*[contains(@class, "cm-tooltip-autocomplete")]//*[contains(@class, "cm-completionLabel")][contains(normalize-space(.), ${quoteXPath(label)})]`
      ),
    autocompleteSelectedOption: () =>
      $('.cm-tooltip-autocomplete [aria-selected="true"] .cm-completionLabel'),
  },

  tabs: {
    bar: () => $('.tabbar'),
    all: () => $$('.tabbar [role="tab"]'),
    tab: (name) => $(`//*[@role="tab"][contains(normalize-space(.), ${quoteXPath(name)})]`),
    activeTab: () => $('.tab.active'),
    closeButton: (name) =>
      $(`//*[@role="tab"][contains(normalize-space(.), ${quoteXPath(name)})]//*[contains(@class, "tab-close")]`),
    newTabButton: () => $('.new-tab-btn'),
  },

  results: {
    gridViewport: () => $('.grid-viewport'),
    gridRow: (index) => $(`.grid-row[data-row-index="${index}"]`),
    gridCell: () => $$('.grid-cell'),
    gridCellWithText: (text) => $(`//*[contains(@class, "grid-cell")]//*[contains(normalize-space(.), ${quoteXPath(text)})]/ancestor::*[contains(@class, "grid-cell")]`),
    pagination: () => $('.pagination'),
    paginationCount: () => $('.pagination .count'),
    pageInfo: () => $('.page-info'),
    nextPageButton: () => $('.page-nav .nav-btn[title="Next page"]'),
  },

  contextMenu: {
    menu: () => $('.context-menu'),
    item: (label) =>
      $(
        `//*[contains(@class, "context-menu")]//button[contains(@class, "context-menu-item")][normalize-space(.)=${quoteXPath(label)}]`
      ),
    separator: () => $('.context-menu-separator'),
  },

  editDialog: {
    overlay: () => $(`//div[contains(@class, "dialog-overlay")][.//h2[normalize-space(.)='Edit Field']]`),
    fieldPath: () => $('.field-path-display'),
    typeSelect: () => $('#field-type'),
    valueInput: () => $('#field-value'),
    saveButton: () => $('.save-btn'),
    cancelButton: () => $('.dialog-footer .cancel-btn'),
  },

  statusBar: {
    center: () => $('.statusbar-center'),
  },
};
