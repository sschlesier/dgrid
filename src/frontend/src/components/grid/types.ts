// Grid Types

// BSON types that use the {_type, _value} pattern
export type BsonType = 'ObjectId' | 'Date' | 'Binary' | 'Decimal128' | 'Long' | 'UUID';

// All cell types the grid can render
export type CellType =
  | BsonType
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'undefined'
  | 'Array'
  | 'Object';

// Column definition
export interface GridColumn {
  key: string;
  label: string;
  width: number;
  type?: CellType;
  sortable?: boolean;
}

// Sort state
export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

// Drill-down state for navigating nested structures
export interface DrilldownState {
  path: string[]; // Current path e.g., ["address", "city"]
  history: string[][]; // Navigation history for back/forward
  historyIndex: number; // Current position in history
}

// Per-tab grid state
export interface GridState {
  columns: GridColumn[];
  columnWidths: Record<string, number>; // Persisted widths
  sort: SortState;
  drilldown: DrilldownState;
  pageSize: 50 | 100 | 250 | 500;
}

// Serialized BSON value (matches backend/db/bson.ts)
export interface SerializedBsonValue {
  _type: BsonType;
  _value: string;
}

// Document with preserved ID for drill-down context
export interface DrilldownDocument {
  _docId?: unknown; // Original document ID for context
  _docIndex?: number; // Original document index
  [key: string]: unknown;
}
