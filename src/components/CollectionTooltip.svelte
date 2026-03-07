<script lang="ts">
  import { onMount } from 'svelte';
  import { formatBytes, formatCount } from '../lib/format';

  interface Props {
    x: number;
    y: number;
    name: string;
    type: 'collection' | 'view';
    documentCount: number;
    avgDocumentSize: number;
    totalSize: number;
    statsLoaded: boolean;
  }

  let { x, y, name, type, documentCount, avgDocumentSize, totalSize, statsLoaded }: Props =
    $props();

  let tooltipEl: HTMLDivElement | undefined = $state();

  let adjustedX = $state(x);
  let adjustedY = $state(y);

  onMount(() => {
    if (tooltipEl) {
      const rect = tooltipEl.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        adjustedX = x - rect.width - 16;
      }
      if (rect.bottom > window.innerHeight) {
        adjustedY = y - rect.height;
      }
    }
  });
</script>

<div
  class="collection-tooltip"
  bind:this={tooltipEl}
  style="left: {adjustedX}px; top: {adjustedY}px;"
>
  <div class="tooltip-name">{name}</div>
  <div class="tooltip-type">{type}</div>
  {#if statsLoaded}
    <div class="tooltip-grid">
      <span class="tooltip-label">Documents</span>
      <span class="tooltip-value">{formatCount(documentCount)}</span>
      <span class="tooltip-label">Avg size</span>
      <span class="tooltip-value">{formatBytes(avgDocumentSize)}</span>
      <span class="tooltip-label">Total size</span>
      <span class="tooltip-value">{formatBytes(totalSize)}</span>
    </div>
  {:else}
    <div class="tooltip-loading">Loading...</div>
  {/if}
</div>

<style>
  .collection-tooltip {
    position: fixed;
    z-index: var(--z-dropdown, 100);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-sm) var(--space-md);
    min-width: 160px;
    pointer-events: none;
  }

  .tooltip-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .tooltip-type {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    text-transform: capitalize;
    margin-bottom: var(--space-sm);
  }

  .tooltip-grid {
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px var(--space-md);
    align-items: baseline;
  }

  .tooltip-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .tooltip-value {
    font-size: var(--font-size-xs);
    color: var(--color-text-primary);
    white-space: nowrap;
    text-align: right;
  }

  .tooltip-loading {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }
</style>
