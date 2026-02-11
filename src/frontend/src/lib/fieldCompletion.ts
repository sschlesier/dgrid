import {
  autocompletion,
  startCompletion,
  acceptCompletion,
  closeCompletion,
  moveCompletionSelection,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { keymap, type KeyBinding } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';

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
      .map((f) => ({ label: f, type: 'property' }));

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
