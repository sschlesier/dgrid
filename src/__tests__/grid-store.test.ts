import { describe, it, expect, beforeEach } from 'vitest';
import { gridStore } from '../stores/grid.svelte';

describe('GridStore', () => {
  const tabId = 'test-tab';

  beforeEach(() => {
    // Reset store state for each test
    gridStore.cleanupTab(tabId);
  });

  describe('getState', () => {
    it('creates initial state for new tab', () => {
      const state = gridStore.getState(tabId);
      expect(state.columns).toEqual([]);
      expect(state.sort).toEqual({ column: null, direction: null });
      expect(state.drilldown.path).toEqual([]);
      expect(state.pageSize).toBe(50);
    });
  });

  describe('columns', () => {
    it('sets and gets columns', () => {
      const columns = [
        { key: '_id', label: '_id', width: 200 },
        { key: 'name', label: 'name', width: 150 },
      ];
      gridStore.setColumns(tabId, columns);
      expect(gridStore.getColumns(tabId)).toEqual(columns);
    });

    it('sets column width', () => {
      gridStore.setColumns(tabId, [{ key: 'name', label: 'name', width: 150 }]);
      gridStore.setColumnWidth(tabId, 'name', 200);
      const cols = gridStore.getColumns(tabId);
      expect(cols[0].width).toBe(200);
    });
  });

  describe('sort', () => {
    it('starts with no sort', () => {
      const sort = gridStore.getSort(tabId);
      expect(sort.column).toBeNull();
      expect(sort.direction).toBeNull();
    });

    it('toggles sort ascending on first click', () => {
      gridStore.toggleSort(tabId, 'name');
      const sort = gridStore.getSort(tabId);
      expect(sort.column).toBe('name');
      expect(sort.direction).toBe('asc');
    });

    it('toggles sort descending on second click', () => {
      gridStore.toggleSort(tabId, 'name');
      gridStore.toggleSort(tabId, 'name');
      const sort = gridStore.getSort(tabId);
      expect(sort.column).toBe('name');
      expect(sort.direction).toBe('desc');
    });

    it('removes sort on third click', () => {
      gridStore.toggleSort(tabId, 'name');
      gridStore.toggleSort(tabId, 'name');
      gridStore.toggleSort(tabId, 'name');
      const sort = gridStore.getSort(tabId);
      expect(sort.column).toBeNull();
      expect(sort.direction).toBeNull();
    });

    it('resets to ascending when changing column', () => {
      gridStore.toggleSort(tabId, 'name');
      gridStore.toggleSort(tabId, 'name'); // desc
      gridStore.toggleSort(tabId, 'age'); // different column
      const sort = gridStore.getSort(tabId);
      expect(sort.column).toBe('age');
      expect(sort.direction).toBe('asc');
    });
  });

  describe('drilldown', () => {
    it('starts at root level', () => {
      const path = gridStore.getDrilldownPath(tabId);
      expect(path).toEqual([]);
    });

    it('drills into nested field', () => {
      gridStore.drillInto(tabId, 'address');
      expect(gridStore.getDrilldownPath(tabId)).toEqual(['address']);
    });

    it('drills into deeper nested field', () => {
      gridStore.drillInto(tabId, 'address');
      gridStore.drillInto(tabId, 'city');
      expect(gridStore.getDrilldownPath(tabId)).toEqual(['address', 'city']);
    });

    it('can go back', () => {
      gridStore.drillInto(tabId, 'address');
      gridStore.drillInto(tabId, 'city');
      expect(gridStore.canDrillBack(tabId)).toBe(true);
      gridStore.drillBack(tabId);
      expect(gridStore.getDrilldownPath(tabId)).toEqual(['address']);
    });

    it('can go forward after going back', () => {
      gridStore.drillInto(tabId, 'address');
      gridStore.drillInto(tabId, 'city');
      gridStore.drillBack(tabId);
      expect(gridStore.canDrillForward(tabId)).toBe(true);
      gridStore.drillForward(tabId);
      expect(gridStore.getDrilldownPath(tabId)).toEqual(['address', 'city']);
    });

    it('cannot go back at root', () => {
      expect(gridStore.canDrillBack(tabId)).toBe(false);
    });

    it('cannot go forward without history', () => {
      gridStore.drillInto(tabId, 'address');
      expect(gridStore.canDrillForward(tabId)).toBe(false);
    });

    it('drills to segment by index', () => {
      gridStore.drillInto(tabId, 'address');
      gridStore.drillInto(tabId, 'city');
      gridStore.drillInto(tabId, 'name');
      gridStore.drillToSegment(tabId, 0); // Go to address
      expect(gridStore.getDrilldownPath(tabId)).toEqual(['address']);
    });

    it('drills to root with index -1', () => {
      gridStore.drillInto(tabId, 'address');
      gridStore.drillInto(tabId, 'city');
      gridStore.drillToSegment(tabId, -1);
      expect(gridStore.getDrilldownPath(tabId)).toEqual([]);
    });

    it('resets sort when drilling', () => {
      gridStore.toggleSort(tabId, 'name');
      gridStore.drillInto(tabId, 'address');
      const sort = gridStore.getSort(tabId);
      expect(sort.column).toBeNull();
    });
  });

  describe('pageSize', () => {
    it('defaults to 50', () => {
      expect(gridStore.getPageSize(tabId)).toBe(50);
    });

    it('can be changed', () => {
      gridStore.setPageSize(tabId, 100);
      expect(gridStore.getPageSize(tabId)).toBe(100);
    });
  });

  describe('resetState', () => {
    it('resets columns, sort, and drilldown', () => {
      gridStore.setColumns(tabId, [{ key: 'name', label: 'name', width: 150 }]);
      gridStore.toggleSort(tabId, 'name');
      gridStore.drillInto(tabId, 'address');
      gridStore.setPageSize(tabId, 100);

      gridStore.resetState(tabId);

      expect(gridStore.getColumns(tabId)).toEqual([]);
      expect(gridStore.getSort(tabId)).toEqual({ column: null, direction: null });
      expect(gridStore.getDrilldownPath(tabId)).toEqual([]);
      // pageSize should be preserved
      expect(gridStore.getPageSize(tabId)).toBe(100);
    });
  });

  describe('cleanupTab', () => {
    it('removes tab state', () => {
      gridStore.drillInto(tabId, 'address');
      gridStore.cleanupTab(tabId);
      // New state should be created
      expect(gridStore.getDrilldownPath(tabId)).toEqual([]);
    });
  });
});
