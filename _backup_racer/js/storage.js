// js/storage.js
// Meow Racing — persistent storage wrapper (localStorage) with schema versioning,
// safe fallbacks, and helper methods for wallet / unlocked levels / skins / scores.

const STORAGE_KEY = 'meowRacing.v2';
const SCHEMA_VERSION = 2;

const DEFAULT_STATE = {
  version: SCHEMA_VERSION,
  unlockedLevel: 1,
  selectedSkinId: 'banana',
  skinsOwned: ['banana'],
  wallet: { coins: 0, crowns: 0 },
  highScore: 0,
  levelsCompleted: []
};

function cloneDefault() {
  return {
    version: DEFAULT_STATE.version,
    unlockedLevel: DEFAULT_STATE.unlockedLevel,
    selectedSkinId: DEFAULT_STATE.selectedSkinId,
    skinsOwned: DEFAULT_STATE.skinsOwned.slice(),
    wallet: { coins: DEFAULT_STATE.wallet.coins, crowns: DEFAULT_STATE.wallet.crowns },
    highScore: DEFAULT_STATE.highScore,
    levelsCompleted: DEFAULT_STATE.levelsCompleted.slice()
  };
}

// In-memory fallback if localStorage is unavailable (private mode, SSR, etc.)
let memoryBackup = null;
let storageAvailable = true;

function testStorage() {
  try {
    const t = '__meow_test__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return true;
  } catch (_) {
    return false;
  }
}

try {
  storageAvailable = typeof window !== 'undefined' && !!window.localStorage && testStorage();
} catch (_) {
  storageAvailable = false;
}

function sanitize(state) {
  const s = cloneDefault();
  if (!state || typeof state !== 'object') return s;

  if (typeof state.unlockedLevel === 'number' && state.unlockedLevel >= 1 && state.unlockedLevel <= 999) {
    s.unlockedLevel = Math.floor(state.unlockedLevel);
  }
  if (typeof state.selectedSkinId === 'string') {
    s.selectedSkinId = state.selectedSkinId;
  }
  if (Array.isArray(state.skinsOwned)) {
    s.skinsOwned = Array.from(new Set(state.skinsOwned.filter((x) => typeof x === 'string')));
    if (!s.skinsOwned.includes('banana')) s.skinsOwned.push('banana');
    if (!s.skinsOwned.includes(s.selectedSkinId)) s.selectedSkinId = 'banana';
  }
  if (state.wallet && typeof state.wallet === 'object') {
    s.wallet.coins = Math.max(0, Math.floor(Number(state.wallet.coins) || 0));
    s.wallet.crowns = Math.max(0, Math.floor(Number(state.wallet.crowns) || 0));
  }
  if (typeof state.highScore === 'number' && state.highScore > 0) {
    s.highScore = Math.floor(state.highScore);
  }
  if (Array.isArray(state.levelsCompleted)) {
    s.levelsCompleted = Array.from(
      new Set(state.levelsCompleted.filter((n) => typeof n === 'number' && n >= 1 && n <= 999).map((n) => Math.floor(n)))
    ).sort((a, b) => a - b);
  }
  s.version = SCHEMA_VERSION;
  return s;
}

function read() {
  if (!storageAvailable) {
    if (!memoryBackup) memoryBackup = cloneDefault();
    return memoryBackup;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SCHEMA_VERSION) {
      // Migrate or reset.
      return sanitize(parsed);
    }
    return sanitize(parsed);
  } catch (_) {
    return cloneDefault();
  }
}

function write(state) {
  const safe = sanitize(state);
  if (!storageAvailable) {
    memoryBackup = safe;
    return safe;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch (_) {
    storageAvailable = false;
    memoryBackup = safe;
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const Storage = {
  isAvailable() {
    return storageAvailable;
  },

  // Whole-state
  get() {
    return read();
  },
  set(state) {
    return write(state);
  },
  reset() {
    return write(cloneDefault());
  },
  clear() {
    if (!storageAvailable) {
      memoryBackup = cloneDefault();
      return;
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      memoryBackup = cloneDefault();
    }
  },

  // Wallet
  getWallet() {
    return read().wallet;
  },
  addCoins(n) {
    const st = read();
    st.wallet.coins = Math.max(0, st.wallet.coins + Math.floor(n));
    return write(st).wallet;
  },
  addCrowns(n) {
    const st = read();
    st.wallet.crowns = Math.max(0, st.wallet.crowns + Math.floor(n));
    return write(st).wallet;
  },
  spendCoins(n) {
    const st = read();
    const cost = Math.floor(n);
    if (cost <= 0 || st.wallet.coins < cost) return false;
    st.wallet.coins -= cost;
    write(st);
    return true;
  },
  spendCrowns(n) {
    const st = read();
    const cost = Math.floor(n);
    if (cost <= 0 || st.wallet.crowns < cost) return false;
    st.wallet.crowns -= cost;
    write(st);
    return true;
  },

  // Levels
  getUnlockedLevel() {
    return read().unlockedLevel;
  },
  isLevelUnlocked(levelId) {
    const st = read();
    return levelId >= 1 && levelId <= st.unlockedLevel;
  },
  unlockLevel(levelId) {
    const st = read();
    const n = Math.floor(levelId);
    if (n > st.unlockedLevel) {
      st.unlockedLevel = n;
      write(st);
    }
    return st.unlockedLevel;
  },
  markLevelCompleted(levelId) {
    const st = read();
    const n = Math.floor(levelId);
    if (!st.levelsCompleted.includes(n)) st.levelsCompleted.push(n);
    st.levelsCompleted.sort((a, b) => a - b);
    if (n + 1 > st.unlockedLevel) st.unlockedLevel = n + 1;
    write(st);
  },
  isLevelCompleted(levelId) {
    return read().levelsCompleted.includes(levelId);
  },
  getLevelsCompleted() {
    return read().levelsCompleted.slice();
  },

  // Skins
  getSelectedSkinId() {
    return read().selectedSkinId;
  },
  setSelectedSkinId(skinId) {
    const st = read();
    if (typeof skinId !== 'string') return st.selectedSkinId;
    if (!st.skinsOwned.includes(skinId)) return st.selectedSkinId;
    st.selectedSkinId = skinId;
    write(st);
    return st.selectedSkinId;
  },
  getOwnedSkins() {
    return read().skinsOwned.slice();
  },
  ownsSkin(skinId) {
    return read().skinsOwned.includes(skinId);
  },
  ownSkin(skinId) {
    const st = read();
    if (typeof skinId !== 'string') return false;
    if (st.skinsOwned.includes(skinId)) return false;
    st.skinsOwned.push(skinId);
    write(st);
    return true;
  },

  // High score
  getHighScore() {
    return read().highScore;
  },
  submitHighScore(score) {
    const st = read();
    const s = Math.floor(score);
    if (s > st.highScore) {
      st.highScore = s;
      write(st);
      return true;
    }
    return false;
  }
};

export default Storage;