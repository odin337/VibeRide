import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { FeatureFlags, RunResult } from '@viberide/shared';

import type { SubmitOutcome } from '../api/submit-flow';

export interface ResultsScreenProps {
  readonly result: RunResult;
  readonly trackTitle: string;
  readonly flags: FeatureFlags;
  readonly submit: (result: RunResult) => Promise<SubmitOutcome>;
  readonly onRetry: () => void;
  readonly onMenu: () => void;
}

/** Post-run screen: outcome, score submission and the leaderboard table. */
export function ResultsScreen({
  result,
  trackTitle,
  flags,
  submit,
  onRetry,
  onMenu,
}: ResultsScreenProps): ReactElement {
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedFor = useRef<RunResult | null>(null);

  useEffect(() => {
    if (!flags.leaderboardEnabled || submittedFor.current === result) {
      return;
    }
    submittedFor.current = result;
    setSubmitting(true);
    setOutcome(null);
    let cancelled = false;
    void submit(result)
      .then((value) => {
        if (!cancelled) {
          setOutcome(value);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOutcome({
            status: 'failed',
            message: error instanceof Error ? error.message : 'submission failed',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSubmitting(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flags.leaderboardEnabled, result, submit]);

  return (
    <section className="vr-screen vr-results">
      <h2>{result.finished ? 'Finish line!' : 'Wiped out'}</h2>
      <p className="vr-results-track">{trackTitle}</p>
      <dl className="vr-results-stats">
        <div>
          <dt>Score</dt>
          <dd data-testid="final-score">{result.score}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{Math.round(result.distanceM)} m</dd>
        </div>
        <div>
          <dt>Pickups</dt>
          <dd>{result.collectiblesTaken}</dd>
        </div>
      </dl>

      {flags.leaderboardEnabled && (
        <div className="vr-leaderboard" data-testid="leaderboard">
          {submitting && <p>Submitting score…</p>}
          {!submitting && outcome?.status === 'failed' && (
            <p className="vr-error" role="alert">
              {outcome.message ?? 'Leaderboard unavailable'}
            </p>
          )}
          {!submitting && outcome?.page && outcome.page.entries.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {outcome.page.entries.map((entry) => (
                  <tr key={`${entry.rank}-${entry.playerId}`}>
                    <td>{entry.rank}</td>
                    <td>{entry.displayName}</td>
                    <td>{entry.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!submitting && outcome?.status === 'submitted' && outcome.page?.entries.length === 0 && (
            <p>First ride on this track — you set the bar.</p>
          )}
        </div>
      )}

      <div className="vr-actions">
        <button type="button" className="vr-button vr-button-primary" onClick={onRetry}>
          Ride again
        </button>
        <button type="button" className="vr-button" onClick={onMenu}>
          Back to menu
        </button>
      </div>
    </section>
  );
}
