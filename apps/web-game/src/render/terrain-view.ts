import { Graphics } from 'pixi.js';
import { createPrng } from '@viberide/shared';
import type { LevelDefinition, Obstacle, Prng, TrackPoint } from '@viberide/shared';

import { sampleTerrainHeight } from '../engine/physics';
import { RENDER_COLORS } from './colors';

/**
 * Static terrain geometry (PixiJS glue, coverage-excluded — see
 * vitest.config.ts): brown dirt body with a thick cartoon grass band,
 * deterministic dirt spots, jagged gap cut faces with warning markers and
 * the checkered finish flag. World units are metres, +Y up; the renderer
 * flips Y. Built once — the camera only moves the parent container.
 */

/** How far below the lowest terrain point the ground fill extends, metres. */
const GROUND_DEPTH_M = 8;

/** Thickness of the grass band along the ride line, metres. */
const GRASS_BAND_M = 0.35;

/** Finish flag pole height, metres. */
const FLAG_HEIGHT_M = 5;

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

/** Brown dirt polygon from the ride line down to a fixed depth. */
function drawDirtBody(graphics: Graphics, points: readonly TrackPoint[], pxPerM: number): void {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return;
  }
  const bottomY = GROUND_DEPTH_M * pxPerM;
  const outline: number[] = [];
  for (const point of points) {
    outline.push(point.x * pxPerM, -point.y * pxPerM);
  }
  outline.push(last.x * pxPerM, bottomY, first.x * pxPerM, bottomY);
  graphics.poly(outline).fill({ color: RENDER_COLORS.dirt });
}

/** Darker ellipse "spots" inside the dirt, deterministic from the level seed. */
function drawDirtSpots(
  graphics: Graphics,
  level: LevelDefinition,
  points: readonly TrackPoint[],
  pxPerM: number,
  rng: Prng,
): void {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return;
  }
  const bottomY = GROUND_DEPTH_M * pxPerM;
  let x = first.x + 1.5;
  while (x < last.x - 1.5) {
    const surfaceY = sampleTerrainHeight(level, x);
    const depthM = 1.3 + rng() * 2.8;
    const rx = (0.3 + rng() * 0.45) * pxPerM;
    const ry = rx * (0.5 + rng() * 0.2);
    const cy = (-surfaceY + depthM) * pxPerM;
    if (cy + ry < bottomY - 6) {
      graphics.ellipse(x * pxPerM, cy, rx, ry).fill({ color: RENDER_COLORS.dirtSpot, alpha: 0.75 });
    }
    x += 2.2 + rng() * 2.6;
  }
}

/** Thick grass band hugging the ride line, with a darker green outline. */
function drawGrassBand(graphics: Graphics, points: readonly TrackPoint[], pxPerM: number): void {
  const first = points[0];
  if (!first) {
    return;
  }
  const bandPx = GRASS_BAND_M * pxPerM;
  const band: number[] = [];
  for (const point of points) {
    band.push(point.x * pxPerM, -point.y * pxPerM);
  }
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (point) {
      band.push(point.x * pxPerM, -point.y * pxPerM + bandPx);
    }
  }
  graphics.poly(band).fill({ color: RENDER_COLORS.grass });

  // Darker outline along the ridge.
  graphics.moveTo(first.x * pxPerM, -first.y * pxPerM);
  for (const point of points) {
    graphics.lineTo(point.x * pxPerM, -point.y * pxPerM);
  }
  graphics.stroke({ width: 3.5, color: RENDER_COLORS.grassDark, alpha: 0.95 });

  // Faint line where grass meets dirt.
  graphics.moveTo(first.x * pxPerM, -first.y * pxPerM + bandPx);
  for (const point of points) {
    graphics.lineTo(point.x * pxPerM, -point.y * pxPerM + bandPx);
  }
  graphics.stroke({ width: 2, color: RENDER_COLORS.grassDark, alpha: 0.35 });
}

/** Jagged dark cut face where the terrain drops into a gap. */
function drawCutFace(
  graphics: Graphics,
  level: LevelDefinition,
  edgeXM: number,
  pxPerM: number,
  inward: 1 | -1,
): void {
  const topY = -sampleTerrainHeight(level, edgeXM) * pxPerM;
  const bottomY = GROUND_DEPTH_M * pxPerM;
  const x0 = edgeXM * pxPerM;
  const points: number[] = [x0, topY];
  const steps = 7;
  for (let i = 1; i <= steps; i += 1) {
    const y = topY + (bottomY - topY) * (i / steps);
    const jag = (i % 2 === 0 ? 0.06 : 0.3) * pxPerM;
    points.push(x0 + inward * jag, y);
  }
  points.push(x0 + inward * 0.5 * pxPerM, bottomY, x0 + inward * 0.5 * pxPerM, topY + 6);
  graphics.poly(points).fill({ color: RENDER_COLORS.gapEdge, alpha: 0.85 });
}

