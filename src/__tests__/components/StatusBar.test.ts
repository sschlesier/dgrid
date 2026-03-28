import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import StatusBar from '../../components/StatusBar.svelte';

const { toggleLog, setTheme } = vi.hoisted(() => ({
  toggleLog: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock('../../stores/app.svelte', () => ({
  appStore: {
    activeConnection: {
      id: 'conn-1',
      name: 'Local Mongo',
      isConnected: true,
    },
    activeTabId: 'tab-1',
    ui: {
      theme: 'light',
      logOpen: false,
    },
    toggleLog,
    setTheme,
  },
}));

vi.mock('../../stores/query.svelte', () => ({
  queryStore: {
    getIsExecuting: vi.fn().mockReturnValue(false),
    getSubResults: vi.fn().mockReturnValue([]),
    getActiveResultIndex: vi.fn().mockReturnValue(0),
    getResults: vi.fn().mockReturnValue({
      documents: [{ _id: '1' }, { _id: '2' }],
      page: 1,
      pageSize: 50,
      executionTimeMs: 7,
    }),
  },
}));

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current result summary', () => {
    render(StatusBar);

    expect(screen.getByText('Docs 1–2 (7ms)')).toBeInTheDocument();
  });

  it('toggles the message log from the bottom bar icon', async () => {
    render(StatusBar);

    await fireEvent.click(screen.getByTitle('Toggle message log'));

    expect(toggleLog).toHaveBeenCalledTimes(1);
  });
});
