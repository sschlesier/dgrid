import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MessageLog from '../../components/MessageLog.svelte';
import { logStore } from '../../stores/log.svelte';

describe('MessageLog', () => {
  beforeEach(() => {
    logStore.clear();
  });

  it('renders an empty state when there are no log entries', () => {
    render(MessageLog);

    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('renders log entries as read-only text', () => {
    logStore.append({
      level: 'info',
      source: 'app',
      message: 'Connected to "Local Mongo"',
      timestamp: '2026-03-28T10:00:00.000Z',
      connectionName: 'Local Mongo',
    });

    render(MessageLog);

    expect(screen.getByText('Connected to "Local Mongo"')).toBeInTheDocument();
    expect(screen.getByText('App / Local Mongo')).toBeInTheDocument();
  });

  it('clears entries when the clear button is clicked', async () => {
    logStore.append({
      level: 'error',
      source: 'query',
      message: 'Query failed',
    });

    render(MessageLog);

    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });
});
