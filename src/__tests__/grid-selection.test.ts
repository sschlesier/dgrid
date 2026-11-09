import { describe, it, expect, beforeEach } from 'vitest';
import { gridStore } from '../stores/grid.svelte';

const TAB = 'sel-tab';

describe('grid row selection', () => {
  beforeEach(() => {
    gridStore.cleanupTab(TAB);
  });

  it('plain select replaces the selection and sets the anchor', () => {
    gridStore.selectRow(TAB, 2);
    gridStore.selectRow(TAB, 4);
    expect(gridStore.getSelectedRows(TAB)).toEqual([4]);
  });

  it('toggle adds and removes rows, keeping ascending order', () => {
    gridStore.selectRow(TAB, 3);
    gridStore.toggleRow(TAB, 1);
    expect(gridStore.getSelectedRows(TAB)).toEqual([1, 3]);
    gridStore.toggleRow(TAB, 3);
    expect(gridStore.getSelectedRows(TAB)).toEqual([1]);
  });

  it('range selects from the anchor in either direction and keeps the anchor', () => {
    gridStore.selectRow(TAB, 3);
    gridStore.selectRange(TAB, 5);
    expect(gridStore.getSelectedRows(TAB)).toEqual([3, 4, 5]);
    gridStore.selectRange(TAB, 1);
    expect(gridStore.getSelectedRows(TAB)).toEqual([1, 2, 3]);
  });

  it('range with no anchor selects just the clicked row', () => {
    gridStore.selectRange(TAB, 2);
    expect(gridStore.getSelectedRows(TAB)).toEqual([2]);
  });

  it('select all selects every row on the page', () => {
    gridStore.selectAllRows(TAB, 4);
    expect(gridStore.getSelectedRows(TAB)).toEqual([0, 1, 2, 3]);
  });

  it('clearSelection empties the selection', () => {
    gridStore.selectRow(TAB, 1);
    gridStore.clearSelection(TAB);
    expect(gridStore.getSelectedRows(TAB)).toEqual([]);
  });

  it.each([
    ['sort', () => gridStore.toggleSort(TAB, 'name')],
    ['page size', () => gridStore.setPageSize(TAB, 100)],
    ['drill into', () => gridStore.drillInto(TAB, 'b')],
    ['drill back', () => gridStore.drillBack(TAB)],
    ['drill forward', () => gridStore.drillForward(TAB)],
    ['drill to segment', () => gridStore.drillToSegment(TAB, -1)],
    ['reset', () => gridStore.resetState(TAB)],
  ])('clears the selection on %s change', (_name, change) => {
    gridStore.drillInto(TAB, 'a');
    gridStore.drillInto(TAB, 'c');
    gridStore.drillBack(TAB);
    gridStore.selectRow(TAB, 1);
    change();
    expect(gridStore.getSelectedRows(TAB)).toEqual([]);
  });
});
