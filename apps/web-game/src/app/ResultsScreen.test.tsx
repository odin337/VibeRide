import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_FLAGS } from '@viberide/shared';
import type { FeatureFlags, RunResult } from '@viberide/shared';
import { describe, expect, it, vi } from 'vitest';

import type { SubmitOutcome } from '../api/submit-flow';
import { ResultsScreen } from './ResultsScreen';

const RESULT: RunResult = {
  audioHash: 'a'.repeat(64),
  seed: 1,
  score: 1035,
  distanceM: 160,
  finished: true,
  durationMs: 20000,
  collectiblesTaken: 2,
  checkpoints: [{ tick: 0, x: 0, y: 0, score: 0 }],
};

const FLAGS: FeatureFlags = { ...DEFAULT_FLAGS, leaderboardEnabled: true };

const PAGE = {
  audioHash: RESULT.audioHash,
  entries: [
    {
      rank: 1,
      playerId: 'p1',
      displayName: 'BeatMaster',
      score: 1450,
      audioHash: RESULT.audioHash,
      achievedAt: '2026-07-01T18:03:44.000Z',
    },
    {
      rank: 2,
      playerId: 'p2',
      displayName: 'Rider',
      score: 1035,
      audioHash: RESULT.audioHash,
      achievedAt: '2026-07-02T09:12:30.000Z',
    },
  ],
  total: 2,
};

function renderResults(
  submit: (result: RunResult) => Promise<SubmitOutcome>,
  overrides: Partial<{ result: RunResult; flags: FeatureFlags }> = {},
): { onRetry: () => void; onMenu: () => void } {
  const onRetry = vi.fn();
  const onMenu = vi.fn();
  render(
    <ResultsScreen
      result={overrides.result ?? RESULT}
      trackTitle="Night Drive"
      flags={overrides.flags ?? FLAGS}
      submit={submit}
      onRetry={onRetry}
      onMenu={onMenu}
    />,
  );
  return { onRetry, onMenu };
}

describe('ResultsScreen', () => {
  it('renders the outcome, stats and leaderboard rows after submission', async () => {
    const submit = vi.fn().mockResolvedValue({
      status: 'submitted',
      entry: PAGE.entries[1],
      page: PAGE,
    } satisfies SubmitOutcome);
    renderResults(submit);

    expect(screen.getByText('Finish line!')).toBeDefined();
    expect(screen.getByTestId('final-score').textContent).toBe('1035');
    expect(screen.getByText('Night Drive')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('BeatMaster')).toBeDefined();
    });
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 entries
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(RESULT);
  });

  it('labels a crash and shows a soft error when submission fails', async () => {
    const submit = vi.fn().mockResolvedValue({
      status: 'failed',
      message: 'score rejected: offline',
    } satisfies SubmitOutcome);
    renderResults(submit, { result: { ...RESULT, finished: false } });

    expect(screen.getByText('Wiped out')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('score rejected: offline');
    });
  });

  it('celebrates the first entry on an empty board', async () => {
    const submit = vi.fn().mockResolvedValue({
      status: 'submitted',
      page: { audioHash: RESULT.audioHash, entries: [], total: 0 },
    } satisfies SubmitOutcome);
    renderResults(submit);
    await waitFor(() => {
      expect(screen.getByText(/you set the bar/)).toBeDefined();
    });
  });

  it('never submits when the leaderboard flag is off', () => {
    const submit = vi.fn();
    renderResults(submit, { flags: { ...FLAGS, leaderboardEnabled: false } });
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('leaderboard')).toBeNull();
  });

  it('recovers from a rejecting submit function', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('boom'));
    renderResults(submit);
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('boom');
    });
  });

  it('wires the retry and menu buttons', async () => {
    const submit = vi.fn().mockResolvedValue({ status: 'skipped' } satisfies SubmitOutcome);
    const { onRetry, onMenu } = renderResults(submit);
    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ride again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});
