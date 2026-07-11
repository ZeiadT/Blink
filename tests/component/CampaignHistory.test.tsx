import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CampaignHistory } from '@sidepanel/components/CampaignDashboard/CampaignHistory';
import type { CampaignHistoryEntry } from '@shared/types';

const history: CampaignHistoryEntry[] = [
  {
    id: 'run-1',
    status: 'completed-with-issues',
    postText: 'First paragraph\r\n\r\nقائمة عربية 😀',
    mediaCount: 1,
    totalGroups: 2,
    results: [
      { groupUrl: 'https://facebook.com/groups/success', status: 'success', timestamp: 1 },
      {
        groupUrl: 'https://facebook.com/groups/failure',
        status: 'failed',
        error: 'Facebook composer did not load.',
        timestamp: 2,
      },
    ],
    settings: { delayMinSeconds: 5, delayMaxSeconds: 10, maxRetries: 1 },
    completedAt: 3,
  },
];

describe('CampaignHistory', () => {
  it('shows an empty state when no completed campaigns exist', () => {
    render(<CampaignHistory history={[]} loading={false} error={null} onRetry={vi.fn()} />);

    expect(screen.getByText('Finished campaigns appear here.')).toBeInTheDocument();
  });

  it('shows completed-with-issues and expands multiline result details', async () => {
    const user = userEvent.setup();
    render(<CampaignHistory history={history} loading={false} error={null} onRetry={vi.fn()} />);

    const row = screen.getByRole('button', { name: /completed with issues/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await user.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(/قائمة عربية 😀/)).toHaveLength(2);
    expect(screen.getByText('Facebook composer did not load.')).toBeInTheDocument();
    expect(screen.getByText(/Delay 5–10s/)).toBeInTheDocument();
  });

  it('hides current terminal campaign until it is dismissed', () => {
    render(
      <CampaignHistory
        history={history}
        activeCampaignId="run-1"
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Finished campaigns appear here.')).toBeInTheDocument();
  });

  it('surfaces history loading failures with retry control', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <CampaignHistory
        history={[]}
        loading={false}
        error="Could not load campaign history."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load campaign history.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
