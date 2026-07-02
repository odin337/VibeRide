import { act, render, screen } from '@testing-library/react';
import { createGameEventBus } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { AnalyzingScreen } from './AnalyzingScreen';

describe('AnalyzingScreen', () => {
  it('tracks analysis progress from bus events', () => {
    const bus = createGameEventBus();
    render(<AnalyzingScreen bus={bus} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('0');

    act(() => {
      bus.emit('audio:analysisStarted', { fileName: 'night-drive.mp3' });
      bus.emit('audio:analysisProgress', { progress: 0.45 });
    });
    expect(screen.getByRole('heading').textContent).toContain('night-drive.mp3');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('45');

    act(() => {
      bus.emit('audio:analysisProgress', { progress: 7 }); // clamped
    });
    expect(progressbar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('resets progress when a new analysis starts and unsubscribes on unmount', () => {
    const bus = createGameEventBus();
    const view = render(<AnalyzingScreen bus={bus} />);
    act(() => {
      bus.emit('audio:analysisProgress', { progress: 0.8 });
      bus.emit('audio:analysisStarted', { fileName: 'next.ogg' });
    });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');

    view.unmount();
    expect(bus.listenerCount('audio:analysisProgress')).toBe(0);
    expect(bus.listenerCount('audio:analysisStarted')).toBe(0);
  });
});
