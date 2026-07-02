import { useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

import type { GameController } from './game-controller';

export interface HudOverlayProps {
  readonly controller: GameController;
}

/** In-run overlay: score, distance, the fever meter and the combo streak. */
export function HudOverlay({ controller }: HudOverlayProps): ReactElement {
  const hud = useSyncExternalStore(controller.subscribeHud, controller.getHud);

  return (
    <div className="vr-hud" data-testid="hud">
      <div className="vr-hud-score" aria-label="score">
        {hud.score}
      </div>
      <div className="vr-hud-distance" aria-label="distance">
        {hud.distanceM} m
      </div>
      {hud.combo > 1 && (
        <div className="vr-hud-combo" aria-label="combo" data-testid="combo">
          {hud.combo} combo · ×{hud.comboMultiplier}
        </div>
      )}
      <div className="vr-hud-boost" aria-label="fever meter">
        <div
          className={hud.boosting ? 'vr-boost-fill vr-boost-active' : 'vr-boost-fill'}
          style={{ width: `${Math.round(hud.boostFraction * 100)}%` }}
        />
      </div>
    </div>
  );
}
