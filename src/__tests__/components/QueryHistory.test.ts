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
      await fireEvent.click(screen.getByLabelText('Clear filter'));

      expect(input).toHaveValue('');
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
});
