export const COLORS = {
  skyDayTop: 0x38bdf8,
  skyDayHorizon: 0xbae6fd,
  skyNightTop: 0x070b1e,
  skyNightHorizon: 0x1e1b4b,
  fogDay: 0x93c5fd,
  fogNight: 0x0f172a,
  sunDay: 0xfffbeb,
  sunNight: 0x93c5fd,
  asphalt: 0x1e222d,
  sidewalk: 0x94a3b8,
  crosswalk: 0xf8fafc,
  laneLine: 0xfacc15,
  roadEdge: 0xe2e8f0,
  lampPole: 0x334155,
  lampGlow: 0xfef08a,
  trafficRed: 0xef4444,
  trafficYellow: 0xf59e0b,
  trafficGreen: 0x22c55e,
  carBodyDefault: 0xff9f1c,
  carAccentDefault: 0xfff8eb,
  smoke: 0xe2e8f0,
  spark: 0xffb703,
  coin: 0xffd166
};

export const WORLD_CFG = {
  blocksPerSide: 14,
  blockSize: 44,
  roadWidth: 14,
  laneOffset: 3.4,
  sidewalkWidth: 2.6,
  sidewalkHeight: 0.22,
  buildingMinHeight: 10,
  buildingMaxHeight: 42,
  skylineCount: 48,
  skylineRadiusMin: 185,
  skylineRadiusMax: 330,
  fogDensity: 0.0032,
  dayCycleDurationSec: 180,
  lightCycleDurationSec: 16,
  redLightRatio: 0.45,
  yellowLightRatio: 0.15,
  get gridSpan() {
    return this.blocksPerSide * (this.blockSize + this.roadWidth) + this.roadWidth;
  },
  get halfSpan() {
    return this.gridSpan * 0.5;
  }
};

export const CAR_CFG = {
  width: 2.0,
  height: 1.15,
  length: 4.2,
  wheelRadius: 0.42,
  wheelWidth: 0.34,
  accel: 18,
  reverseAccel: 12,
  brakeDecel: 30,
  coastDecel: 9,
  maxSpeed: 30,
  reverseMaxSpeed: 12,
  driftMaxSpeed: 27,
  steerSpeed: 2.65,
  driftSteerMult: 1.32,
  gripNormal: 10.5,
  gripDrift: 3.2,
  rollMax: 0.18,
  pitchMax: 0.06,
  collisionRadius: 2.15,
  bounceFactor: 0.42,
  cameraOffset: { x: 0, y: 5.4, z: 10.2 },
  cameraLookAhead: { x: 0, y: 1.3, z: -12 },
  cameraLerp: 8.5,
  skins: [
    { id: 'meow_orange', name: 'Tabby Gold', body: 0xff9f1c, accent: 0xfff8eb, trim: 0x1e293b },
    { id: 'cyber_cyan', name: 'Neon Whisker', body: 0x06b6d4, accent: 0xf472b6, trim: 0x0f172a },
    { id: 'sakura_rose', name: 'Sakura Paws', body: 0xf43f5e, accent: 0xfef08a, trim: 0x1e1b4b },
    { id: 'midnight_prowler', name: 'Midnight Cat', body: 0x1e293b, accent: 0x38bdf8, trim: 0x94a3b8 }
  ]
};

export const SPEED_LEVELS = [
  { label: 'ECO', maxSpeed: 18, accel: 12, driftMaxSpeed: 16 },
  { label: 'NORMAL', maxSpeed: 30, accel: 18, driftMaxSpeed: 27 },
  { label: 'SPORT', maxSpeed: 42, accel: 26, driftMaxSpeed: 38 }
];

