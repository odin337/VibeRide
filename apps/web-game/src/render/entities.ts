import { Container, Graphics } from 'pixi.js';
import type { Collectible, LevelDefinition, Obstacle } from '@viberide/shared';

import { movingPlatformOffsetY, sampleTerrainHeight } from '../engine/physics';
import { RENDER_COLORS } from './colors';

/**
 * Obstacle and collectible views (PixiJS glue, coverage-excluded — see
 * vitest.config.ts). All positions come from the deterministic simulation;
 * nothing here mutates gameplay state. Static shapes are built once; the
 * per-frame update only moves platforms and decays beat-synced effects.
 */

export interface EntityViews {
  readonly container: Container;
  /** Advances moving platforms and decays beat pulse/flash effects. */
  update(timeSec: number, deltaSec: number): void;
  /** Beat-synced collectible scale pulse (no-op when reduced motion). */
  pulseCollectibles(): void;
  /** White-flashes the next obstacle within range ahead of the player. */
  flashObstacleAhead(playerXM: number): void;
  hideCollectible(id: string): void;
  /** World position in pixels of a collectible, for pickup effects. */
  collectiblePosition(id: string): { x: number; y: number } | undefined;
  destroy(): void;
}

/** Only the next obstacle within this range flashes on a beat, metres. */
const BEAT_FLASH_RANGE_M = 8;
/** Collectible beat pulse: peak extra scale and ~120 ms decay. */
const PULSE_SCALE = 0.15;
const PULSE_DECAY_PER_SEC = 1 / 0.12;
/** Obstacle beat flash: peak alpha and ~150 ms decay. */
const FLASH_ALPHA = 0.85;
const FLASH_DECAY_PER_SEC = 1 / 0.15;

/** Metal-grey spike strip: a row of outlined triangles on a base bar. */
function drawSpike(graphics: Graphics, w: number, h: number, widthM: number): void {
  const teeth = Math.max(1, Math.round(widthM / 0.6));
  const toothW = w / teeth;
  for (let i = 0; i < teeth; i += 1) {
    graphics
      .poly([i * toothW, 0, i * toothW + toothW / 2, -h, (i + 1) * toothW, 0])
      .fill({ color: RENDER_COLORS.spike })
      .stroke({ width: 2, color: RENDER_COLORS.spikeOutline });
  }
  graphics.rect(0, -2, w, 4).fill({ color: RENDER_COLORS.spikeOutline });
}

/** Wooden crate: brown fill, frame and crossed planks. */
function drawCrate(graphics: Graphics, w: number, h: number): void {
  graphics.rect(0, -h, w, h).fill({ color: RENDER_COLORS.crate });
  graphics
    .moveTo(3, -h + 3)
    .lineTo(w - 3, -3)
    .moveTo(w - 3, -h + 3)
    .lineTo(3, -3)
    .stroke({ width: 4, color: RENDER_COLORS.cratePlank, alpha: 0.9 });
  graphics
    .rect(2, -h + 2, w - 4, h - 4)
    .stroke({ width: 3, color: RENDER_COLORS.crateLight, alpha: 0.7 });
  graphics.rect(0, -h, w, h).stroke({ width: 2.5, color: RENDER_COLORS.cratePlank });
}

/** Green log plank for moving platforms. */
function drawLog(graphics: Graphics, w: number, h: number): void {
  const radius = Math.min(10, h / 2);
  graphics
    .roundRect(0, -h, w, h, radius)
    .fill({ color: RENDER_COLORS.platformLog })
    .stroke({ width: 3, color: RENDER_COLORS.platformLogDark });
  graphics
    .moveTo(6, -h / 2)
    .lineTo(w - 6, -h / 2)
    .stroke({ width: 2, color: RENDER_COLORS.platformLogDark, alpha: 0.4 });
}

function buildObstacle(obstacle: Obstacle, baseY: number, pxPerM: number): Graphics {
  const graphics = new Graphics();
  const w = obstacle.width * pxPerM;
  const h = obstacle.height * pxPerM;
  if (obstacle.kind === 'spike') {
    drawSpike(graphics, w, h, obstacle.width);
  } else if (obstacle.kind === 'block') {
    drawCrate(graphics, w, h);
  } else {
    drawLog(graphics, w, h);
  }
  graphics.position.set(obstacle.x * pxPerM, -baseY * pxPerM);
  return graphics;
}

/** Golden circle with an eighth-note glyph. */
function drawNote(view: Graphics): void {
  view
    .circle(0, 0, 10)
    .fill({ color: RENDER_COLORS.note })
    .stroke({ width: 2, color: RENDER_COLORS.noteRim });
  view.ellipse(-2.5, 3.5, 2.8, 2.1).fill({ color: RENDER_COLORS.noteGlyph });
  view.rect(-0.4, -5.5, 1.6, 9).fill({ color: RENDER_COLORS.noteGlyph });
  view.poly([1.2, -5.5, 4.6, -3.6, 4.6, -1.4, 1.2, -3.3]).fill({ color: RENDER_COLORS.noteGlyph });
}

