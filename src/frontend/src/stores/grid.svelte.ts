// Grid Store - Per-tab grid state management with Svelte 5 runes

import type {
  GridState,
  GridColumn,
  SortDirection,
  DrilldownState,
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
  };
}

class GridStore {
  // Per-tab state
  states = $state<Map<string, GridState>>(new Map());

  // Get or create state for a tab
  getState(tabId: string): GridState {
    let state = this.states.get(tabId);
    if (!state) {
      state = createInitialState();
      const newStates = new Map(this.states);
      newStates.set(tabId, state);
      this.states = newStates;
    }
    return state;
  }

  // Update state for a tab
  private updateState(tabId: string, updates: Partial<GridState>): void {
    const state = this.getState(tabId);
    const newStates = new Map(this.states);
    newStates.set(tabId, { ...state, ...updates });
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
    this.updateState(tabId, { pageSize });
  }

  // Reset grid state for a tab (e.g., when running a new query)
  resetState(tabId: string): void {
    const state = this.getState(tabId);
    this.updateState(tabId, {
      columns: [],
      sort: { column: null, direction: null },
      drilldown: {
        path: [],
        history: [[]],
        historyIndex: 0,
      },
      // Keep pageSize and columnWidths
      pageSize: state.pageSize,
      columnWidths: state.columnWidths,
    });
  }

  // Clean up tab state when tab is closed
  cleanupTab(tabId: string): void {
    const newStates = new Map(this.states);
    newStates.delete(tabId);
    this.states = newStates;
  }
}

// Singleton instance
export const gridStore = new GridStore();
