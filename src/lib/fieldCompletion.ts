import {
  autocompletion,
  startCompletion,
  acceptCompletion,
  closeCompletion,
  moveCompletionSelection,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { keymap, type EditorView, type KeyBinding } from '@codemirror/view';
import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** Keys the query parser accepts without quotes (mirrors the unquoted-key regex in queries.ts). */
const UNQUOTED_KEY = /^[A-Za-z_$][\w$]*$/;

/** Syntax nodes where a completion must be inserted bare, never quoted. */
const BARE_CONTEXTS = new Set([
  'String',
  'TemplateString',
  'RegExp',
  'LineComment',
  'BlockComment',
]);

function isInBareContext(state: EditorState, pos: number): boolean {
  const inner = syntaxTree(state).resolveInner(pos, -1);
  for (let node: typeof inner | null = inner; node; node = node.parent) {
    if (BARE_CONTEXTS.has(node.name)) return true;
    // Code inside a template `${...}` is not part of the string.
    if (node.name === 'Interpolation') return false;
  }
  return false;
}

/** Insert the field path, quoting it when the parser would not accept it as a bare key. */
export function applyFieldCompletion(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number
): void {
  const path = completion.label;
  const insert = UNQUOTED_KEY.test(path) || isInBareContext(view.state, from) ? path : `"${path}"`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.complete',
    annotations: pickedCompletion.of(completion),
  });
}

/** Create a CompletionSource that offers field names matching a word/dot-notation prefix. */
export function createFieldCompletionSource(getFields: () => string[]): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    // Match word characters and dots (for dot-notation like address.city)
    const word = context.matchBefore(/[\w.]+/);
    if (!word) return null;

    const fields = getFields();
    if (fields.length === 0) return null;

    const prefix = word.text.toLowerCase();
    const options = fields
      .filter((f) => f.toLowerCase().startsWith(prefix) || f.toLowerCase().includes(prefix))
      .map((f) => ({ label: f, type: 'property', apply: applyFieldCompletion }));

    if (options.length === 0) return null;

    return {
      from: word.from,
      options,
      filter: true,
    };
  };
}

/** Build the autocomplete extension with Tab keymap for triggering/accepting completions. */
export function fieldCompletionExtension(getFields: () => string[]): Extension {
  const source = createFieldCompletionSource(getFields);

  const completionBindings: KeyBinding[] = [
    {
      key: 'Tab',
      run: (view) => {
        // If completions are open, accept the selected one
        if (acceptCompletion(view)) return true;
        // Otherwise, trigger completions
        startCompletion(view);
        return true;
      },
    },
    {
      key: 'ArrowDown',
      run: moveCompletionSelection(true),
    },
    {
      key: 'ArrowUp',
      run: moveCompletionSelection(false),
    },
    {
      key: 'Ctrl-j',
      run: moveCompletionSelection(true),
    },
    {
      key: 'Ctrl-k',
      run: moveCompletionSelection(false),
    },
    {
      key: 'Enter',
      run: acceptCompletion,
    },
    {
      key: 'Escape',
      run: closeCompletion,
    },
  ];

  return [
    autocompletion({
      override: [source],
      activateOnTyping: false,
      defaultKeymap: false,
      interactionDelay: 0,
    }),
    Prec.highest(keymap.of(completionBindings)),
  ];
}
