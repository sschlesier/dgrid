<script lang="ts">
  import TreeField from './TreeField.svelte';
  import TypeIcon from './TypeIcon.svelte';
  import {
    detectValueType,
    isExpandable,
    getDisplayValue,
    getTypeClass,
    getTypeBadge,
    buildPath,
  } from './tree-utils';

  interface Props {
    fieldKey: string | number;
    value: unknown;
    docIndex: number;
    path: (string | number)[];
    depth: number;
    expandedPaths: Set<string>;
    searchMatches: Set<string>;
    ontoggle: (_path: string) => void;
  }

  let { fieldKey, value, docIndex, path, depth, expandedPaths, searchMatches, ontoggle }: Props =
    $props();

  const fullPath = $derived(buildPath(docIndex, path));
  const valueType = $derived(detectValueType(value));
  const expandable = $derived(isExpandable(value));
  const expanded = $derived(expandedPaths.has(fullPath));
  const displayValue = $derived(getDisplayValue(value, valueType));
  const typeClass = $derived(getTypeClass(valueType));
  const isMatch = $derived(searchMatches.has(fullPath));

  // Get children for expandable types
  const children = $derived.by(() => {
    if (!expandable || !expanded) return [];

    if (Array.isArray(value)) {
      return value.map((item, index) => ({
        key: index,
        value: item,
      }));
    }

    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).map(([k, v]) => ({
        key: k,
        value: v,
      }));
    }

    return [];
  });

  function handleToggle() {
    if (expandable) {
      ontoggle(fullPath);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle();
    } else if (event.key === 'ArrowRight' && expandable && !expanded) {
      event.preventDefault();
      ontoggle(fullPath);
    } else if (event.key === 'ArrowLeft' && expandable && expanded) {
      event.preventDefault();
      ontoggle(fullPath);
    }
  }
</script>

<!-- Row wrapper with display: contents so cells flow into parent grid -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="tree-row"
  class:expandable
  class:expanded
  class:match={isMatch}
  role={expandable ? 'button' : undefined}
  tabindex={expandable ? 0 : undefined}
  onclick={handleToggle}
  onkeydown={handleKeydown}
>
  <!-- Key cell -->
  <div class="key-cell" style="padding-left: calc({depth} * var(--tree-indent) + var(--space-sm))">
    {#if expandable}
      <span class="field-chevron">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </span>
    {:else}
      <span class="field-spacer"></span>
    {/if}
    <TypeIcon type={valueType} />
    <span class="field-key" class:match={isMatch}>{fieldKey}</span>
  </div>

  <!-- Value cell -->
  <div class="value-cell {typeClass}">{displayValue}</div>

  <!-- Type cell -->
  <div class="type-cell">{getTypeBadge(valueType)}</div>
</div>

{#if expanded && children.length > 0}
  {#each children as child (child.key)}
    <TreeField
      fieldKey={child.key}
      value={child.value}
      {docIndex}
      path={[...path, child.key]}
      depth={depth + 1}
      {expandedPaths}
      {searchMatches}
      {ontoggle}
    />
  {/each}
{/if}

<style>
  .tree-row {
    display: contents;
  }

  /* Style the cells when row is hovered */
  .tree-row:hover > .key-cell,
  .tree-row:hover > .value-cell,
  .tree-row:hover > .type-cell {
    background-color: var(--color-bg-hover);
  }

  .tree-row.match > .key-cell,
  .tree-row.match > .value-cell,
  .tree-row.match > .type-cell {
    background-color: var(--color-warning-light);
  }

  .tree-row:focus > .key-cell,
  .tree-row:focus > .value-cell,
  .tree-row:focus > .type-cell {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .tree-row.expandable {
    cursor: pointer;
  }

  .key-cell,
  .value-cell,
  .type-cell {
    display: flex;
    align-items: center;
    height: var(--tree-node-height);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    overflow: hidden;
  }

  .key-cell {
    gap: var(--space-xs);
    padding-right: var(--space-sm);
  }

  .value-cell {
    padding: 0 var(--space-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type-cell {
    padding: 0 var(--space-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .field-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--tree-icon-size);
    height: var(--tree-icon-size);
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform var(--transition-fast);
  }

  .tree-row.expanded .field-chevron {
    transform: rotate(90deg);
  }

  .field-spacer {
    width: var(--tree-icon-size);
    flex-shrink: 0;
  }

  .field-key {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
  }

  .field-key.match {
    background-color: var(--color-warning);
    color: var(--color-warning-text);
    padding: 0 2px;
    border-radius: 2px;
  }

  /* Type-specific value colors */
  .type-id {
    color: var(--color-primary);
  }

  .type-date {
    color: var(--color-info);
  }

  .type-number {
    color: var(--color-success);
  }

  .type-boolean {
    color: var(--color-warning);
  }

  .type-null {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .type-string {
    color: var(--color-text-primary);
  }

  .type-array,
  .type-object {
    color: var(--color-primary);
  }

  .type-binary {
    color: var(--color-text-secondary);
  }
</style>
