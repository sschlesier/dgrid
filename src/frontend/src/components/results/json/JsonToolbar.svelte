<script lang="ts">
  import type { JsonFormat } from './formatters';
  import { FORMAT_LABELS } from './formatters';

  interface Props {
    format: JsonFormat;
    onformatchange: (_format: JsonFormat) => void;
    oncopyall: () => void;
  }

  let { format, onformatchange, oncopyall }: Props = $props();

  let copied = $state(false);
  let showDropdown = $state(false);

  const formats: JsonFormat[] = ['mongodb-shell', 'pure-json', 'mongoexport', 'relaxed-ejson'];

  function handleFormatSelect(selectedFormat: JsonFormat) {
    onformatchange(selectedFormat);
    showDropdown = false;
  }

  async function handleCopyAll() {
    oncopyall();
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.format-dropdown')) {
      showDropdown = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="json-toolbar">
  <div class="format-dropdown">
    <button class="format-btn" onclick={() => (showDropdown = !showDropdown)}>
      <span class="format-label">{FORMAT_LABELS[format]}</span>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"
        />
      </svg>
    </button>

    {#if showDropdown}
      <div class="dropdown-menu">
        {#each formats as fmt}
          <button
            class="dropdown-item"
            class:active={fmt === format}
            onclick={() => handleFormatSelect(fmt)}
          >
            {FORMAT_LABELS[fmt]}
            {#if fmt === format}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path
                  d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
                />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <button class="copy-all-btn" class:copied onclick={handleCopyAll}>
    {#if copied}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
        />
      </svg>
      <span>Copied</span>
    {:else}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
        />
        <path
          d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
        />
      </svg>
      <span>Copy All</span>
    {/if}
  </button>
</div>

<style>
  .json-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .format-dropdown {
    position: relative;
  }

  .format-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .format-btn:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-medium);
  }

  .format-label {
    font-weight: var(--font-weight-medium);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 160px;
    padding: var(--space-xs);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: var(--z-dropdown);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .dropdown-item:hover {
    background-color: var(--color-bg-hover);
  }

  .dropdown-item.active {
    color: var(--color-primary);
  }

  .copy-all-btn {
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

  .copy-all-btn:hover {
    color: var(--color-text-primary);
    background-color: var(--color-bg-hover);
  }

  .copy-all-btn.copied {
    color: var(--color-success);
  }
</style>
