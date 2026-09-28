import { describe, it, expect, afterEach } from 'vitest';
import { CompletionContext, closeBrackets, type Completion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { ensureSyntaxTree } from '@codemirror/language';
import { createFieldCompletionSource } from '../lib/fieldCompletion.js';
import { parseQuery } from '../lib/queries.js';

const FIELDS = ['_id', 'name', 'fee.foo', 'first-name', 'my field'];

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

/** Build a view from `doc`, where `|` marks the cursor. */
function createView(doc: string): EditorView {
  const cursor = doc.indexOf('|');
  const state = EditorState.create({
    doc: doc.replace('|', ''),
    selection: { anchor: cursor },
    extensions: [javascript(), closeBrackets()],
  });
  ensureSyntaxTree(state, state.doc.length);
  view = new EditorView({ state });
  return view;
}

/** Run the field source at the cursor and accept the option labelled `label`. */
function complete(doc: string, label: string): { text: string; cursor: number } {
  const v = createView(doc);
  const pos = v.state.selection.main.head;
  const result = createFieldCompletionSource(() => FIELDS)(
    new CompletionContext(v.state, pos, true)
  );
  if (!result || result instanceof Promise) throw new Error(`no completions at: ${doc}`);
  const option = result.options.find((o) => o.label === label);
  if (!option) throw new Error(`option ${label} not offered at: ${doc}`);

  if (typeof option.apply === 'function') option.apply(v, option, result.from, pos);
  else v.dispatch({ changes: { from: result.from, to: pos, insert: option.apply ?? label } });
  return { text: v.state.doc.toString(), cursor: v.state.selection.main.head };
}

/** Render text with `|` at the cursor. */
function withCursor({ text, cursor }: { text: string; cursor: number }): string {
  return `${text.slice(0, cursor)}|${text.slice(cursor)}`;
}

describe('field completion', () => {
  describe('outside strings', () => {
    it('quotes a dotted path and puts the cursor after the closing quote', () => {
      expect(withCursor(complete('db.c.find({ fee.f| })', 'fee.foo'))).toBe(
        'db.c.find({ "fee.foo"| })'
      );
    });

    it('inserts a plain identifier unquoted', () => {
      expect(withCursor(complete('db.c.find({ na| })', 'name'))).toBe('db.c.find({ name| })');
    });

    it('quotes a non-identifier top-level field', () => {
      expect(complete('db.c.find({ first| })', 'first-name').text).toBe(
        'db.c.find({ "first-name" })'
      );
    });

    it('quotes a field containing a space, replacing only the typed word', () => {
      expect(complete('db.c.find({ my| })', 'my field').text).toBe('db.c.find({ "my field" })');
    });

    it('produces a query that parses', () => {
      const { text } = complete('db.c.find({ fee.f| })', 'fee.foo');
      const query = text.replace('{ "fee.foo" }', '{ "fee.foo": 1 }');

      expect(parseQuery(query).ok).toBe(true);
    });
  });

  describe('inside strings, regexes and comments', () => {
    it('does not double the quotes inside a double-quoted string', () => {
      expect(withCursor(complete('db.c.find({ "fee.f|" })', 'fee.foo'))).toBe(
        'db.c.find({ "fee.foo|" })'
      );
    });

    it('does not add quotes inside a single-quoted string', () => {
      expect(complete("db.c.find({ 'fee.f|' })", 'fee.foo').text).toBe("db.c.find({ 'fee.foo' })");
    });

    it('inserts bare inside an aggregation field reference', () => {
      expect(complete('db.c.aggregate([{ $project: { x: "$fee.f|" } }])', 'fee.foo').text).toBe(
        'db.c.aggregate([{ $project: { x: "$fee.foo" } }])'
      );
    });

    it('inserts bare inside a regex literal', () => {
      expect(complete('db.c.find({ a: /fee.f|/ })', 'fee.foo').text).toBe(
        'db.c.find({ a: /fee.foo/ })'
      );
    });

    it('inserts bare inside a line comment', () => {
      expect(complete('// fee.f|\ndb.c.find({})', 'fee.foo').text).toBe(
        '// fee.foo\ndb.c.find({})'
      );
    });

    it('inserts bare inside a block comment', () => {
      expect(complete('/* fee.f| */ db.c.find({})', 'fee.foo').text).toBe(
        '/* fee.foo */ db.c.find({})'
      );
    });
  });

  it('shows the unquoted path as the popup label', () => {
    const v = createView('db.c.find({ fee.f| })');
    const result = createFieldCompletionSource(() => FIELDS)(
      new CompletionContext(v.state, v.state.selection.main.head, true)
    ) as { options: readonly Completion[] };

    expect(result.options.map((o) => o.label)).toContain('fee.foo');
  });
});
