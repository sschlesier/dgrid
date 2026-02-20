<script lang="ts">
  import type { Tab, ExecuteInfo, ExecuteMode } from '../types';
  import { appStore } from '../stores/app.svelte';
  import { queryStore } from '../stores/query.svelte';
  import { editorStore } from '../stores/editor.svelte';
  import { gridStore } from '../stores/grid.svelte';
  import { schemaStore } from '../stores/schema.svelte';
  import {
    splitQueries,
    findSliceAtOffset,
    findSlicesInSelection,
  } from '../../../shared/querySplitter';
  import type { QuerySlice } from '../../../shared/querySplitter';
  import { watchFile } from '../api/websocket';
  import * as api from '../api/client';
  import { supportsFileSystemAccess, openFile, saveFile } from '../lib/file-access';
  import Editor from './Editor.svelte';
  import QueryHistory from './QueryHistory.svelte';
  import FileDialog from './FileDialog.svelte';
  import Spinner from './Spinner.svelte';
  import { ResultsContainer } from './results';

  interface Props {
    tab: Tab;
  }

  let { tab }: Props = $props();

  // Local state bound to store
  let queryText = $derived(queryStore.getQueryText(tab.id) || tab.queryText);
  let results = $derived(queryStore.getResults(tab.id));
  let isExecuting = $derived(queryStore.getIsExecuting(tab.id));
  let error = $derived(queryStore.getError(tab.id));

  // Multi-query state
  let subResults = $derived(queryStore.getSubResults(tab.id));
  let activeResultIndex = $derived(queryStore.getActiveResultIndex(tab.id));
  let hasMultipleResults = $derived(subResults.length > 1);

  // Extract collection name from query text (supports dot, bracket, and getCollection syntax)
  const collectionName = $derived.by(() => {
    const text = queryStore.getQueryText(tab.id);
    // db.getCollection('name') or db.getCollection("name")
    const gcMatch = text.match(/db\.getCollection\(\s*['"]([^'"]*)['"]\s*\)/);
    if (gcMatch) return gcMatch[1];
    // db['name'] or db["name"]
    const brMatch = text.match(/db\[['"]([^'"]*)['"]\]/);
    if (brMatch) return brMatch[1];
    // db.name. (dot notation)
    const dotMatch = text.match(/db\.([^.[]+)\./);
    return dotMatch ? dotMatch[1] : '';
  });

  // Fetch schema when collection changes
  $effect(() => {
    if (collectionName && tab.connectionId && tab.database) {
      schemaStore.fetchSchema(tab.connectionId, tab.database, collectionName);
    }
  });

  // Field names for autocomplete
  let fieldNames = $derived(
    collectionName ? schemaStore.getFields(tab.connectionId, tab.database, collectionName) : []
  );

  // UI state
  let showHistory = $state(false);
  let editorRef: Editor | null = $state(null);
  let showDropdown = $state(false);

  // Resizable splitter state
  let editorHeight = $state(200);
  let isDragging = $state(false);
  let panelEl: HTMLDivElement | undefined = $state();

  function onSplitterMouseDown(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;
    const startY = e.clientY;
    const startHeight = editorHeight;

    function onMouseMove(e: MouseEvent) {
      if (!panelEl) return;
      const panelRect = panelEl.getBoundingClientRect();
      const maxHeight = panelRect.height - 100; // leave 100px min for results
      const newHeight = startHeight + (e.clientY - startY);
      editorHeight = Math.max(80, Math.min(maxHeight, newHeight));
    }

    function onMouseUp() {
      isDragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
  let fileDialogMode = $state<'save' | 'load' | null>(null);
  let currentFilePath = $state<string | null>(null);
  let fileHandle = $state<FileSystemFileHandle | null>(null);
  let currentFileName = $state<string | null>(null);
  let fileError = $state<string | null>(null);
  let unwatchFile = $state<(() => void) | null>(null);

  const useNativePicker = supportsFileSystemAccess();

  function handleQueryChange(value: string) {
    queryStore.setQueryText(tab.id, value);
    // Update tab title based on query
    const firstLine = value.split('\n')[0].slice(0, 30);
    if (firstLine) {
      appStore.updateTab(tab.id, { title: firstLine || 'New Query' });
    }
  }

  // Resolve which slices to execute based on mode
  function resolveQueries(info: ExecuteInfo): QuerySlice[] {
    const fullText = queryStore.getQueryText(tab.id);
    const allSlices = splitQueries(fullText);

    if (allSlices.length === 0) return [];

    switch (info.mode) {
      case 'all':
        return allSlices;

      case 'current': {
        const slice = findSliceAtOffset(allSlices, info.cursorOffset);
        return slice ? [slice] : allSlices.length > 0 ? [allSlices[0]] : [];
      }

      case 'selected': {
        if (!info.hasSelection) {
          // No selection — fall back to all
          return allSlices;
        }
        const selected = findSlicesInSelection(allSlices, info.selectionFrom, info.selectionTo);
        if (selected.length === 0) {
          // Partial selection — find the slice that overlaps the most
          const atCursor = findSliceAtOffset(allSlices, info.selectionFrom);
          return atCursor ? [atCursor] : [];
        }
        return selected;
      }

      default:
        return allSlices;
    }
  }

  async function handleExecute(info?: ExecuteInfo) {
    const fullText = queryStore.getQueryText(tab.id);
    if (!fullText.trim()) return;

    const executeInfo: ExecuteInfo = info ?? {
      mode: queryStore.lastExecuteMode,
      cursorOffset: 0,
      selectionFrom: 0,
      selectionTo: 0,
      hasSelection: false,
    };

    queryStore.lastExecuteMode = executeInfo.mode;

    const queries = resolveQueries(executeInfo);
    if (queries.length === 0) return;

    // Reset grid state for all sub-results
    gridStore.resetAllSubResults(tab.id, queries.length);

    const pageSize = gridStore.getPageSize(tab.id);
    await queryStore.executeQueries(tab.id, tab.connectionId, tab.database, queries, pageSize);

    // Enrich schema cache from result documents
    const queryResults = queryStore.getResults(tab.id);
    if (queryResults && collectionName) {
      schemaStore.enrichFromDocuments(
        tab.connectionId,
        tab.database,
        collectionName,
        queryResults.documents
      );
    }
  }

  function handleCancel() {
    queryStore.cancelQuery(tab.id);
  }

  // Execute mode labels and shortcuts
  const modeConfig: Record<ExecuteMode, { label: string; shortcut: string }> = {
    all: { label: 'Run All', shortcut: '⌘↵' },
    current: { label: 'Run Current', shortcut: '⌘⇧↵' },
    selected: { label: 'Run Selected', shortcut: '⌘⌥↵' },
  };

  function handleDropdownClick(mode: ExecuteMode) {
    showDropdown = false;
    const cursorInfo = editorRef?.getCursorInfo() ?? {
      offset: 0,
      selectionFrom: 0,
      selectionTo: 0,
      hasSelection: false,
    };
    handleExecute({
      mode,
      cursorOffset: cursorInfo.offset,
      selectionFrom: cursorInfo.selectionFrom,
      selectionTo: cursorInfo.selectionTo,
      hasSelection: cursorInfo.hasSelection,
    });
  }

  function handleMainExecuteClick() {
    const cursorInfo = editorRef?.getCursorInfo() ?? {
      offset: 0,
      selectionFrom: 0,
      selectionTo: 0,
      hasSelection: false,
    };
    handleExecute({
      mode: queryStore.lastExecuteMode,
      cursorOffset: cursorInfo.offset,
      selectionFrom: cursorInfo.selectionFrom,
      selectionTo: cursorInfo.selectionTo,
      hasSelection: cursorInfo.hasSelection,
    });
  }

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  // Close dropdown when clicking outside
  function handleWindowClick(e: MouseEvent) {
    if (showDropdown) {
      const target = e.target as HTMLElement;
      if (!target.closest('.split-button')) {
        showDropdown = false;
      }
    }
  }

  // Sub-result tab switching
  function switchSubResult(index: number) {
    queryStore.setActiveResultIndex(tab.id, index);
  }

  // Error categorization
  interface ErrorInfo {
    type: string;
    suggestion: string | null;
  }

  function categorizeError(errorMessage: string): ErrorInfo {
    const lowerError = errorMessage.toLowerCase();

    // Syntax errors
    if (
      lowerError.includes('syntax') ||
      lowerError.includes('parse') ||
      lowerError.includes('unexpected token')
    ) {
      return {
        type: 'Syntax Error',
        suggestion: 'Check your query syntax. Make sure brackets and quotes are properly matched.',
      };
    }

    // Connection errors
    if (
      lowerError.includes('connect') ||
      lowerError.includes('econnrefused') ||
      lowerError.includes('network')
    ) {
      return {
        type: 'Connection Error',
        suggestion: 'Check if MongoDB is running and the connection settings are correct.',
      };
    }

    // Authentication errors
    if (
      lowerError.includes('auth') ||
      lowerError.includes('unauthorized') ||
      lowerError.includes('permission')
    ) {
      return {
        type: 'Authentication Error',
        suggestion: 'Verify your username, password, and authentication database.',
      };
    }

    // Timeout errors
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return {
        type: 'Timeout Error',
        suggestion: 'The query took too long. Try adding limits or more specific filters.',
      };
    }

    // Collection/Database not found
    if (lowerError.includes('not found') || lowerError.includes('does not exist')) {
      return {
        type: 'Not Found Error',
        suggestion: 'Verify the database and collection names are correct.',
      };
    }

    // Default
    return {
      type: 'Query Error',
      suggestion: null,
    };
  }

  async function copyError(errorMessage: string) {
    try {
      await navigator.clipboard.writeText(errorMessage);
      // Could add a notification here
    } catch {
      // Fallback for older browsers
      console.error('Failed to copy error to clipboard');
    }
  }

  async function handlePageChange(newPage: number) {
    if (hasMultipleResults) {
      const sub = subResults[activeResultIndex];
      if (sub) {
        const pageSize = gridStore.getPageSize(tab.id, activeResultIndex);
        await queryStore.loadPage(
          tab.id,
          tab.connectionId,
          tab.database,
          sub.query,
          newPage,
          pageSize,
          false,
          activeResultIndex
        );
      }
    } else {
      const query = queryStore.getQueryText(tab.id);
      const pageSize = gridStore.getPageSize(tab.id);
      await queryStore.loadPage(tab.id, tab.connectionId, tab.database, query, newPage, pageSize);
    }
  }

  async function handlePageSizeChange(newSize: 50 | 100 | 250 | 500) {
    if (hasMultipleResults) {
      const sub = subResults[activeResultIndex];
      if (sub) {
        gridStore.setPageSize(tab.id, newSize);
        await queryStore.loadPage(
          tab.id,
          tab.connectionId,
          tab.database,
          sub.query,
          1,
          newSize,
          false,
          activeResultIndex
        );
      }
    } else {
      const query = queryStore.getQueryText(tab.id);
      await queryStore.executeQuery(tab.id, tab.connectionId, tab.database, query, 1, newSize);
    }
  }

  // Derive the active sub-result for rendering
  let activeSubResult = $derived(hasMultipleResults ? subResults[activeResultIndex] : null);

  // History handlers
  function openHistory() {
    showHistory = true;
  }

  function closeHistory() {
    showHistory = false;
  }

  function selectHistoryItem(item: { query: string }) {
    queryStore.setQueryText(tab.id, item.query);
    showHistory = false;
    // Refocus editor so keyboard shortcuts work
    editorRef?.focus();
  }

  function clearHistory() {
    queryStore.clearHistory();
  }

  // File dialog handlers - native picker or fallback dialog
  async function handleOpen() {
    if (useNativePicker) {
      try {
        const result = await openFile();
        queryStore.setQueryText(tab.id, result.content);
        fileHandle = result.handle;
        currentFileName = result.name;
        currentFilePath = null;
      } catch (e) {
        // User cancelled the picker - not an error
        if ((e as DOMException).name === 'AbortError') return;
        console.error('Failed to open file:', e);
      }
    } else {
      fileDialogMode = 'load';
      fileError = null;
    }
  }

  async function handleSave() {
    if (useNativePicker) {
      try {
        const content = queryStore.getQueryText(tab.id);
        fileHandle = await saveFile(content, fileHandle, currentFileName ?? 'query.js');
        currentFileName = (await fileHandle.getFile()).name;
        currentFilePath = null;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
        console.error('Failed to save file:', e);
      }
    } else if (currentFilePath) {
      // Fallback: save directly to known path
      try {
        const content = queryStore.getQueryText(tab.id);
        await api.writeFile({ path: currentFilePath, content });
      } catch (e) {
        fileError = (e as Error).message;
        fileDialogMode = 'save';
      }
    } else {
      fileDialogMode = 'save';
      fileError = null;
    }
  }

  async function handleSaveAs() {
    if (useNativePicker) {
      try {
        const content = queryStore.getQueryText(tab.id);
        fileHandle = await saveFile(content, null, currentFileName ?? 'query.js');
        currentFileName = (await fileHandle.getFile()).name;
        currentFilePath = null;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
        console.error('Failed to save file:', e);
      }
    } else {
      fileDialogMode = 'save';
      fileError = null;
    }
  }

  function closeFileDialog() {
    fileDialogMode = null;
    fileError = null;
  }

  async function handleFileLoad(path: string) {
    try {
      const result = await api.readFile(path);
      queryStore.setQueryText(tab.id, result.content);
      editorStore.addRecentPath(path);
      currentFilePath = path;
      currentFileName = path.split('/').pop() ?? null;
      fileHandle = null;
      fileDialogMode = null;
      fileError = null;

      // Start watching the file
      startWatching(path);
    } catch (e) {
      fileError = (e as Error).message;
    }
  }

  async function handleFileSave(path: string) {
    try {
      const content = queryStore.getQueryText(tab.id);
      await api.writeFile({ path, content });
      editorStore.addRecentPath(path);
      currentFilePath = path;
      currentFileName = path.split('/').pop() ?? null;
      fileHandle = null;
      fileDialogMode = null;
      fileError = null;

      // Start watching the file
      startWatching(path);
    } catch (e) {
      fileError = (e as Error).message;
    }
  }

  function startWatching(path: string) {
    // Stop watching previous file
    if (unwatchFile) {
      unwatchFile();
      unwatchFile = null;
    }

    // Watch new file
    unwatchFile = watchFile(path, (content) => {
      // Update editor content when file changes externally
      const currentContent = queryStore.getQueryText(tab.id);
      if (content !== currentContent) {
        queryStore.setQueryText(tab.id, content);
      }
    });
  }

  // Keyboard shortcuts for file operations
  function handleKeydown(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;

    if (event.key === 's' && event.shiftKey) {
      event.preventDefault();
      handleSaveAs();
    } else if (event.key === 's') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'o') {
      event.preventDefault();
      handleOpen();
    }
  }

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      if (unwatchFile) {
        unwatchFile();
      }
    };
  });

  // Executing progress message
  let executingMessage = $derived.by(() => {
    if (!isExecuting) return '';
    if (subResults.length > 1) {
      const running = subResults.findIndex((s) => s.isExecuting);
      if (running >= 0) {
        return `Executing query ${running + 1} of ${subResults.length}...`;
      }
      return 'Executing queries...';
    }
    return 'Executing query...';
  });
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleWindowClick} />

