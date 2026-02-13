<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, lineNumbers, keymap } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { json } from '@codemirror/lang-json';
  import { foldGutter, foldKeymap, foldAll, unfoldAll } from '@codemirror/language';
  import { editorHighlighting } from '../../../lib/editorHighlighting';
  import type { ExecuteQueryResponse } from '../../../../../shared/contracts';
  import type { JsonFormat } from './formatters';
  import { formatDocuments, loadJsonFormat, saveJsonFormat } from './formatters';
  import JsonToolbar from './JsonToolbar.svelte';
  import { GridPagination } from '../../grid';
  import { gridStore } from '../../../stores/grid.svelte';

  interface Props {
    tabId: string;
    results: ExecuteQueryResponse;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let { tabId, results, onpagechange, onpagesizechange }: Props = $props();

  let editorContainer: HTMLDivElement | undefined = $state();
  let view: EditorView | null = null;
  let format = $state<JsonFormat>(loadJsonFormat());

  const gridState = $derived(gridStore.getState(tabId));

  // Format all documents as one combined text
  const combinedContent = $derived.by(() => {
    return formatDocuments(results.documents as Record<string, unknown>[], format);
  });

  // Theme using CSS variables
  const theme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)',
      fontSize: 'var(--font-size-sm)',
      height: '100%',
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
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
      cursor: 'pointer',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--color-primary-light) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--color-primary-light) !important',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  });

  function initEditor() {
    if (!editorContainer) return;

    view?.destroy();

    const state = EditorState.create({
      doc: combinedContent,
      extensions: [
        lineNumbers(),
        foldGutter(),
        keymap.of(foldKeymap),
        json(),
        editorHighlighting,
        theme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });

    view = new EditorView({
      state,
      parent: editorContainer,
    });
  }

  onMount(() => {
    initEditor();
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Update content when format or documents change
  $effect(() => {
    if (view && combinedContent) {
      const currentContent = view.state.doc.toString();
      if (combinedContent !== currentContent) {
        view.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: combinedContent,
          },
        });
      }
    }
  });

  function handleFoldAll() {
    if (view) {
      foldAll(view);
    }
  }

  function handleUnfoldAll() {
    if (view) {
      unfoldAll(view);
    }
  }

  function handleFormatChange(newFormat: JsonFormat) {
    format = newFormat;
    saveJsonFormat(newFormat);
  }

  async function handleCopyAll() {
    try {
      await navigator.clipboard.writeText(combinedContent);
    } catch {
      // Clipboard API may fail
    }
  }

  function handlePageSizeChange(size: 50 | 100 | 250 | 500) {
    gridStore.setPageSize(tabId, size);
    if (onpagesizechange) {
      onpagesizechange(size);
    }
  }
</script>

<div class="json-view">
  <div class="json-header">
    <JsonToolbar {format} onformatchange={handleFormatChange} oncopyall={handleCopyAll} />
    <div class="fold-controls">
      <button class="fold-btn" onclick={handleFoldAll} title="Fold All (Ctrl+Shift+[)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM8 10a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 1.5 0v4.5A.75.75 0 0 1 8 10Z"
          />
          <path
            d="M5.22 7.47a.75.75 0 0 1 1.06 0L8 9.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
        Fold All
      </button>
      <button class="fold-btn" onclick={handleUnfoldAll} title="Unfold All (Ctrl+Shift+])">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM8 6a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 8 6Z"
          />
          <path
            d="M5.22 8.53a.75.75 0 0 1 0-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 1 1-1.06 1.06L8 6.81 6.28 8.53a.75.75 0 0 1-1.06 0Z"
          />
        </svg>
        Unfold All
      </button>
    </div>
  </div>

  {#if results.documents.length === 0}
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" class="empty-icon">
        <path
          d="M2.5 1.75a.25.25 0 0 1 .25-.25h8.5a.25.25 0 0 1 .25.25v7.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25Zm.25-1.75A1.75 1.75 0 0 0 1 1.75v7.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 13 9.25v-7.5A1.75 1.75 0 0 0 11.25 0ZM0 12.75A1.75 1.75 0 0 0 1.75 14.5h8.5A1.75 1.75 0 0 0 12 12.75v-.5a.75.75 0 0 0-1.5 0v.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-.5a.75.75 0 0 0-1.5 0Z"
        />
      </svg>
      <p class="empty-title">No documents found</p>
      <p class="empty-hint">Your query returned no results</p>
    </div>
  {:else}
    <div class="json-content" bind:this={editorContainer}></div>
  {/if}

  <GridPagination
    totalCount={results.totalCount}
    page={results.page}
    pageSize={gridState.pageSize}
    hasMore={results.hasMore}
    {onpagechange}
    onpagesizechange={handlePageSizeChange}
  />
</div>

<style>
  .json-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .json-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .fold-controls {
    display: flex;
    gap: var(--space-xs);
  }

  .fold-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    padding: var(--space-xxs) var(--space-xs);
    background: none;
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .fold-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .json-content {
    flex: 1;
    overflow: hidden;
  }

  .json-content :global(.cm-editor) {
    height: 100%;
  }

  .json-content :global(.cm-scroller) {
    overflow: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    flex: 1;
    color: var(--color-text-muted);
  }

  .empty-icon {
    opacity: 0.3;
    margin-bottom: var(--space-xs);
  }

  .empty-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    opacity: 0.7;
  }
</style>
