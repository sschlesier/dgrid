import { describe, expect, it } from 'vitest';
import { applyFormatSuggestion, formatQueryText } from '../lib/queryFormatter';

describe('formatQueryText', () => {
  it('formats a mongo shell statement with prettier javascript rules', async () => {
    const result = await formatQueryText('db.users.find({foo:1,bar:{$gt:2}}).sort({createdAt:-1})');

    expect(result).toEqual({
      ok: true,
      formatted: 'db.users.find({ foo: 1, bar: { $gt: 2 } }).sort({ createdAt: -1 });',
    });
  });

  it('formats expression fragments by retrying as a wrapped expression', async () => {
    const result = await formatQueryText('{foo:1,bar:[1,2,3]}');

    expect(result).toEqual({
      ok: true,
      formatted: '{ foo: 1, bar: [1, 2, 3] }',
    });
  });

  it('returns a failure for invalid javascript', async () => {
    const result = await formatQueryText('db.users.find({ foo: })');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        'Line 1, column 23: query could not be formatted because the syntax is incomplete or invalid'
      );
      expect(result.suggestions).toEqual([]);
    }
  });

  it('reports missing stage delimiters clearly for incomplete aggregate pipelines', async () => {
    const result = await formatQueryText(`db.data.aggregate([
  {$match: { elevation: { $gt: 5000 } }},
  {$project: { _id: 0 }
   ]})`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Line 4, column 4: query is incomplete: expected `}` before `]`');
      expect(result.suggestions).toEqual([
        {
          id: 'insert-}-89',
          label: 'Insert }',
          description: 'Insert the missing `}` before `]`.',
          from: 89,
          to: 89,
          insert: '}',
        },
      ]);
    }
  });

  it('suggests removing unexpected closing delimiters', async () => {
    const result = await formatQueryText('db.users.find({})])');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Line 1, column 19: unexpected closing `]`');
      expect(result.suggestions[0]).toMatchObject({
        label: 'Remove ]',
        from: 17,
        to: 18,
        insert: '',
      });
    }
  });

  it('can apply a suggested text edit', () => {
    const repaired = applyFormatSuggestion('db.users.find({})])', {
      id: 'remove-]-17',
      label: 'Remove ]',
      description: 'Delete the unexpected closing `]`.',
      from: 17,
      to: 18,
      insert: '',
    });

    expect(repaired).toBe('db.users.find({}))');
  });
});
