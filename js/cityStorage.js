// js/cityStorage.js
// Meow Open City - persistent player profile.
// Versioned schema, safe fallbacks for private mode, no crashes on bad data.

const STORAGE_KEY = 'meowOpenCity.v1';
const SCHEMA_VERSION = 1;

const DEFAULT_PROFILE = {
  version: SCHEMA_VERSION,
  coins: 0,
  ownedVehicles: ['sedan'],
  currentVehicle: 'sedan',
  layout: 'compact',
  speedLevel: 1,
  vehicleColors: {},
  missionsCompleted: [],
  activeMission: null,
  xp: 0,
  level: 1,
  totalDistance: 0,
  faresEarned: 0,
  faresCompleted: 0,
  deliveriesCompleted: 0,
  bestPizzaRun: 0,
  racesWon: 0,
  bestTimeSec: 0,
  lastPlayed: 0
};

let memoryFallback = null;
let available = true;

function testStorage() {
  try {
    const key = '__meow_city_test__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}

try {
  available = typeof window !== 'undefined' && !!window.localStorage && testStorage();
} catch (_) {
  available = false;
}

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function sanitize(raw) {
  const p = { ...DEFAULT_PROFILE };
  if (!raw || typeof raw !== 'object') return p;

  p.coins = Math.floor(num(raw.coins));
  p.xp = Math.floor(num(raw.xp));
  p.level = Math.max(1, Math.floor(num(raw.level, 1)));
  p.totalDistance = num(raw.totalDistance);
  p.faresEarned = Math.floor(num(raw.faresEarned));
  p.faresCompleted = Math.floor(num(raw.faresCompleted));
  p.deliveriesCompleted = Math.floor(num(raw.deliveriesCompleted));
  p.bestPizzaRun = Math.floor(num(raw.bestPizzaRun));
  p.racesWon = Math.floor(num(raw.racesWon));
  p.bestTimeSec = num(raw.bestTimeSec);
  p.lastPlayed = num(raw.lastPlayed);

  if (Array.isArray(raw.ownedVehicles)) {
    const list = raw.ownedVehicles.filter((v) => typeof v === 'string' && v.length > 0);
    if (!list.includes('sedan')) list.push('sedan');
    p.ownedVehicles = Array.from(new Set(list));
  }
  if (typeof raw.currentVehicle === 'string' && p.ownedVehicles.includes(raw.currentVehicle)) {
    p.currentVehicle = raw.currentVehicle;
  }
  if (['compact', 'large', 'left', 'right'].includes(raw.layout)) p.layout = raw.layout;
  p.speedLevel = Math.min(2, Math.max(0, Math.floor(num(raw.speedLevel, 1))));
  if (raw.vehicleColors && typeof raw.vehicleColors === 'object' && !Array.isArray(raw.vehicleColors)) {
    for (const [key, value] of Object.entries(raw.vehicleColors)) {
      if (typeof key === 'string' && Number.isFinite(value) && value >= 0 && value <= 0xffffff) {
        p.vehicleColors[key] = Math.floor(value);
      }
    }
  }
  p.missionsCompleted = Array.isArray(raw && raw.missionsCompleted)
    ? raw.missionsCompleted.filter((id) => typeof id === 'string') : [];
  p.activeMission = raw && typeof raw.activeMission === 'string' ? raw.activeMission : null;

  p.version = SCHEMA_VERSION;
  return p;
}

function read() {
  if (!available) {
    if (!memoryFallback) memoryFallback = { ...DEFAULT_PROFILE };
    return { ...memoryFallback };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return sanitize(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_PROFILE };
  }
}

function write(profile) {
  const safe = sanitize(profile);
  if (available) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (_) {
      available = false;
      memoryFallback = safe;
    }
  } else {
    memoryFallback = safe;
  }
  return { ...safe };
}

export const CityStorage = {
  isAvailable() {
    return available;
  },

  get() {
    return read();
  },

  save(patch = {}) {
    const next = { ...read(), ...patch };
    next.lastPlayed = Date.now();
    return write(next);
  },

  reset() {
    memoryFallback = { ...DEFAULT_PROFILE };
    if (available) {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
    return { ...DEFAULT_PROFILE };
  },

  addCoins(amount) {
    const p = read();
    p.coins = Math.max(0, p.coins + Math.floor(num(amount)));
    return write(p);
  },

  addXp(amount) {
    const p = read();
    p.xp = Math.floor(p.xp + Math.max(0, num(amount)));
    p.level = Math.max(1, Math.floor(Math.sqrt(p.xp / 120)) + 1);
    return write(p);
  },

  unlockVehicle(type) {
    const p = read();
    if (typeof type === 'string' && !p.ownedVehicles.includes(type)) {
      p.ownedVehicles.push(type);
    }
    if (p.ownedVehicles.includes(type)) p.currentVehicle = type;
    return write(p);
  },

  setLayout(layout) {
    return this.save({ layout });
  },

  setVehicleColor(type, hex) {
    const p = read();
    if (typeof type === 'string' && Number.isFinite(hex)) {
      p.vehicleColors[type] = Math.floor(hex);
    }
    return write(p);
  },

  addDistance(meters) {
    const p = read();
    p.totalDistance += Math.max(0, num(meters));
    const gained = Math.floor(p.totalDistance / 1000) - Math.floor((p.totalDistance - Math.max(0, num(meters))) / 1000);
    if (gained > 0) p.xp += gained * 10;
    p.level = Math.max(1, Math.floor(Math.sqrt(p.xp / 120)) + 1);
    return write(p);
  },

  addFare(fare) {
    const p = read();
    p.coins = Math.max(0, p.coins + Math.floor(num(fare)));
    p.faresEarned = Math.floor(p.faresEarned + Math.max(0, num(fare)));
    p.faresCompleted += 1;
    p.xp = Math.floor(p.xp + Math.max(2, Math.floor(num(fare) / 10)));
    p.level = Math.max(1, Math.floor(Math.sqrt(p.xp / 120)) + 1);
    return write(p);
  }
};
