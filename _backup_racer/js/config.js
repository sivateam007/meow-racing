// js/config.js
// Meow Racing — central configuration.
// All gameplay/math constants live here so gameplay matches the verified
// FullSpeed Racing (AutoControl) source as closely as possible.
// Meow Racing branding only affects text/UI; physics/visuals stay identical.

// -----------------------------------------------------------------------------
// CAR (AutoControl — verified)
// -----------------------------------------------------------------------------
export const CAR = {
  // Verified AutoControl constants
  maxSpeed: 62.5,
  gravity: 9.8,
  speedGiro: 32,
  speedGiroStunt: 35,
  drift: 0.3,

  // Derived / tuning
  accel: 28.0,
  brakeDecel: 55.0,
  coastDecel: 12.0,
  reverseMax: 14.0,
  airControl: 0.6,

  // Boost (legacy turbo alias — see BOOST for the new system)
  turboMax: 100,
  turboDrain: 45,
  turboRegenPass: 12,
  turboRegenCoin: 6,
  turboRegenCrown: 20,
  turboRegenIdle: 3,
  turboSpeedMult: 1.45,
  turboMinToActivate: 20,

  // Lives / timer defaults (per-level overrides live in LEVELS)
  lives: 3,
  tiempoMax: 60,
  checkpointTimeBonus: 8,
  timeoutFailGrace: 0.5,

  // Collision
  collisionSpeedPenalty: 0.55,
  collisionInvulnTime: 1.2,
  collisionShakeAmp: 0.9,
  collisionShakeDur: 0.5,

  // Drift / skid
  skidThreshold: 8.0,
  skidFade: 0.6,

  // Physical footprint for collisions
  collisionRadius: 1.1,
  bodyHalfWidth: 1.0,
  bodyHalfLength: 2.2,
  bodyHalfHeight: 0.55
};

// -----------------------------------------------------------------------------
// LANES (verified: carrilPosX = -0.368, -0.184, 0, +0.184, +0.368)
// -----------------------------------------------------------------------------
export const LANE_SCALE = 20;
export const LANES = {
  raw: [-0.368, -0.184, 0, 0.184, 0.368],
  count: 5,
  width: 0.184 * LANE_SCALE,
  get positions() {
    return this.raw.map((v) => v * LANE_SCALE);
  }
};
export const LANE_POSITIONS = LANES.positions;

// -----------------------------------------------------------------------------
// ROAD / WORLD
// -----------------------------------------------------------------------------
export const ROAD = {
  width: LANES.width * LANES.count,
  segmentLength: 60,
  segmentsAhead: 6,
  segmentsBehind: 1,
  laneMarkLength: 4.0,
  laneMarkGap: 4.0,
  guardrailHeight: 0.7,
  guardrailThickness: 0.35,
  shoulderWidth: 3.0,
  rumbleWidth: 0.6,
  rumbleStripeLength: 2.0
};

export const WORLD = {
  fogColor: 0x9fd8ff,
  fogNear: 90,
  fogFar: 260,
  groundY: 0,
  oceanLevel: -0.35,
  beachLevel: -0.15,
  shadowMapSize: 2048,
  sunDirection: { x: -0.55, y: 0.8, z: -0.35 },
  ambientIntensity: 0.65,
  sunIntensity: 1.4,
  hemiIntensity: 0.45
};

// -----------------------------------------------------------------------------
// TRAFFIC — pool size and behaviours
// -----------------------------------------------------------------------------
export const TRAFFIC = {
  count: 30,
  countMobile: 20,
  minSpeed: 18,
  maxSpeed: 36,
  spawnAheadDistance: 260,
  recycleBehindDistance: 45,
  laneChance: [0.18, 0.22, 0.2, 0.22, 0.18],
  lateralSnapSpeed: 6,
  laneChangeMinInterval: 2.5,
  laneChangeMaxInterval: 6.5,
  laneChangeChance: 0.35,
  colors: [0xd8433a, 0x2f7fd8, 0x2fb56a, 0xf0a03a, 0xe23b2e, 0x8a2fbf],
  scale: 1.0
};

