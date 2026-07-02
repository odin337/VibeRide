import { Container, Graphics } from 'pixi.js';
import { createPrng } from '@viberide/shared';

import { CONFETTI_COLORS, RENDER_COLORS } from './colors';

/**
 * Event-driven visual effects (PixiJS glue, coverage-excluded — see
 * vitest.config.ts). World effects live in world space (sparkles on pickup,
 * confetti at the finish); screen effects sit on top of the stage (crash
 * shake + red vignette, note-miss darken). All of them are skipped when
 * reduced motion is on, and particle counts are capped.
 */

export interface WorldEffects {
  /** World-space layer; add above entities so bursts render on top. */
  readonly container: Container;
  spawnSparkle(xPx: number, yPx: number): void;
  spawnConfetti(xPx: number, yPx: number): void;
  update(deltaSec: number): void;
  destroy(): void;
}

export interface ScreenEffects {
  /** Stage-fixed overlay layer (vignette + stumble washes). */
  readonly container: Container;
  onCollision(): void;
  onNoteMiss(): void;
  update(deltaSec: number): void;
  /** Current camera shake offset in pixels (0,0 when idle). */
  shakeOffset(): { x: number; y: number };
  destroy(): void;
}

const PARTICLE_CAP = 40;
const SPARKLE_COUNT = 8;
const CONFETTI_COUNT = 26;
const SHAKE_DURATION_SEC = 0.25;
const SHAKE_AMPLITUDE_PX = 10;
const VIGNETTE_DECAY_PER_SEC = 1 / 0.3;
const STUMBLE_DECAY_PER_SEC = 1 / 0.15;

interface Particle {
  readonly view: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly spin: number;
  readonly gravity: number;
  age: number;
  readonly ttl: number;
  readonly baseAlpha: number;
}

export function buildWorldEffects(reducedMotion: boolean, seed: number): WorldEffects {
  const container = new Container();
  const rng = createPrng(seed ^ 0x0effec);
  const particles: Particle[] = [];

  function add(particle: Particle): void {
    particle.view.position.set(particle.x, particle.y);
    particles.push(particle);
    container.addChild(particle.view);
  }

  return {
    container,
    spawnSparkle(xPx: number, yPx: number): void {
      if (reducedMotion) {
        return;
      }
      for (let i = 0; i < SPARKLE_COUNT; i += 1) {
        if (particles.length >= PARTICLE_CAP) {
          return;
        }
        const color = i % 2 === 0 ? RENDER_COLORS.sparkle : 0xffffff;
        const view = new Graphics();
        view.rect(-1, -4.5, 2, 9).fill({ color });
        view.rect(-4.5, -1, 9, 2).fill({ color });
        view.rotation = rng() * Math.PI;
        const angle = (i / SPARKLE_COUNT) * Math.PI * 2 + rng() * 0.5;
        const speed = 70 + rng() * 90;
        add({
          view,
          x: xPx,
          y: yPx,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          spin: (rng() - 0.5) * 8,
          gravity: 60,
          age: 0,
          ttl: 0.3 + rng() * 0.25,
          baseAlpha: 1,
        });
      }
    },
    spawnConfetti(xPx: number, yPx: number): void {
      if (reducedMotion) {
        return;
      }
      for (let i = 0; i < CONFETTI_COUNT; i += 1) {
        if (particles.length >= PARTICLE_CAP) {
          return;
        }
        const color = CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)] ?? 0xffffff;
        const view = new Graphics();
        view.rect(-2, -3.5, 4, 7).fill({ color });
        const angle = -Math.PI / 2 + (rng() - 0.5) * 2.2;
        const speed = 120 + rng() * 220;
        add({
          view,
          x: xPx,
          y: yPx,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          spin: (rng() - 0.5) * 20,
          gravity: 420,
          age: 0,
          ttl: 0.9 + rng() * 0.6,
          baseAlpha: 1,
        });
      }
    },
    update(deltaSec: number): void {
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        if (!particle) {
          continue;
        }
        particle.age += deltaSec;
        if (particle.age >= particle.ttl) {
          container.removeChild(particle.view);
          particle.view.destroy();
          particles.splice(i, 1);
          continue;
        }
        particle.vy += particle.gravity * deltaSec;
        particle.x += particle.vx * deltaSec;
        particle.y += particle.vy * deltaSec;
        particle.view.position.set(particle.x, particle.y);
        particle.view.rotation += particle.spin * deltaSec;
        particle.view.alpha = particle.baseAlpha * (1 - particle.age / particle.ttl);
      }
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}

export function buildScreenEffects(
  widthPx: number,
  heightPx: number,
  reducedMotion: boolean,
  seed: number,
): ScreenEffects {
  const container = new Container();
  const rng = createPrng(seed ^ 0x54a4e);
  const edge = Math.max(60, Math.round(Math.min(widthPx, heightPx) * 0.16));

  // Red crash vignette: soft full wash plus heavier edges.
  const vignette = new Graphics();
  vignette.rect(0, 0, widthPx, heightPx).fill({ color: RENDER_COLORS.vignette, alpha: 0.15 });
  vignette.rect(0, 0, widthPx, edge).fill({ color: RENDER_COLORS.vignette, alpha: 0.35 });
  vignette
    .rect(0, heightPx - edge, widthPx, edge)
    .fill({ color: RENDER_COLORS.vignette, alpha: 0.35 });
  vignette.rect(0, 0, edge, heightPx).fill({ color: RENDER_COLORS.vignette, alpha: 0.35 });
  vignette.rect(widthPx - edge, 0, edge, heightPx).fill({
    color: RENDER_COLORS.vignette,
    alpha: 0.35,
  });
  vignette.alpha = 0;
  container.addChild(vignette);

  // Note-miss "stumble": brief darkening of the whole stage.
  const stumble = new Graphics();
  stumble.rect(0, 0, widthPx, heightPx).fill({ color: RENDER_COLORS.stumble });
  stumble.alpha = 0;
  container.addChild(stumble);

  let shakeT = 0;
  let vignetteLevel = 0;
  let stumbleLevel = 0;
  let shakeX = 0;
  let shakeY = 0;

  return {
    container,
    onCollision(): void {
      if (reducedMotion) {
        return;
      }
      shakeT = SHAKE_DURATION_SEC;
      vignetteLevel = 1;
    },
    onNoteMiss(): void {
      if (reducedMotion) {
        return;
      }
      stumbleLevel = 1;
    },
    update(deltaSec: number): void {
      if (shakeT > 0) {
        shakeT = Math.max(0, shakeT - deltaSec);
        const amp = SHAKE_AMPLITUDE_PX * (shakeT / SHAKE_DURATION_SEC);
        shakeX = (rng() * 2 - 1) * amp;
        shakeY = (rng() * 2 - 1) * amp;
      } else {
        shakeX = 0;
        shakeY = 0;
      }
      if (vignetteLevel > 0) {
        vignetteLevel = Math.max(0, vignetteLevel - VIGNETTE_DECAY_PER_SEC * deltaSec);
        vignette.alpha = vignetteLevel;
      }
      if (stumbleLevel > 0) {
        stumbleLevel = Math.max(0, stumbleLevel - STUMBLE_DECAY_PER_SEC * deltaSec);
        stumble.alpha = stumbleLevel * 0.4;
      }
    },
    shakeOffset(): { x: number; y: number } {
      return { x: shakeX, y: shakeY };
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
