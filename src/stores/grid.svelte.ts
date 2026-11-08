// Grid Store - Per-tab grid state management with Svelte 5 runes

import type {
  GridState,
  GridColumn,
  SortDirection,
  DrilldownState,
  ViewMode,
} from '../components/grid/types';

// localStorage key for persisted column widths
const COLUMN_WIDTHS_KEY = 'dgrid-grid-column-widths';

// Load persisted column widths
function loadColumnWidths(): Record<string, number> {
  try {
    const stored = localStorage.getItem(COLUMN_WIDTHS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

// Save column widths to localStorage
function saveColumnWidths(widths: Record<string, number>): void {
  try {
    localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths));
  } catch {
    // Ignore storage errors
  }
}

// Create initial grid state
function createInitialState(): GridState {
  return {
    columns: [],
    columnWidths: loadColumnWidths(),
    sort: { column: null, direction: null },
    drilldown: {
      path: [],
      history: [[]],
      historyIndex: 0,
    },
    pageSize: 50,
    viewMode: 'table',
    selectedRows: [],
    selectionAnchor: null,
  };
}

// Compound key for multi-query sub-result grid state
function gridKey(tabId: string, resultIndex = 0): string {
  return resultIndex === 0 ? tabId : `${tabId}:${resultIndex}`;
}

class GridStore {
  // Per-tab state
  states = $state<Map<string, GridState>>(new Map());

  // Get or create state for a tab (with optional sub-result index)
  getState(tabId: string, resultIndex = 0): GridState {
    const key = gridKey(tabId, resultIndex);
    let state = this.states.get(key);
    if (!state) {
      state = createInitialState();
      const newStates = new Map(this.states);
      newStates.set(key, state);
      this.states = newStates;
    }
    return state;
  }

  // Update state for a tab
  private updateState(tabId: string, updates: Partial<GridState>, resultIndex = 0): void {
    const key = gridKey(tabId, resultIndex);
    const state = this.getState(tabId, resultIndex);
    const newStates = new Map(this.states);
    newStates.set(key, { ...state, ...updates });
    this.states = newStates;
  }

  // Set columns for a tab
  setColumns(tabId: string, columns: GridColumn[]): void {
    const state = this.getState(tabId);
    // Apply persisted widths
    const columnsWithWidths = columns.map((col) => ({
      ...col,
      width: state.columnWidths[col.key] ?? col.width,
    }));
    this.updateState(tabId, { columns: columnsWithWidths });
  }

  // Get columns for a tab
  getColumns(tabId: string): GridColumn[] {
    return this.getState(tabId).columns;
  }

  // Update column width
  setColumnWidth(tabId: string, columnKey: string, width: number): void {
    const state = this.getState(tabId);

    // Update columns
    const columns = state.columns.map((col) => (col.key === columnKey ? { ...col, width } : col));

    // Persist width
    const columnWidths = { ...state.columnWidths, [columnKey]: width };
    saveColumnWidths(columnWidths);

    this.updateState(tabId, { columns, columnWidths });
  }

  // Sort state management
  getSort(tabId: string): { column: string | null; direction: SortDirection } {
    return this.getState(tabId).sort;
  }

  toggleSort(tabId: string, columnKey: string): void {
    const state = this.getState(tabId);
    const { sort } = state;

    let newDirection: SortDirection;
    if (sort.column !== columnKey) {
      newDirection = 'asc';
    } else if (sort.direction === 'asc') {
      newDirection = 'desc';
    } else {
      newDirection = null;
    }

    this.updateState(tabId, {
      sort: {
        column: newDirection ? columnKey : null,
        direction: newDirection,
      },
      selectedRows: [],
      selectionAnchor: null,
    });
  }

  // Drill-down navigation
  getDrilldownPath(tabId: string): string[] {
    return this.getState(tabId).drilldown.path;
  }

  getDrilldownState(tabId: string): DrilldownState {
    return this.getState(tabId).drilldown;
  }

  // Navigate into a nested field
  drillInto(tabId: string, field: string): void {
    const state = this.getState(tabId);
    const { drilldown } = state;

    const newPath = [...drilldown.path, field];

    // Truncate forward history if we're not at the end
    const newHistory = drilldown.history.slice(0, drilldown.historyIndex + 1);
    newHistory.push(newPath);

    this.updateState(tabId, {
      drilldown: {
        path: newPath,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      },
      // Reset sort when drilling
      sort: { column: null, direction: null },
      selectedRows: [],
      selectionAnchor: null,
    });
  }

  // Navigate back in drill-down history
  drillBack(tabId: string): boolean {
    const state = this.getState(tabId);
    const { drilldown } = state;

    if (drilldown.historyIndex <= 0) return false;

    const newIndex = drilldown.historyIndex - 1;
    this.updateState(tabId, {
      drilldown: {
        ...drilldown,
        path: drilldown.history[newIndex],
        historyIndex: newIndex,
      },
      sort: { column: null, direction: null },
      selectedRows: [],
      selectionAnchor: null,
    });

    return true;
  }

  // Navigate forward in drill-down history
  drillForward(tabId: string): boolean {
    const state = this.getState(tabId);
    const { drilldown } = state;

    if (drilldown.historyIndex >= drilldown.history.length - 1) return false;

    const newIndex = drilldown.historyIndex + 1;
    this.updateState(tabId, {
      drilldown: {
        ...drilldown,
        path: drilldown.history[newIndex],
        historyIndex: newIndex,
      },
      sort: { column: null, direction: null },
      selectedRows: [],
      selectionAnchor: null,
    });

    return true;
  }

  // Navigate to a specific path segment (breadcrumb click)
  drillToSegment(tabId: string, segmentIndex: number): void {
    const state = this.getState(tabId);
    const { drilldown } = state;

    // segmentIndex -1 means root (empty path)
    const newPath = segmentIndex < 0 ? [] : drilldown.path.slice(0, segmentIndex + 1);

    // Add to history
    const newHistory = drilldown.history.slice(0, drilldown.historyIndex + 1);
    newHistory.push(newPath);

    this.updateState(tabId, {
      drilldown: {
        path: newPath,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      },
      sort: { column: null, direction: null },
      selectedRows: [],
      selectionAnchor: null,
    });
  }

  // Reset to root level
  drillToRoot(tabId: string): void {
    this.drillToSegment(tabId, -1);
  }

  // Check if can go back/forward
  canDrillBack(tabId: string): boolean {
    const { drilldown } = this.getState(tabId);
    return drilldown.historyIndex > 0;
  }

  canDrillForward(tabId: string): boolean {
    const { drilldown } = this.getState(tabId);
    return drilldown.historyIndex < drilldown.history.length - 1;
  }

  // Page size management
  getPageSize(tabId: string): 50 | 100 | 250 | 500 {
    return this.getState(tabId).pageSize;
  }

  setPageSize(tabId: string, pageSize: 50 | 100 | 250 | 500): void {
    this.updateState(tabId, { pageSize, selectedRows: [], selectionAnchor: null });
  }

  // View mode management
  getViewMode(tabId: string): ViewMode {
    return this.getState(tabId).viewMode;
  }

  setViewMode(tabId: string, viewMode: ViewMode): void {
    this.updateState(tabId, { viewMode });
  }

  // Row selection (indexes into the displayed rows of the current page)
  getSelectedRows(tabId: string, resultIndex = 0): number[] {
    return this.getState(tabId, resultIndex).selectedRows;
  }

  isRowSelected(tabId: string, index: number, resultIndex = 0): boolean {
    return this.getState(tabId, resultIndex).selectedRows.includes(index);
  }

  // Plain click: select only this row
  selectRow(tabId: string, index: number, resultIndex = 0): void {
    this.updateState(tabId, { selectedRows: [index], selectionAnchor: index }, resultIndex);
  }

  // Cmd/Ctrl+click: toggle this row
  toggleRow(tabId: string, index: number, resultIndex = 0): void {
    const { selectedRows } = this.getState(tabId, resultIndex);
    const next = selectedRows.includes(index)
      ? selectedRows.filter((i) => i !== index)
      : [...selectedRows, index].sort((a, b) => a - b);
    this.updateState(tabId, { selectedRows: next, selectionAnchor: index }, resultIndex);
  }

  // Shift+click: select anchor..index, replacing the selection (anchor is kept)
  selectRange(tabId: string, index: number, resultIndex = 0): void {
    const { selectionAnchor } = this.getState(tabId, resultIndex);
    if (selectionAnchor === null) {
      this.selectRow(tabId, index, resultIndex);
      return;
    }
    const from = Math.min(selectionAnchor, index);
    const to = Math.max(selectionAnchor, index);
    const selectedRows = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    this.updateState(tabId, { selectedRows }, resultIndex);
  }

  selectAllRows(tabId: string, rowCount: number, resultIndex = 0): void {
    this.updateState(
      tabId,
      { selectedRows: Array.from({ length: rowCount }, (_, i) => i), selectionAnchor: null },
      resultIndex
    );
  }

  clearSelection(tabId: string, resultIndex = 0): void {
    const state = this.getState(tabId, resultIndex);
    if (state.selectedRows.length === 0 && state.selectionAnchor === null) return;
    this.updateState(tabId, { selectedRows: [], selectionAnchor: null }, resultIndex);
  }

  // Reset grid state for a tab (e.g., when running a new query)
  resetState(tabId: string, resultIndex = 0): void {
    const state = this.getState(tabId, resultIndex);
    this.updateState(
      tabId,
      {
        columns: [],
        sort: { column: null, direction: null },
        drilldown: {
          path: [],
          history: [[]],
          historyIndex: 0,
        },
        selectedRows: [],
        selectionAnchor: null,
        // Keep pageSize, columnWidths, and viewMode
        pageSize: state.pageSize,
        columnWidths: state.columnWidths,
        viewMode: state.viewMode,
      },
      resultIndex
    );
  }

  // Reset grid state for all sub-results of a multi-query execution
  resetAllSubResults(tabId: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.resetState(tabId, i);
    }
  }

  // Clean up tab state when tab is closed
  cleanupTab(tabId: string): void {
    const newStates = new Map(this.states);
    // Delete the primary key and any compound keys
    newStates.delete(tabId);
    for (const key of newStates.keys()) {
      if (key.startsWith(`${tabId}:`)) {
        newStates.delete(key);
      }
    }
    this.states = newStates;
  }
}

// Singleton instance
export const gridStore = new GridStore();
