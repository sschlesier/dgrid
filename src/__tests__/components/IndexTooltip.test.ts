import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import IndexTooltip from '../../components/IndexTooltip.svelte';

function renderTooltip(expireAfterSeconds?: number | null) {
  render(IndexTooltip, {
    props: {
      x: 0,
      y: 0,
      name: 'createdAt_1',
      keyPattern: { createdAt: 1 },
      unique: false,
      sparse: false,
      expireAfterSeconds,
    },
  });
}

describe('IndexTooltip', () => {
  it('shows the TTL as a readable duration with raw seconds', () => {
    renderTooltip(3600);
    expect(screen.getByText('TTL: 1h (3600s)')).toBeInTheDocument();
  });

  it('shows no TTL flag for an index without a TTL', () => {
    renderTooltip();
    expect(screen.queryByText(/TTL:/)).not.toBeInTheDocument();
  });

  it('shows no TTL flag when the backend sends a null TTL', () => {
    renderTooltip(null);
    expect(screen.queryByText(/TTL:/)).not.toBeInTheDocument();
  });
});
