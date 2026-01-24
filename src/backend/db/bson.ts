import { ObjectId, Binary, Decimal128, Long, UUID, Document } from 'mongodb';

export interface SerializedValue {
  _type: 'ObjectId' | 'Date' | 'Binary' | 'Decimal128' | 'Long' | 'UUID';
  _value: string;
}

type SerializedDocument = Record<string, unknown>;

function isSerializedValue(value: unknown): value is SerializedValue {
  return typeof value === 'object' && value !== null && '_type' in value && '_value' in value;
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof ObjectId) {
    return { _type: 'ObjectId', _value: value.toHexString() } as SerializedValue;
  }

  if (value instanceof Date) {
    return { _type: 'Date', _value: value.toISOString() } as SerializedValue;
  }

  if (value instanceof UUID) {
    return { _type: 'UUID', _value: value.toString() } as SerializedValue;
  }

  if (value instanceof Binary) {
    return { _type: 'Binary', _value: value.toString('base64') } as SerializedValue;
  }

  if (value instanceof Decimal128) {
    return { _type: 'Decimal128', _value: value.toString() } as SerializedValue;
  }

  if (value instanceof Long) {
    return { _type: 'Long', _value: value.toString() } as SerializedValue;
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === 'object') {
    return serializeDocument(value as Document);
  }

  return value;
}

function deserializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (isSerializedValue(value)) {
    switch (value._type) {
      case 'ObjectId':
        return new ObjectId(value._value);
      case 'Date':
        return new Date(value._value);
      case 'Binary':
        return new Binary(Buffer.from(value._value, 'base64'));
      case 'Decimal128':
        return Decimal128.fromString(value._value);
      case 'Long':
        return Long.fromString(value._value);
      case 'UUID':
        return new UUID(value._value);
    }
  }

  if (Array.isArray(value)) {
    return value.map(deserializeValue);
  }

  if (typeof value === 'object') {
    return deserializeDocument(value as SerializedDocument);
  }

  return value;
}

export function serializeDocument(doc: Document): SerializedDocument {
  const result: SerializedDocument = {};

  for (const [key, value] of Object.entries(doc)) {
    result[key] = serializeValue(value);
  }

  return result;
}

export function deserializeDocument(doc: SerializedDocument): Document {
  const result: Document = {};

  for (const [key, value] of Object.entries(doc)) {
    result[key] = deserializeValue(value);
  }

  return result;
}
