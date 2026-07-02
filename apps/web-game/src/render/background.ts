import { Container, Graphics } from 'pixi.js';
import { createPrng } from '@viberide/shared';
import type { Prng } from '@viberide/shared';

import { RENDER_COLORS } from './colors';

/**
 * Cartoon daytime sky (PixiJS glue, coverage-excluded — see
 * vitest.config.ts): vertical gradient, soft sun, drifting clouds and
 * rolling hill silhouettes on two parallax layers. Purely decorative.
 */

export interface BackgroundView {
  readonly container: Container;
  /** Scrolls the parallax layers and decays the beat pulse. */
  update(cameraXpx: number, deltaSec: number): void;
  /** Kicks the beat pulse (ignored when reduced motion is on). */
  pulse(): void;
  destroy(): void;
}

const CLOUD_PARALLAX = 0.2;
const HILL_PARALLAX = 0.4;
const CLOUD_DRIFT_PX_PER_SEC = 7;
const PULSE_DECAY_PER_SEC = 4;
const SKY_BANDS = 18;

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(a: number, b: number, t: number): number {
  const r = lerpChannel((a >> 16) & 0xff, (b >> 16) & 0xff, t);
  const g = lerpChannel((a >> 8) & 0xff, (b >> 8) & 0xff, t);
  const bl = lerpChannel(a & 0xff, b & 0xff, t);
  return (r << 16) | (g << 8) | bl;
}

/** Vertical light-blue → pale-horizon gradient painted as flat bands. */
function drawSky(width: number, height: number): Graphics {
  const sky = new Graphics();
  const bandH = height / SKY_BANDS;
  for (let i = 0; i < SKY_BANDS; i += 1) {
    const t = i / (SKY_BANDS - 1);
    sky
      .rect(0, i * bandH, width, bandH + 1)
      .fill({ color: lerpColor(RENDER_COLORS.skyTop, RENDER_COLORS.skyHorizon, t) });
  }
  return sky;
}

/** Soft sun disc with halo rings, top-left of the screen. */
function drawSun(width: number, height: number): Graphics {
  const sun = new Graphics();
  const cx = width * 0.17;
  const cy = height * 0.18;
  sun.circle(cx, cy, 72).fill({ color: RENDER_COLORS.sunGlow, alpha: 0.25 });
  sun.circle(cx, cy, 54).fill({ color: RENDER_COLORS.sunGlow, alpha: 0.35 });
  sun.circle(cx, cy, 38).fill({ color: RENDER_COLORS.sunCore });
  return sun;
}

interface CloudBlob {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
}

/** White rounded cloud blobs, drawn periodically so the layer tiles. */
function drawClouds(rng: Prng, tileW: number, height: number): Graphics {
  const clouds = new Graphics();
  const blobs: CloudBlob[] = [];
  const count = Math.max(4, Math.round(tileW / 260));
  for (let i = 0; i < count; i += 1) {
    blobs.push({
      cx: rng() * tileW,
      cy: height * (0.08 + rng() * 0.3),
      scale: 0.7 + rng() * 0.9,
    });
  }
  // Draw each blob at x - T, x and x + T so the modulo scroll wraps cleanly.
  for (const shift of [-tileW, 0, tileW]) {
    for (const blob of blobs) {
      const x = blob.cx + shift;
      const s = blob.scale;
      clouds
        .ellipse(x, blob.cy, 44 * s, 17 * s)
        .circle(x - 20 * s, blob.cy - 7 * s, 16 * s)
        .circle(x + 6 * s, blob.cy - 13 * s, 20 * s)
        .circle(x + 26 * s, blob.cy - 4 * s, 13 * s)
        .fill({ color: RENDER_COLORS.cloud, alpha: 0.92 });
    }
  }
  return clouds;
}

interface Hump {
  readonly cx: number;
  readonly radius: number;
}

/** Rolling hill silhouettes: overlapping circle tops over a solid base. */
function drawHills(rng: Prng, tileW: number, height: number): Graphics {
  const hills = new Graphics();
  const baseY = height * 0.8;
  const humps: Hump[] = [];
  let x = -80;
  while (x < tileW) {
    const radius = 70 + rng() * 130;
    humps.push({ cx: x + radius, radius });
    x += radius * (0.9 + rng() * 0.6);
  }
  for (const shift of [-tileW, 0, tileW]) {
    for (const hump of humps) {
      hills
        .circle(hump.cx + shift, baseY + hump.radius * 0.45, hump.radius)
        .fill({ color: RENDER_COLORS.hillFar });
    }
    hills.rect(shift, baseY, tileW, height - baseY).fill({ color: RENDER_COLORS.hillFar });
  }
  return hills;
}

export function buildBackground(
  widthPx: number,
  heightPx: number,
  seed: number,
  reducedMotion: boolean,
): BackgroundView {
  const container = new Container();
  const rng = createPrng(seed ^ 0x5eed);
  const tileW = Math.max(widthPx, 800) * 1.5;

  container.addChild(drawSky(widthPx, heightPx));
  container.addChild(drawSun(widthPx, heightPx));

  const cloudLayer = new Container();
  cloudLayer.addChild(drawClouds(rng, tileW, heightPx));
  container.addChild(cloudLayer);

  const hillLayer = new Container();
  hillLayer.addChild(drawHills(rng, tileW, heightPx));
  container.addChild(hillLayer);

  // Beat pulse: a warm wash whose alpha spikes on the beat and decays.
  const pulseOverlay = new Graphics();
  pulseOverlay.rect(0, 0, widthPx, heightPx).fill({ color: RENDER_COLORS.beatPulse });
  pulseOverlay.alpha = 0;
  container.addChild(pulseOverlay);

  let cloudDrift = 0;
  let pulseLevel = 0;
  return {
    container,
    update(cameraXpx: number, deltaSec: number): void {
      if (!reducedMotion) {
        cloudDrift += CLOUD_DRIFT_PX_PER_SEC * deltaSec;
      }
      cloudLayer.position.x = -((cameraXpx * CLOUD_PARALLAX + cloudDrift) % tileW);
      hillLayer.position.x = -((cameraXpx * HILL_PARALLAX) % tileW);
      if (pulseLevel > 0) {
        pulseLevel = Math.max(0, pulseLevel - PULSE_DECAY_PER_SEC * deltaSec);
        pulseOverlay.alpha = pulseLevel * 0.1;
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
