<script lang="ts">
  import { onMount } from 'svelte';

  interface MenuItem {
    label: string;
    onclick?: () => void;
    altLabel?: string;
    altOnclick?: () => void;
    submenu?: MenuItem[];
    destructive?: boolean;
    separator?: boolean;
  }

  interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onclose: () => void;
  }

  const SUBMENU_CLOSE_DELAY_MS = 150;

  let { x, y, items, onclose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();

  // Adjust position if menu would overflow viewport
  let adjustedX = $state(x);
  let adjustedY = $state(y);

  // Index of the open submenu parent at each depth, e.g. [2] or [2, 0]
  let openPath = $state<number[]>([]);
  let altHeld = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

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
    return () => clearTimeout(closeTimer);
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
      return;
    }
    altHeld = event.altKey;
  }

  function handleKeyup(event: KeyboardEvent) {
    altHeld = event.altKey;
  }

  function handleBlur() {
    altHeld = false;
  }

  function hasAlt(item: MenuItem): boolean {
    return !!item.altLabel && !!item.altOnclick;
  }

  function labelFor(item: MenuItem): string {
    return altHeld && hasAlt(item) ? item.altLabel! : item.label;
  }

  function openSubmenu(depth: number, index: number) {
    clearTimeout(closeTimer);
    openPath = [...openPath.slice(0, depth), index];
  }

  function handleItemEnter(item: MenuItem, depth: number, index: number) {
    if (item.submenu) {
      openSubmenu(depth, index);
      return;
    }
    if (openPath.length > depth) {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        openPath = openPath.slice(0, depth);
      }, SUBMENU_CLOSE_DELAY_MS);
    }
  }

  function handleItemClick(event: MouseEvent, item: MenuItem, depth: number, index: number) {
    if (item.submenu) {
      openSubmenu(depth, index);
      return;
    }
    if (event.altKey && hasAlt(item)) {
      item.altOnclick!();
    } else {
      item.onclick?.();
    }
    if (depth > 0) onclose();
  }

  // Keep a submenu inside the viewport: flip left on right overflow, shift up on bottom overflow
  function fitSubmenu(node: HTMLElement) {
    const rect = node.getBoundingClientRect();
    const parentRect = (node.parentElement ?? node).getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      if (parentRect.left - rect.width >= 0) {
        node.style.left = 'auto';
        node.style.right = '100%';
      } else {
        // No room on either side: align to the viewport's left edge
        node.style.left = `${-parentRect.left}px`;
      }
    }
    if (rect.bottom > window.innerHeight) {
      const shift = rect.bottom - window.innerHeight;
      // Never shift above the viewport's top edge
      node.style.top = `${-Math.min(shift, parentRect.top)}px`;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} onblur={handleBlur} />

{#snippet menuItems(list: MenuItem[], depth: number)}
  {#each list as item, index}
    {#if item.separator}
      <div class="context-menu-separator"></div>
    {/if}
    <div class="context-menu-entry">
      <button
        class="context-menu-item"
        class:destructive={item.destructive}
        class:has-submenu={!!item.submenu}
        onmouseenter={() => handleItemEnter(item, depth, index)}
        onclick={(e: MouseEvent) => handleItemClick(e, item, depth, index)}
      >
        <span class="context-menu-label">{labelFor(item)}</span>
        {#if item.submenu}<span class="context-menu-arrow">▸</span>{/if}
      </button>
      {#if item.submenu && openPath[depth] === index}
        <div class="context-menu-submenu" use:fitSubmenu>
          {@render menuItems(item.submenu, depth + 1)}
        </div>
      {/if}
    </div>
  {/each}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="context-menu-backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu"
    bind:this={menuEl}
    style="left: {adjustedX}px; top: {adjustedY}px;"
    onclick={(e: MouseEvent) => e.stopPropagation()}
  >
    {@render menuItems(items, 0)}
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

  .context-menu-entry {
    position: relative;
  }

  .context-menu-submenu {
    position: absolute;
    left: 100%;
    top: 0;
    min-width: 160px;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-xs) 0;
    z-index: 1002;
  }

  .context-menu-item.has-submenu {
    display: flex;
    justify-content: space-between;
    gap: var(--space-lg);
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

  .context-menu-separator {
    height: 1px;
    background-color: var(--color-border-light);
    margin: var(--space-xs) 0;
  }
</style>
