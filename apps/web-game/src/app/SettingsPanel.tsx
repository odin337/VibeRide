import type { ChangeEvent, ReactElement } from 'react';
import type { GameSettings } from '@viberide/shared';

export interface SettingsPanelProps {
  readonly settings: GameSettings;
  readonly onChange: (settings: GameSettings) => void;
  readonly onClose: () => void;
}

/** Volume + reduced-motion settings; state lives in the controller. */
export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps): ReactElement {
  const handleVolume = (event: ChangeEvent<HTMLInputElement>): void => {
    const volume = Number(event.target.value);
    onChange({
      ...settings,
      volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : settings.volume,
    });
  };

  const handleReducedMotion = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange({ ...settings, reducedMotion: event.target.checked });
  };

  return (
    <aside className="vr-settings" data-testid="settings-panel">
      <h3>Settings</h3>
      <label className="vr-setting">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          aria-label="volume"
          onChange={handleVolume}
        />
      </label>
      <label className="vr-setting">
        <span>Reduced motion</span>
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          aria-label="reduced motion"
          onChange={handleReducedMotion}
        />
      </label>
      <button type="button" className="vr-button" onClick={onClose}>
        Close
      </button>
    </aside>
  );
}