<div class="query-panel" class:is-dragging={isDragging} bind:this={panelEl}>
  <div class="editor-section" style="height: {editorHeight}px">
    <div class="toolbar">
      {#if isExecuting}
        <button class="cancel-btn" onclick={handleCancel}> Cancel </button>
      {:else}
        <div class="split-button">
          <button
            class="execute-btn split-main"
            onclick={handleMainExecuteClick}
            disabled={!queryText.trim()}
          >
            {modeConfig[queryStore.lastExecuteMode].label} ({modeConfig[queryStore.lastExecuteMode]
              .shortcut})
          </button>
          <button
            class="execute-btn split-dropdown"
            onclick={toggleDropdown}
            disabled={!queryText.trim()}
            title="Choose execute mode"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M2 3.5L5 7L8 3.5H2Z" />
            </svg>
          </button>
          {#if showDropdown}
            <div class="execute-dropdown">
              {#each ['all', 'current', 'selected'] as const as mode}
                <button
                  class="dropdown-item"
                  class:active={queryStore.lastExecuteMode === mode}
                  onclick={() => handleDropdownClick(mode)}
                >
                  <span class="dropdown-label">{modeConfig[mode].label}</span>
                  <span class="dropdown-shortcut">{modeConfig[mode].shortcut}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <div class="toolbar-divider"></div>

      <button class="toolbar-btn" onclick={openHistory} title="Query History">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M8 3.5a4.5 4.5 0 1 0 4.5 4.5.75.75 0 0 1 1.5 0 6 6 0 1 1-6-6 .75.75 0 0 1 0 1.5Z"
          />
          <path
            d="M8 6.75a.75.75 0 0 1 .75.75v2.69l1.72 1.72a.75.75 0 1 1-1.06 1.06l-2-2A.75.75 0 0 1 7.25 10V7.5A.75.75 0 0 1 8 6.75Z"
          />
          <path
            d="M10.97 1.22a.75.75 0 0 1 1.06 0l2.75 2.75a.75.75 0 0 1-1.06 1.06L11 2.28 8.28 5.03a.75.75 0 0 1-1.06-1.06l2.75-2.75Z"
          />
        </svg>
        <span>History</span>
      </button>

      <button class="toolbar-btn" onclick={handleOpen} title="Open File (⌘O)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M3.5 3.75a.25.25 0 0 1 .25-.25h5a.75.75 0 0 0 0-1.5h-5A1.75 1.75 0 0 0 2 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 12.25v-6.5a.75.75 0 0 0-1.5 0v6.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-8.5Z"
          />
          <path
            d="M13.78 1.22a.75.75 0 0 1 0 1.06L8.06 8l1.72 1.72a.75.75 0 1 1-1.06 1.06l-2.25-2.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z"
          />
        </svg>
        <span>Open</span>
      </button>

      <button class="toolbar-btn" onclick={handleSave} title="Save (⌘S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"
          />
        </svg>
        <span>Save</span>
      </button>

      <button class="toolbar-btn" onclick={handleSaveAs} title="Save As (⌘⇧S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"
          />
        </svg>
        <span>Save As</span>
      </button>

      <div class="toolbar-divider"></div>

      <button
        class="toolbar-btn"
        class:active={editorStore.vimMode}
        onclick={() => editorStore.toggleVimMode()}
        title="Toggle Vim Mode"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M4.708 5.578L2.061 8.224l2.647 2.646.708-.708-1.939-1.938 1.939-1.938-.708-.708zm6.584 0l-.708.708 1.939 1.938-1.939 1.938.708.708 2.647-2.646-2.647-2.646zM7.042 11.678l1.683-7.356h1.233l-1.683 7.356H7.042z"
          />
        </svg>
        <span>Vim</span>
      </button>

      <div class="toolbar-spacer"></div>

      {#if currentFileName || currentFilePath}
        <span class="toolbar-file" title={currentFilePath ?? currentFileName ?? ''}>
          {currentFileName ?? currentFilePath?.split('/').pop()}
        </span>
      {/if}

      <span class="toolbar-info">Database: {tab.database}</span>
    </div>

    <Editor
      bind:this={editorRef}
      value={queryText}
      onchange={handleQueryChange}
      onexecute={handleExecute}
      vimMode={editorStore.vimMode}
      placeholder="Enter your MongoDB query here... (e.g., db.collection.find())"
      {fieldNames}
    />
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="splitter" onmousedown={onSplitterMouseDown}></div>

  <div class="results-section">
    {#if hasMultipleResults}
      <!-- Sub-result tab bar -->
      <div class="sub-result-tabs">
        {#each subResults as sub, i}
          <button
            class="sub-result-tab"
            class:active={i === activeResultIndex}
            class:has-error={sub.error !== null}
            class:is-executing={sub.isExecuting}
            onclick={() => switchSubResult(i)}
          >
            <span class="sub-tab-label">Query {i + 1}</span>
            {#if sub.error}
              <span class="sub-tab-error-dot" title="Error"></span>
            {:else if sub.isExecuting}
              <Spinner size="xs" />
            {:else if sub.result}
              <span class="sub-tab-count">{sub.result.totalCount}</span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Active sub-result content -->
      {#if activeSubResult}
        {#if activeSubResult.error}
          {@const errorInfo = categorizeError(activeSubResult.error)}
          <div class="error-display">
            <div class="error-header">
              <span class="error-type">{errorInfo.type}</span>
              <button
                class="copy-error-btn"
                onclick={() => copyError(activeSubResult?.error ?? '')}
                title="Copy error to clipboard"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path
                    d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
                  />
                  <path
                    d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
                  />
                </svg>
              </button>
            </div>
            <pre class="error-message">{activeSubResult.error}</pre>
            {#if errorInfo.suggestion}
              <div class="error-suggestion">
                <strong>Suggestion:</strong>
                {errorInfo.suggestion}
              </div>
            {/if}
          </div>
        {:else if activeSubResult.isExecuting}
          <div class="loading-display">
            <Spinner size="lg" />
            <span>{executingMessage}</span>
          </div>
        {:else if activeSubResult.result}
          <ResultsContainer
            tabId={tab.id}
            results={activeSubResult.result}
            connectionId={tab.connectionId}
            database={tab.database}
            collection={collectionName}
            query={activeSubResult.query}
            onpagechange={handlePageChange}
            onpagesizechange={handlePageSizeChange}
          />
        {:else}
          <div class="empty-results">
            <p class="empty-title">No results yet</p>
          </div>
        {/if}
      {/if}
    {:else if error}
      {@const errorInfo = categorizeError(error)}
      <div class="error-display">
        <div class="error-header">
          <span class="error-type">{errorInfo.type}</span>
          <button
            class="copy-error-btn"
            onclick={() => copyError(error)}
            title="Copy error to clipboard"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
              />
              <path
                d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
              />
            </svg>
          </button>
        </div>
        <pre class="error-message">{error}</pre>
        {#if errorInfo.suggestion}
          <div class="error-suggestion">
            <strong>Suggestion:</strong>
            {errorInfo.suggestion}
          </div>
        {/if}
      </div>
    {:else if isExecuting}
      <div class="loading-display">
        <Spinner size="lg" />
        <span>{executingMessage}</span>
      </div>
    {:else if results}
      <ResultsContainer
        tabId={tab.id}
        {results}
        connectionId={tab.connectionId}
        database={tab.database}
        collection={collectionName}
        query={queryText}
        onpagechange={handlePageChange}
        onpagesizechange={handlePageSizeChange}
      />
    {:else}
      <div class="empty-results">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" class="empty-icon">
          <path
            d="M11.28 3.22a.75.75 0 0 1 0 1.06L6.56 9l4.72 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z"
          />
        </svg>
        <p class="empty-title">Execute a query to see results</p>
        <p class="empty-hint">Press <kbd>Cmd</kbd>+<kbd>Enter</kbd> to run all queries</p>
      </div>
    {/if}
  </div>
</div>

{#if showHistory}
  <QueryHistory
    history={queryStore.history}
    onselect={selectHistoryItem}
    onclear={clearHistory}
    onclose={closeHistory}
  />
{/if}

{#if fileDialogMode}
  <FileDialog
    mode={fileDialogMode}
    initialPath={currentFilePath ?? ''}
    apiError={fileError}
    onconfirm={fileDialogMode === 'load' ? handleFileLoad : handleFileSave}
    oncancel={closeFileDialog}
  />
{/if}

<style>
  .query-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .query-panel.is-dragging {
    cursor: row-resize;
    user-select: none;
  }

  .editor-section {
    display: flex;
    flex-direction: column;
    min-height: 80px;
    flex-shrink: 0;
  }

  .splitter {
    height: 5px;
    cursor: row-resize;
    background-color: var(--color-border-light);
    flex-shrink: 0;
    transition: background-color var(--transition-fast);
  }

  .splitter:hover,
  .is-dragging .splitter {
    background-color: var(--color-primary);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  /* Split button */
  .split-button {
    display: flex;
    position: relative;
  }

  .execute-btn.split-main {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    transition: background-color var(--transition-fast);
  }

  .execute-btn.split-main:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .execute-btn.split-main:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .execute-btn.split-dropdown {
    display: flex;
    align-items: center;
    padding: var(--space-xs) var(--space-xs);
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border-left: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    transition: background-color var(--transition-fast);
  }

  .execute-btn.split-dropdown:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .execute-btn.split-dropdown:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .execute-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    min-width: 200px;
    margin-top: 2px;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .dropdown-item:hover {
    background-color: var(--color-bg-hover);
  }

  .dropdown-item.active {
    background-color: var(--color-primary-light);
    color: var(--color-primary);
  }

  .dropdown-shortcut {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .cancel-btn {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-error);
    color: var(--color-error-text, white);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
  }

  .cancel-btn:hover {
    background-color: var(--color-error-hover, #c0392b);
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background-color: var(--color-border-light);
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .toolbar-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .toolbar-btn.active {
    background-color: var(--color-primary-light);
    color: var(--color-primary);
  }

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-file {
    padding: var(--space-xs) var(--space-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar-info {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .results-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Sub-result tabs */
  .sub-result-tabs {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 0 var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .sub-result-tab {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .sub-result-tab:hover {
    color: var(--color-text-primary);
    background-color: var(--color-bg-hover);
  }

  .sub-result-tab.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .sub-result-tab.has-error {
    color: var(--color-error);
  }

  .sub-result-tab.has-error.active {
    border-bottom-color: var(--color-error);
  }

  .sub-tab-error-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background-color: var(--color-error);
  }

  .sub-tab-count {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    background-color: var(--color-bg-tertiary);
    padding: 0 4px;
    border-radius: var(--radius-sm);
  }

  .error-display {
    padding: var(--space-md);
    background-color: var(--color-error-light);
    color: var(--color-error-text);
    border-left: 4px solid var(--color-error);
  }

  .error-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-sm);
  }

  .error-type {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .copy-error-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-error-text);
    opacity: 0.7;
    transition: all var(--transition-fast);
  }

  .copy-error-btn:hover {
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.1);
  }

  .error-message {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    white-space: pre-wrap;
    margin: 0;
    padding: var(--space-sm);
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: var(--radius-sm);
  }

  .error-suggestion {
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    font-size: var(--font-size-sm);
    background-color: rgba(255, 255, 255, 0.5);
    border-radius: var(--radius-sm);
  }

  .error-suggestion strong {
    font-weight: var(--font-weight-semibold);
  }

  .loading-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    flex: 1;
    color: var(--color-text-secondary);
  }

  .empty-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    flex: 1;
    color: var(--color-text-muted);
  }

  .empty-results .empty-icon {
    opacity: 0.3;
    margin-bottom: var(--space-xs);
  }

  .empty-results .empty-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
  }

  .empty-results .empty-hint {
    font-size: var(--font-size-sm);
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .empty-results kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    padding: 2px 5px;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-sm);
    box-shadow: 0 1px 0 var(--color-border-medium);
  }
</style>
