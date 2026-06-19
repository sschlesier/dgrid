import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const updateDocumentMock = vi.fn();
const insertDocumentMock = vi.fn();
const notifyMock = vi.fn();

vi.mock('../../api/client', () => ({
  updateDocument: (...args: unknown[]) => updateDocumentMock(...args),
  insertDocument: (...args: unknown[]) => insertDocumentMock(...args),
}));

vi.mock('../../stores/app.svelte', () => ({
  appStore: {
    notify: (...args: unknown[]) => notifyMock(...args),
  },
}));

import JsonEditorDialog from '../../components/JsonEditorDialog.svelte';

const OBJECT_ID = { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' };

const baseEditProps = {
  mode: 'edit' as const,
  connectionId: 'conn-1',
  database: 'testdb',
  collection: 'users',
  docId: OBJECT_ID,
  initialJson: JSON.stringify({ _id: OBJECT_ID, name: 'Alice', age: 30 }, null, 2),
  onclose: vi.fn(),
  onsaved: vi.fn(),
};

const baseInsertProps = {
  mode: 'insert' as const,
  connectionId: 'conn-1',
  database: 'testdb',
  collection: 'users',
  initialJson: '{}',
  onclose: vi.fn(),
  onsaved: vi.fn(),
};

describe('JsonEditorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('shows "Edit Document" title and "Save" button in edit mode', () => {
      render(JsonEditorDialog, { props: baseEditProps });
      expect(screen.getByRole('heading', { name: 'Edit Document' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('shows "Insert Document" title and "Insert" button in insert mode', () => {
      render(JsonEditorDialog, { props: baseInsertProps });
      expect(screen.getByRole('heading', { name: 'Insert Document' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Insert' })).toBeInTheDocument();
    });
  });

  describe('JSON validation', () => {
    it('disables Save and shows validation error for invalid JSON', async () => {
      render(JsonEditorDialog, { props: baseEditProps });

      const textarea = screen.getByRole('textbox');
      await fireEvent.input(textarea, { target: { value: '{ invalid json' } });

      expect(screen.getByTestId('json-validation-error')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('disables Save and shows error for non-object JSON (array)', async () => {
      render(JsonEditorDialog, { props: baseEditProps });

      const textarea = screen.getByRole('textbox');
      await fireEvent.input(textarea, { target: { value: '[1, 2, 3]' } });

      expect(screen.getByTestId('json-validation-error')).toBeInTheDocument();
      expect(screen.getByTestId('json-validation-error')).toHaveTextContent(
        'Document must be a JSON object'
      );
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('enables Save for valid JSON object', async () => {
      render(JsonEditorDialog, { props: baseEditProps });

      const textarea = screen.getByRole('textbox');
      await fireEvent.input(textarea, { target: { value: '{"name": "Bob"}' } });

      expect(screen.queryByTestId('json-validation-error')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
  });

  describe('Format button', () => {
    it('is disabled when JSON is invalid', async () => {
      render(JsonEditorDialog, { props: baseEditProps });

      const textarea = screen.getByRole('textbox');
      await fireEvent.input(textarea, { target: { value: '{ bad json' } });

      expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
    });

    it('pretty-prints valid JSON when clicked', async () => {
      render(JsonEditorDialog, { props: baseEditProps });

      const textarea = screen.getByRole('textbox');
      await fireEvent.input(textarea, { target: { value: '{"a":1,"b":2}' } });
      await fireEvent.click(screen.getByRole('button', { name: 'Format' }));

      expect((textarea as HTMLTextAreaElement).value).toBe(JSON.stringify({ a: 1, b: 2 }, null, 2));
    });
  });

  describe('save — edit mode', () => {
    it('calls updateDocument with correct args, then onsaved and notify on success', async () => {
      const onsaved = vi.fn();
      updateDocumentMock.mockResolvedValueOnce({ success: true, modifiedCount: 1 });

      render(JsonEditorDialog, {
        props: { ...baseEditProps, onsaved },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(updateDocumentMock).toHaveBeenCalledWith('conn-1', {
        database: 'testdb',
        collection: 'users',
        documentId: OBJECT_ID,
        document: { _id: OBJECT_ID, name: 'Alice', age: 30 },
      });
      expect(onsaved).toHaveBeenCalledOnce();
      expect(notifyMock).toHaveBeenCalledWith('success', 'Document updated');
    });

    it('shows error message on API failure and does not call onsaved', async () => {
      const onsaved = vi.fn();
      updateDocumentMock.mockRejectedValueOnce(new Error('Write conflict'));

      render(JsonEditorDialog, {
        props: { ...baseEditProps, onsaved },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onsaved).not.toHaveBeenCalled();
      // error-message element should appear (class-based)
      const errorEl = document.querySelector('.error-message');
      expect(errorEl).toBeTruthy();
      expect(errorEl?.textContent).toContain('Write conflict');
    });
  });

  describe('save — insert mode', () => {
    it('calls insertDocument with correct args, then onsaved and notify on success', async () => {
      const onsaved = vi.fn();
      insertDocumentMock.mockResolvedValueOnce({ success: true, insertedId: OBJECT_ID });

      render(JsonEditorDialog, {
        props: { ...baseInsertProps, initialJson: '{"title":"Workshop"}', onsaved },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

      expect(insertDocumentMock).toHaveBeenCalledWith('conn-1', {
        database: 'testdb',
        collection: 'users',
        document: { title: 'Workshop' },
      });
      expect(onsaved).toHaveBeenCalledOnce();
      expect(notifyMock).toHaveBeenCalledWith('success', 'Document inserted');
    });

    it('shows error message on API failure', async () => {
      insertDocumentMock.mockRejectedValueOnce(new Error('Duplicate key'));

      render(JsonEditorDialog, {
        props: { ...baseInsertProps, initialJson: '{"title":"Workshop"}' },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

      const errorEl = document.querySelector('.error-message');
      expect(errorEl?.textContent).toContain('Duplicate key');
    });
  });

  describe('keyboard handling', () => {
    it('calls onclose when Escape is pressed', async () => {
      const onclose = vi.fn();
      render(JsonEditorDialog, { props: { ...baseEditProps, onclose } });

      await fireEvent.keyDown(window, { key: 'Escape' });

      expect(onclose).toHaveBeenCalledOnce();
    });

    it('saves when Cmd+Enter is pressed', async () => {
      const onsaved = vi.fn();
      updateDocumentMock.mockResolvedValueOnce({ success: true, modifiedCount: 1 });
      render(JsonEditorDialog, { props: { ...baseEditProps, onsaved } });

      await fireEvent.keyDown(window, { key: 'Enter', metaKey: true });

      expect(updateDocumentMock).toHaveBeenCalledOnce();
      expect(onsaved).toHaveBeenCalledOnce();
    });

    it('saves when Ctrl+Enter is pressed', async () => {
      const onsaved = vi.fn();
      updateDocumentMock.mockResolvedValueOnce({ success: true, modifiedCount: 1 });
      render(JsonEditorDialog, { props: { ...baseEditProps, onsaved } });

      await fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

      expect(updateDocumentMock).toHaveBeenCalledOnce();
      expect(onsaved).toHaveBeenCalledOnce();
    });
  });

  describe('overlay / close button', () => {
    it('calls onclose when overlay is clicked', async () => {
      const onclose = vi.fn();
      const { container } = render(JsonEditorDialog, { props: { ...baseEditProps, onclose } });

      const overlay = container.querySelector('.dialog-overlay');
      await fireEvent.click(overlay!);

      expect(onclose).toHaveBeenCalledOnce();
    });

    it('does not call onclose when inner dialog is clicked', async () => {
      const onclose = vi.fn();
      const { container } = render(JsonEditorDialog, { props: { ...baseEditProps, onclose } });

      const dialog = container.querySelector('.dialog');
      await fireEvent.click(dialog!);

      expect(onclose).not.toHaveBeenCalled();
    });

    it('calls onclose when close button is clicked', async () => {
      const onclose = vi.fn();
      render(JsonEditorDialog, { props: { ...baseEditProps, onclose } });

      await fireEvent.click(screen.getByTitle('Close'));

      expect(onclose).toHaveBeenCalledOnce();
    });
  });

  describe('_id change warning', () => {
    it('shows warning when _id is modified in edit mode', async () => {
      render(JsonEditorDialog, { props: baseEditProps });

      const textarea = screen.getByRole('textbox');
      // Change _id to a different value
      const editedDoc = {
        _id: { _type: 'ObjectId', _value: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
        name: 'Alice',
      };
      await fireEvent.input(textarea, { target: { value: JSON.stringify(editedDoc) } });

      expect(screen.getByTestId('json-edit-warning-id-changed')).toBeInTheDocument();
      // Save should still be enabled (non-blocking)
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('shows warning when _id is removed in edit mode', async () => {
      render(JsonEditorDialog, { props: baseEditProps });

      const textarea = screen.getByRole('textbox');
      // Remove _id from the document
      await fireEvent.input(textarea, { target: { value: '{"name": "Alice"}' } });

      expect(screen.getByTestId('json-edit-warning-id-changed')).toBeInTheDocument();
    });

    it('does not show warning when _id is unchanged', () => {
      render(JsonEditorDialog, { props: baseEditProps });

      expect(screen.queryByTestId('json-edit-warning-id-changed')).not.toBeInTheDocument();
    });

    it('does not show _id warning in insert mode', async () => {
      render(JsonEditorDialog, {
        props: { ...baseInsertProps, initialJson: '{"name":"Bob"}' },
      });

      // No docId prop, so no _id comparison
      expect(screen.queryByTestId('json-edit-warning-id-changed')).not.toBeInTheDocument();
    });
  });
});
