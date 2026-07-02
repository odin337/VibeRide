import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MenuScreen } from './MenuScreen';
import { TRACK_LIBRARY } from './track-library';

const NFT_TRACK = TRACK_LIBRARY.find((track) => track.nftItemName !== undefined);
const FREE_TRACK = TRACK_LIBRARY.find((track) => track.nftItemName === undefined);

function renderMenu(overrides: Partial<Parameters<typeof MenuScreen>[0]> = {}): {
  onFile: ReturnType<typeof vi.fn>;
  onSelectTrack: ReturnType<typeof vi.fn>;
} {
  const onFile = vi.fn();
  const onSelectTrack = vi.fn();
  render(
    <MenuScreen
      onFile={onFile}
      onSelectTrack={onSelectTrack}
      lockedTrackIds={[]}
      error={null}
      {...overrides}
    />,
  );
  return { onFile, onSelectTrack };
}

describe('MenuScreen', () => {
  it('forwards a picked file', () => {
    const { onFile } = renderMenu();
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Choose an audio track'), {
      target: { files: [file] },
    });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('ignores an empty selection', () => {
    const { onFile } = renderMenu();
    fireEvent.change(screen.getByLabelText('Choose an audio track'), { target: { files: [] } });
    expect(onFile).not.toHaveBeenCalled();
  });

  it('accepts a dropped file and toggles the active style', () => {
    const { onFile } = renderMenu();
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

  it('renders one card per library track and starts a ride on click', () => {
    const { onSelectTrack } = renderMenu();
    for (const track of TRACK_LIBRARY) {
      expect(screen.getByRole('button', { name: track.title })).toBeDefined();
    }
    if (!FREE_TRACK) {
      throw new Error('library has no free track');
    }
    fireEvent.click(screen.getByRole('button', { name: FREE_TRACK.title }));
    expect(onSelectTrack).toHaveBeenCalledWith(FREE_TRACK);
  });

  it('locks NFT tracks the player does not own', () => {
    if (!NFT_TRACK) {
      throw new Error('library has no NFT track');
    }
    const { onSelectTrack } = renderMenu({ lockedTrackIds: [NFT_TRACK.id] });
    const card = screen.getByRole('button', { name: NFT_TRACK.title });
    expect(card).toHaveProperty('disabled', true);
    fireEvent.click(card);
    expect(onSelectTrack).not.toHaveBeenCalled();
    expect(card.textContent).toContain('🔒 NFT');
  });

  it('shows errors', () => {
    renderMenu({ error: 'could not decode' });
    expect(screen.getByRole('alert').textContent).toBe('could not decode');
  });
});
