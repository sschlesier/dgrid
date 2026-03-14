import { describe, it, expect } from 'vitest';
import { buildEditPreview } from '../lib/editPreview';

describe('buildEditPreview', () => {
  it('renders a Mongo shell update preview with BSON values', () => {
    const result = buildEditPreview({
      collection: 'items',
      docId: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
      fieldPath: 'createdAt',
      value: { _type: 'Date', _value: '2024-01-15T10:30:00.000Z' },
      queryText: 'db.items.find({})',
    });

    expect(result.previewText).toContain('db.items.updateOne(');
    expect(result.previewText).toContain('ObjectId("507f1f77bcf86cd799439011")');
    expect(result.previewText).toContain('"createdAt": ISODate("2024-01-15T10:30:00.000Z")');
    expect(result.missingId).toBe(false);
    expect(result.idManipulationWarning).toBe(false);
  });

  it('marks missing _id as a blocking warning', () => {
    const result = buildEditPreview({
      collection: 'items',
      docId: undefined,
      fieldPath: 'name',
      value: 'Updated',
      queryText: 'db.items.find({}, { name: 1, _id: 0 })',
    });

    expect(result.missingId).toBe(true);
    expect(result.missingIdMessage).toContain('no source `_id`');
    expect(result.previewText).toContain('<missing _id>');
    expect(result.idManipulationWarning).toBe(false);
  });

  it('warns when a find projection explicitly excludes _id', () => {
    const result = buildEditPreview({
      collection: 'items',
      docId: 'abc123',
      fieldPath: 'name',
      value: 'Updated',
      queryText: 'db.items.find({}, { name: 1, _id: 0 })',
    });

    expect(result.idManipulationWarning).toBe(true);
    expect(result.idManipulationMessage).toContain('changes `_id`');
  });

  it('does not warn when _id is only used in a filter', () => {
    const result = buildEditPreview({
      collection: 'items',
      docId: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
      fieldPath: 'name',
      value: 'Updated',
      queryText: 'db.items.find({ _id: ObjectId("507f1f77bcf86cd799439011") })',
    });

    expect(result.idManipulationWarning).toBe(false);
  });

  it('warns when an aggregate pipeline groups documents', () => {
    const result = buildEditPreview({
      collection: 'items',
      docId: 'grouped-id',
      fieldPath: 'total',
      value: 10,
      queryText:
        'db.items.aggregate([{ $match: { active: true } }, { $group: { _id: "$status", total: { $sum: 1 } } }])',
    });

    expect(result.idManipulationWarning).toBe(true);
  });

  it('warns when aggregate stages rewrite _id explicitly', () => {
    const result = buildEditPreview({
      collection: 'items',
      docId: 'projected-id',
      fieldPath: 'name',
      value: 'Updated',
      queryText:
        'db.items.aggregate([{ $project: { _id: "$legacyId", name: 1 } }, { $set: { _id: "$name" } }])',
    });

    expect(result.idManipulationWarning).toBe(true);
  });
});
