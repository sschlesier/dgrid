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
    actionButton: (title) => $(`.action-btn[title="${title}"]`),
  },

  connectionDialog: {
    overlay: () => $('.dialog-overlay'),
    dialog: () => $('.dialog'),
    heading: () => $('.dialog-header h2'),
    nameInput: () => $('#name'),
    hostInput: () => $('#host'),
    portInput: () => $('#port'),
    testButton: () => $('button=Test Connection'),
    saveButton: () => $('button=Save'),
    deleteButton: () => $('button=Delete'),
    uriTab: () => $('[data-testid="uri-tab"]'),
    uriInput: () => $('[data-testid="uri-input"]'),
    testResultSuccess: () => $('.test-result.success'),
    testResultFailure: () => $('.test-result.failure'),
  },

  shortcutsModal: {
    overlay: () => $('.modal-overlay'),
    modal: () => $('.modal-overlay .modal'),
    heading: () => $('.modal-header h2'),
    shortcutKeys: (id) => $(`[data-testid="shortcut-keys-${id}"]`),
    captureZone: () => $('[data-testid="capture-zone"]'),
    resetButton: (id) => $(`[data-testid="reset-${id}"]`),
  },

  query: {
    editorContainer: () => $('.editor-container'),
    editorContent: () => $('.cm-content'),
    executeButton: () => $('.execute-btn.split-main'),
    executeDropdownToggle: () => $('.execute-btn.split-dropdown'),
    executeDropdown: () => $('.execute-dropdown'),
    executeDropdownItem: (label) =>
      $(
        `//*[contains(@class, "execute-dropdown")]//*[contains(@class, "dropdown-item")][.//*[contains(normalize-space(.), ${quoteXPath(label)})]]`
      ),
    errorDisplay: () => $('.error-display'),
    subResultTabs: () => $('.sub-result-tabs'),
    subResultTab: (index) => $$('.sub-result-tab')[index],
    subResultTabWithError: () => $('.sub-result-tab.has-error'),
    autocomplete: () => $('.cm-tooltip-autocomplete'),
    autocompleteOption: (label) =>
      $(
        `//*[contains(@class, "cm-tooltip-autocomplete")]//*[contains(@class, "cm-completionLabel")][contains(normalize-space(.), ${quoteXPath(label)})]`
      ),
    autocompleteSelectedOption: () =>
      $('.cm-tooltip-autocomplete [aria-selected="true"] .cm-completionLabel'),
    formatButton: () => $('.toolbar-btn[title*="Format Query"]'),
    formatAssist: () => $('.format-assist'),
    formatAssistSuggestion: (label) =>
      $(
        `//*[contains(@class, "format-assist")]//button[contains(@class, "format-assist-btn")][normalize-space(.)=${quoteXPath(label)}]`
      ),
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
    container: () => $('.results-container'),
    gridViewport: () => $('.grid-viewport'),
    gridRow: (index) => $(`.grid-row[data-row-index="${index}"]`),
    gridCell: () => $$('.grid-cell'),
    gridCellWithText: (text) => $(`//*[contains(@class, "grid-cell")]//*[contains(normalize-space(.), ${quoteXPath(text)})]/ancestor::*[contains(@class, "grid-cell")]`),
    viewSelector: () => $('.view-selector'),
    viewButton: (name) => $(`.view-btn[title="${name} View"]`),
    pagination: () => $('.pagination'),
    paginationCount: () => $('.pagination .count'),
    pageInfo: () => $('.page-info'),
    nextPageButton: () => $('.page-nav .nav-btn[title="Next page"]'),
    jsonView: () => $('.json-view'),
    treeView: () => $('.tree-view'),
    exportButton: () => $('.export-csv-btn'),
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
    missingIdWarning: () => $('[data-testid="edit-warning-missing-id"]'),
    idManipulatedWarning: () => $('[data-testid="edit-warning-id-manipulated"]'),
    updatePreview: () => $('[data-testid="update-preview"]'),
    copyPreviewButton: () => $('.copy-preview-btn'),
  },

  exportOverlay: {
    overlay: () => $('.export-overlay'),
    status: () => $('.export-status'),
    cancelButton: () => $('.export-overlay .cancel-btn'),
  },

  statusBar: {
    center: () => $('.statusbar-center'),
  },

  notification: {
    all: () => $$('.notification'),
    message: () => $$('.notification .notification-message'),
    withText: (text) =>
      $(`//*[contains(@class, "notification")]//*[contains(@class, "notification-message")][contains(normalize-space(.), ${quoteXPath(text)})]`),
  },

  tooltip: {
    collection: () => $('.collection-tooltip'),
  },

  history: {
    toolbarButton: () =>
      $(`//*[contains(@class, "toolbar-btn")][.//*[contains(normalize-space(.), ${quoteXPath('History')})]]`),
    dropdown: () => $('.history-dropdown'),
    item: () => $$('.history-item'),
    itemQuery: () => $$('.item-query'),
    clearButton: () => $('.clear-btn'),
    emptyState: () => $('.empty-history'),
  },
};
