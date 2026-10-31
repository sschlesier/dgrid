import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ContextMenu from '../../components/ContextMenu.svelte';

function rect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...partial,
  } as DOMRect;
}

// mouseenter does not bubble, so it must be fired on the button itself
function itemButton(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement;
}

describe('ContextMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flat menus', () => {
    it('runs onclick and ignores alt when an item has no alternate', async () => {
      const onclick = vi.fn();
      render(ContextMenu, {
        props: { x: 0, y: 0, items: [{ label: 'Plain', onclick }], onclose: vi.fn() },
      });

      await fireEvent.keyDown(window, { key: 'Alt', altKey: true });
      expect(screen.getByText('Plain')).toBeInTheDocument();
      await fireEvent.click(screen.getByText('Plain'), { altKey: true });

      expect(onclick).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape', async () => {
      const onclose = vi.fn();
      render(ContextMenu, {
        props: { x: 0, y: 0, items: [{ label: 'A', onclick: vi.fn() }], onclose },
      });

      await fireEvent.keyDown(window, { key: 'Escape' });

      expect(onclose).toHaveBeenCalledTimes(1);
    });
  });

  describe('submenus', () => {
    function setup() {
      const copy = vi.fn();
      const onclose = vi.fn();
      render(ContextMenu, {
        props: {
          x: 0,
          y: 0,
          items: [
            { label: 'Edit', onclick: vi.fn() },
            { label: 'Copy', submenu: [{ label: 'Copy Value', onclick: copy }] },
          ],
          onclose,
        },
      });
      return { copy, onclose };
    }

    it('opens on hover and shows the marker on the parent', async () => {
      setup();
      expect(screen.queryByText('Copy Value')).not.toBeInTheDocument();
      expect(screen.getByText('▸')).toBeInTheDocument();

      await fireEvent.mouseEnter(itemButton('Copy'));

      expect(screen.getByText('Copy Value')).toBeInTheDocument();
    });

    it('opens on click of the parent', async () => {
      setup();
      await fireEvent.click(screen.getByText('Copy'));
      expect(screen.getByText('Copy Value')).toBeInTheDocument();
    });

    it('runs a submenu item and closes the whole menu', async () => {
      const { copy, onclose } = setup();
      await fireEvent.mouseEnter(itemButton('Copy'));

      await fireEvent.click(screen.getByText('Copy Value'));

      expect(copy).toHaveBeenCalledTimes(1);
      expect(onclose).toHaveBeenCalledTimes(1);
    });

    it('closes after a delay when another item is entered', async () => {
      vi.useFakeTimers();
      try {
        setup();
        await fireEvent.mouseEnter(itemButton('Copy'));
        await fireEvent.mouseEnter(itemButton('Edit'));
        expect(screen.getByText('Copy Value')).toBeInTheDocument();

        await vi.advanceTimersByTimeAsync(151);

        expect(screen.queryByText('Copy Value')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('flips left when it would overflow the right edge', async () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(500);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        return this.classList.contains('context-menu-submenu')
          ? rect({ left: 480, right: 640, top: 10, bottom: 60, width: 160, height: 50 })
          : rect({ right: 200, bottom: 100 });
      });
      setup();

      await fireEvent.mouseEnter(itemButton('Copy'));

      const submenu = document.querySelector('.context-menu-submenu') as HTMLElement;
      expect(submenu.style.right).toBe('100%');
      expect(submenu.style.left).toBe('auto');
    });

    it('shifts up when it would overflow the bottom edge', async () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(500);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        return this.classList.contains('context-menu-submenu')
          ? rect({ left: 200, right: 360, top: 470, bottom: 530, width: 160, height: 60 })
          : rect({ right: 200, bottom: 100 });
      });
      setup();

      await fireEvent.mouseEnter(itemButton('Copy'));

      const submenu = document.querySelector('.context-menu-submenu') as HTMLElement;
      expect(submenu.style.top).toBe('-30px');
    });
  });

  describe('alternate items', () => {
    function setup() {
      const onclick = vi.fn();
      const altOnclick = vi.fn();
      render(ContextMenu, {
        props: {
          x: 0,
          y: 0,
          items: [{ label: 'Copy Row', altLabel: 'Copy Row as CSV', onclick, altOnclick }],
          onclose: vi.fn(),
        },
      });
      return { onclick, altOnclick };
    }

    it('swaps the label while alt is held and restores it on release', async () => {
      setup();

      await fireEvent.keyDown(window, { key: 'Alt', altKey: true });
      expect(screen.getByText('Copy Row as CSV')).toBeInTheDocument();

      await fireEvent.keyUp(window, { key: 'Alt', altKey: false });
      expect(screen.getByText('Copy Row')).toBeInTheDocument();
    });

    it('restores the label on window blur', async () => {
      setup();
      await fireEvent.keyDown(window, { key: 'Alt', altKey: true });

      await fireEvent.blur(window);

      expect(screen.getByText('Copy Row')).toBeInTheDocument();
    });

    it('runs altOnclick when clicked with alt held', async () => {
      const { onclick, altOnclick } = setup();
      await fireEvent.click(screen.getByText('Copy Row'), { altKey: true });
      expect(altOnclick).toHaveBeenCalledTimes(1);
      expect(onclick).not.toHaveBeenCalled();
    });

    it('runs onclick when clicked without alt', async () => {
      const { onclick, altOnclick } = setup();
      await fireEvent.click(screen.getByText('Copy Row'));
      expect(onclick).toHaveBeenCalledTimes(1);
      expect(altOnclick).not.toHaveBeenCalled();
    });

    it('ignores a half-declared alternate', async () => {
      const onclick = vi.fn();
      render(ContextMenu, {
        props: { x: 0, y: 0, items: [{ label: 'X', altLabel: 'Y', onclick }], onclose: vi.fn() },
      });
      await fireEvent.keyDown(window, { key: 'Alt', altKey: true });
      expect(screen.getByText('X')).toBeInTheDocument();
      await fireEvent.click(screen.getByText('X'), { altKey: true });
      expect(onclick).toHaveBeenCalledTimes(1);
    });
  });
});
