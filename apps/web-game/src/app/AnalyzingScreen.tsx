import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { GameEventBus } from '@viberide/shared';

export interface AnalyzingScreenProps {
  readonly bus: GameEventBus;
}

/** Progress view driven by 'audio:analysisStarted' / 'audio:analysisProgress'. */
export function AnalyzingScreen({ bus }: AnalyzingScreenProps): ReactElement {
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    const unsubscribes = [
      bus.on('audio:analysisStarted', ({ fileName: name }) => {
        setFileName(name);
        setProgress(0);
      }),
      bus.on('audio:analysisProgress', ({ progress: value }) => {
        setProgress(Math.min(1, Math.max(0, value)));
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [bus]);

  const percent = Math.round(progress * 100);
  return (
    <section className="vr-screen vr-analyzing">
      <h2>Analyzing{fileName !== '' ? ` “${fileName}”` : ''}…</h2>
      <div
        className="vr-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="vr-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="vr-help">Finding the beat, carving the terrain…</p>
    </section>
  );
}
