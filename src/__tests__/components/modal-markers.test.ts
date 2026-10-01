import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ConnectionProgressModal from '../../components/ConnectionProgressModal.svelte';
import PasswordPromptDialog from '../../components/PasswordPromptDialog.svelte';
import SettingsModal from '../../components/SettingsModal.svelte';

describe('modal markers', () => {
  it('marks ConnectionProgressModal as a modal dialog', () => {
    render(ConnectionProgressModal, { props: { targetName: 'Local', oncancel: vi.fn() } });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('marks PasswordPromptDialog as a modal dialog', () => {
    render(PasswordPromptDialog, {
      props: { connectionName: 'Local', username: 'admin', onSubmit: vi.fn(), onClose: vi.fn() },
    });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('marks SettingsModal as a modal dialog', () => {
    render(SettingsModal, { props: { onclose: vi.fn() } });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
