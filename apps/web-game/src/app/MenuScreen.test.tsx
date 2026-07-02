import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MenuScreen } from './MenuScreen';

describe('MenuScreen', () => {
  it('forwards a picked file', () => {
    const onFile = vi.fn();
    render(<MenuScreen onFile={onFile} onDemo={vi.fn()} error={null} />);
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Choose an audio track'), {
      target: { files: [file] },
    });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('ignores an empty selection', () => {
    const onFile = vi.fn();
    render(<MenuScreen onFile={onFile} onDemo={vi.fn()} error={null} />);
    fireEvent.change(screen.getByLabelText('Choose an audio track'), { target: { files: [] } });
    expect(onFile).not.toHaveBeenCalled();
  });

  it('accepts a dropped file and toggles the active style', () => {
    const onFile = vi.fn();
    render(<MenuScreen onFile={onFile} onDemo={vi.fn()} error={null} />);
    const zone = screen.getByTestId('dropzone');
    const file = new File(['x'], 'drop.ogg', { type: 'audio/ogg' });

    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(zone.className).toContain('vr-dropzone-active');

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('vr-dropzone-active');

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    expect(zone.className).not.toContain('vr-dropzone-active');
  });

  it('fires the demo callback and shows errors', () => {
    const onDemo = vi.fn();
    render(<MenuScreen onFile={vi.fn()} onDemo={onDemo} error="could not decode" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play demo track' }));
    expect(onDemo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('could not decode');
  });
});