// Traffic car types (weighted). Widths/lengths are approximate bounds (metres).
export const TRAFFIC_TYPES = {
  sedan: {
    name: 'Sedan',
    w: 1.8,
    h: 1.1,
    l: 3.6,
    weight: 4,
    speedRange: [18, 28],
    palette: [0xd8433a, 0x2f7fd8, 0x2fb56a, 0xf0a03a]
  },
  sports: {
    name: 'Sports',
    w: 1.85,
    h: 0.95,
    l: 3.8,
    weight: 3,
    speedRange: [26, 42],
    palette: [0xe23b2e, 0xffd21a, 0x1a1a1a, 0x9fd8ff]
  },
  van: {
    name: 'Van',
    w: 2.0,
    h: 1.7,
    l: 4.8,
    weight: 2,
    speedRange: [16, 24],
    palette: [0xf0f0f5, 0xbfc7cf, 0xf7b8a0, 0xd6e8f5]
  },
  truck: {
    name: 'Truck',
    w: 2.4,
    h: 2.6,
    l: 7.0,
    weight: 1,
    speedRange: [14, 20],
    palette: [0x4a4a52, 0x8a2fbf, 0x2a7ba8, 0xd68f00]
  }
};

// -----------------------------------------------------------------------------
// SPAWNING — pickups & checkpoints
// -----------------------------------------------------------------------------
export const SPAWN = {
  checkpointEveryDistance: 550,
  checkpointFirstAt: 350,
  coinEveryDistance: 40,
  coinLaneJitter: 0.55,
  crownEveryCoins: 12,
  turboPickupEveryDistance: 180,
  boostPickupEveryDistance: 140
};

export const PICKUPS = {
  coinRadius: 0.55,
  coinSpinSpeed: 2.2,
  coinBobAmp: 0.18,
  coinBobFreq: 2.4,
  crownRadius: 0.75,
  crownSpinSpeed: 1.6,
  crownBobAmp: 0.22,
  crownBobFreq: 2.0,
  turboRadius: 0.7,
  turboSpinSpeed: 3.0,
  boostRadius: 0.8,
  boostSpinSpeed: 2.6,
  valueCoin: 25,
  valueCrown: 150,
  valueTurbo: 0,
  magnetRadius: 0
};

export const SCORE = {
  perMeter: 0.1,
  passTraffic: 50,
  checkpoint: 300,
  coin: 25,
  crown: 150,
  comboWindow: 2.5,
  comboMax: 8
};

// -----------------------------------------------------------------------------
// CAMERA
// -----------------------------------------------------------------------------
export const CAMERA = {
  fov: 62,
  fovTurboBoost: 82,
  near: 0.1,
  far: 500,
  offsetBack: 10.5,
  offsetUp: 4.2,
  lookAhead: 8.0,
  lookUp: 1.4,
  followLerp: 6.0,
  rotationLerp: 4.0,
  fovLerp: 4.0,
  checkpointTweenDur: 0.9,
  checkpointTweenBack: 14.0,
  checkpointTweenUp: 6.5,
  shakeDecay: 4.0,
  shakeMax: 1.4,
  menuOrbitRadius: 12.0,
  menuOrbitHeight: 5.5,
  menuOrbitSpeed: 0.28,
  menuOrbitLookHeight: 0.6
};

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------
export const UI = {
  title: 'MEOW RACING',
  subtitle: 'Full Speed, Nine Lives',
  goText: 'GO',
  gameOverText: 'GAME OVER',
  winText: 'YOU WIN!',
  restartText: 'Press R to restart',
  counterTweenDur: 450,
  popupDur: 900,
  overlayFadeDur: 400,
  scorePopupLifetime: 900,
  levelCompleteDur: 1200
};

// -----------------------------------------------------------------------------
// INPUT
// -----------------------------------------------------------------------------
export const INPUT = {
  steerLeft: ['ArrowLeft', 'KeyA'],
  steerRight: ['ArrowRight', 'KeyD'],
  gas: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  turbo: ['Space', 'ArrowUp', 'KeyW'],
  boost: ['Space', 'ArrowUp', 'KeyW'],
  drift: ['ShiftLeft', 'ShiftRight'],
  pause: ['KeyP', 'Escape'],
  start: ['Enter'],
  restart: ['KeyR'],
  cycleColor: ['KeyC'],
  mute: ['KeyM']
};

