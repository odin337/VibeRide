import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactElement } from 'react';

import { TRACK_LIBRARY } from './track-library';
import type { LibraryTrack } from './track-library';

export interface MenuScreenProps {
  readonly onFile: (file: File) => void;
  readonly onSelectTrack: (track: LibraryTrack) => void;
  /** Ids of NFT tracks the player has not unlocked. */
  readonly lockedTrackIds: readonly string[];
  readonly error: string | null;
}

function formatDuration(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * Landing screen: a Piano-Tiles-style library of pre-tuned tracks (each
 * card is one ride), an mp3/ogg dropzone for custom music, and NFT tracks
 * that unlock via TON wallet ownership.
 */
export function MenuScreen({
  onFile,
  onSelectTrack,
  lockedTrackIds,
  error,
}: MenuScreenProps): ReactElement {
  const [dragOver, setDragOver] = useState(false);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        onFile(file);
      }
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files[0];
      if (file) {
        onFile(file);
      }
    },
    [onFile],
  );

  return (
    <section className="vr-screen vr-menu">
      <h1 className="vr-title">
        Vibe<span className="vr-title-accent">Ride</span>
      </h1>
      <p className="vr-tagline">Every ride is a song. You are the melody.</p>

      <h2 className="vr-lib-heading">Track library</h2>
      <div className="vr-track-grid" data-testid="track-library">
        {TRACK_LIBRARY.map((track) => {
          const locked = lockedTrackIds.includes(track.id);
          return (
            <button
              key={track.id}
              type="button"
              className={locked ? 'vr-track-card vr-track-locked' : 'vr-track-card'}
              disabled={locked}
              aria-label={track.title}
              onClick={() => {
                onSelectTrack(track);
              }}
            >
              <span className="vr-track-title">{track.title}</span>
              <span className="vr-track-meta">
                {track.bpm} BPM · {formatDuration(track.durationSec)} ·{' '}
                {'●'.repeat(track.difficulty)}
                {'○'.repeat(3 - track.difficulty)}
              </span>
              {track.nftItemName !== undefined && (
                <span className="vr-track-badge">{locked ? '🔒 NFT' : 'NFT ✓'}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className={dragOver ? 'vr-dropzone vr-dropzone-active' : 'vr-dropzone'}
        data-testid="dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <label className="vr-file-label">
          <input
            type="file"
            accept=".mp3,.ogg,audio/mpeg,audio/ogg"
            aria-label="Choose an audio track"
            onChange={handleChange}
          />
          <span>Or ride your own music — mp3 / ogg, drop it here</span>
        </label>
      </div>

      {error !== null && (
        <p role="alert" className="vr-error">
          {error}
        </p>
      )}

      <p className="vr-help">
        Space / tap — jump · Shift / hold — fever · &#8595; — dive. Hit the notes, keep the combo,
        the music follows you.
      </p>
    </section>
  );
}
