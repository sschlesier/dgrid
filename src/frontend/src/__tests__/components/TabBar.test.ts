import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TabBar from '../../components/TabBar.svelte';

// Mock the stores
vi.mock('../../stores/app.svelte', () => {
  const mockTabs = [
    {
      id: 'tab-1',
      title: 'Query 1',
      database: 'testdb',
      connectionId: 'conn-1',
      type: 'query',
      queryText: '',
    },
    {
      id: 'tab-2',
      title: 'Query 2',
      database: 'otherdb',
      connectionId: 'conn-1',
      type: 'query',
      queryText: '',
    },
  ];

  return {
    appStore: {
      tabs: mockTabs,
      activeTabId: 'tab-1',
      activeConnection: { id: 'conn-1', name: 'Test', isConnected: true },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      createTab: vi.fn(),
      closeTab: vi.fn(),
      setActiveTab: vi.fn(),
    },
  };
});

vi.mock('../../stores/query.svelte', () => ({
  queryStore: {
    cleanupTab: vi.fn(),
  },
}));

vi.mock('../../stores/export.svelte', () => ({
  exportStore: {
    cleanupTab: vi.fn(),
  },
}));

vi.mock('../../stores/keybindings.svelte', () => ({
  keybindingsStore: {
    getBinding: (id: string) => {
      const defaults: Record<string, { key: string; alt?: boolean }> = {
        'new-tab': { key: 't', alt: true },
        'close-tab': { key: 'w', alt: true },
      };
      return defaults[id] ?? { key: '?' };
    },
    getFormatted: (id: string) => {
      const labels: Record<string, string> = {
        'new-tab': '⌥T',
        'close-tab': '⌥W',
      };
      return labels[id] ?? '?';
    },
  },
}));

vi.mock('../../utils/keyboard', () => ({
  registerShortcut: vi.fn(),
  unregisterShortcut: vi.fn(),
  bindingToShortcut: vi.fn((_binding: unknown, handler: unknown) => ({
    key: 't',
    alt: true,
    handler,
  })),
}));

import { appStore } from '../../stores/app.svelte';
import { queryStore } from '../../stores/query.svelte';

describe('TabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tab rendering', () => {
    it('renders all tabs', () => {
      render(TabBar);

      expect(screen.getByText('Query 1')).toBeInTheDocument();
      expect(screen.getByText('Query 2')).toBeInTheDocument();
    });

    it('displays database name for each tab', () => {
      render(TabBar);

      expect(screen.getByText('testdb')).toBeInTheDocument();
      expect(screen.getByText('otherdb')).toBeInTheDocument();
    });

    it('renders close button for each tab', () => {
      render(TabBar);

      const closeButtons = screen.getAllByTitle('Close tab');
      expect(closeButtons).toHaveLength(2);
    });
  });

  describe('active tab highlighting', () => {
    it('applies active class to active tab', () => {
      const { container } = render(TabBar);

      const tabs = container.querySelectorAll('.tab');
      expect(tabs[0]).toHaveClass('active');
      expect(tabs[1]).not.toHaveClass('active');
    });
  });

  describe('tab interactions', () => {
    it('calls setActiveTab when tab is clicked', async () => {
      render(TabBar);

      // Click on the second tab
      const secondTab = screen.getByText('Query 2').closest('.tab');
      await fireEvent.click(secondTab!);

      expect(appStore.setActiveTab).toHaveBeenCalledWith('tab-2');
    });

    it('calls closeTab and cleanupTab when close button clicked', async () => {
      render(TabBar);

      const closeButtons = screen.getAllByTitle('Close tab');
      await fireEvent.click(closeButtons[0]);

      expect(queryStore.cleanupTab).toHaveBeenCalledWith('tab-1');
      expect(appStore.closeTab).toHaveBeenCalledWith('tab-1');
    });

    it('does not switch tabs when close button is clicked', async () => {
      render(TabBar);

      const closeButtons = screen.getAllByTitle('Close tab');
      await fireEvent.click(closeButtons[0]);

      // setActiveTab should not be called from the close action
      expect(appStore.setActiveTab).not.toHaveBeenCalled();
    });
  });

  describe('new tab button', () => {
    it('renders new tab button', () => {
      render(TabBar);

      const newTabBtn = screen.getByTitle('New tab (⌥T)');
      expect(newTabBtn).toBeInTheDocument();
    });

    it('is enabled when connection is connected and has databases', () => {
      render(TabBar);

      const newTabBtn = screen.getByTitle('New tab (⌥T)');
      expect(newTabBtn).not.toBeDisabled();
    });

    it('calls createTab when clicked', async () => {
      render(TabBar);

      const newTabBtn = screen.getByTitle('New tab (⌥T)');
      await fireEvent.click(newTabBtn);

      expect(appStore.createTab).toHaveBeenCalledWith('conn-1', 'testdb');
    });
  });

  describe('accessibility', () => {
    it('tabs have role="tab"', () => {
      render(TabBar);

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);
    });

    it('tabs are focusable', () => {
      render(TabBar);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('tabindex', '0');
      });
    });

    it('responds to Enter key on tab', async () => {
      render(TabBar);

      const secondTab = screen.getByText('Query 2').closest('.tab');
      await fireEvent.keyDown(secondTab!, { key: 'Enter' });

      expect(appStore.setActiveTab).toHaveBeenCalledWith('tab-2');
    });
  });

  describe('tab title display', () => {
    it('displays title attribute with full info', () => {
      const { container } = render(TabBar);

      const tabTitles = container.querySelectorAll('.tab-title');
      expect(tabTitles[0]).toHaveAttribute('title', 'Query 1 - testdb');
      expect(tabTitles[1]).toHaveAttribute('title', 'Query 2 - otherdb');
    });
  });
});
