import { Application, Container } from 'pixi.js';
import type { LevelDefinition, Unsubscribe } from '@viberide/shared';

import type { SimSnapshot } from '../engine/run-controller';
import type { RendererHandle, RendererOptions } from '../app/ports';
import { buildBackground } from './background';
import { RENDER_COLORS } from './colors';
import { buildCarView, buildEntityViews } from './entities';
import { buildTerrainGraphics } from './terrain-view';

/**
 * PixiJS Application glue (coverage-excluded — see vitest.config.ts):
 * canvas lifecycle, resize handling, camera follow with lookahead and the
 * scene graph composition. Every number it draws comes from the sim
 * snapshot or the level definition.
 */

/** World-to-screen scale: pixels per metre. */
export const PX_PER_M = 42;

/** Camera looks ahead of the car by this fraction of the view width. */
const LOOKAHEAD_FRACTION = 0.28;

/** Vertical anchor: the car sits at this fraction of the view height. */
const CAR_SCREEN_Y_FRACTION = 0.62;

export async function createPixiRenderer(
  container: HTMLElement,
  level: LevelDefinition,
  options: RendererOptions,
): Promise<RendererHandle> {
  const app = new Application();
  await app.init({
    background: RENDER_COLORS.background,
    resizeTo: container,
    antialias: true,
  });
  container.appendChild(app.canvas);

  const background = buildBackground(
    app.screen.width || 800,
    app.screen.height || 600,
    options.reducedMotion,
  );
  const world = new Container();
  const terrain = buildTerrainGraphics(level, PX_PER_M);
  const entities = buildEntityViews(level, PX_PER_M);
  const car = buildCarView(PX_PER_M);
  world.addChild(terrain, entities.container, car.container);
  app.stage.addChild(background.container, world);

  const subscriptions: Unsubscribe[] = [
    options.bus.on('audio:beat', () => {
      background.pulse();
    }),
    options.bus.on('game:collect', ({ collectibleId }) => {
      entities.hideCollectible(collectibleId);
    }),
  ];

  let lastTimeSec = 0;
  let destroyed = false;
  return {
    update(snapshot: SimSnapshot, timeSec: number): void {
      if (destroyed) {
        return;
      }
      const viewW = app.screen.width;
      const viewH = app.screen.height;

      entities.updatePlatforms(timeSec);
      car.update(snapshot.x, snapshot.y, snapshot.crashed);

      // Camera: keep the car left-of-center with lookahead, clamped to the track start.
      const cameraX = Math.max(0, snapshot.x * PX_PER_M - viewW * (0.5 - LOOKAHEAD_FRACTION));
      const cameraY = -snapshot.y * PX_PER_M - viewH * CAR_SCREEN_Y_FRACTION;
      world.position.set(-cameraX, -cameraY);

      const deltaFrames = Math.max(0, (timeSec - lastTimeSec) * 60);
      lastTimeSec = timeSec;
      background.update(cameraX, deltaFrames);
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
      app.destroy(true, { children: true });
    },
  };
}
