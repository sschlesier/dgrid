<script lang="ts">
  interface Props {
    path: string[];
    canBack: boolean;
    canForward: boolean;
    onback?: () => void;
    onforward?: () => void;
    onsegment?: (_index: number) => void;
  }

  let { path, canBack, canForward, onback, onforward, onsegment }: Props = $props();

  function handleBack() {
    if (canBack && onback) onback();
  }

  function handleForward() {
    if (canForward && onforward) onforward();
  }

  function handleSegmentClick(index: number) {
    if (onsegment) onsegment(index);
  }
</script>

{#if path.length > 0}
  <div class="breadcrumb">
    <div class="nav-buttons">
      <button class="nav-btn" onclick={handleBack} disabled={!canBack} title="Back">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"
          />
        </svg>
      </button>

      <button class="nav-btn" onclick={handleForward} disabled={!canForward} title="Forward">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M8.22 3.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.53a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </button>
    </div>

    <div class="path">
      <button class="segment root" onclick={() => handleSegmentClick(-1)}> data </button>

      {#each path as segment, i (i)}
        <span class="separator">&gt;</span>
        <button
          class="segment"
          class:current={i === path.length - 1}
          onclick={() => handleSegmentClick(i)}
        >
          {segment}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .nav-buttons {
    display: flex;
    gap: 2px;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .nav-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .path {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-sm);
    overflow-x: auto;
  }

  .segment {
    padding: 2px 6px;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .segment:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .segment.root {
    color: var(--color-primary);
  }

  .segment.current {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
    cursor: default;
  }

  .segment.current:hover {
    background-color: transparent;
  }

  .separator {
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
  }
</style>