export const TRAFFIC_CFG = {
  poolSize: 40,
  spawnMinDist: 38,
  spawnMaxDist: 135,
  recycleDist: 165,
  minVehicleGap: 11,
  stopLineBuffer: 7.5,
  turnProbability: 0.35,
  types: {
    sedan: {
      width: 1.95,
      height: 1.25,
      length: 4.1,
      speedMin: 13,
      speedMax: 21,
      colors: [0x3b82f6, 0x10b981, 0xe2e8f0, 0xf97316, 0x6366f1]
    },
    sports: {
      width: 2.0,
      height: 1.0,
      length: 4.3,
      speedMin: 21,
      speedMax: 30,
      colors: [0xef4444, 0xfacc15, 0x00f5d4, 0xec4899]
    },
    van: {
      width: 2.15,
      height: 1.75,
      length: 4.7,
      speedMin: 11,
      speedMax: 18,
      colors: [0xf8fafc, 0x38bdf8, 0xfbbf24, 0x94a3b8]
    },
    truck: {
      width: 2.35,
      height: 2.45,
      length: 6.4,
      speedMin: 9,
      speedMax: 15,
      colors: [0xdc2626, 0xd97706, 0x475569, 0x0284c7]
    },
    bus: {
      width: 2.4,
      height: 2.55,
      length: 7.2,
      speedMin: 10,
      speedMax: 16,
      colors: [0xf59e0b, 0x16a34a, 0x2563eb]
    }
  }
};

export const PED_CFG = {
  poolSize: 56,
  spawnMinDist: 18,
  spawnMaxDist: 95,
  recycleDist: 120,
  walkSpeedMin: 1.6,
  walkSpeedMax: 2.9,
  avoidRadius: 5.2,
  avoidStepDist: 1.6,
  collisionRadius: 0.75,
  shirtColors: [0x38bdf8, 0xf472b6, 0xfacc15, 0x4ade80, 0xfb923c, 0xc084fc, 0xf8fafc],
  pantsColors: [0x1e293b, 0x334155, 0x1d4ed8, 0x3f3f46]
};

export const INPUT = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['Space']
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}
/* === PHASE 2 ADDITIONS (Gemini) === */
export const VEHICLE_TYPES = {
  sedan: {
    label: 'Sedan',
    w: 1.95,
    h: 1.25,
    l: 4.1,
    speedMin: 13,
    speedMax: 21,
    spawnWeight: 26,
    colors: [0x3b82f6, 0x10b981, 0xe2e8f0, 0xf97316, 0x6366f1]
  },
  sports: {
    label: 'Sports',
    w: 2.0,
    h: 1.0,
    l: 4.3,
    speedMin: 21,
    speedMax: 30,
    spawnWeight: 16,
    colors: [0xef4444, 0xfacc15, 0x00f5d4, 0xec4899]
  },
  van: {
    label: 'Van',
    w: 2.15,
    h: 1.75,
    l: 4.7,
    speedMin: 11,
    speedMax: 18,
    spawnWeight: 14,
    colors: [0xf8fafc, 0x38bdf8, 0xfbbf24, 0x94a3b8]
  },
  truck: {
    label: 'Truck',
    w: 2.35,
    h: 2.45,
    l: 6.4,
    speedMin: 9,
    speedMax: 15,
    spawnWeight: 10,
    colors: [0xdc2626, 0xd97706, 0x475569, 0x0284c7]
  },
  bus: {
    label: 'Bus',
    w: 2.45,
    h: 2.65,
    l: 7.4,
    speedMin: 10,
    speedMax: 16,
    spawnWeight: 10,
    colors: [0xf59e0b, 0x16a34a, 0x2563eb]
  },
  bike: {
    label: 'Bike',
    w: 0.95,
    h: 1.35,
    l: 2.2,
    speedMin: 18,
    speedMax: 29,
    spawnWeight: 12,
    colors: [0xff2a85, 0x00e5ff, 0xfacc15, 0xa855f7]
  },
  oil_tanker: {
    label: 'Oil Tanker',
    w: 2.45,
    h: 2.6,
    l: 7.2,
    speedMin: 9,
    speedMax: 14,
    spawnWeight: 8,
    colors: [0xd97706, 0xea580c, 0xf59e0b]
  },
  taxi: {
    label: 'Taxi',
    w: 1.95,
    h: 1.3,
    l: 4.15,
    speedMin: 15,
    speedMax: 24,
    spawnWeight: 14,
    colors: [0xfacc15, 0xfbbf24]
  },
  police: {
    label: 'Police',
    w: 2.0,
    h: 1.35,
    l: 4.3,
    speedMin: 22,
    speedMax: 32,
    spawnWeight: 0,
    colors: [0x0f172a, 0x1e293b]
  },
  coupe: { label: 'Coupe', w: 1.96, h: 1.12, l: 4.15, speedMin: 20, speedMax: 29, spawnWeight: 14, colors: [0xf43f5e, 0x38bdf8, 0xfacc15, 0xa855f7] },
  muscle: { label: 'Muscle', w: 2.08, h: 1.18, l: 4.55, speedMin: 22, speedMax: 32, spawnWeight: 12, colors: [0xf97316, 0x1e293b, 0xdc2626, 0xfbbf24] },
  supercar: { label: 'Supercar', w: 2.12, h: 0.94, l: 4.45, speedMin: 27, speedMax: 38, spawnWeight: 8, colors: [0x00f5d4, 0xff2a85, 0xfef08a, 0x2563eb] }
};