export const DRIFT = { grip: 0.25, yawBoost: 1.35, smokeRate: 0.05, minSpeed: 8 };
export const ANALOG = { dragSensitivity: 0.0035, maxSteer: 1 };

// -----------------------------------------------------------------------------
// CAR COLORS (legacy — SKINS is the authoritative list now)
// -----------------------------------------------------------------------------
export const CAR_COLORS = [
  { name: 'Banana', body: 0xffd21a, accent: 0x1a1a1a },
  { name: 'Cherry', body: 0xe23b2e, accent: 0x141414 },
  { name: 'Ocean', body: 0x2f7fd8, accent: 0x101820 },
  { name: 'Mint', body: 0x2fbf78, accent: 0x0f2016 }
];

export const CAR_MATERIALS = {
  wheel: 0x141414,
  hub: 0xbfbfbf,
  glass: 0x9fd8ff,
  lightFront: 0xfff6c8,
  lightBrake: 0xff3b30,
  glow: 0x9fe8ff,
  shadow: 0x000000
};

// -----------------------------------------------------------------------------
// SKINS — purchasable car skins
// -----------------------------------------------------------------------------
export const SKINS = [
  { id: 'banana',   name: 'Banana',   body: 0xffd21a, accent: 0x1a1a1a, price: 0 },
  { id: 'cherry',   name: 'Cherry',   body: 0xe23b2e, accent: 0x141414, price: 250 },
  { id: 'ocean',    name: 'Ocean',    body: 0x2f7fd8, accent: 0x101820, price: 500 },
  { id: 'mint',     name: 'Mint',     body: 0x2fbf78, accent: 0x0f2016, price: 750 },
  { id: 'midnight', name: 'Midnight', body: 0x2a2a3a, accent: 0xffd21a, price: 1200 },
  { id: 'lava',     name: 'Lava',     body: 0xff6a1a, accent: 0x1a1a1a, price: 1600 },
  { id: 'ghost',    name: 'Ghost',    body: 0xf0f0f5, accent: 0x101820, price: 2000 },
  { id: 'royal',    name: 'Royal',    body: 0x6a2fbf, accent: 0xffd21a, price: 2500 }
];

// -----------------------------------------------------------------------------
// BOOST — replaces the legacy turbo system with richer effects
// -----------------------------------------------------------------------------
export const BOOST = {
  max: 100,
  startAmount: 50,
  drainRate: 42,
  idleRegen: 3,
  passRegen: 14,
  pickupRegen: 35,
  coinRegen: 6,
  crownRegen: 20,
  minToActivate: 18,
  speedMult: 1.55,
  fovBoost: 84,
  fovLerp: 5.0,
  flameRate: 70,
  shakeAmp: 0.14,
  glowTarget: 0.7,
  ribbonBoost: 1.6
};

