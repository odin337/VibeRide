import { fireEvent, render, screen } from '@testing-library/react';
import type { GameSettings } from '@viberide/shared';
import { describe, expect, it, vi } from 'vitest';

import { SettingsPanel } from './SettingsPanel';

const SETTINGS: GameSettings = { volume: 0.8, reducedMotion: false };

describe('SettingsPanel', () => {
  it('reflects the current settings', () => {
    render(<SettingsPanel settings={SETTINGS} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('volume')).toHaveProperty('value', '0.8');
    expect(screen.getByLabelText('reduced motion')).toHaveProperty('checked', false);
  });

  it('emits clamped volume changes', () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={SETTINGS} onChange={onChange} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('volume'), { target: { value: '0.25' } });
    expect(onChange).toHaveBeenCalledWith({ volume: 0.25, reducedMotion: false });
  });

  it('toggles reduced motion', () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={SETTINGS} onChange={onChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('reduced motion'));
    expect(onChange).toHaveBeenCalledWith({ volume: 0.8, reducedMotion: true });
  });

  it('closes via the close button', () => {
    const onClose = vi.fn();
    render(<SettingsPanel settings={SETTINGS} onChange={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
