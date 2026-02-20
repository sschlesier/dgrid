import { describe, it, expect } from 'vitest';
import { splitQueries, findSliceAtOffset, findSlicesInSelection } from '../querySplitter';

describe('splitQueries', () => {
  it('returns empty array for empty input', () => {
    expect(splitQueries('')).toEqual([]);
    expect(splitQueries('   ')).toEqual([]);
    expect(splitQueries('\n\n')).toEqual([]);
  });

  it('returns single slice for a single query', () => {
    const text = 'db.users.find({})';
    const slices = splitQueries(text);
    expect(slices).toHaveLength(1);
    expect(slices[0].text).toBe('db.users.find({})');
    expect(slices[0].startLine).toBe(0);
    expect(slices[0].endLine).toBe(0);
    expect(slices[0].startOffset).toBe(0);
    expect(slices[0].endOffset).toBe(text.length);
  });

  it('splits two queries on separate lines', () => {
    const text = 'db.users.find({})\ndb.orders.find({})';
    const slices = splitQueries(text);
    expect(slices).toHaveLength(2);
    expect(slices[0].text).toBe('db.users.find({})');
    expect(slices[1].text).toBe('db.orders.find({})');
  });

  it('handles multi-line chained queries', () => {
    const text = `db.users.find({})
  .sort({ name: 1 })
  .limit(10)
db.orders.find({})`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(2);
    expect(slices[0].text).toBe('db.users.find({})\n  .sort({ name: 1 })\n  .limit(10)');
    expect(slices[1].text).toBe('db.orders.find({})');
    expect(slices[0].startLine).toBe(0);
    expect(slices[0].endLine).toBe(2);
    expect(slices[1].startLine).toBe(3);
    expect(slices[1].endLine).toBe(3);
  });

  it('handles blank lines between queries', () => {
    const text = `db.users.find({})

db.orders.find({})`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(2);
    expect(slices[0].text).toBe('db.users.find({})');
    expect(slices[1].text).toBe('db.orders.find({})');
  });

  it('handles comment lines between queries', () => {
    const text = `db.users.find({})
// find all orders
db.orders.find({})`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(2);
    expect(slices[0].text).toBe('db.users.find({})\n// find all orders');
    expect(slices[1].text).toBe('db.orders.find({})');
  });

  it('handles bracket notation db["collection"]', () => {
    const text = `db["users"].find({})
db['orders'].find({})`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(2);
    expect(slices[0].text).toBe('db["users"].find({})');
    expect(slices[1].text).toBe("db['orders'].find({})");
  });

  it('handles getCollection syntax', () => {
    const text = `db.getCollection('users').find({})
db.getCollection("orders").find({})`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(2);
    expect(slices[0].text).toBe("db.getCollection('users').find({})");
    expect(slices[1].text).toBe('db.getCollection("orders").find({})');
  });

  it('tracks offsets accurately', () => {
    const line1 = 'db.users.find({})';
    const line2 = 'db.orders.find({})';
    const text = `${line1}\n${line2}`;
    const slices = splitQueries(text);

    expect(slices[0].startOffset).toBe(0);
    expect(slices[0].endOffset).toBe(line1.length + 1); // +1 for newline
    expect(slices[1].startOffset).toBe(line1.length + 1);
    expect(slices[1].endOffset).toBe(text.length);
  });

  it('handles three queries', () => {
    const text = `db.a.find({})
db.b.find({})
db.c.find({})`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(3);
    expect(slices[0].text).toBe('db.a.find({})');
    expect(slices[1].text).toBe('db.b.find({})');
    expect(slices[2].text).toBe('db.c.find({})');
  });

  it('handles leading blank lines', () => {
    const text = `\n\ndb.users.find({})`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(1);
    expect(slices[0].text).toBe('db.users.find({})');
    expect(slices[0].startLine).toBe(2);
  });

  it('handles trailing blank lines', () => {
    const text = `db.users.find({})\n\n`;
    const slices = splitQueries(text);
    expect(slices).toHaveLength(1);
    expect(slices[0].text).toBe('db.users.find({})');
  });
});

describe('findSliceAtOffset', () => {
  it('returns the slice containing the cursor offset', () => {
    const text = 'db.users.find({})\ndb.orders.find({})';
    const slices = splitQueries(text);

    expect(findSliceAtOffset(slices, 5)?.text).toBe('db.users.find({})');
    expect(findSliceAtOffset(slices, 20)?.text).toBe('db.orders.find({})');
  });

  it('returns null for empty slices', () => {
    expect(findSliceAtOffset([], 0)).toBeNull();
  });

  it('returns last slice when offset is past all slices', () => {
    const slices = splitQueries('db.users.find({})');
    expect(findSliceAtOffset(slices, 1000)?.text).toBe('db.users.find({})');
  });
});

describe('findSlicesInSelection', () => {
  it('returns slices wholly within selection', () => {
    const text = 'db.users.find({})\ndb.orders.find({})\ndb.items.find({})';
    const slices = splitQueries(text);

    // Select just the second query
    const selected = findSlicesInSelection(slices, slices[1].startOffset, slices[1].endOffset);
    expect(selected).toHaveLength(1);
    expect(selected[0].text).toBe('db.orders.find({})');
  });

  it('returns multiple slices within selection', () => {
    const text = 'db.users.find({})\ndb.orders.find({})\ndb.items.find({})';
    const slices = splitQueries(text);

    // Select all three
    const selected = findSlicesInSelection(slices, 0, text.length);
    expect(selected).toHaveLength(3);
  });

  it('excludes partially selected slices', () => {
    const text = 'db.users.find({})\ndb.orders.find({})';
    const slices = splitQueries(text);

    // Select only part of the first query
    const selected = findSlicesInSelection(slices, 0, 5);
    expect(selected).toHaveLength(0);
  });
});