// -----------------------------------------------------------------------------
// LEVELS — 10 levels with increasing difficulty and distinct themes
// -----------------------------------------------------------------------------
export const LEVELS = [
  { id: 1,  name: 'Sunny Shores',     theme: 'beach',    targetDistance: 800,  timeLimit: 60, trafficDensity: 1.00, trafficSpeedMult: 1.00, coinRate: 1.00 },
  { id: 2,  name: 'Boardwalk Rush',   theme: 'coastal',  targetDistance: 1100, timeLimit: 65, trafficDensity: 1.15, trafficSpeedMult: 1.05, coinRate: 1.00 },
  { id: 3,  name: 'Bay Bridge',       theme: 'harbour',  targetDistance: 1400, timeLimit: 70, trafficDensity: 1.30, trafficSpeedMult: 1.10, coinRate: 1.10 },
  { id: 4,  name: 'City Lights',      theme: 'city',     targetDistance: 1700, timeLimit: 72, trafficDensity: 1.50, trafficSpeedMult: 1.15, coinRate: 1.15 },
  { id: 5,  name: 'Golden Hour',      theme: 'sunset',   targetDistance: 2000, timeLimit: 75, trafficDensity: 1.65, trafficSpeedMult: 1.20, coinRate: 1.20 },
  { id: 6,  name: 'Night Drive',      theme: 'night',    targetDistance: 2300, timeLimit: 78, trafficDensity: 1.80, trafficSpeedMult: 1.25, coinRate: 1.25 },
  { id: 7,  name: 'Desert Run',       theme: 'desert',   targetDistance: 2600, timeLimit: 80, trafficDensity: 1.95, trafficSpeedMult: 1.30, coinRate: 1.30 },
  { id: 8,  name: 'Mountain Pass',    theme: 'mountain', targetDistance: 2900, timeLimit: 82, trafficDensity: 2.10, trafficSpeedMult: 1.35, coinRate: 1.40 },
  { id: 9,  name: 'Jungle Speedway',  theme: 'jungle',   targetDistance: 3200, timeLimit: 85, trafficDensity: 2.25, trafficSpeedMult: 1.40, coinRate: 1.50 },
  { id: 10, name: 'Meow Grand Prix',  theme: 'final',    targetDistance: 3600, timeLimit: 90, trafficDensity: 2.40, trafficSpeedMult: 1.50, coinRate: 1.60 },
  { id: 11, name: 'Sunlit Cove Blitz', theme: 'beach', targetDistance: 3900, timeLimit: 92, trafficDensity: 2.5, trafficSpeedMult: 1.55, coinRate: 1.7 },
  { id: 12, name: 'Tidebreaker Coast', theme: 'coastal', targetDistance: 4120, timeLimit: 95, trafficDensity: 2.62, trafficSpeedMult: 1.6, coinRate: 1.78 },
  { id: 13, name: 'Dockyard Rush Hour', theme: 'harbour', targetDistance: 4340, timeLimit: 98, trafficDensity: 2.74, trafficSpeedMult: 1.65, coinRate: 1.86 },
  { id: 14, name: 'Skyline Overdrive', theme: 'city', targetDistance: 4560, timeLimit: 101, trafficDensity: 2.86, trafficSpeedMult: 1.7, coinRate: 1.95 },
  { id: 15, name: 'Amber Horizon Run', theme: 'sunset', targetDistance: 4780, timeLimit: 104, trafficDensity: 2.98, trafficSpeedMult: 1.75, coinRate: 2.05 },
  { id: 16, name: 'Neon Afterburner', theme: 'night', targetDistance: 5000, timeLimit: 107, trafficDensity: 3.1, trafficSpeedMult: 1.8, coinRate: 2.15 },
  { id: 17, name: 'Mirage Ridge Dash', theme: 'desert', targetDistance: 5220, timeLimit: 110, trafficDensity: 3.22, trafficSpeedMult: 1.85, coinRate: 2.24 },
  { id: 18, name: 'Summit Switchbacks', theme: 'mountain', targetDistance: 5450, timeLimit: 113, trafficDensity: 3.34, trafficSpeedMult: 1.9, coinRate: 2.32 },
  { id: 19, name: 'Canopy Turbo Trail', theme: 'jungle', targetDistance: 5720, timeLimit: 116, trafficDensity: 3.48, trafficSpeedMult: 1.95, coinRate: 2.41 },
  { id: 20, name: 'Meow Grand Finale', theme: 'final', targetDistance: 6000, timeLimit: 120, trafficDensity: 3.6, trafficSpeedMult: 2.0, coinRate: 2.5 }
];

