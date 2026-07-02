import { Container, Graphics } from 'pixi.js';
import { createPrng, PLAYER } from '@viberide/shared';
import type { LevelDefinition } from '@viberide/shared';

import { sampleTerrainHeight } from '../engine/physics';
import type { SimSnapshot } from '../engine/run-controller';
import { RENDER_COLORS } from './colors';

/**
 * Cartoon jeep (PixiJS glue, coverage-excluded — see vitest.config.ts):
 * rounded body with a driver, spinning wheels, slope/airtime pitch,
 * squash-and-stretch landings, fever glow and exhaust puffs. Every pose is
 * derived from the sim snapshot; nothing here mutates gameplay state.
 */

export interface CarView {
  /** World-space wrapper holding the car and its exhaust trail. */
  readonly container: Container;
  /** Squash-and-stretch landing bounce (no-op when reduced motion). */
  onLanded(): void;
  update(snapshot: SimSnapshot, deltaSec: number): void;
  destroy(): void;
}

const EXHAUST_CAP = 24;
const EXHAUST_INTERVAL_SEC = 0.07;
const SQUASH_DURATION_SEC = 0.22;
const PITCH_BLEND_PER_SEC = 9;
const GLOW_BLEND_PER_SEC = 7;
/** Terrain is sampled this far ahead/behind to align the car with slopes. */
const SLOPE_SAMPLE_M = 0.6;
const CRASH_TILT_RAD = 0.55;

