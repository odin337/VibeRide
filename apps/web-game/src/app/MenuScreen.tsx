import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactElement } from 'react';

export interface MenuScreenProps {
  readonly onFile: (file: File) => void;
  readonly onDemo: () => void;
  readonly error: string | null;
}

/** Landing screen: pick an mp3/ogg (input or drag-drop) or ride the demo. */
export function MenuScreen({ onFile, onDemo, error }: MenuScreenProps): ReactElement {
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
      <p className="vr-tagline">Drop a track. Ride its beat.</p>

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
          <span>Choose an mp3 / ogg — or drop it here</span>
        </label>
      </div>

      <button type="button" className="vr-button vr-button-primary" onClick={onDemo}>
        Play demo track
      </button>

      {error !== null && (
        <p role="alert" className="vr-error">
          {error}
        </p>
      )}

      <p className="vr-help">Space / tap — jump · Shift / hold — boost · &#8592; — lean back</p>
    </section>
  );
}
