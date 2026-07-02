import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { noopLogger } from '@viberide/shared';
import type {
  FeatureFlags,
  GameSettings,
  Logger,
  PlatformAdapter,
  RunResult,
} from '@viberide/shared';
import type { TonModule } from '@viberide/ton-sdk-wrapper';

import type { ApiClient } from '../api/client';
import { submitRunResult } from '../api/submit-flow';
import type { SubmitOutcome } from '../api/submit-flow';
import { AnalyzingScreen } from './AnalyzingScreen';
import type { GameController } from './game-controller';
import { HudOverlay } from './HudOverlay';
import { MenuScreen } from './MenuScreen';
import { ResultsScreen } from './ResultsScreen';
import { SettingsPanel } from './SettingsPanel';
import { TonPanel } from './TonPanel';
import { TRACK_LIBRARY } from './track-library';
import type { LibraryTrack } from './track-library';

export interface AppProps {
  readonly controller: GameController;
  readonly client: ApiClient;
  readonly ton: TonModule;
  readonly flags: FeatureFlags;
  readonly platform: PlatformAdapter;
  readonly logger?: Logger;
}

/**
 * FSM-driven screen switcher. All game logic lives in the controller;
 * this component only renders the current phase and forwards intents.
 * The root element exposes data-game-state for the e2e suite.
 */
export function App({
  controller,
  client,
  ton,
  flags,
  platform,
  logger = noopLogger,
}: AppProps): ReactElement {
  const phase = useSyncExternalStore(controller.subscribePhase, controller.getPhase);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(controller.currentSettings);
  const [ownedNftNames, setOwnedNftNames] = useState<readonly string[]>([]);

  useEffect(() => {
    void controller.loadSettings().then(() => {
      setSettings(controller.currentSettings);
    });
  }, [controller]);

  // NFT tracks unlock when the connected wallet owns the matching item.
  useEffect(() => {
    if (!flags.tonEnabled) {
      return undefined;
    }
    let cancelled = false;
    const refresh = (address: string | null): void => {
      if (address === null) {
        setOwnedNftNames([]);
        return;
      }
      ton
        .getOwnedSkins(address)
        .then((skins) => {
          if (!cancelled) {
            setOwnedNftNames(skins.map((skin) => skin.name));
          }
        })
        .catch((cause: unknown) => {
          logger.warn('failed to list owned NFTs', {
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        });
    };
    refresh(ton.getWallet()?.address ?? null);
    const unsubscribe = ton.onWalletChange((wallet) => {
      refresh(wallet?.address ?? null);
    });
    return (): void => {
      cancelled = true;
      unsubscribe();
    };
  }, [flags.tonEnabled, logger, ton]);

  const lockedTrackIds = TRACK_LIBRARY.filter(
    (libraryTrack) =>
      libraryTrack.nftItemName !== undefined && !ownedNftNames.includes(libraryTrack.nftItemName),
  ).map((libraryTrack) => libraryTrack.id);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      void file
        .arrayBuffer()
        .then((bytes) => controller.loadFile(file.name, bytes))
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'could not analyze this file');
        });
    },
    [controller],
  );

  const handleSelectTrack = useCallback(
    (libraryTrack: LibraryTrack) => {
      setError(null);
      // Library tracks need no confirmation screen — the click is the gesture.
      controller.loadLibraryTrack(libraryTrack);
      controller.play();
    },
    [controller],
  );

  const stageRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        void controller.attachStage(element).catch((cause: unknown) => {
          logger.error('failed to start run', {
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        });
      }
    },
    [controller, logger],
  );

  const handleSettingsChange = useCallback(
    (next: GameSettings) => {
      setSettings(next);
      controller.updateSettings(next);
    },
    [controller],
  );

  const submit = useCallback(
    (result: RunResult): Promise<SubmitOutcome> => {
      const track = controller.loadedTrack;
      if (!track) {
        return Promise.resolve({ status: 'failed' as const, message: 'no track loaded' });
      }
      return submitRunResult({ client, platform, flags, logger }, result, {
        title: track.title,
        beatMap: track.beatMap,
      });
    },
    [client, controller, flags, logger, platform],
  );

  const result = controller.latestResult;
  const track = controller.loadedTrack;

  return (
    <div className="vr-app" data-game-state={phase}>
      <header className="vr-topbar">
        <span className="vr-brand">VibeRide</span>
        <button
          type="button"
          className="vr-button vr-button-ghost"
          aria-label="settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          ⚙
        </button>
      </header>

      {phase === 'menu' && (
        <MenuScreen
          onFile={handleFile}
          onSelectTrack={handleSelectTrack}
          lockedTrackIds={lockedTrackIds}
          error={error}
        />
      )}

      {phase === 'analyzing' && <AnalyzingScreen bus={controller.bus} />}

      {phase === 'ready' && (
        <section className="vr-screen vr-ready">
          <h2>Track ready</h2>
          <p className="vr-results-track">{track?.title ?? ''}</p>
          <div className="vr-actions">
            <button
              type="button"
              className="vr-button vr-button-primary"
              data-testid="start-run"
              onClick={() => controller.play()}
            >
              Ride
            </button>
            <button type="button" className="vr-button" onClick={() => controller.backToMenu()}>
              Back
            </button>
          </div>
        </section>
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <div className="vr-stage-wrap">
          <div className="vr-stage" ref={stageRef} data-testid="stage" />
          <HudOverlay controller={controller} />
          {phase === 'playing' ? (
            <button
              type="button"
              className="vr-button vr-button-ghost vr-pause"
              onClick={() => controller.pause()}
            >
              Pause
            </button>
          ) : (
            <div className="vr-pause-overlay">
              <h2>Paused</h2>
              <div className="vr-actions">
                <button
                  type="button"
                  className="vr-button vr-button-primary"
                  onClick={() => controller.resume()}
                >
                  Resume
                </button>
                <button type="button" className="vr-button" onClick={() => controller.backToMenu()}>
                  Quit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(phase === 'crashed' || phase === 'finished') && result !== null && (
        <ResultsScreen
          result={result}
          trackTitle={track?.title ?? 'Unknown track'}
          flags={flags}
          submit={submit}
          onRetry={() => controller.retry()}
          onMenu={() => controller.backToMenu()}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {phase === 'menu' && flags.tonEnabled && (
        <TonPanel ton={ton} flags={flags} bus={controller.bus} logger={logger} />
      )}
    </div>
  );
}