// -----------------------------------------------------------------------------
// THEMES — per-level palette and lighting recipes
// -----------------------------------------------------------------------------
export const THEMES = {
  beach: {
    skyTop: 0x2a95d8, skyMid: 0x6fc0ec, skyLow: 0xb9e0f5, skyHorizon: 0xe6f3fb,
    oceanTint: 0x2aa7e8, oceanSpeed: 1.0,
    sunDir: { x: -0.55, y: 0.80, z: -0.35 }, sunColor: 0xfff2d8, sunIntensity: 1.40,
    hemiSky: 0x9fd8ff, hemiGround: 0xf5e2b8, hemiIntensity: 0.45,
    ambientColor: 0xffffff, ambientIntensity: 0.26,
    fogColor: 0x9fd8ff, fogNear: 90, fogFar: 260,
    buildingPalette: [0xf5e5c8, 0xe8c9a0, 0xd6e8f5, 0xf7b8a0, 0xc8e0d0, 0xf0d0e0],
    palmLeaf: 0x2fbf5a
  },
  coastal: {
    skyTop: 0x2478c8, skyMid: 0x67b2e0, skyLow: 0xb0d8ee, skyHorizon: 0xf1ece0,
    oceanTint: 0x1f94d4, oceanSpeed: 1.05,
    sunDir: { x: -0.45, y: 0.85, z: -0.30 }, sunColor: 0xfff0cc, sunIntensity: 1.45,
    hemiSky: 0x9ed4ff, hemiGround: 0xf3dcb4, hemiIntensity: 0.48,
    ambientColor: 0xffffff, ambientIntensity: 0.28,
    fogColor: 0xc0e0f0, fogNear: 95, fogFar: 280,
    buildingPalette: [0xf6e8cc, 0xf0d0a8, 0xd8e8f8, 0xf4c8b0, 0xcce4d4, 0xf2d8e8],
    palmLeaf: 0x2eb74e
  },
  harbour: {
    skyTop: 0x3a80a8, skyMid: 0x7aaac4, skyLow: 0xbdd4de, skyHorizon: 0xeee6d8,
    oceanTint: 0x1f7a9a, oceanSpeed: 0.95,
    sunDir: { x: -0.60, y: 0.72, z: -0.30 }, sunColor: 0xffe8c8, sunIntensity: 1.30,
    hemiSky: 0x90b8d0, hemiGround: 0xe8d8b8, hemiIntensity: 0.50,
    ambientColor: 0xe0e8f0, ambientIntensity: 0.30,
    fogColor: 0xa8c8d8, fogNear: 85, fogFar: 250,
    buildingPalette: [0xd8d0c4, 0xa8a498, 0xc8b8a8, 0x8a98a0, 0xb8c4cc, 0xd4ccb8],
    palmLeaf: 0x2fa04a
  },
  city: {
    skyTop: 0x4a78b8, skyMid: 0x8aa8d0, skyLow: 0xc8d8e8, skyHorizon: 0xf0e8d8,
    oceanTint: 0x2a7aa8, oceanSpeed: 0.9,
    sunDir: { x: -0.50, y: 0.85, z: -0.25 }, sunColor: 0xfff4d8, sunIntensity: 1.35,
    hemiSky: 0xa0c0e0, hemiGround: 0xe0d8c0, hemiIntensity: 0.52,
    ambientColor: 0xe8e8f0, ambientIntensity: 0.32,
    fogColor: 0xb8c8d8, fogNear: 80, fogFar: 240,
    buildingPalette: [0xc8d0d8, 0xa0a8b0, 0xd8dcd8, 0xb0b8c0, 0xc0c8d0, 0x9ea8b0],
    palmLeaf: 0x2a9848
  },
  sunset: {
    skyTop: 0x6a4898, skyMid: 0xd07aa0, skyLow: 0xffaa80, skyHorizon: 0xffe0b0,
    oceanTint: 0x8a4a7a, oceanSpeed: 1.1,
    sunDir: { x: -0.70, y: 0.35, z: -0.20 }, sunColor: 0xffb070, sunIntensity: 1.55,
    hemiSky: 0xd0a0c0, hemiGround: 0xffd8a0, hemiIntensity: 0.50,
    ambientColor: 0xf8d8b8, ambientIntensity: 0.34,
    fogColor: 0xe0a8a8, fogNear: 75, fogFar: 230,
    buildingPalette: [0xd8a8b0, 0xc8a0b0, 0xe0b8b0, 0xb89098, 0xd0a8a8, 0xe8c8c0],
    palmLeaf: 0x3a8a4a
  },
  night: {
    skyTop: 0x0a1430, skyMid: 0x1a2850, skyLow: 0x2a3868, skyHorizon: 0x3a4880,
    oceanTint: 0x1a2a4a, oceanSpeed: 0.8,
    sunDir: { x: 0.35, y: 0.55, z: -0.25 }, sunColor: 0x90b8ff, sunIntensity: 0.55,
    hemiSky: 0x3050a0, hemiGround: 0x201838, hemiIntensity: 0.40,
    ambientColor: 0x5060a0, ambientIntensity: 0.30,
    fogColor: 0x1a2848, fogNear: 70, fogFar: 220,
    buildingPalette: [0x3a4a68, 0x2a3a58, 0x4a5a78, 0x304868, 0x3a4868, 0x284060],
    palmLeaf: 0x1a5838
  },
  desert: {
    skyTop: 0x4a90c8, skyMid: 0x9ab8d8, skyLow: 0xe0c8a8, skyHorizon: 0xf8e0b0,
    oceanTint: 0x8a9068, oceanSpeed: 0.7,
    sunDir: { x: -0.55, y: 0.90, z: -0.35 }, sunColor: 0xfff4c8, sunIntensity: 1.60,
    hemiSky: 0xf0d8a8, hemiGround: 0xd8a878, hemiIntensity: 0.55,
    ambientColor: 0xfff0d8, ambientIntensity: 0.36,
    fogColor: 0xf0d8b0, fogNear: 100, fogFar: 280,
    buildingPalette: [0xd8b888, 0xc8a878, 0xe0c898, 0xb89868, 0xd0a878, 0xe8c8a0],
    palmLeaf: 0x5a9a3a
  },
  mountain: {
    skyTop: 0x3a78b0, skyMid: 0x7aa8cc, skyLow: 0xc0d8e8, skyHorizon: 0xe8f0f8,
    oceanTint: 0x3a88b8, oceanSpeed: 1.0,
    sunDir: { x: -0.40, y: 0.88, z: -0.30 }, sunColor: 0xfff8e0, sunIntensity: 1.42,
    hemiSky: 0xa8c8e8, hemiGround: 0xd8e0e8, hemiIntensity: 0.50,
    ambientColor: 0xe8f0f8, ambientIntensity: 0.30,
    fogColor: 0xb8d0e0, fogNear: 90, fogFar: 260,
    buildingPalette: [0xc8d8e8, 0xa8b8c8, 0xd8e0e8, 0x98a8b8, 0xb8c8d8, 0xe0e8f0],
    palmLeaf: 0x2a8848
  },
  jungle: {
    skyTop: 0x2a8a6a, skyMid: 0x5ab890, skyLow: 0xa8d8b8, skyHorizon: 0xe0f0d8,
    oceanTint: 0x2a8878, oceanSpeed: 1.15,
    sunDir: { x: -0.50, y: 0.82, z: -0.28 }, sunColor: 0xfff0c8, sunIntensity: 1.38,
    hemiSky: 0x98e0b8, hemiGround: 0xc8e0a8, hemiIntensity: 0.52,
    ambientColor: 0xd8f0d8, ambientIntensity: 0.32,
    fogColor: 0xa8d8b8, fogNear: 85, fogFar: 250,
    buildingPalette: [0xa8c898, 0x88b888, 0xc0d8a8, 0x98b878, 0xb0c898, 0xd0e0b8],
    palmLeaf: 0x1a9a4a
  },
  final: {
    skyTop: 0x3a2868, skyMid: 0x8a4898, skyLow: 0xffd070, skyHorizon: 0xfff0b0,
    oceanTint: 0x5a3a88, oceanSpeed: 1.2,
    sunDir: { x: -0.55, y: 0.60, z: -0.30 }, sunColor: 0xffd890, sunIntensity: 1.65,
    hemiSky: 0xd0b0e8, hemiGround: 0xffe0a8, hemiIntensity: 0.55,
    ambientColor: 0xfff0d8, ambientIntensity: 0.36,
    fogColor: 0xe8c8a8, fogNear: 80, fogFar: 240,
    buildingPalette: [0xe8c8d8, 0xd8a8c0, 0xf0d8b0, 0xb890b8, 0xe8b898, 0xf8e0c0],
    palmLeaf: 0x3a9a5a
  }
};

