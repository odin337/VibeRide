import { Application, Container } from 'pixi.js';
import type { LevelDefinition, Unsubscribe } from '@viberide/shared';

import type { SimSnapshot } from '../engine/run-controller';
import type { RendererHandle, RendererOptions } from '../app/ports';
import { buildBackground } from './background';
import { buildCarView } from './car';
import { RENDER_COLORS } from './colors';
import { buildScreenEffects, buildWorldEffects } from './effects';
import { buildEntityViews } from './entities';
import { buildTerrainGraphics } from './terrain-view';

/**
 * PixiJS Application glue (coverage-excluded — see vitest.config.ts):
 * canvas lifecycle, camera follow with lookahead + vertical smoothing,
 * subtle fever zoom, crash shake, and the scene graph composition. Every
 * number it draws comes from the sim snapshot, the level definition or a
 * bus event; static world graphics are built once and only containers are
 * transformed per frame.
 */

/** World-to-screen scale: pixels per metre. */
export const PX_PER_M = 42;

/** Camera looks ahead of the car by this fraction of the view width. */
const LOOKAHEAD_FRACTION = 0.28;

/** Vertical anchor: the car sits at this fraction of the view height. */
const CAR_SCREEN_Y_FRACTION = 0.62;

/** Vertical camera smoothing rate (per second). */
const CAMERA_Y_BLEND_PER_SEC = 8;

/** Subtle zoom-out while fever (boost) is active. */
const FEVER_ZOOM = 0.94;
const ZOOM_BLEND_PER_SEC = 5;

export async function createPixiRenderer(
  container: HTMLElement,
  level: LevelDefinition,
  options: RendererOptions,
): Promise<RendererHandle> {
  const app = new Application();
  await app.init({
    background: RENDER_COLORS.skyTop,
    resizeTo: container,
    antialias: true,
  });
  container.appendChild(app.canvas);

  const { reducedMotion } = options;
  const viewW0 = app.screen.width || 800;
  const viewH0 = app.screen.height || 600;

  const background = buildBackground(viewW0, viewH0, level.seed, reducedMotion);
  const zoom = new Container();
  const world = new Container();
  const terrain = buildTerrainGraphics(level, PX_PER_M);
  const entities = buildEntityViews(level, PX_PER_M, reducedMotion);
  const car = buildCarView(level, PX_PER_M, reducedMotion);
  const worldEffects = buildWorldEffects(reducedMotion, level.seed);
  world.addChild(terrain, entities.container, car.container, worldEffects.container);
  zoom.addChild(world);
  const screenEffects = buildScreenEffects(viewW0, viewH0, reducedMotion, level.seed);
  app.stage.addChild(background.container, zoom, screenEffects.container);

  let lastPlayerX = 0;
  const subscriptions: Unsubscribe[] = [
    options.bus.on('audio:beat', () => {
      background.pulse();
      entities.pulseCollectibles();
      entities.flashObstacleAhead(lastPlayerX);
    }),
    options.bus.on('game:collect', ({ collectibleId }) => {
      const pos = entities.collectiblePosition(collectibleId);
      entities.hideCollectible(collectibleId);
      if (pos) {
        worldEffects.spawnSparkle(pos.x, pos.y);
      }
    }),
    options.bus.on('game:noteMiss', () => {
      screenEffects.onNoteMiss();
    }),
    options.bus.on('game:landed', () => {
      car.onLanded();
    }),
    options.bus.on('game:collision', () => {
      screenEffects.onCollision();
    }),
  ];

  let lastTimeSec = 0;
  let smoothCameraY: number | undefined;
  let zoomLevel = 1;
  let finishCelebrated = false;
  let destroyed = false;
  return {
    update(snapshot: SimSnapshot, timeSec: number): void {
      if (destroyed) {
        return;
      }
      const viewW = app.screen.width;
      const viewH = app.screen.height;
      const deltaSec = Math.max(0, timeSec - lastTimeSec);
      lastTimeSec = timeSec;
      lastPlayerX = snapshot.x;

      entities.update(timeSec, deltaSec);
      car.update(snapshot, deltaSec);
      worldEffects.update(deltaSec);
      screenEffects.update(deltaSec);

      if (snapshot.finished && !finishCelebrated) {
        finishCelebrated = true;
        worldEffects.spawnConfetti(snapshot.x * PX_PER_M, -snapshot.y * PX_PER_M - 30);
      }

      // Subtle zoom-out during fever, scaled about the screen centre.
      const zoomTarget = snapshot.boosting && !reducedMotion ? FEVER_ZOOM : 1;
      zoomLevel += (zoomTarget - zoomLevel) * Math.min(1, ZOOM_BLEND_PER_SEC * deltaSec);
      zoom.position.set(viewW / 2, viewH / 2);
      zoom.pivot.set(viewW / 2, viewH / 2);
      zoom.scale.set(zoomLevel);

      // Camera: car left-of-centre with lookahead, clamped to the track
      // start, with vertical smoothing so hill crests don't jolt the view.
      const cameraX = Math.max(0, snapshot.x * PX_PER_M - viewW * (0.5 - LOOKAHEAD_FRACTION));
      const targetCameraY = -snapshot.y * PX_PER_M - viewH * CAR_SCREEN_Y_FRACTION;
      smoothCameraY =
        smoothCameraY === undefined
          ? targetCameraY
          : smoothCameraY +
            (targetCameraY - smoothCameraY) * Math.min(1, CAMERA_Y_BLEND_PER_SEC * deltaSec);

      const shake = screenEffects.shakeOffset();
      world.position.set(-cameraX + shake.x, -smoothCameraY + shake.y);

      background.update(cameraX, deltaSec);
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const unsubscribe of subscriptions.splice(0)) {
        unsubscribe();
      }
      background.destroy();
      entities.destroy();
      car.destroy();
      worldEffects.destroy();
      screenEffects.destroy();
      app.destroy(true, { children: true });
    },
  };
}
