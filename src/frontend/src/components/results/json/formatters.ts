// JSON formatters for MongoDB documents

export type JsonFormat = 'mongodb-shell' | 'pure-json' | 'mongoexport' | 'relaxed-ejson';

interface SerializedBsonValue {
  _type: string;
  _value: string;
}

function isSerializedBson(value: unknown): value is SerializedBsonValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_type' in value &&
    '_value' in value &&
    typeof (value as SerializedBsonValue)._type === 'string' &&
    typeof (value as SerializedBsonValue)._value === 'string'
  );
}

// Format value for MongoDB Shell format (ObjectId("..."), ISODate("..."))
function formatValueForShell(value: unknown): unknown {
  if (isSerializedBson(value)) {
    switch (value._type) {
      case 'ObjectId':
        return `__OBJECTID__${value._value}__`;
      case 'Date':
        return `__ISODATE__${value._value}__`;
      case 'UUID':
        return `__UUID__${value._value}__`;
      case 'Binary':
        return `__BINDATA__${value._value}__`;
      case 'Decimal128':
        return `__NUMBERDECIMAL__${value._value}__`;
      case 'Long':
        return `__NUMBERLONG__${value._value}__`;
    }
  }

  if (Array.isArray(value)) {
    return value.map(formatValueForShell);
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = formatValueForShell(v);
    }
    return result;
  }

  return value;
}

// Post-process JSON string to replace placeholders with MongoDB shell syntax
function postProcessShellFormat(json: string): string {
  return json
    .replace(/"__OBJECTID__([^_]+)__"/g, 'ObjectId("$1")')
    .replace(/"__ISODATE__([^_]+)__"/g, 'ISODate("$1")')
    .replace(/"__UUID__([^_]+)__"/g, 'UUID("$1")')
    .replace(/"__BINDATA__([^_]+)__"/g, 'BinData(0, "$1")')
    .replace(/"__NUMBERDECIMAL__([^_]+)__"/g, 'NumberDecimal("$1")')
    .replace(/"__NUMBERLONG__([^_]+)__"/g, 'NumberLong("$1")');
}

// Format value for Extended JSON ({"$oid": "..."})
function formatValueForEjson(value: unknown): unknown {
  if (isSerializedBson(value)) {
    switch (value._type) {
      case 'ObjectId':
        return { $oid: value._value };
      case 'Date':
        return { $date: value._value };
      case 'UUID':
        return { $uuid: value._value };
      case 'Binary':
        return { $binary: { base64: value._value, subType: '00' } };
      case 'Decimal128':
        return { $numberDecimal: value._value };
      case 'Long':
        return { $numberLong: value._value };
    }
  }

  if (Array.isArray(value)) {
    return value.map(formatValueForEjson);
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = formatValueForEjson(v);
    }
    return result;
  }

  return value;
}

// Format value for Relaxed EJSON (human-readable dates)
function formatValueForRelaxedEjson(value: unknown): unknown {
  if (isSerializedBson(value)) {
    switch (value._type) {
      case 'ObjectId':
        return { $oid: value._value };
      case 'Date':
        // Use ISO string for readability
        return { $date: new Date(value._value).toISOString() };
      case 'UUID':
        return { $uuid: value._value };
      case 'Binary':
        return { $binary: { base64: value._value, subType: '00' } };
      case 'Decimal128':
        return { $numberDecimal: value._value };
      case 'Long': {
        // Parse as number if safe
        const num = parseInt(value._value, 10);
        if (Number.isSafeInteger(num)) {
          return num;
        }
        return { $numberLong: value._value };
      }
    }
  }

  if (Array.isArray(value)) {
    return value.map(formatValueForRelaxedEjson);
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = formatValueForRelaxedEjson(v);
    }
    return result;
  }

  return value;
}

/**
 * Format a document as MongoDB Shell format
 * ObjectId("..."), ISODate("..."), etc.
 */
export function formatMongoShell(doc: Record<string, unknown>): string {
  const transformed = formatValueForShell(doc);
  const json = JSON.stringify(transformed, null, 2);
  return postProcessShellFormat(json);
}

/**
 * Format a document as pure Extended JSON
 * {"$oid": "..."}, {"$date": "..."}, etc.
 */
export function formatPureJson(doc: Record<string, unknown>): string {
  const transformed = formatValueForEjson(doc);
  return JSON.stringify(transformed, null, 2);
}

/**
 * Format a document for mongoexport (compact, one line)
 */
export function formatMongoexport(doc: Record<string, unknown>): string {
  const transformed = formatValueForEjson(doc);
  return JSON.stringify(transformed);
}

/**
 * Format a document as Relaxed Extended JSON
 * Human-readable dates, numbers parsed when safe
 */
export function formatRelaxedEjson(doc: Record<string, unknown>): string {
  const transformed = formatValueForRelaxedEjson(doc);
  return JSON.stringify(transformed, null, 2);
}

/**
 * Format a document using the specified format
 */
export function formatDocument(doc: Record<string, unknown>, format: JsonFormat): string {
  switch (format) {
    case 'mongodb-shell':
      return formatMongoShell(doc);
    case 'pure-json':
      return formatPureJson(doc);
    case 'mongoexport':
      return formatMongoexport(doc);
    case 'relaxed-ejson':
      return formatRelaxedEjson(doc);
  }
}

/**
 * Format multiple documents
 */
export function formatDocuments(docs: Record<string, unknown>[], format: JsonFormat): string {
  if (format === 'mongoexport') {
    // One document per line for mongoexport
    return docs.map((doc) => formatMongoexport(doc)).join('\n');
  }

  // For other formats, format each document with separators
  return docs.map((doc) => formatDocument(doc, format)).join('\n\n');
}

// Format labels for display
export const FORMAT_LABELS: Record<JsonFormat, string> = {
  'mongodb-shell': 'MongoDB Shell',
  'pure-json': 'Extended JSON',
  mongoexport: 'mongoexport',
  'relaxed-ejson': 'Relaxed EJSON',
};

// localStorage key for persisted format preference
const JSON_FORMAT_KEY = 'dgrid-json-format';

export function loadJsonFormat(): JsonFormat {
  try {
    const stored = localStorage.getItem(JSON_FORMAT_KEY);
    if (stored && stored in FORMAT_LABELS) {
      return stored as JsonFormat;
    }
  } catch {
    // Ignore storage errors
  }
  return 'mongodb-shell';
}

export function saveJsonFormat(format: JsonFormat): void {
  try {
    localStorage.setItem(JSON_FORMAT_KEY, format);
  } catch {
    // Ignore storage errors
  }
}
