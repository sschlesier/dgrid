import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

import ConfirmDialog from '../../components/ConfirmDialog.svelte';

function renderDialog(overrides?: { onconfirm?: () => void; oncancel?: () => void }) {
  const onconfirm = overrides?.onconfirm ?? vi.fn();
  const oncancel = overrides?.oncancel ?? vi.fn();
  render(ConfirmDialog, {
    props: {
      title: 'Delete Document',
      message: 'Delete this document? This cannot be undone.',
      confirmLabel: 'Delete',
      onconfirm,
      oncancel,
    },
  });
  return { onconfirm, oncancel };
}

describe('ConfirmDialog', () => {
  it('renders title and message', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: 'Delete Document' })).toBeInTheDocument();
    expect(screen.getByText('Delete this document? This cannot be undone.')).toBeInTheDocument();
  });

  it('calls onconfirm when confirm button is clicked', async () => {
    const { onconfirm } = renderDialog();
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onconfirm).toHaveBeenCalledOnce();
  });

  it('calls oncancel when cancel button is clicked', async () => {
    const { oncancel } = renderDialog();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('calls oncancel when overlay is clicked', async () => {
    const { oncancel } = renderDialog();
    await fireEvent.click(document.querySelector('.dialog-overlay')!);
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('does not call oncancel when dialog body is clicked', async () => {
    const { oncancel } = renderDialog();
    await fireEvent.click(document.querySelector('.dialog')!);
    expect(oncancel).not.toHaveBeenCalled();
  });

  it('calls oncancel on Escape key', async () => {
    const { oncancel } = renderDialog();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('calls onconfirm on Enter key', async () => {
    const { onconfirm } = renderDialog();
    await fireEvent.keyDown(window, { key: 'Enter' });
    expect(onconfirm).toHaveBeenCalledOnce();
  });

  it('does not call onconfirm when cancel is clicked', async () => {
    const { onconfirm } = renderDialog();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onconfirm).not.toHaveBeenCalled();
  });
});
