import { Graphics } from 'pixi.js';
import type { LevelDefinition, Obstacle, TrackPoint } from '@viberide/shared';

import { RENDER_COLORS } from './colors';

/**
 * Static terrain geometry (PixiJS glue, coverage-excluded — see
 * vitest.config.ts). World units are metres, +Y up; the renderer flips Y.
 */

/** How far below the lowest terrain point the ground fill extends, metres. */
const GROUND_DEPTH_M = 8;

interface Segment {
  readonly points: TrackPoint[];
}

/** Splits the heightfield into segments, dropping spans covered by gaps. */
function splitAroundGaps(level: LevelDefinition): Segment[] {
  const gaps: Obstacle[] = level.obstacles
    .filter((obstacle) => obstacle.kind === 'gap')
    .sort((a, b) => a.x - b.x);
  const segments: Segment[] = [];
  let current: TrackPoint[] = [];
  for (const point of level.heightfield) {
    const inGap = gaps.some((gap) => point.x > gap.x && point.x < gap.x + gap.width);
    if (inGap) {
      if (current.length > 1) {
        segments.push({ points: current });
      }
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 1) {
    segments.push({ points: current });
  }
  return segments;
}

/** Builds the filled terrain silhouette with a neon ridge line. */
export function buildTerrainGraphics(level: LevelDefinition, pxPerM: number): Graphics {
  const graphics = new Graphics();
  const bottomY = GROUND_DEPTH_M * pxPerM;

  for (const segment of splitAroundGaps(level)) {
    const first = segment.points[0];
    const last = segment.points[segment.points.length - 1];
    if (!first || !last) {
      continue;
    }
    const outline: number[] = [];
    for (const point of segment.points) {
      outline.push(point.x * pxPerM, -point.y * pxPerM);
    }
    // Close the polygon down to a fixed depth below the ride line.
    outline.push(last.x * pxPerM, bottomY, first.x * pxPerM, bottomY);
    graphics.poly(outline).fill({ color: RENDER_COLORS.terrainFill });

    graphics.moveTo(first.x * pxPerM, -first.y * pxPerM);
    for (const point of segment.points) {
      graphics.lineTo(point.x * pxPerM, -point.y * pxPerM);
    }
    graphics.stroke({ width: 3, color: RENDER_COLORS.terrainLine, alpha: 0.9 });
  }

  // Finish line pillar.
  const finishTop = 6 * pxPerM;
  graphics
    .rect(level.finishX * pxPerM, -finishTop, 4, finishTop + bottomY)
    .fill({ color: RENDER_COLORS.finish, alpha: 0.8 });

  return graphics;
}
