import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

import type { ServerInfoResponse } from '../../lib/contracts';

const getServerInfo = vi.fn();
vi.mock('../../api/client', () => ({
  getServerInfo: (id: string) => getServerInfo(id),
}));

import ServerInfoDialog from '../../components/ServerInfoDialog.svelte';

function renderDialog(onclose = vi.fn()) {
  render(ServerInfoDialog, {
    props: { connectionId: 'c1', connectionName: 'Local', onclose },
  });
  return { onclose };
}

const fullInfo: ServerInfoResponse = {
  build: { data: { version: '7.0.5', allocator: 'tcmalloc' } },
  runtime: { data: { host: 'db1:27017' } },
  topology: { data: { setName: 'rs0' } },
};

describe('ServerInfoDialog', () => {
  beforeEach(() => {
    getServerInfo.mockReset();
  });

  it('shows a loading state until the data arrives', async () => {
    getServerInfo.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('titles the dialog with the connection name and shows the version', async () => {
    getServerInfo.mockResolvedValue(fullInfo);
    renderDialog();
    expect(await screen.findByText('7.0.5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Local' })).toBeInTheDocument();
    expect(screen.getByText('Allocator')).toBeInTheDocument();
    expect(screen.getByText('rs0')).toBeInTheDocument();
  });

  it('shows Unavailable with the error for a failed section while others render', async () => {
    getServerInfo.mockResolvedValue({
      ...fullInfo,
      runtime: { error: 'not authorized on admin' },
    });
    renderDialog();
    expect(await screen.findByText('Unavailable: not authorized on admin')).toBeInTheDocument();
    expect(screen.getByText('rs0')).toBeInTheDocument();
  });

  it('shows only the error when every section fails', async () => {
    getServerInfo.mockResolvedValue({
      build: { error: 'boom' },
      runtime: { error: 'boom' },
      topology: { error: 'boom' },
    });
    renderDialog();
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Build' })).not.toBeInTheDocument();
  });

  it('lists each distinct error once when sections fail differently', async () => {
    getServerInfo.mockResolvedValue({
      build: { error: 'a' },
      runtime: { error: 'b' },
      topology: { error: 'a' },
    });
    renderDialog();
    expect(await screen.findByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('shows the error when the command itself fails', async () => {
    getServerInfo.mockRejectedValue(new Error('Connection not found'));
    renderDialog();
    expect(await screen.findByText('Connection not found')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    getServerInfo.mockResolvedValue(fullInfo);
    const { onclose } = renderDialog();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('closes on overlay click but not on dialog click', async () => {
    getServerInfo.mockResolvedValue(fullInfo);
    const { onclose } = renderDialog();
    await fireEvent.click(screen.getByRole('dialog'));
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.click(document.querySelector('.dialog-overlay')!);
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('closes with the Close button', async () => {
    getServerInfo.mockResolvedValue(fullInfo);
    const { onclose } = renderDialog();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalledOnce();
  });
});
