<script lang="ts">
  import { onMount } from 'svelte';

  interface MenuItem {
    label: string;
    onclick: () => void;
    destructive?: boolean;
  }

  interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onclose: () => void;
  }

  let { x, y, items, onclose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();

  // Adjust position if menu would overflow viewport
  let adjustedX = $state(x);
  let adjustedY = $state(y);

  onMount(() => {
    if (menuEl) {
      const rect = menuEl.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        adjustedX = x - rect.width;
      }
      if (rect.bottom > window.innerHeight) {
        adjustedY = y - rect.height;
      }
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="context-menu-backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu"
    bind:this={menuEl}
    style="left: {adjustedX}px; top: {adjustedY}px;"
    onclick={(e: MouseEvent) => e.stopPropagation()}
  >
    {#each items as item}
      <button
        class="context-menu-item"
        class:destructive={item.destructive}
        onclick={() => item.onclick()}
      >
        {item.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .context-menu {
    position: fixed;
    min-width: 160px;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-xs) 0;
    z-index: 1001;
  }

  .context-menu-item {
    display: block;
    width: 100%;
    padding: var(--space-sm) var(--space-lg);
    border: none;
    background: none;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }

  .context-menu-item:hover {
    background-color: var(--color-bg-hover);
  }

  .context-menu-item.destructive {
    color: var(--color-error-text);
  }

  .context-menu-item.destructive:hover {
    background-color: var(--color-error-light);
  }
</style>
