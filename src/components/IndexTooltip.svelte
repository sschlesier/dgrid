<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    x: number;
    y: number;
    name: string;
    keyPattern: Record<string, unknown>;
    unique: boolean;
    sparse: boolean;
    expireAfterSeconds?: number;
  }

  let { x, y, name, keyPattern, unique, sparse, expireAfterSeconds }: Props = $props();

  let tooltipEl: HTMLDivElement | undefined = $state();

  let adjustedX = $state(x);
  let adjustedY = $state(y);

  const formattedKey = $derived(
    '{ ' +
      Object.entries(keyPattern)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') +
      ' }'
  );

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

<div class="index-tooltip" bind:this={tooltipEl} style="left: {adjustedX}px; top: {adjustedY}px;">
  <div class="tooltip-name">{name}</div>
  <div class="tooltip-key">{formattedKey}</div>
  {#if unique || sparse || expireAfterSeconds !== undefined}
    <div class="tooltip-flags">
      {#if unique}<span class="flag">unique</span>{/if}
      {#if sparse}<span class="flag">sparse</span>{/if}
      {#if expireAfterSeconds !== undefined}
        <span class="flag">TTL: {expireAfterSeconds}s</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .index-tooltip {
    position: fixed;
    z-index: var(--z-dropdown, 100);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-sm) var(--space-md);
    min-width: 160px;
    max-width: 280px;
    pointer-events: none;
  }

  .tooltip-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tooltip-key {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-mono, monospace);
    word-break: break-all;
    margin-bottom: 4px;
  }

  .tooltip-flags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .flag {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
  }
</style>