/** Small red/white striped warning marker planted at a gap lip. */
function drawGapMarker(
  graphics: Graphics,
  level: LevelDefinition,
  xM: number,
  pxPerM: number,
): void {
  const baseY = -sampleTerrainHeight(level, xM) * pxPerM;
  const x = xM * pxPerM;
  const poleH = 0.85 * pxPerM;
  graphics.rect(x - 1.5, baseY - poleH, 3, poleH).fill({ color: RENDER_COLORS.markerPole });
  const signW = 0.55 * pxPerM;
  const signH = 0.3 * pxPerM;
  const sx = x - signW / 2;
  const sy = baseY - poleH - signH + 2;
  const stripe = signW / 3;
  graphics.rect(sx, sy, stripe, signH).fill({ color: RENDER_COLORS.markerRed });
  graphics.rect(sx + stripe, sy, stripe, signH).fill({ color: RENDER_COLORS.markerWhite });
  graphics.rect(sx + 2 * stripe, sy, stripe, signH).fill({ color: RENDER_COLORS.markerRed });
  graphics
    .rect(sx, sy, signW, signH)
    .stroke({ width: 1.5, color: RENDER_COLORS.gapEdge, alpha: 0.8 });
}

/** Cut faces + warning markers for every gap obstacle. */
function drawGapEdges(graphics: Graphics, level: LevelDefinition, pxPerM: number): void {
  for (const gap of level.obstacles) {
    if (gap.kind !== 'gap') {
      continue;
    }
    // Exact terrain cut positions: the heightfield points kept by
    // splitAroundGaps closest to each side of the gap span.
    let leftX: number | undefined;
    let rightX: number | undefined;
    for (const point of level.heightfield) {
      if (point.x <= gap.x) {
        leftX = point.x;
      }
      if (rightX === undefined && point.x >= gap.x + gap.width) {
        rightX = point.x;
      }
    }
    if (leftX !== undefined) {
      drawCutFace(graphics, level, leftX, pxPerM, -1);
      drawGapMarker(graphics, level, leftX - 0.35, pxPerM);
    }
    if (rightX !== undefined) {
      drawCutFace(graphics, level, rightX, pxPerM, 1);
      drawGapMarker(graphics, level, rightX + 0.35, pxPerM);
    }
  }
}

/** Finish pole with a checkered flag at level.finishX. */
function drawFinishFlag(graphics: Graphics, level: LevelDefinition, pxPerM: number): void {
  const baseY = -sampleTerrainHeight(level, level.finishX) * pxPerM;
  const x = level.finishX * pxPerM;
  const poleH = FLAG_HEIGHT_M * pxPerM;
  graphics.rect(x - 2, baseY - poleH, 4, poleH).fill({ color: RENDER_COLORS.flagPole });
  graphics
    .circle(x, baseY - poleH, 4)
    .fill({ color: RENDER_COLORS.flagLight })
    .stroke({ width: 1.5, color: RENDER_COLORS.flagPole });
  const cell = 0.35 * pxPerM;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const color = (row + col) % 2 === 0 ? RENDER_COLORS.flagDark : RENDER_COLORS.flagLight;
      graphics.rect(x + 2 + col * cell, baseY - poleH + row * cell, cell, cell).fill({ color });
    }
  }
  graphics
    .rect(x + 2, baseY - poleH, cell * 4, cell * 2)
    .stroke({ width: 1.5, color: RENDER_COLORS.flagDark, alpha: 0.7 });
}

/** Builds the full static terrain: dirt, grass, spots, gap edges, flag. */
export function buildTerrainGraphics(level: LevelDefinition, pxPerM: number): Graphics {
  const graphics = new Graphics();
  const rng = createPrng(level.seed ^ 0x7e44a1);
  for (const segment of splitAroundGaps(level)) {
    drawDirtBody(graphics, segment.points, pxPerM);
    drawDirtSpots(graphics, level, segment.points, pxPerM, rng);
    drawGrassBand(graphics, segment.points, pxPerM);
  }
  drawGapEdges(graphics, level, pxPerM);
  drawFinishFlag(graphics, level, pxPerM);
  return graphics;
}