// -----------------------------------------------------------------------------
// PERF TIERS — mobile / low-power tuning
// -----------------------------------------------------------------------------
export const PERF_TIERS = {
  desktop: {
    pixelRatioCap: 2.0,
    shadowMapSize: 2048,
    particleCount: 26,
    ribbonCount: 18,
    trafficCount: 30,
    shadowType: 'pcfsoft'
  },
  mobile: {
    pixelRatioCap: 1.5,
    shadowMapSize: 1024,
    particleCount: 16,
    ribbonCount: 11,
    trafficCount: 20,
    shadowType: 'basic'
  },
  low: {
    pixelRatioCap: 1.0,
    shadowMapSize: 512,
    particleCount: 10,
    ribbonCount: 6,
    trafficCount: 14,
    shadowType: 'basic'
  }
};

// -----------------------------------------------------------------------------
// GAME STATES
// -----------------------------------------------------------------------------
export const STATE = Object.freeze({
  MENU: 'MENU',
  LEVEL_SELECT: 'LEVEL_SELECT',
  SHOP: 'SHOP',
  PLAY: 'PLAY',
  CHECKPOINT: 'CHECKPOINT',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  PRIZE: 'PRIZE',
  GAME_OVER: 'GAME_OVER',
  WIN: 'WIN'
});

