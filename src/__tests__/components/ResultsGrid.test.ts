import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ResultsGrid from '../../components/grid/ResultsGrid.svelte';
import { gridStore } from '../../stores/grid.svelte';
import { keybindingsStore } from '../../stores/keybindings.svelte';
import type { ExecuteQueryResponse } from '../../lib/contracts';

const results = {
  documents: [{ _id: '1', name: 'Alice' }],
  page: 1,
  hasMore: false,
} as unknown as ExecuteQueryResponse;

function hintFor(label: string): string | undefined {
  return (
    screen.getByText(label).closest('button')?.querySelector('.context-menu-hint')?.textContent ??
    undefined
  );
}

async function openMenu() {
  const cell = document.querySelector('[data-field-key="name"]') as HTMLElement;
  await fireEvent.contextMenu(cell);
}

function renderGrid() {
  // The grid creates per-tab state lazily inside a derived; create it up front
  gridStore.getState('t1');
  return render(ResultsGrid, {
    props: { tabId: 't1', results, connectionId: 'c1', database: 'db', collection: 'col' },
  });
}

describe('ResultsGrid context menu hints', () => {
  afterEach(() => {
    cleanup();
    keybindingsStore.resetBinding('insert-document');
  });

  it('shows the current bindings on the edit and insert items', async () => {
    renderGrid();
    await openMenu();

    expect(hintFor('Edit Field')).toBe(keybindingsStore.getFormatted('edit-field'));
    expect(hintFor('Edit Document')).toBe(keybindingsStore.getFormatted('edit-document'));
    expect(hintFor('Insert Document')).toBe(keybindingsStore.getFormatted('insert-document'));
  });

  it('shows no hint on Delete Document', async () => {
    renderGrid();
    await openMenu();

    expect(hintFor('Delete Document')).toBeUndefined();
  });

  it('shows a customised binding the next time the menu opens', async () => {
    renderGrid();
    await openMenu();
    const before = hintFor('Insert Document');
    await fireEvent.click(document.querySelector('.context-menu-backdrop') as HTMLElement);

    keybindingsStore.setBinding('insert-document', { key: 'i', meta: true, shift: true });
    await openMenu();

    expect(hintFor('Insert Document')).toBe(keybindingsStore.getFormatted('insert-document'));
    expect(hintFor('Insert Document')).not.toBe(before);
  });
});
