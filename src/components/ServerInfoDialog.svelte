<script lang="ts">
  import { getServerInfo } from '../api/client';
  import type { ServerInfoResponse, ServerInfoSection } from '../lib/contracts';
  import { allSectionsFailed, sectionRows, serverVersion } from '../lib/serverInfo';

  interface Props {
    connectionId: string;
    connectionName: string;
    onclose: () => void;
  }

  let { connectionId, connectionName, onclose }: Props = $props();

  let info = $state<ServerInfoResponse | null>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    const id = connectionId;
    let cancelled = false;
    info = null;
    loadError = null;
    getServerInfo(id)
      .then((result) => {
        if (!cancelled) info = result;
      })
      .catch((e: unknown) => {
        if (!cancelled) loadError = e instanceof Error ? e.message : String(e);
      });
    return () => {
      cancelled = true;
    };
  });

  const failureMessage = $derived(
    loadError ??
      (info && allSectionsFailed(info)
        ? (info.build.error ?? info.runtime.error ?? info.topology.error ?? 'Unknown error')
        : null)
  );
  const version = $derived(info ? serverVersion(info) : undefined);

  const sections = $derived<{ title: string; section: ServerInfoSection }[]>(
    info
      ? [
          { title: 'Build', section: info.build },
          { title: 'Runtime', section: info.runtime },
          { title: 'Topology', section: info.topology },
        ]
      : []
  );

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog server-info-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Server Info: {connectionName}"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="dialog-header">
      <h2>{connectionName}</h2>
    </div>

    <div class="dialog-content">
      {#if failureMessage}
        <p class="server-info-error" data-testid="server-info-error">{failureMessage}</p>
      {:else if !info}
        <p class="server-info-loading">Loading…</p>
      {:else}
        {#if version}
          <div class="server-info-version" data-testid="server-info-version">{version}</div>
        {/if}
        {#each sections as { title, section } (title)}
          <section class="server-info-section">
            <h3>{title}</h3>
            {#if section.error !== undefined}
              <p class="server-info-unavailable">Unavailable: {section.error}</p>
            {:else}
              <dl>
                {#each sectionRows(section) as row (row.key)}
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                {/each}
              </dl>
            {/if}
          </section>
        {/each}
      {/if}
    </div>

    <div class="dialog-footer">
      <button type="button" class="cancel-btn" data-testid="server-info-close" onclick={onclose}>
        Close
      </button>
    </div>
  </div>
</div>

<style>
  .server-info-dialog {
    max-width: 560px;
    max-height: 80vh;
  }

  .server-info-version {
    font-size: 2rem;
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-md);
  }

  .server-info-section {
    margin-bottom: var(--space-md);
  }

  .server-info-section h3 {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    margin-bottom: var(--space-xs);
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-xs) var(--space-md);
    margin: 0;
    font-size: var(--font-size-md);
  }

  dt {
    color: var(--color-text-secondary);
  }

  dd {
    margin: 0;
    word-break: break-word;
  }

  .server-info-error,
  .server-info-unavailable {
    color: var(--color-error);
    font-size: var(--font-size-md);
  }

  .server-info-loading {
    color: var(--color-text-secondary);
  }
</style>
