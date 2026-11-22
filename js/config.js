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
  maxSpeed: 62.5,          // top forward speed (game units / s)
  gravity: 9.8,            // world gravity
  speedGiro: 32,           // steering rate (deg / s) at normal speed
  speedGiroStunt: 35,      // steering rate while airborne / stunt
  drift: 0.3,              // lateral drift factor

  // Derived / tuning that matches the feel of the original
  accel: 28.0,             // forward acceleration (units / s^2)
  brakeDecel: 55.0,        // braking deceleration
  coastDecel: 12.0,        // natural slowdown when no input
  reverseMax: 14.0,        // reverse top speed
  airControl: 0.6,         // multiplier on steering while airborne

  // Turbo
  turboMax: 100,           // turbo bar capacity
  turboDrain: 45,          // per second while boosting
  turboRegenPass: 12,      // per passed traffic car
  turboRegenCoin: 6,       // per coin
  turboRegenCrown: 20,     // per crown
  turboRegenIdle: 3,       // passive regen / s
  turboSpeedMult: 1.45,    // speed multiplier while boosting
  turboMinToActivate: 20,  // need at least this much turbo to fire

  // Lives / timer
  lives: 3,
  tiempoMax: 60,           // starting countdown (s)
  checkpointTimeBonus: 8,  // +time per checkpoint
  timeoutFailGrace: 0.5,   // seconds of leeway on time-out

  // Collision
  collisionSpeedPenalty: 0.55,   // multiplier on speed after hit
  collisionInvulnTime: 1.2,      // s of i-frames after hit
  collisionShakeAmp: 0.9,
  collisionShakeDur: 0.5,

  // Drift / skid
  skidThreshold: 8.0,      // lateral speed to start skid FX
  skidFade: 0.6,           // s for skid ribbon to fade

  // Physical footprint for collisions
  collisionRadius: 1.1,
  bodyHalfWidth: 1.0,
  bodyHalfLength: 2.2,
  bodyHalfHeight: 0.55
};

// -----------------------------------------------------------------------------
// LANES (verified: carrilPosX = -0.368, -0.184, 0, +0.184, +0.368)
// Scaled up to metres. LANE_SCALE is the single conversion factor.
// -----------------------------------------------------------------------------
export const LANE_SCALE = 20;
export const LANES = {
  raw: [-0.368, -0.184, 0, 0.184, 0.368],
  count: 5,
  width: 0.184 * LANE_SCALE, // ≈ 3.68 m per lane
  get positions() {
    return this.raw.map((v) => v * LANE_SCALE);
  }
};

// Convenience: per-lane world X positions in metres
export const LANE_POSITIONS = LANES.positions;

