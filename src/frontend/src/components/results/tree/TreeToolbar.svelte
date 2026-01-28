<script lang="ts">
  interface Props {
    searchQuery: string;
    matchCount: number;
    onsearch: (_query: string) => void;
    onexpandall: () => void;
    oncollapseall: () => void;
  }

  let { searchQuery, matchCount, onsearch, onexpandall, oncollapseall }: Props = $props();

  let inputRef: HTMLInputElement | undefined = $state();

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    onsearch(target.value);
  }

  function handleClear() {
    onsearch('');
    inputRef?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClear();
    }
  }
</script>

<div class="tree-toolbar">
  <div class="search-wrapper">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="search-icon">
      <path
        d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"
      />
    </svg>
    <input
      bind:this={inputRef}
      type="text"
      class="search-input"
      placeholder="Search fields and values..."
      value={searchQuery}
      oninput={handleInput}
      onkeydown={handleKeydown}
    />
    {#if searchQuery}
      <span class="match-count">{matchCount} match{matchCount !== 1 ? 'es' : ''}</span>
      <button class="clear-btn" onclick={handleClear} title="Clear search">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </button>
    {/if}
  </div>

  <div class="toolbar-actions">
    <button class="action-btn" onclick={onexpandall} title="Expand All">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M8.177.677l2.896 2.896a.25.25 0 0 1-.177.427H8.75v1.25a.75.75 0 0 1-1.5 0V4H5.104a.25.25 0 0 1-.177-.427L7.823.677a.25.25 0 0 1 .354 0ZM7.25 10.75a.75.75 0 0 1 1.5 0V12h2.146a.25.25 0 0 1 .177.427l-2.896 2.896a.25.25 0 0 1-.354 0l-2.896-2.896A.25.25 0 0 1 5.104 12H7.25v-1.25Zm-5-2a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5ZM6 8a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1 0-1.5h.5A.75.75 0 0 1 6 8Zm2.25.75a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5ZM12 8a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1 0-1.5h.5A.75.75 0 0 1 12 8Zm2.25.75a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5Z"
        />
      </svg>
      <span>Expand</span>
    </button>
    <button class="action-btn" onclick={oncollapseall} title="Collapse All">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M5.104 4h5.792a.25.25 0 0 0 .177-.427L8.177.677a.25.25 0 0 0-.354 0L4.927 3.573A.25.25 0 0 0 5.104 4ZM8.823 12.896l2.896-2.896A.25.25 0 0 0 11.542 9.573H5.104a.25.25 0 0 0-.177.427l2.896 2.896a.25.25 0 0 0 .354 0ZM1.75 8.75a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5ZM6 8a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1 0-1.5h.5A.75.75 0 0 1 6 8Zm2.25.75a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5ZM12 8a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1 0-1.5h.5A.75.75 0 0 1 12 8Zm2.25.75a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5Z"
        />
      </svg>
      <span>Collapse</span>
    </button>
  </div>
</div>

<style>
  .tree-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .search-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    flex: 1;
    max-width: 300px;
  }

  .search-wrapper:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-light);
  }

  .search-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    background: none;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    outline: none;
    min-width: 0;
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .match-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .clear-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .action-btn {
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
    transition: all var(--transition-fast);
  }

  .action-btn:hover {
    color: var(--color-text-primary);
    background-color: var(--color-bg-hover);
  }
</style>
