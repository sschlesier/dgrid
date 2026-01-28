<script lang="ts">
  import type { CellType } from '../../grid/types';

  interface Props {
    type: CellType;
  }

  let { type }: Props = $props();
</script>

<span class="type-icon type-icon-{type}">
  {#if type === 'ObjectId' || type === 'UUID'}
    <!-- ID badge icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm2-.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5H4z"
      />
      <path d="M5.5 6.5h5v1h-5v-1zm0 2h3v1h-3v-1z" />
    </svg>
  {:else if type === 'string'}
    <!-- Quotes icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M3.5 5.5a.5.5 0 0 1 .5-.5h1.5a.5.5 0 0 1 0 1H4.5v2H5a.5.5 0 0 1 0 1h-.5v1h1a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5v-5zm6 0a.5.5 0 0 1 .5-.5h1.5a.5.5 0 0 1 0 1h-1v2h.5a.5.5 0 0 1 0 1H10v1h1a.5.5 0 0 1 0 1h-1.5a.5.5 0 0 1-.5-.5v-5z"
      />
    </svg>
  {:else if type === 'number' || type === 'Long' || type === 'Decimal128'}
    <!-- Hash/number icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M6.5 2.5a.5.5 0 0 0-1 0v2h-2a.5.5 0 0 0 0 1h2v3h-2a.5.5 0 0 0 0 1h2v2a.5.5 0 0 0 1 0v-2h3v2a.5.5 0 0 0 1 0v-2h2a.5.5 0 0 0 0-1h-2v-3h2a.5.5 0 0 0 0-1h-2v-2a.5.5 0 0 0-1 0v2h-3v-2zm3 3v3h-3v-3h3z"
      />
    </svg>
  {:else if type === 'Date'}
    <!-- Calendar icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M4 0a1 1 0 0 0-1 1v1H2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-1V1a1 1 0 0 0-2 0v1H5V1a1 1 0 0 0-1-1zM1 6h14v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6zm2.5 1a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-1z"
      />
    </svg>
  {:else if type === 'Object'}
    <!-- Braces icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M3 2a2 2 0 0 0-2 2v1.5a.5.5 0 0 1-.5.5H0v4h.5a.5.5 0 0 1 .5.5V12a2 2 0 0 0 2 2h1v-1H3a1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1v-2a1 1 0 0 0 1-1V4a1 1 0 0 1 1-1h1V2H3zm10 0h-1v1h1a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1v2a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1h-1v1h1a2 2 0 0 0 2-2v-1.5a.5.5 0 0 1 .5-.5H16V6h-.5a.5.5 0 0 1-.5-.5V4a2 2 0 0 0-2-2z"
      />
    </svg>
  {:else if type === 'Array'}
    <!-- Brackets icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 4a2 2 0 0 1 2-2h1v1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1v1H4a2 2 0 0 1-2-2V4z" />
      <path d="M14 4a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v1h1a2 2 0 0 0 2-2V4z" />
    </svg>
  {:else if type === 'boolean'}
    <!-- Toggle icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3a5 5 0 0 0 0 10h6a5 5 0 0 0 0-10H5zm6 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
    </svg>
  {:else if type === 'null' || type === 'undefined'}
    <!-- Null/empty icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM2 8a6 6 0 1 1 12 0A6 6 0 0 1 2 8z" />
      <path d="M4.5 7.5h7v1h-7v-1z" />
    </svg>
  {:else if type === 'Binary'}
    <!-- Binary/data icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M3 5h10v6H3V5zm-.5-1A.5.5 0 0 0 2 4.5v7a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-11z"
      />
      <path d="M4.5 6h1v1h-1V6zm0 2h1v1h-1V8zm2-2h1v1h-1V6zm0 2h1v1h-1V8zm2-2h1v1h-1V6z" />
    </svg>
  {:else}
    <!-- Default: document icon -->
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4zm0 1h5v4h4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"
      />
    </svg>
  {/if}
</span>

<style>
  .type-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .type-icon svg {
    opacity: 0.7;
  }

  /* Type-specific colors */
  .type-icon-ObjectId,
  .type-icon-UUID {
    color: var(--color-primary);
  }

  .type-icon-Date {
    color: var(--color-info);
  }

  .type-icon-number,
  .type-icon-Long,
  .type-icon-Decimal128 {
    color: var(--color-success);
  }

  .type-icon-boolean {
    color: var(--color-warning);
  }

  .type-icon-null,
  .type-icon-undefined {
    color: var(--color-text-muted);
  }

  .type-icon-string {
    color: var(--color-text-secondary);
  }

  .type-icon-Array,
  .type-icon-Object {
    color: var(--color-primary);
  }

  .type-icon-Binary {
    color: var(--color-text-secondary);
  }
</style>
