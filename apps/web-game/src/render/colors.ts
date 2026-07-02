/**
 * Hill Climb Racing–inspired daytime cartoon palette. Every render module
 * pulls its colours from here so the whole look can be retuned in one place.
 */
export const RENDER_COLORS = {
  // Sky.
  skyTop: 0x4da3e8,
  skyHorizon: 0xcdeafb,
  sunCore: 0xffe89a,
  sunGlow: 0xfff3c4,
  cloud: 0xffffff,
  hillFar: 0x5c9a58,

  // Terrain.
  grass: 0x62b544,
  grassDark: 0x3c7d28,
  dirt: 0x9a6b3f,
  dirtSpot: 0x7c5330,
  gapEdge: 0x4a3220,
  markerPole: 0x6b4f35,
  markerRed: 0xe04338,
  markerWhite: 0xf5f0e6,

  // Car.
  carBody: 0xe8542f,
  carBodyDark: 0xb93c1d,
  carCabin: 0x6e2a14,
  driverSkin: 0xf2c28f,
  driverCap: 0x374b5c,
  wheelTire: 0x2e2c2b,
  wheelHub: 0xd8d8d8,
  wheelHubDark: 0x8e8e8e,
  exhaust: 0xe6e6e6,
  feverGlow: 0xffb03a,

  // Obstacles.
  spike: 0x9aa5ad,
  spikeOutline: 0x59626a,
  crate: 0xb07c45,
  cratePlank: 0x82562c,
  crateLight: 0xcfa06a,
  platformLog: 0x6cae4c,
  platformLogDark: 0x477f2f,

  // Collectibles.
  note: 0xffc93c,
  noteRim: 0xd9a413,
  noteGlyph: 0x5b4300,
  gem: 0x35d0e0,
  gemLight: 0xa8f0f8,

  // Finish flag.
  flagPole: 0x8f99a3,
  flagDark: 0x24262b,
  flagLight: 0xf7f7f2,

  // Effects.
  beatPulse: 0xfff3d6,
  vignette: 0xd93025,
  stumble: 0x101018,
  sparkle: 0xfff2b0,
} as const;

/** Confetti piece colours for the finish celebration. */
export const CONFETTI_COLORS: readonly number[] = [
  0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xff4081, 0xffffff,
];
