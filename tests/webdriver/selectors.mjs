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
    editorContent: () => $('.cm-content'),
    executeButton: () => $('.execute-btn.split-main'),
    errorDisplay: () => $('.error-display'),
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
    pagination: () => $('.pagination'),
    paginationCount: () => $('.pagination .count'),
    pageInfo: () => $('.page-info'),
    nextPageButton: () => $('.page-nav .nav-btn[title="Next page"]'),
  },

  statusBar: {
    center: () => $('.statusbar-center'),
  },
};
