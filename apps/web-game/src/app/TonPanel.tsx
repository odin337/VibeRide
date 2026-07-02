import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { noopLogger } from '@viberide/shared';
import type { FeatureFlags, GameEventBus, Logger, NftSkin, WalletInfo } from '@viberide/shared';
import type { TonModule } from '@viberide/ton-sdk-wrapper';

export interface TonPanelProps {
  readonly ton: TonModule;
  readonly flags: FeatureFlags;
  readonly bus: GameEventBus;
  readonly logger?: Logger;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Flag-gated TON wallet connect + NFT skin gallery (render only when tonEnabled). */
export function TonPanel({ ton, flags, bus, logger = noopLogger }: TonPanelProps): ReactElement {
  const [wallet, setWallet] = useState<WalletInfo | null>(() => ton.getWallet());
  const [skins, setSkins] = useState<readonly NftSkin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => ton.onWalletChange(setWallet), [ton]);

  useEffect(() => {
    if (!flags.nftSkinsEnabled || wallet === null) {
      setSkins([]);
      return;
    }
    let cancelled = false;
    void ton
      .getOwnedSkins(wallet.address)
      .then((owned) => {
        if (!cancelled) {
          setSkins(owned);
        }
      })
      .catch((cause: unknown) => {
        logger.warn('skin lookup failed', {
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [flags.nftSkinsEnabled, logger, ton, wallet]);

  const connect = (): void => {
    setBusy(true);
    setError(null);
    void ton
      .connect()
      .then((info) => {
        bus.emit('ton:walletConnected', { wallet: info });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'wallet connection failed');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const disconnect = (): void => {
    void ton
      .disconnect()
      .then(() => {
        bus.emit('ton:walletDisconnected', {});
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'disconnect failed');
      });
  };

  return (
    <aside className="vr-ton" data-testid="ton-panel">
      <h3>TON</h3>
      {wallet === null ? (
        <button type="button" className="vr-button" onClick={connect} disabled={busy}>
          {busy ? 'Connecting…' : 'Connect wallet'}
        </button>
      ) : (
        <div className="vr-ton-wallet">
          <span title={wallet.address}>{shortAddress(wallet.address)}</span>
          <button type="button" className="vr-button" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}
      {error !== null && (
        <p className="vr-error" role="alert">
          {error}
        </p>
      )}
      {flags.nftSkinsEnabled && wallet !== null && (
        <ul className="vr-skins" aria-label="owned skins">
          {skins.map((skin) => (
            <li key={skin.id}>
              <img src={skin.imageUrl} alt={skin.name} width={48} height={48} />
              <span>{skin.name}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
