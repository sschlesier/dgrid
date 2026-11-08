import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ResultsGrid from '../../components/grid/ResultsGrid.svelte';
import { gridStore } from '../../stores/grid.svelte';
import { appStore } from '../../stores/app.svelte';
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

describe('ResultsGrid row selection', () => {
  const multi = {
    documents: [
      { _id: '1', name: 'Alice', meta: { a: 1 } },
      { _id: '2', name: 'Bob', meta: { a: 2 } },
      { _id: '3', name: 'Cara', meta: { a: 3 } },
    ],
    page: 1,
    hasMore: false,
  } as unknown as ExecuteQueryResponse;

  let write: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gridStore.cleanupTab('t2');
    gridStore.getState('t2');
    write = vi.fn().mockResolvedValue(undefined);
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      }
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { write, writeText },
      configurable: true,
    });
    ({ rerender } = render(ResultsGrid, {
      props: { tabId: 't2', results: multi, connectionId: 'c1', database: 'db', collection: 'col' },
    }));
  });

  let rerender: (_props: Record<string, unknown>) => Promise<void>;

  async function writtenText(call = 0): Promise<string> {
    const item = write.mock.calls[call][0][0] as { items: Record<string, Blob> };
    return item.items['text/plain'].text();
  }

  async function chooseCopyItem(label: string, altKey = false) {
    await fireEvent.click(screen.getByText('Copy'));
    await fireEvent.click(screen.getByText(label), { altKey });
  }

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const gutter = (i: number) => document.querySelectorAll('.row-gutter')[i] as HTMLElement;
  const row = (i: number) => document.querySelector(`.grid-row[data-row-index="${i}"]`)!;
  const container = () => document.querySelector('.results-grid') as HTMLElement;

  it('shows 1-based row numbers in the gutter', () => {
    expect(gutter(0).textContent?.trim()).toBe('1');
    expect(gutter(2).textContent?.trim()).toBe('3');
  });

  it('selects only the clicked row on a gutter click', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(1));

    expect(row(0).classList.contains('selected')).toBe(false);
    expect(row(1).classList.contains('selected')).toBe(true);
    expect(row(1).getAttribute('aria-selected')).toBe('true');
  });

  it('toggles a row with Cmd+click', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(2), { metaKey: true });

    expect(row(0).classList.contains('selected')).toBe(true);
    expect(row(2).classList.contains('selected')).toBe(true);
  });

  it('selects a range with Shift+click on a data cell', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(row(2).querySelector('[data-field-key="name"]')!, { shiftKey: true });

    expect([0, 1, 2].every((i) => row(i).classList.contains('selected'))).toBe(true);
  });

  it('drills on a plain click of a drillable cell without selecting', async () => {
    await fireEvent.click(row(0).querySelector('[data-field-key="meta"]')!);

    expect(gridStore.getDrilldownPath('t2')).toEqual(['meta']);
    expect(gridStore.getSelectedRows('t2')).toEqual([]);
  });

  it('does not drill on a Cmd+click of a drillable cell', async () => {
    await fireEvent.click(row(0).querySelector('[data-field-key="meta"]')!, { metaKey: true });

    expect(gridStore.getDrilldownPath('t2')).toEqual([]);
    expect(gridStore.getSelectedRows('t2')).toEqual([0]);
  });

  it('selects every row with Cmd+A and clears with Escape', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.keyDown(container(), { key: 'a', metaKey: true });
    expect(gridStore.getSelectedRows('t2')).toEqual([0, 1, 2]);

    await fireEvent.keyDown(container(), { key: 'Escape' });
    expect(gridStore.getSelectedRows('t2')).toEqual([]);
  });

  it('copies the selected rows with Cmd+C', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(2), { metaKey: true });
    await fireEvent.keyDown(container(), { key: 'c', metaKey: true });

    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as { items: Record<string, Blob> };
    const text = await item.items['text/plain'].text();
    expect(text).toContain('Alice');
    expect(text).toContain('Cara');
    expect(text).not.toContain('Bob');
  });

  it('does not touch the clipboard on Cmd+C with no selection', async () => {
    container().focus();
    await fireEvent.keyDown(container(), { key: 'c', metaKey: true });

    expect(write).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('defers Cmd+C to the browser when text is selected', async () => {
    await fireEvent.click(gutter(0));
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'some text',
    } as unknown as Selection);
    await fireEvent.keyDown(container(), { key: 'c', metaKey: true });

    expect(write).not.toHaveBeenCalled();
  });

  it('offers Copy Rows for a multi-row selection, and Copy Row once an unselected row is right-clicked', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(1), { shiftKey: true });
    await fireEvent.contextMenu(row(0).querySelector('[data-field-key="name"]')!);
    await fireEvent.click(screen.getByText('Copy'));
    expect(screen.getByText('Copy Rows')).toBeTruthy();

    await fireEvent.click(document.querySelector('.context-menu-backdrop') as HTMLElement);
    await fireEvent.contextMenu(row(2).querySelector('[data-field-key="name"]')!);
    await fireEvent.click(screen.getByText('Copy'));
    expect(screen.getByText('Copy Row')).toBeTruthy();
    expect(gridStore.getSelectedRows('t2')).toEqual([2]);
  });

  it('toggles a row with Ctrl+click on the gutter and on a data cell', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(2), { ctrlKey: true });
    await fireEvent.click(row(1).querySelector('[data-field-key="name"]')!, { ctrlKey: true });
    expect(gridStore.getSelectedRows('t2')).toEqual([0, 1, 2]);

    await fireEvent.click(gutter(1), { ctrlKey: true });
    expect(gridStore.getSelectedRows('t2')).toEqual([0, 2]);
  });

  it('prevents the browser select-all on Cmd+A', async () => {
    await fireEvent.click(gutter(0));
    const notPrevented = await fireEvent.keyDown(container(), { key: 'a', metaKey: true });

    expect(notPrevented).toBe(false);
  });

  it('copies the selected rows in order without headers on Cmd+C', async () => {
    await fireEvent.click(gutter(2));
    await fireEvent.click(gutter(0), { metaKey: true });
    await fireEvent.keyDown(container(), { key: 'c', metaKey: true });

    const lines = (await writtenText()).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Alice');
    expect(lines[1]).toContain('Cara');
  });

  it('copies every selected row from the Copy Rows menu item', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(2), { shiftKey: true });
    await fireEvent.contextMenu(row(1).querySelector('[data-field-key="name"]')!);
    await chooseCopyItem('Copy Rows');

    const lines = (await writtenText()).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Bob');
  });

  it('adds a header line when Copy Rows is chosen with ⌥ held', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(1), { shiftKey: true });
    await fireEvent.contextMenu(row(0).querySelector('[data-field-key="name"]')!);
    await chooseCopyItem('Copy Rows', true);

    const lines = (await writtenText()).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('name');
    expect(lines[0]).not.toContain('Alice');
  });

  it('shows no notification when the copy succeeds', async () => {
    const notify = vi.spyOn(appStore, 'notify');
    await fireEvent.click(gutter(0));
    await fireEvent.keyDown(container(), { key: 'c', metaKey: true });

    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a failed multi-row copy as rows', async () => {
    write.mockRejectedValue(new Error('denied'));
    writeText.mockRejectedValue(new Error('denied'));
    const notify = vi.spyOn(appStore, 'notify');
    await fireEvent.click(gutter(0));
    await fireEvent.click(gutter(1), { shiftKey: true });
    await fireEvent.keyDown(container(), { key: 'c', metaKey: true });

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith('error', 'Failed to copy rows to clipboard')
    );
  });

  it('reports a failed single-row copy as a row', async () => {
    write.mockRejectedValue(new Error('denied'));
    writeText.mockRejectedValue(new Error('denied'));
    const notify = vi.spyOn(appStore, 'notify');
    await fireEvent.click(gutter(0));
    await fireEvent.keyDown(container(), { key: 'c', metaKey: true });

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith('error', 'Failed to copy row to clipboard')
    );
  });

  it('clears the selection when the results change', async () => {
    await fireEvent.click(gutter(0));
    expect(gridStore.getSelectedRows('t2')).toEqual([0]);

    await rerender({ results: { ...multi, page: 2 } });

    expect(gridStore.getSelectedRows('t2')).toEqual([]);
  });

  it('keeps the selection when Escape is pressed with a context menu open', async () => {
    await fireEvent.click(gutter(0));
    await fireEvent.contextMenu(row(0).querySelector('[data-field-key="name"]')!);
    await fireEvent.keyDown(container(), { key: 'Escape' });

    expect(gridStore.getSelectedRows('t2')).toEqual([0]);
  });
});
