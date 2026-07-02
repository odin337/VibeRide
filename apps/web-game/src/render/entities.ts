import { Container, Graphics } from 'pixi.js';
import type { LevelDefinition, Obstacle } from '@viberide/shared';
import { PLAYER } from '@viberide/shared';

import { movingPlatformOffsetY, sampleTerrainHeight } from '../engine/physics';
import { RENDER_COLORS } from './colors';

/**
 * Obstacle, collectible and car views (PixiJS glue, coverage-excluded —
 * see vitest.config.ts). All positions come from the deterministic
 * simulation; nothing here mutates gameplay state.
 */

export interface EntityViews {
  readonly container: Container;
  /** Advances the moving platforms; timeSec = tick × SIM_DT. */
  updatePlatforms(timeSec: number): void;
  hideCollectible(id: string): void;
  destroy(): void;
}

function buildObstacle(obstacle: Obstacle, baseY: number, pxPerM: number): Graphics {
  const graphics = new Graphics();
  const w = obstacle.width * pxPerM;
  const h = obstacle.height * pxPerM;
  if (obstacle.kind === 'spike') {
    // A row of triangles across the obstacle span.
    const teeth = Math.max(1, Math.round(obstacle.width / 0.6));
    const toothW = w / teeth;
    for (let i = 0; i < teeth; i += 1) {
      graphics
        .poly([i * toothW, 0, i * toothW + toothW / 2, -h, (i + 1) * toothW, 0])
        .fill({ color: RENDER_COLORS.spike });
    }
  } else if (obstacle.kind === 'block') {
    graphics.rect(0, -h, w, h).fill({ color: RENDER_COLORS.block });
    graphics.rect(0, -h, w, h).stroke({ width: 2, color: RENDER_COLORS.terrainLine, alpha: 0.5 });
  } else {
    graphics.roundRect(0, -h, w, h, 6).fill({ color: RENDER_COLORS.movingPlatform });
  }
  graphics.position.set(obstacle.x * pxPerM, -baseY * pxPerM);
  return graphics;
}

export function buildEntityViews(level: LevelDefinition, pxPerM: number): EntityViews {
  const container = new Container();
  const platforms: { obstacle: Obstacle; view: Graphics; baseY: number }[] = [];
  const collectibles = new Map<string, Graphics>();

  for (const obstacle of level.obstacles) {
    if (obstacle.kind === 'gap') {
      continue; // Gaps are holes in the terrain silhouette, not sprites.
    }
    const baseY = sampleTerrainHeight(level, obstacle.x + obstacle.width / 2);
    const view = buildObstacle(obstacle, baseY, pxPerM);
    if (obstacle.kind === 'movingPlatform') {
      platforms.push({ obstacle, view, baseY });
    }
    container.addChild(view);
  }

  for (const collectible of level.collectibles) {
    const view = new Graphics();
    if (collectible.kind === 'gem') {
      view
        .poly([0, -10, 8, 0, 0, 10, -8, 0])
        .fill({ color: RENDER_COLORS.gem })
        .stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    } else {
      view.circle(0, 0, 6).fill({ color: RENDER_COLORS.note });
    }
    view.position.set(collectible.x * pxPerM, -collectible.y * pxPerM);
    collectibles.set(collectible.id, view);
    container.addChild(view);
  }

  return {
    container,
    updatePlatforms(timeSec: number): void {
      for (const { obstacle, view, baseY } of platforms) {
        const offset = movingPlatformOffsetY(obstacle, timeSec);
        view.position.y = -(baseY + offset) * pxPerM;
      }
    },
    hideCollectible(id: string): void {
      const view = collectibles.get(id);
      if (view) {
        view.visible = false;
      }
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}

export interface CarView {
  readonly container: Container;
  /** Positions the car and spins the wheels from the travelled distance. */
  update(xM: number, yM: number, crashed: boolean): void;
  destroy(): void;
}

export function buildCarView(pxPerM: number): CarView {
  const container = new Container();
  const bodyW = PLAYER.widthM * pxPerM;
  const bodyH = PLAYER.heightM * pxPerM;
  const wheelR = bodyH * 0.32;

  const body = new Graphics();
  body
    .roundRect(-bodyW / 2, -bodyH, bodyW, bodyH * 0.72, 5)
    .fill({ color: RENDER_COLORS.car })
    .roundRect(-bodyW * 0.18, -bodyH * 1.18, bodyW * 0.42, bodyH * 0.5, 4)
    .fill({ color: RENDER_COLORS.carAccent, alpha: 0.9 });

  const wheels: Graphics[] = [];
  for (const wheelX of [-bodyW * 0.3, bodyW * 0.3]) {
    const wheel = new Graphics();
    wheel
      .circle(0, 0, wheelR)
      .fill({ color: RENDER_COLORS.wheel })
      .stroke({ width: 2, color: RENDER_COLORS.wheelRim });
    // A spoke so the spin is visible.
    wheel.moveTo(0, 0).lineTo(wheelR, 0).stroke({ width: 2, color: RENDER_COLORS.wheelRim });
    wheel.position.set(wheelX, -wheelR * 0.9);
    wheels.push(wheel);
    container.addChild(wheel);
  }
  container.addChild(body);

  const wheelRadiusM = wheelR / pxPerM;
  return {
    container,
    update(xM: number, yM: number, crashed: boolean): void {
      container.position.set(xM * pxPerM, -yM * pxPerM);
      const rotation = xM / wheelRadiusM;
      for (const wheel of wheels) {
        wheel.rotation = rotation;
      }
      container.alpha = crashed ? 0.4 : 1;
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