// -----------------------------------------------------------------------------
// ROAD / WORLD
// -----------------------------------------------------------------------------
export const ROAD = {
  width: LANES.width * LANES.count, // ≈ 18.4 m
  segmentLength: 60,                // length of each recycled road chunk
  segmentsAhead: 6,                 // chunks ahead of camera
  segmentsBehind: 1,                // chunks behind camera
  laneMarkLength: 4.0,
  laneMarkGap: 4.0,
  guardrailHeight: 0.7,
  guardrailThickness: 0.35,
  shoulderWidth: 3.0
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
// TRAFFIC (TraficoSystem — AI cars move along lanes)
// -----------------------------------------------------------------------------
export const TRAFFIC = {
  count: 22,                 // pooled traffic cars alive at once
  minSpeed: 18,
  maxSpeed: 36,
  spawnAheadDistance: 240,   // spawn ahead of the player
  recycleBehindDistance: 45, // if behind camera by this much, recycle ahead
  laneChance: [0.18, 0.22, 0.2, 0.22, 0.18], // weights per lane
  lateralSnapSpeed: 6,       // how fast AI slides to target lane
  colors: [0xd8433a, 0x2f7fd8, 0x2fb56a, 0xf0a03a], // 4 AI colors
  scale: 1.0
};

// -----------------------------------------------------------------------------
// SPAWNING — pickups & checkpoints
// -----------------------------------------------------------------------------
export const SPAWN = {
  checkpointEveryDistance: 550,  // distance between checkpoints (m)
  checkpointFirstAt: 350,
  coinEveryDistance: 40,
  coinLaneJitter: 0.55,
  crownEveryCoins: 12,           // every Nth coin becomes a crown
  turboPickupEveryDistance: 180
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
  valueCoin: 25,
  valueCrown: 150,
  valueTurbo: 0,
  magnetRadius: 0
};

export const SCORE = {
  perMeter: 0.1,        // passive distance score
  passTraffic: 50,      // points for passing a traffic car
  checkpoint: 300,      // per checkpoint
  coin: 25,
  crown: 150,
  comboWindow: 2.5,     // s window to keep combo alive
  comboMax: 8
};

// -----------------------------------------------------------------------------
// CAMERA (CameraPath / TweenCamara / Shake — verified behaviours)
// -----------------------------------------------------------------------------
export const CAMERA = {
  fov: 62,
  fovTurboBoost: 82,
  near: 0.1,
  far: 500,
  // Chase position relative to car (behind & above)
  offsetBack: 10.5,
  offsetUp: 4.2,
  lookAhead: 8.0,
  lookUp: 1.4,
  // Lag / smoothing
  followLerp: 6.0,       // higher = tighter
  rotationLerp: 4.0,
  // Turbo
  fovLerp: 4.0,
  // Checkpoint cinematic tween
  checkpointTweenDur: 0.9,
  checkpointTweenBack: 14.0,
  checkpointTweenUp: 6.5,
  // Shake
  shakeDecay: 4.0,
  shakeMax: 1.4,
  // Menu orbit
  menuOrbitRadius: 12.0,
  menuOrbitHeight: 5.5,
  menuOrbitSpeed: 0.28,   // rad / s
  menuOrbitLookHeight: 0.6
};

// -----------------------------------------------------------------------------
// MENU / UI (Meow Racing text lives here so UI matches everywhere)
// -----------------------------------------------------------------------------
export const UI = {
  title: 'MEOW RACING',
  subtitle: 'Full Speed, Nine Lives',
  goText: 'GO',
  gameOverText: 'GAME OVER',
  winText: 'YOU WIN!',
  restartText: 'Press R to restart',
  // HUD timing
  counterTweenDur: 450,   // ms
  popupDur: 900,          // ms
  overlayFadeDur: 400,    // ms
  scorePopupLifetime: 900 // ms
};

// -----------------------------------------------------------------------------
// INPUT
// -----------------------------------------------------------------------------
export const INPUT = {
  steerLeft: ['ArrowLeft', 'KeyA'],
  steerRight: ['ArrowRight', 'KeyD'],
  gas: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  turbo: ['Space'],
  start: ['Enter'],
  restart: ['KeyR'],
  cycleColor: ['KeyC']
};

// -----------------------------------------------------------------------------
// CAR COLORS (carroseria body skins — 4 colors)
// -----------------------------------------------------------------------------
export const CAR_COLORS = [
  { name: 'Banana', body: 0xffd21a, accent: 0x1a1a1a },   // yellow (default)
  { name: 'Cherry', body: 0xe23b2e, accent: 0x141414 },
  { name: 'Ocean',  body: 0x2f7fd8, accent: 0x101820 },
  { name: 'Mint',   body: 0x2fbf78, accent: 0x0f2016 }
];

// Wheel / shared car material colors
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
// GAME STATES
// -----------------------------------------------------------------------------
export const STATE = Object.freeze({
  MENU: 'MENU',
  PLAY: 'PLAY',
  CHECKPOINT: 'CHECKPOINT',
  GAME_OVER: 'GAME_OVER',
  WIN: 'WIN'
});

// -----------------------------------------------------------------------------
// WIN CONDITION
// -----------------------------------------------------------------------------
export const WIN_DISTANCE = 3000; // metres — finish line milestone

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
  coinPickupSpin: 720,   // deg
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
// AUDIO (CarSoundManager — placeholders; no external files required)
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

export default {
  CAR,
  LANES,
  LANE_POSITIONS,
  LANE_SCALE,
  ROAD,
  WORLD,
  TRAFFIC,
  SPAWN,
  PICKUPS,
  SCORE,
  CAMERA,
  UI,
  INPUT,
  CAR_COLORS,
  CAR_MATERIALS,
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
  pick
};