// -----------------------------------------------------------------------------
// WIN CONDITION (legacy — per-level targetDistance used instead)
// -----------------------------------------------------------------------------
export const WIN_DISTANCE = 3000;

// -----------------------------------------------------------------------------
// PHYSICS
// -----------------------------------------------------------------------------
export const PHYSICS = {
  fixedStep: 1 / 60,
  maxSubSteps: 3,
  gravity: -CAR.gravity
};

// -----------------------------------------------------------------------------
// EFFECTS
// -----------------------------------------------------------------------------
export const EFFECTS = {
  particleBurstCount: 26,
  particleBurstLife: 0.8,
  particleBurstSpeed: 9.0,
  particleBurstSize: 0.18,
  speedRibbonCount: 18,
  speedRibbonLength: 3.2,
  speedRibbonWidth: 0.08,
  speedRibbonMinSpeed: 30,
  turboGlowPulseFreq: 4.0,
  checkpointPulseAmp: 0.35,
  coinPickupSpin: 720,
  menuBounceAmp: 0.12,
  menuBounceFreq: 1.6
};

// -----------------------------------------------------------------------------
// RENDERER
// -----------------------------------------------------------------------------
export const RENDER = {
  pixelRatioCap: 2,
  antialias: true,
  powerPreference: 'high-performance',
  toneMappingExposure: 1.05,
  fxaaEnabled: true
};

// -----------------------------------------------------------------------------
// AUDIO
// -----------------------------------------------------------------------------
export const AUDIO = {
  enabled: true,
  masterVolume: 0.6,
  engineVolume: 0.35,
  pickupVolume: 0.5,
  crashVolume: 0.6
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function pickWeighted(entries, key = 'weight') {
  let total = 0;
  for (const e of entries) total += Math.max(0, e[key] || 0);
  if (total <= 0) return entries[0];
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Math.max(0, e[key] || 0);
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

export function getLevelById(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

export function getThemeById(id) {
  return THEMES[id] || THEMES.beach;
}

export default {
  CAR,
  LANES,
  LANE_POSITIONS,
  LANE_SCALE,
  ROAD,
  WORLD,
  TRAFFIC,
  TRAFFIC_TYPES,
  SPAWN,
  PICKUPS,
  SCORE,
  CAMERA,
  UI,
  INPUT,
  CAR_COLORS,
  CAR_MATERIALS,
  SKINS,
  BOOST,
  LEVELS,
  THEMES,
  PERF_TIERS,
  STATE,
  WIN_DISTANCE,
  PHYSICS,
  EFFECTS,
  RENDER,
  AUDIO,
  clamp,
  lerp,
  randRange,
  randInt,
  pick,
  pickWeighted,
  getLevelById,
  getThemeById
};