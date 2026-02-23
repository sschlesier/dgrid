<script lang="ts">
  interface Props {
    exportedCount: number;
    totalCount: number;
    oncancel: () => void;
  }

  let { exportedCount, totalCount, oncancel }: Props = $props();

  const percentage = $derived(totalCount > 0 ? Math.round((exportedCount / totalCount) * 100) : 0);

  function formatNumber(n: number): string {
    return n.toLocaleString();
  }
</script>

<div class="export-overlay">
  <div class="export-card">
    <div class="export-status">
      Exporting {formatNumber(exportedCount)} / {formatNumber(totalCount)} documents...
    </div>

    <div class="progress-track">
      <div class="progress-fill" style="width: {percentage}%"></div>
    </div>

    <div class="export-percentage">{percentage}%</div>

    <button class="cancel-btn" onclick={oncancel}>Cancel</button>
  </div>
</div>

<style>
  .export-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.3);
    z-index: 10;
  }

  .export-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    background-color: var(--color-bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    min-width: 320px;
  }

  .export-status {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .progress-track {
    width: 100%;
    height: 6px;
    background-color: var(--color-bg-tertiary);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: var(--color-primary);
    border-radius: 3px;
    transition: width 0.2s ease;
  }

  .export-percentage {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .cancel-btn {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: none;
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-btn:hover {
    color: var(--color-text-primary);
    border-color: var(--color-text-secondary);
    background-color: var(--color-bg-hover);
  }
</style>
