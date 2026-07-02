import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createGameEventBus, DEFAULT_FLAGS } from '@viberide/shared';
import type { FeatureFlags, GameEventMap } from '@viberide/shared';
import {
  MOCK_SKINS,
  MOCK_WALLET,
  MockTonModule,
  TonDisabledError,
} from '@viberide/ton-sdk-wrapper';
import type { TonModule } from '@viberide/ton-sdk-wrapper';
import { describe, expect, it } from 'vitest';

import { TonPanel } from './TonPanel';

const TON_FLAGS: FeatureFlags = { ...DEFAULT_FLAGS, tonEnabled: true };

function renderPanel(
  ton: TonModule,
  flags: FeatureFlags = TON_FLAGS,
): { events: { connected: GameEventMap['ton:walletConnected'][]; disconnected: number } } {
  const bus = createGameEventBus();
  const events = { connected: [] as GameEventMap['ton:walletConnected'][], disconnected: 0 };
  bus.on('ton:walletConnected', (payload) => {
    events.connected.push(payload);
  });
  bus.on('ton:walletDisconnected', () => {
    events.disconnected += 1;
  });
  render(<TonPanel ton={ton} flags={flags} bus={bus} />);
  return { events };
}

describe('TonPanel', () => {
  it('connects a wallet, shows its address and emits ton:walletConnected', async () => {
    const ton = new MockTonModule();
    const { events } = renderPanel(ton);

    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDefined();
    });
    expect(screen.getByTitle(MOCK_WALLET.address)).toBeDefined();
    expect(events.connected).toEqual([{ wallet: MOCK_WALLET }]);
  });

  it('disconnects and emits ton:walletDisconnected', async () => {
    const ton = new MockTonModule();
    await ton.connect();
    const { events } = renderPanel(ton);

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeDefined();
    });
    expect(events.disconnected).toBe(1);
  });

  it('lists owned NFT skins when the skins flag is on', async () => {
    const ton = new MockTonModule();
    await ton.connect();
    renderPanel(ton, { ...TON_FLAGS, nftSkinsEnabled: true });

    await waitFor(() => {
      expect(screen.getByLabelText('owned skins')).toBeDefined();
    });
    for (const skin of MOCK_SKINS) {
      expect(screen.getByText(skin.name)).toBeDefined();
      expect(screen.getByAltText(skin.name)).toBeDefined();
    }
  });

  it('hides the skin gallery when the flag is off', async () => {
    const ton = new MockTonModule();
    await ton.connect();
    renderPanel(ton);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDefined();
    });
    expect(screen.queryByLabelText('owned skins')).toBeNull();
  });

  it('surfaces connection failures without crashing', async () => {
    const failing = new (class extends MockTonModule {
      override connect(): Promise<never> {
        return Promise.reject(new TonDisabledError());
      }
    })();
    renderPanel(failing);
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('disabled by feature flag');
    });
  });
});
