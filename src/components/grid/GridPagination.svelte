<script lang="ts">
  interface Props {
    totalCount: number;
    page: number;
    pageSize: 50 | 100 | 250 | 500;
    hasMore: boolean;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let { totalCount, page, pageSize, hasMore, onpagechange, onpagesizechange }: Props = $props();

  const totalPages = $derived(Math.ceil(totalCount / pageSize));

  function handlePrevious() {
    if (page > 1 && onpagechange) {
      onpagechange(page - 1);
    }
  }

  function handleNext() {
    if (hasMore && onpagechange) {
      onpagechange(page + 1);
    }
  }

  function handlePageSizeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const newSize = parseInt(select.value, 10) as 50 | 100 | 250 | 500;
    if (onpagesizechange) {
      onpagesizechange(newSize);
    }
  }
</script>

<div class="pagination">
  <span class="count">
    {totalCount.toLocaleString()} document{totalCount !== 1 ? 's' : ''}
  </span>

  {#if totalCount > 50}
    <div class="page-size">
      <label for="page-size-select">Per page:</label>
      <select id="page-size-select" value={pageSize} onchange={handlePageSizeChange}>
        <option value={50}>50</option>
        <option value={100}>100</option>
        <option value={250}>250</option>
        <option value={500}>500</option>
      </select>
    </div>
  {/if}

  {#if totalPages > 1}
    <div class="page-nav">
      <button class="nav-btn" onclick={handlePrevious} disabled={page === 1} title="Previous page">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z"
          />
        </svg>
      </button>

      <span class="page-info">
        Page {page} of {totalPages}
      </span>

      <button class="nav-btn" onclick={handleNext} disabled={!hasMore} title="Next page">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .pagination {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border-light);
    font-size: var(--font-size-sm);
  }

  .count {
    color: var(--color-text-secondary);
  }

  .page-size {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-left: auto;
  }

  .page-size label {
    color: var(--color-text-secondary);
  }

  .page-size select {
    padding: 2px 6px;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .page-nav {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .nav-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
    border-color: var(--color-border-dark);
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
</style>
