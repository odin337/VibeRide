import { Container, Graphics } from 'pixi.js';
import { createPrng } from '@viberide/shared';

import { RENDER_COLORS } from './colors';

/**
 * Parallax skyline + starfield that pulses on 'audio:beat' (PixiJS glue,
 * coverage-excluded — see vitest.config.ts). Purely decorative.
 */

export interface BackgroundView {
  readonly container: Container;
  /** Scrolls the parallax layers to follow the camera. */
  update(cameraXpx: number, deltaFrames: number): void;
  /** Kicks the beat pulse (ignored when reduced motion is on). */
  pulse(): void;
  destroy(): void;
}

const LAYER_FACTORS = [0.15, 0.35] as const;

export function buildBackground(
  widthPx: number,
  heightPx: number,
  reducedMotion: boolean,
): BackgroundView {
  const container = new Container();
  const rng = createPrng(0x5eed);
  const layers: { view: Container; factor: number }[] = [];

  // Starfield (slowest layer).
  const stars = new Graphics();
  for (let i = 0; i < 70; i += 1) {
    const x = rng() * widthPx * 3;
    const y = rng() * heightPx * 0.7;
    stars.circle(x, y, rng() * 1.6 + 0.4).fill({ color: 0xffffff, alpha: 0.3 + rng() * 0.5 });
  }
  const starLayer = new Container();
  starLayer.addChild(stars);
  container.addChild(starLayer);
  layers.push({ view: starLayer, factor: LAYER_FACTORS[0] });

  // Skyline silhouettes.
  const skyline = new Graphics();
  let x = 0;
  while (x < widthPx * 3) {
    const w = 40 + rng() * 90;
    const h = heightPx * (0.15 + rng() * 0.3);
    skyline.rect(x, heightPx * 0.85 - h, w, h).fill({ color: RENDER_COLORS.backgroundGlow });
    x += w + 12 + rng() * 30;
  }
  const skylineLayer = new Container();
  skylineLayer.addChild(skyline);
  container.addChild(skylineLayer);
  layers.push({ view: skylineLayer, factor: LAYER_FACTORS[1] });

  // Beat glow overlay.
  const glow = new Graphics();
  glow.rect(0, 0, widthPx * 3, heightPx).fill({ color: RENDER_COLORS.terrainLine, alpha: 1 });
  glow.alpha = 0;
  container.addChild(glow);

  let pulseLevel = 0;
  return {
    container,
    update(cameraXpx: number, deltaFrames: number): void {
      for (const layer of layers) {
        layer.view.position.x = -cameraXpx * layer.factor;
      }
      if (pulseLevel > 0) {
        pulseLevel = Math.max(0, pulseLevel - 0.06 * deltaFrames);
        glow.alpha = pulseLevel * 0.12;
      }
    },
    pulse(): void {
      if (!reducedMotion) {
        pulseLevel = 1;
      }
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
