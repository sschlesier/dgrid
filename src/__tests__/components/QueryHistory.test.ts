import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import QueryHistory from '../../components/QueryHistory.svelte';
import type { QueryHistoryItem } from '../../types';

function createItem(id: string, query: string, database: string): QueryHistoryItem {
  return {
    id,
    query,
    database,
    connectionId: 'conn-1',
    timestamp: new Date().toISOString(),
  };
}

const longQuery = `db.orders.find({\n  status: 'shipped',\n  ${'x'.repeat(200)}: 1,\n  trackingCode: 'ZEBRA'\n})`;

const history: QueryHistoryItem[] = [
  createItem('1', 'db.users.find({})', 'app'),
  createItem('2', 'db.products.find({ price: { $gt: 10 } })', 'shop'),
  createItem('3', longQuery, 'app'),
];

describe('QueryHistory', () => {
  const onselect = vi.fn();
  const onclear = vi.fn();
  const onclose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderHistory(items: QueryHistoryItem[] = history) {
    return render(QueryHistory, { props: { history: items, onselect, onclear, onclose } });
  }

  function visibleQueries(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.item-query')).map((el) => el.textContent ?? '');
  }

  describe('filter', () => {
    it('focuses the filter input on open', () => {
      renderHistory();

      expect(screen.getByLabelText('Filter history')).toHaveFocus();
    });

    it('shows the full list in order when the filter is empty', () => {
      const { container } = renderHistory();

      expect(visibleQueries(container)).toHaveLength(3);
      expect(visibleQueries(container)[0]).toBe('db.users.find({})');
    });

    it('matches query text case-insensitively', async () => {
      const { container } = renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'PRODUCTS' },
      });

      expect(visibleQueries(container)).toEqual(['db.products.find({ price: { $gt: 10 } })']);
    });

    it('matches text beyond the truncated preview', async () => {
      const { container } = renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'zebra' },
      });

      expect(visibleQueries(container)).toHaveLength(1);
      expect(visibleQueries(container)[0]).toContain('db.orders.find');
    });

    it('matches the database name', async () => {
      const { container } = renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'Shop' },
      });

      expect(visibleQueries(container)).toEqual(['db.products.find({ price: { $gt: 10 } })']);
    });

    it('ignores surrounding whitespace and treats whitespace-only as empty', async () => {
      const { container } = renderHistory();
      const input = screen.getByLabelText('Filter history');

      await fireEvent.input(input, { target: { value: '  users  ' } });
      expect(visibleQueries(container)).toEqual(['db.users.find({})']);

      await fireEvent.input(input, { target: { value: '   ' } });
      expect(visibleQueries(container)).toHaveLength(3);
    });

    it('shows "No matching queries" when nothing matches', async () => {
      renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'nothing-here' },
      });

      expect(screen.getByText('No matching queries')).toBeInTheDocument();
    });

    it('shows "No queries in history" and no filter when history is empty', () => {
      renderHistory([]);

      expect(screen.getByText('No queries in history')).toBeInTheDocument();
      expect(screen.queryByLabelText('Filter history')).not.toBeInTheDocument();
    });

    it('clears the filter with the clear button', async () => {
      const { container } = renderHistory();
      const input = screen.getByLabelText('Filter history');

      expect(screen.queryByLabelText('Clear filter')).not.toBeInTheDocument();
      await fireEvent.input(input, { target: { value: 'users' } });
      const clearButton = screen.getByLabelText('Clear filter');
      clearButton.focus();
      await fireEvent.click(clearButton);

      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      expect(visibleQueries(container)).toHaveLength(3);
    });

    it('clears the filter on Escape, then closes on a second Escape', async () => {
      const { container } = renderHistory();
      const input = screen.getByLabelText('Filter history');

      await fireEvent.input(input, { target: { value: 'users' } });
      await fireEvent.keyDown(input, { key: 'Escape' });

      expect(input).toHaveValue('');
      expect(visibleQueries(container)).toHaveLength(3);
      expect(onclose).not.toHaveBeenCalled();

      await fireEvent.keyDown(input, { key: 'Escape' });

      expect(onclose).toHaveBeenCalledOnce();
    });

    it('calls onselect with a filtered item when clicked', async () => {
      renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'shop' },
      });
      await fireEvent.click(screen.getByText('db.products.find({ price: { $gt: 10 } })'));

      expect(onselect).toHaveBeenCalledWith(history[1]);
    });

    it('starts with an empty filter when reopened', async () => {
      const first = renderHistory();
      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'users' },
      });
      first.unmount();

      renderHistory();

      expect(screen.getByLabelText('Filter history')).toHaveValue('');
    });

    it('Clear All clears everything while a filter is active', async () => {
      renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'users' },
      });
      await fireEvent.click(screen.getByText('Clear All'));

      expect(onclear).toHaveBeenCalledOnce();
    });

    it('shows the "Filter history..." placeholder', () => {
      renderHistory();

      expect(screen.getByPlaceholderText('Filter history...')).toBeInTheDocument();
    });

    it('shows every item when the filter is empty, beyond the old 20-item cap', () => {
      const many = Array.from({ length: 25 }, (_, i) =>
        createItem(`${i}`, `db.c${i}.find({})`, 'app')
      );
      const { container } = renderHistory(many);

      expect(visibleQueries(container)).toEqual(many.map((item) => item.query));
    });

    it('keeps newest-first order among several matches', async () => {
      const { container } = renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'find' },
      });

      expect(visibleQueries(container)).toEqual([
        'db.users.find({})',
        'db.products.find({ price: { $gt: 10 } })',
        expect.stringContaining('db.orders.find'),
      ]);
    });

    it('matches a mixed-case database name ignoring case', async () => {
      const { container } = renderHistory([
        createItem('1', 'db.users.find({})', 'MyDB'),
        createItem('2', 'db.users.find({})', 'other'),
      ]);

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'mydb' },
      });

      expect(visibleQueries(container)).toHaveLength(1);
    });

    it('clears a whitespace-only filter on Escape before closing', async () => {
      renderHistory();
      const input = screen.getByLabelText('Filter history');

      await fireEvent.input(input, { target: { value: '   ' } });
      await fireEvent.keyDown(input, { key: 'Escape' });

      expect(input).toHaveValue('');
      expect(onclose).not.toHaveBeenCalled();

      await fireEvent.keyDown(input, { key: 'Escape' });

      expect(onclose).toHaveBeenCalledOnce();
    });

    it('hides the hover popup when the filter removes the hovered item', async () => {
      const { container } = renderHistory();

      await fireEvent.mouseEnter(screen.getByText('db.users.find({})').closest('button')!);
      expect(container.ownerDocument.querySelector('.query-popup')).not.toBeNull();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'shop' },
      });

      expect(container.ownerDocument.querySelector('.query-popup')).toBeNull();
    });

    it('keeps the hover popup hidden after clearing a filter that hid the hovered item', async () => {
      const { container } = renderHistory();
      const input = screen.getByLabelText('Filter history');

      await fireEvent.mouseEnter(screen.getByText('db.users.find({})').closest('button')!);
      await fireEvent.input(input, { target: { value: 'nothing-here' } });
      await fireEvent.click(screen.getByLabelText('Clear filter'));

      expect(container.ownerDocument.querySelector('.query-popup')).toBeNull();
    });

    it('closes on the first Escape after Clear All empties a filtered history', async () => {
      const { rerender } = renderHistory();

      await fireEvent.input(screen.getByLabelText('Filter history'), {
        target: { value: 'users' },
      });
      await fireEvent.click(screen.getByText('Clear All'));
      await rerender({ history: [], onselect, onclear, onclose });
      await fireEvent.keyDown(window, { key: 'Escape' });

      expect(onclose).toHaveBeenCalledOnce();
    });
  });

  describe('keyboard navigation', () => {
    const filter = () => screen.getByLabelText('Filter history');
    const active = (container: HTMLElement) => container.querySelector('.history-item.active');
    const key = (k: string) => fireEvent.keyDown(filter(), { key: k });

    it('highlights nothing on open', () => {
      const { container } = renderHistory();
      expect(active(container)).toBeNull();
    });

    it('ArrowDown highlights the first item, then moves down; ArrowUp moves back', async () => {
      const { container } = renderHistory();
      await key('ArrowDown');
      expect(active(container)).toHaveTextContent('db.users.find({})');
      await key('ArrowDown');
      expect(active(container)).toHaveTextContent('db.products');
      await key('ArrowUp');
      expect(active(container)).toHaveTextContent('db.users.find({})');
    });

    it('stops at the first and last item', async () => {
      const { container } = renderHistory();
      await key('ArrowDown');
      await key('ArrowUp');
      expect(active(container)).toHaveTextContent('db.users.find({})');
      for (let i = 0; i < 3; i++) await key('ArrowDown');
      expect(active(container)).toHaveTextContent('trackingCode');
      await key('ArrowDown');
      expect(active(container)).toHaveTextContent('trackingCode');
    });

    it('ArrowUp with nothing highlighted keeps nothing highlighted', async () => {
      const { container } = renderHistory();
      await key('ArrowUp');
      expect(active(container)).toBeNull();
    });

    it('Enter selects the highlighted item', async () => {
      renderHistory();
      await key('ArrowDown');
      await key('ArrowDown');
      await key('Enter');
      expect(onselect).toHaveBeenCalledTimes(1);
      expect(onselect).toHaveBeenCalledWith(history[1]);
    });

    it('Enter does nothing with no highlight', async () => {
      renderHistory();
      await key('Enter');
      expect(onselect).not.toHaveBeenCalled();
    });

    it('clears the highlight when the filter changes', async () => {
      const { container } = renderHistory();
      await key('ArrowDown');
      expect(active(container)).not.toBeNull();
      await fireEvent.input(filter(), { target: { value: 'users' } });
      expect(active(container)).toBeNull();
      expect(filter()).not.toHaveAttribute('aria-activedescendant');
    });

    it('keeps focus in the filter input and exposes aria-activedescendant', async () => {
      const { container } = renderHistory();
      await key('ArrowDown');
      expect(filter()).toHaveFocus();
      expect(filter()).toHaveAttribute('aria-activedescendant', active(container)!.id);
      expect(active(container)).toHaveAttribute('aria-selected', 'true');
    });

    it('prevents the default cursor movement for arrow keys', async () => {
      renderHistory();
      expect(await fireEvent.keyDown(filter(), { key: 'ArrowDown' })).toBe(false);
    });

    it('Enter keydown on an item button is not handled by the input handler; click selects once', async () => {
      const { container } = renderHistory();
      const button = container.querySelector('.history-item') as HTMLElement;
      await fireEvent.keyDown(button, { key: 'Enter' });
      expect(onselect).not.toHaveBeenCalled();
      await fireEvent.click(button);
      expect(onselect).toHaveBeenCalledTimes(1);
    });

    it('does nothing on arrows or Enter when no items match', async () => {
      const { container } = renderHistory();
      await fireEvent.input(filter(), { target: { value: 'zzz-no-match' } });
      await key('ArrowDown');
      await key('Enter');
      expect(active(container)).toBeNull();
      expect(onselect).not.toHaveBeenCalled();
    });

    it('ignores Enter while an IME composition is active', async () => {
      renderHistory();
      await key('ArrowDown');
      await fireEvent.keyDown(filter(), { key: 'Enter', isComposing: true });
      expect(onselect).not.toHaveBeenCalled();
    });

    it('scrolls the highlighted item into view', async () => {
      const spy = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = spy;
      try {
        const { container } = renderHistory();
        await key('ArrowDown');
        await key('ArrowDown');
        expect(spy).toHaveBeenLastCalledWith({ block: 'nearest' });
        expect(spy.mock.contexts.at(-1)).toBe(active(container));
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });

    it('exposes listbox and option roles', () => {
      renderHistory();
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    it('keeps mouse selection working', async () => {
      const { container } = renderHistory();
      await fireEvent.click(container.querySelectorAll('.history-item')[1]);
      expect(onselect).toHaveBeenCalledWith(history[1]);
    });
  });
});
