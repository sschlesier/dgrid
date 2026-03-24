interface SerializedObjectIdLike {
  _type: string;
  _value: string;
}

const OBJECT_ID_HEX_RE = /^[0-9a-fA-F]{24}$/;

export function isObjectIdHex(value: string): boolean {
  return OBJECT_ID_HEX_RE.test(value);
}

export function getObjectIdDate(hex: string): Date | null {
  if (!isObjectIdHex(hex)) {
    return null;
  }

  const seconds = Number.parseInt(hex.slice(0, 8), 16);
  if (!Number.isFinite(seconds)) {
    return null;
  }

  return new Date(seconds * 1000);
}

export function formatObjectIdDateTooltip(hex: string): string | null {
  const date = getObjectIdDate(hex);
  if (!date) {
    return null;
  }

  return `Created: ${date.toISOString()}`;
}

export function getObjectIdDateTooltip(value: unknown): string | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    '_type' in value &&
    '_value' in value &&
    (value as SerializedObjectIdLike)._type === 'ObjectId' &&
    typeof (value as SerializedObjectIdLike)._value === 'string'
  ) {
    return formatObjectIdDateTooltip((value as SerializedObjectIdLike)._value);
  }

  return null;
}
