<script lang="ts">
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

<div class="tree-field" style="--depth: {depth};">
  <div
    class="field-row"
    class:expandable
    class:expanded
    class:match={isMatch}
    onclick={handleToggle}
    onkeydown={handleKeydown}
    role={expandable ? 'button' : undefined}
    tabindex={expandable ? 0 : -1}
  >
    <span class="field-indent" style="width: calc({depth} * var(--tree-indent))"></span>

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

    <span class="field-key" class:match={isMatch}>{fieldKey}</span>
    <span class="field-colon">:</span>
    <span class="field-type {typeClass}">{getTypeBadge(valueType)}</span>
    <span class="field-value {typeClass}">{displayValue}</span>
  </div>

  {#if expanded && children.length > 0}
    <div class="field-children">
      {#each children as child (child.key)}
        <svelte:self
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
    </div>
  {/if}
</div>

<style>
  .tree-field {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .field-row {
    display: flex;
    align-items: center;
    height: var(--tree-node-height);
    padding-right: var(--space-sm);
    border-radius: var(--radius-sm);
    cursor: default;
  }

  .field-row.expandable {
    cursor: pointer;
  }

  .field-row:hover {
    background-color: var(--color-bg-hover);
  }

  .field-row:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .field-row.match {
    background-color: var(--color-warning-light);
  }

  .field-indent {
    flex-shrink: 0;
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

  .field-row.expanded .field-chevron {
    transform: rotate(90deg);
  }

  .field-spacer {
    width: var(--tree-icon-size);
    flex-shrink: 0;
  }

  .field-key {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
    margin-left: var(--space-xs);
  }

  .field-key.match {
    background-color: var(--color-warning);
    color: var(--color-warning-text);
    padding: 0 2px;
    border-radius: 2px;
  }

  .field-colon {
    color: var(--color-text-muted);
    margin-right: var(--space-xs);
  }

  .field-type {
    font-size: var(--font-size-xs);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
    margin-right: var(--space-xs);
  }

  .field-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Type-specific colors */
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

  .field-children {
    /* Children are indented via their own depth */
  }
</style>
