<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, lineNumbers } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { json } from '@codemirror/lang-json';
  import { editorHighlighting } from '../../../lib/editorHighlighting';

  interface Props {
    content: string;
    index: number;
  }

  let { content, index }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | null = null;
  let copied = $state(false);

  // Theme using CSS variables
  const theme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)',
      fontSize: 'var(--font-size-sm)',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      padding: 'var(--space-sm) 0',
      caretColor: 'var(--color-text-primary)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-bg-secondary)',
      color: 'var(--color-text-muted)',
      border: 'none',
      borderRight: '1px solid var(--color-border-light)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 var(--space-sm)',
      minWidth: '32px',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--color-primary-light) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--color-primary-light) !important',
    },
  });

  function initEditor() {
    if (!container) return;

    // Destroy existing view
    view?.destroy();

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        json(),
        editorHighlighting,
        theme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });

    view = new EditorView({
      state,
      parent: container,
    });
  }

  onMount(() => {
    initEditor();
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Update content when it changes
  $effect(() => {
    if (view) {
      const currentContent = view.state.doc.toString();
      if (content !== currentContent) {
        view.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: content,
          },
        });
      }
    }
  });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard API may fail
    }
  }
</script>

<div class="json-document">
  <div class="document-header">
    <span class="document-index">Document {index + 1}</span>
    <button class="copy-btn" class:copied onclick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
      {#if copied}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
          />
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
          />
          <path
            d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
          />
        </svg>
      {/if}
    </button>
  </div>
  <div class="document-content" bind:this={container}></div>
</div>

<style>
  .json-document {
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .document-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .document-index {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .copy-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .copy-btn.copied {
    color: var(--color-success);
  }

  .document-content {
    max-height: 400px;
    overflow: auto;
  }

  .document-content :global(.cm-editor) {
    height: auto;
  }

  .document-content :global(.cm-scroller) {
    overflow: visible;
  }
</style>
