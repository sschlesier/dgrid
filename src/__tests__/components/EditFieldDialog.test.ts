import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const updateFieldMock = vi.fn();
const notifyMock = vi.fn();

vi.mock('../../api/client', () => ({
  updateField: (...args: unknown[]) => updateFieldMock(...args),
}));

vi.mock('../../stores/app.svelte', () => ({
  appStore: {
    notify: (...args: unknown[]) => notifyMock(...args),
  },
}));

import EditFieldDialog from '../../components/EditFieldDialog.svelte';

describe('EditFieldDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('shows a blocking warning and disables save when _id is missing', () => {
    render(EditFieldDialog, {
      props: {
        field: {
          connectionId: 'conn-1',
          database: 'testdb',
          collection: 'items',
          docId: undefined,
          fieldPath: 'name',
          value: 'Alice',
          cellType: 'string',
          queryText: 'db.items.find({}, { name: 1, _id: 0 })',
        },
        onclose: vi.fn(),
        onsaved: vi.fn(),
      },
    });

    expect(screen.getByTestId('edit-warning-missing-id')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByTestId('update-preview')).toHaveTextContent('<missing _id>');
  });

  it('shows a yellow warning when the source query manipulates _id', () => {
    render(EditFieldDialog, {
      props: {
        field: {
          connectionId: 'conn-1',
          database: 'testdb',
          collection: 'items',
          docId: '507f1f77bcf86cd799439011',
          fieldPath: 'total',
          value: 42,
          cellType: 'number',
          queryText:
            'db.items.aggregate([{ $group: { _id: "$status", total: { $sum: "$amount" } } }])',
        },
        onclose: vi.fn(),
        onsaved: vi.fn(),
      },
    });

    expect(screen.getByTestId('edit-warning-id-manipulated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('updates and copies the preview query', async () => {
    render(EditFieldDialog, {
      props: {
        field: {
          connectionId: 'conn-1',
          database: 'testdb',
          collection: 'items',
          docId: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
          fieldPath: 'name',
          value: 'Alice',
          cellType: 'string',
          queryText: 'db.items.find({})',
        },
        onclose: vi.fn(),
        onsaved: vi.fn(),
      },
    });

    const textarea = screen.getByLabelText('Value');
    await fireEvent.input(textarea, { target: { value: 'Updated' } });

    expect(screen.getByTestId('update-preview')).toHaveTextContent('"name": "Updated"');

    await fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"name": "Updated"')
    );
  });
});