interface Puff {
  readonly view: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  readonly ttl: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Body shell: chassis, cabin, driver head with a cap, window glint. */
function drawShell(bodyW: number, bodyH: number): Graphics {
  const shell = new Graphics();
  // Dark open cabin behind the driver.
  shell
    .roundRect(-bodyW * 0.28, -bodyH * 1.25, bodyW * 0.52, bodyH * 0.6, 4)
    .fill({ color: RENDER_COLORS.carCabin });
  // Driver: round head with a little cap.
  const headX = -bodyW * 0.02;
  const headY = -bodyH * 1.18;
  shell.circle(headX, headY, bodyH * 0.2).fill({ color: RENDER_COLORS.driverSkin });
  shell
    .ellipse(headX, headY - bodyH * 0.12, bodyH * 0.22, bodyH * 0.12)
    .fill({ color: RENDER_COLORS.driverCap });
  // Chassis: warm rounded rectangle with a darker outline.
  shell
    .roundRect(-bodyW / 2, -bodyH * 0.78, bodyW, bodyH * 0.62, bodyH * 0.18)
    .fill({ color: RENDER_COLORS.carBody })
    .stroke({ width: 2, color: RENDER_COLORS.carBodyDark });
  // Front bumper nub and a hood glint.
  shell
    .roundRect(bodyW * 0.44, -bodyH * 0.6, bodyW * 0.1, bodyH * 0.28, 3)
    .fill({ color: RENDER_COLORS.carBodyDark });
  shell
    .roundRect(bodyW * 0.08, -bodyH * 0.72, bodyW * 0.3, bodyH * 0.12, 3)
    .fill({ color: 0xffffff, alpha: 0.25 });
  return shell;
}

/** Wheel: dark tire, light hub, cross spokes so the spin reads. */
function drawWheel(wheelR: number): Graphics {
  const wheel = new Graphics();
  wheel.circle(0, 0, wheelR).fill({ color: RENDER_COLORS.wheelTire });
  wheel
    .circle(0, 0, wheelR * 0.55)
    .fill({ color: RENDER_COLORS.wheelHub })
    .stroke({ width: 1.5, color: RENDER_COLORS.wheelHubDark });
  wheel
    .moveTo(-wheelR * 0.5, 0)
    .lineTo(wheelR * 0.5, 0)
    .moveTo(0, -wheelR * 0.5)
    .lineTo(0, wheelR * 0.5)
    .stroke({ width: 2, color: RENDER_COLORS.wheelHubDark });
  wheel.circle(0, 0, wheelR * 0.14).fill({ color: RENDER_COLORS.wheelTire });
  return wheel;
}

export function buildCarView(
  level: LevelDefinition,
  pxPerM: number,
  reducedMotion: boolean,
): CarView {
  const container = new Container();
  const exhaustLayer = new Container();
  const root = new Container();
  container.addChild(exhaustLayer, root);

  const bodyW = PLAYER.widthM * pxPerM;
  const bodyH = PLAYER.heightM * pxPerM;
  const wheelR = bodyH * 0.34;

  // Warm fever glow behind the whole car, faded in while boosting.
  const glow = new Graphics();
  glow.circle(0, 0, bodyW * 0.95).fill({ color: RENDER_COLORS.feverGlow, alpha: 0.1 });
  glow.circle(0, 0, bodyW * 0.72).fill({ color: RENDER_COLORS.feverGlow, alpha: 0.16 });
  glow.circle(0, 0, bodyW * 0.5).fill({ color: RENDER_COLORS.feverGlow, alpha: 0.22 });
  glow.position.set(0, -bodyH * 0.55);
  glow.alpha = 0;

  // Body group squashes about the axle line (origin y = 0).
  const body = new Container();
  body.addChild(drawShell(bodyW, bodyH));

  const wheels: Graphics[] = [];
  for (const wheelX of [-bodyW * 0.32, bodyW * 0.32]) {
    const wheel = drawWheel(wheelR);
    wheel.position.set(wheelX, -wheelR * 0.9);
    wheels.push(wheel);
  }
  root.addChild(glow, body, ...wheels);

  const rng = createPrng(0xcafe);
  const puffs: Puff[] = [];
  const wheelRadiusM = wheelR / pxPerM;

  let lastY: number | undefined;
  let pitch = 0;
  let squashT = 0;
  let glowAlpha = 0;
  let exhaustTimer = 0;

  function spawnPuff(): void {
    if (puffs.length >= EXHAUST_CAP) {
      return;
    }
    const view = new Graphics();
    view.circle(0, 0, 2.5 + rng() * 3).fill({ color: RENDER_COLORS.exhaust });
    const puff: Puff = {
      view,
      x: root.position.x - bodyW * 0.55,
      y: root.position.y - bodyH * 0.35,
      vx: -40 - rng() * 40,
      vy: -15 - rng() * 25,
      age: 0,
      ttl: 0.55 + rng() * 0.35,
    };
    view.position.set(puff.x, puff.y);
    puffs.push(puff);
    exhaustLayer.addChild(view);
  }

  function updatePuffs(deltaSec: number): void {
    for (let i = puffs.length - 1; i >= 0; i -= 1) {
      const puff = puffs[i];
      if (!puff) {
        continue;
      }
      puff.age += deltaSec;
      if (puff.age >= puff.ttl) {
        exhaustLayer.removeChild(puff.view);
        puff.view.destroy();
        puffs.splice(i, 1);
        continue;
      }
      puff.x += puff.vx * deltaSec;
      puff.y += puff.vy * deltaSec;
      puff.view.position.set(puff.x, puff.y);
      puff.view.scale.set(1 + puff.age * 1.6);
      puff.view.alpha = 0.75 * (1 - puff.age / puff.ttl);
    }
  }

  return {
    container,
    onLanded(): void {
      if (!reducedMotion) {
        squashT = SQUASH_DURATION_SEC;
      }
    },
    update(snapshot: SimSnapshot, deltaSec: number): void {
      root.position.set(snapshot.x * pxPerM, -snapshot.y * pxPerM);

      // Wheels spin proportionally to the travelled distance.
      if (!snapshot.crashed) {
        const rotation = snapshot.x / wheelRadiusM;
        for (const wheel of wheels) {
          wheel.rotation = rotation;
        }
      }

      // Vertical velocity from consecutive snapshot deltas drives the pitch.
      let vy = 0;
      if (lastY !== undefined && deltaSec > 0) {
        vy = (snapshot.y - lastY) / deltaSec;
      }
      lastY = snapshot.y;
      let pitchTarget: number;
      if (snapshot.crashed) {
        pitchTarget = CRASH_TILT_RAD;
      } else if (snapshot.grounded) {
        const ahead = sampleTerrainHeight(level, snapshot.x + SLOPE_SAMPLE_M);
        const behind = sampleTerrainHeight(level, snapshot.x - SLOPE_SAMPLE_M);
        pitchTarget = -Math.atan2(ahead - behind, SLOPE_SAMPLE_M * 2);
      } else {
        // Nose up while rising, down while falling (screen Y is flipped).
        pitchTarget = clamp(-vy * 0.045, -0.38, 0.42);
      }
      pitch += (pitchTarget - pitch) * Math.min(1, PITCH_BLEND_PER_SEC * deltaSec);
      root.rotation = pitch;

      // Landing squash-and-stretch, recovering over SQUASH_DURATION_SEC.
      if (squashT > 0) {
        squashT = Math.max(0, squashT - deltaSec);
        const k = squashT / SQUASH_DURATION_SEC;
        body.scale.set(1 + 0.18 * k, 1 - 0.25 * k);
        body.position.y = 3 * k;
      } else {
        body.scale.set(1, 1);
        body.position.y = 0;
      }

      // Fever glow fades in/out with the boost state.
      const glowTarget = snapshot.boosting && !snapshot.crashed ? 1 : 0;
      glowAlpha += (glowTarget - glowAlpha) * Math.min(1, GLOW_BLEND_PER_SEC * deltaSec);
      glow.alpha = glowAlpha;

      // Exhaust puffs stream out while boosting.
      if (snapshot.boosting && !snapshot.crashed && !reducedMotion) {
        exhaustTimer += deltaSec;
        while (exhaustTimer >= EXHAUST_INTERVAL_SEC) {
          exhaustTimer -= EXHAUST_INTERVAL_SEC;
          spawnPuff();
        }
      } else {
        exhaustTimer = 0;
      }
      updatePuffs(deltaSec);

      root.alpha = snapshot.crashed ? 0.55 : 1;
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