/** Cyan diamond with a lighter top facet. */
function drawGem(view: Graphics): void {
  view
    .poly([0, -11, 8, 0, 0, 11, -8, 0])
    .fill({ color: RENDER_COLORS.gem })
    .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  view.poly([0, -11, 4, -5.5, -4, -5.5]).fill({ color: RENDER_COLORS.gemLight, alpha: 0.9 });
}

interface Flashable {
  readonly xM: number;
  readonly endXM: number;
  readonly overlay: Graphics;
}

interface CollectibleEntry {
  readonly view: Graphics;
  readonly x: number;
  readonly y: number;
}

export function buildEntityViews(
  level: LevelDefinition,
  pxPerM: number,
  reducedMotion: boolean,
): EntityViews {
  const container = new Container();
  const platforms: { obstacle: Obstacle; view: Graphics; baseY: number }[] = [];
  const collectibles = new Map<string, CollectibleEntry>();
  const flashables: Flashable[] = [];
  const activeFlashes: Graphics[] = [];

  for (const obstacle of level.obstacles) {
    if (obstacle.kind === 'gap') {
      continue; // Gaps are holes in the terrain silhouette, not sprites.
    }
    const baseY = sampleTerrainHeight(level, obstacle.x + obstacle.width / 2);
    const view = buildObstacle(obstacle, baseY, pxPerM);
    if (obstacle.kind === 'movingPlatform') {
      platforms.push({ obstacle, view, baseY });
    }
    // White beat-flash overlay covering the obstacle bounds.
    const w = obstacle.width * pxPerM;
    const h = obstacle.height * pxPerM;
    const overlay = new Graphics();
    overlay.roundRect(-3, -h - 3, w + 6, h + 6, 4).fill({ color: 0xffffff });
    overlay.alpha = 0;
    view.addChild(overlay);
    flashables.push({ xM: obstacle.x, endXM: obstacle.x + obstacle.width, overlay });
    container.addChild(view);
  }
  flashables.sort((a, b) => a.xM - b.xM);

  const sorted: Collectible[] = [...level.collectibles].sort((a, b) => a.x - b.x);
  for (const collectible of sorted) {
    const view = new Graphics();
    if (collectible.kind === 'gem') {
      drawGem(view);
    } else {
      drawNote(view);
    }
    const x = collectible.x * pxPerM;
    const y = -collectible.y * pxPerM;
    view.position.set(x, y);
    collectibles.set(collectible.id, { view, x, y });
    container.addChild(view);
  }

  let pulseLevel = 0;
  return {
    container,
    update(timeSec: number, deltaSec: number): void {
      for (const { obstacle, view, baseY } of platforms) {
        const offset = movingPlatformOffsetY(obstacle, timeSec);
        view.position.y = -(baseY + offset) * pxPerM;
      }
      if (pulseLevel > 0) {
        pulseLevel = Math.max(0, pulseLevel - PULSE_DECAY_PER_SEC * deltaSec);
        const scale = 1 + PULSE_SCALE * pulseLevel;
        for (const entry of collectibles.values()) {
          entry.view.scale.set(scale);
        }
      }
      for (let i = activeFlashes.length - 1; i >= 0; i -= 1) {
        const overlay = activeFlashes[i];
        if (!overlay) {
          continue;
        }
        overlay.alpha = Math.max(0, overlay.alpha - FLASH_DECAY_PER_SEC * deltaSec);
        if (overlay.alpha <= 0) {
          activeFlashes.splice(i, 1);
        }
      }
    },
    pulseCollectibles(): void {
      if (!reducedMotion) {
        pulseLevel = 1;
      }
    },
    flashObstacleAhead(playerXM: number): void {
      if (reducedMotion) {
        return;
      }
      for (const item of flashables) {
        if (item.endXM < playerXM) {
          continue; // Already behind the player.
        }
        if (item.xM <= playerXM + BEAT_FLASH_RANGE_M) {
          item.overlay.alpha = FLASH_ALPHA;
          if (!activeFlashes.includes(item.overlay)) {
            activeFlashes.push(item.overlay);
          }
        }
        break; // Only the next upcoming obstacle is considered.
      }
    },
    hideCollectible(id: string): void {
      const entry = collectibles.get(id);
      if (entry) {
        entry.view.visible = false;
      }
    },
    collectiblePosition(id: string): { x: number; y: number } | undefined {
      const entry = collectibles.get(id);
      return entry ? { x: entry.x, y: entry.y } : undefined;
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
