<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    placeholder as placeholderExt,
  } from '@codemirror/view';
  import { EditorState, Compartment } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { javascript } from '@codemirror/lang-javascript';
  import { vim } from '@replit/codemirror-vim';
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
  import { bracketMatching } from '@codemirror/language';

  interface Props {
    value?: string;
    onchange?: (_value: string) => void;
    onexecute?: () => void;
    vimMode?: boolean;
    readonly?: boolean;
    placeholder?: string;
  }

  let {
    value = '',
    onchange,
    onexecute,
    vimMode = false,
    readonly = false,
    placeholder = '',
  }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let vimCompartment = new Compartment();
  let readonlyCompartment = new Compartment();

  // Theme using CSS variables for light/dark support
  const theme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
      lineHeight: 'var(--line-height-relaxed)',
      padding: 'var(--space-sm) 0',
      caretColor: 'var(--color-text-primary)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--color-text-primary)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-bg-secondary)',
      color: 'var(--color-text-muted)',
      border: 'none',
      borderRight: '1px solid var(--color-border-light)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 var(--space-sm)',
      minWidth: '40px',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--color-bg-hover)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--color-bg-tertiary)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--color-primary-light) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--color-primary-light) !important',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--color-bg-tertiary)',
      outline: '1px solid var(--color-border-medium)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--color-warning-light)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--color-primary-light)',
    },
    '.cm-placeholder': {
      color: 'var(--color-text-muted)',
      fontStyle: 'italic',
    },
    // Vim mode styling
    '.cm-vim-panel': {
      backgroundColor: 'var(--color-bg-secondary)',
      color: 'var(--color-text-primary)',
      padding: 'var(--space-xs) var(--space-sm)',
      borderTop: '1px solid var(--color-border-light)',
    },
    '.cm-fat-cursor': {
      backgroundColor: 'var(--color-primary) !important',
      color: 'var(--color-primary-text) !important',
    },
  });

  // Execute keybinding (Cmd/Ctrl + Enter)
  function createExecuteKeymap() {
    return keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onexecute?.();
          return true;
        },
      },
    ]);
  }

  // Update listener for external value sync
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const newValue = update.state.doc.toString();
      onchange?.(newValue);
    }
  });

  onMount(() => {
    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      javascript(),
      theme,
      updateListener,
      createExecuteKeymap(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      vimCompartment.of(vimMode ? vim() : []),
      readonlyCompartment.of(EditorState.readOnly.of(readonly)),
    ];

    if (placeholder) {
      extensions.push(placeholderExt(placeholder));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    view = new EditorView({
      state,
      parent: container,
    });

    // Auto-focus so keyboard shortcuts work immediately
    view.focus();
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Sync vim mode changes
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: vimCompartment.reconfigure(vimMode ? vim() : []),
      });
    }
  });

  // Sync readonly changes
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(readonly)),
      });
    }
  });

  // Sync external value changes (e.g., loading from file)
  $effect(() => {
    if (view) {
      const currentValue = view.state.doc.toString();
      if (value !== currentValue) {
        view.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        });
      }
    }
  });

  // Public method to focus the editor
  export function focus(): void {
    view?.focus();
  }

  // Public method to get current value
  export function getValue(): string {
    return view?.state.doc.toString() ?? '';
  }
</script>

<div class="editor-container" bind:this={container}></div>

<style>
  .editor-container {
    flex: 1;
    overflow: hidden;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
  }

  .editor-container :global(.cm-scroller) {
    overflow: auto;
  }
</style>