export const SURVIVAL = {
  maxHealth: 200,
  crashDamage: 8,
  pedPenalty: 5,
  healthRegenPerSec: 1.5,
  healthRegenDelay: 6,
  wantedDecay: 0.12,
  wantedMax: 5,
  missionReward: 150,
  oilDistrictSize: 44
};

export const MISSION = {
  targetDistance: 240,
  reward: 150
};
/* === PHASE 3 ADDITIONS (Gemini) === */
// Note: In WORLD_CFG, change `blocksPerSide: 6` to `blocksPerSide: 9`.

export const TERRAIN = {
  hillCount: 14,
  mountainRingMin: 230,
  mountainRingMax: 360,
  bridgeCount: 6,
  bridgeHeight: 9,
  bridgeWidth: 14,
  rampLength: 36
};

export const RACE = {
  checkpoints: 3,
  timeLimit: 90,
  reward: 400,
  radius: 12
};

export const PED_STYLES = ['casual', 'business', 'runner', 'skater', 'tourist'];

// Add inside VEHICLE_TYPES:
// coupe: { label: 'Coupe', w: 1.96, h: 1.12, l: 4.15, speedMin: 20, speedMax: 29, spawnWeight: 14, colors: [0xf43f5e, 0x38bdf8, 0xfacc15, 0xa855f7] },
// muscle: { label: 'Muscle', w: 2.08, h: 1.18, l: 4.55, speedMin: 22, speedMax: 32, spawnWeight: 12, colors: [0xf97316, 0x1e293b, 0xdc2626, 0xfbbf24] },
// supercar: { label: 'Supercar', w: 2.12, h: 0.94, l: 4.45, speedMin: 27, speedMax: 38, spawnWeight: 8, colors: [0x00f5d4, 0xff2a85, 0xfef08a, 0x2563eb] },
/* === PHASE 4 ADDITIONS (Gemini) === */
export const FUEL = {
  max: 100,
  drainPerSec: 0.35,
  refillRate: 55,
  stationRadius: 11,
  startAmount: 100
};

export const DISTRICTS = {
  downtown: 'downtown',
  suburbs: 'suburbs',
  beach: 'beach',
  desert: 'desert',
  airport: 'airport',
  industrial: 'industrial'
};
/* === PHASE 5 ADDITIONS (Gemini) === */
export const TRAIN = {
  carCount: 4,
  carLength: 9,
  speed: 18,
  stationRadius: 16,
  fare: 60
};

export const TAXI = {
  fareBase: 35,
  farePerMeter: 0.5,
  pickupRadius: 8,
  dropoffRadius: 10,
  pickupMarkerRadius: 8,
  fareSpawnMin: 30,
  fareSpawnMax: 70
};

export const SHOP = {
  prices: {
    bike: 400,
    coupe: 900,
    muscle: 1400,
    supercar: 2200,
    bus: 1800
  },
  stock: ['bike', 'coupe', 'muscle', 'supercar', 'bus']
};