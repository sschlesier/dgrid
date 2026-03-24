import { describe, expect, it } from 'vitest';
import {
  formatObjectIdDateTooltip,
  getObjectIdDate,
  getObjectIdDateTooltip,
  isObjectIdHex,
} from '../lib/objectId';

describe('objectId utils', () => {
  it('detects valid ObjectId hex strings', () => {
    expect(isObjectIdHex('507f1f77bcf86cd799439011')).toBe(true);
    expect(isObjectIdHex('507F1F77BCF86CD799439011')).toBe(true);
  });

  it('rejects invalid ObjectId hex strings', () => {
    expect(isObjectIdHex('507f1f77bcf86cd79943901')).toBe(false);
    expect(isObjectIdHex('507f1f77bcf86cd79943901z')).toBe(false);
  });

  it('extracts the timestamp encoded in an ObjectId', () => {
    expect(getObjectIdDate('507f1f77bcf86cd799439011')?.toISOString()).toBe(
      '2012-10-17T21:13:27.000Z'
    );
  });

  it('formats a tooltip for a serialized ObjectId', () => {
    expect(getObjectIdDateTooltip({ _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' })).toBe(
      'Created: 2012-10-17T21:13:27.000Z'
    );
  });

  it('returns null for non-ObjectId values', () => {
    expect(getObjectIdDateTooltip({ _type: 'Date', _value: '2024-01-01T00:00:00.000Z' })).toBe(
      null
    );
    expect(formatObjectIdDateTooltip('not-an-object-id')).toBe(null);
  });
});
