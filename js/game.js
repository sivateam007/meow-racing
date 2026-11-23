// js/game.js
// Meow Racing — main loop, state machine, level manager, camera, HUD, shop.
// Boots Three.js, ties together Car / World / Effects / Shop / Storage and
// drives the game through MENU → LEVEL_SELECT → PLAY → LEVEL_COMPLETE →
// PRIZE → (next level | WIN), plus GAME_OVER and SHOP.

import * as THREE from 'three';
import anime from 'animejs';
import {
  CAR,
  CAMERA,
  STATE,
  UI,
  INPUT,
  SCORE,
  BOOST,
  LEVELS,
  PERF_TIERS,
  SKINS,
  ANALOG,
  getLevelById,
  clamp,
  lerp
} from './config.js';
import { Car } from './car.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Shop } from './shop.js';
import { Storage } from './storage.js';

function el(id) {
  return document.getElementById(id);
}

function detectTouch() {
  if (typeof window === 'undefined') return false;
  if ('ontouchstart' in window) return true;
  if (navigator && navigator.maxTouchPoints > 0) return true;
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  return false;
}

export class Game {
  constructor() {
    this.canvas = el('game-canvas');
    if (!this.canvas) throw new Error('Missing #game-canvas');

    this.isTouch = detectTouch();
    this.perfTier = this.isTouch ? PERF_TIERS.mobile : PERF_TIERS.desktop;

    // ----- Renderer -----
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isTouch,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.perfTier.pixelRatioCap)
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type =
      this.perfTier.shadowType === 'basic' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // ----- Scene -----
    this.scene = new THREE.Scene();

    // ----- Camera -----
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      CAMERA.near,
      CAMERA.far
    );
    this.camera.position.set(0, 6, 12);
    this.camera.lookAt(0, 0, 0);

    // ----- Effects -----
    this.effects = new Effects(this.scene, this.camera, this.renderer);

    // ----- World + Car -----
    this.currentLevelId = 1;
    this.level = getLevelById(this.currentLevelId);
    this.world = new World(this.scene, this.level.theme);
    this.car = new Car(this.scene, Storage.getSelectedSkinId());
    this.car.reset(0, 0, 0);

    // ----- Run state -----
    this.state = STATE.MENU;
    this.stateTime = 0;
    this.lives = CAR.lives;
    this.timer = this.level.timeLimit;
    this.score = 0;
    this.coins = 0;
    this.crowns = 0;
    this.distance = 0;
    this.combo = 0;
    this.lastPassTime = -999;
    this.invulnTime = 0;
    this.hitFlashTime = 0;
    this.timeWasLow = false;
    this.prevPlayerZ = 0;
    this.startZ = 0;
    this.prize = null;

    this._display = { coins: 0, crowns: 0, score: 0 };

    // Camera smoothing
    this.camPos = new THREE.Vector3(0, CAMERA.offsetUp, CAMERA.offsetBack);
    this.camLookAt = new THREE.Vector3(0, CAMERA.lookUp, 0);
    this.camFov = CAMERA.fov;
    this.cpTween = null;
    this.menuOrbitAngle = 0;

    // Boost sparkle timing
    this._boostSparkleTimer = 0;
    this._boostPulseActive = false;

    // Input
    this.keys = {};
    this.touch = { left: false, right: false, gas: false, brake: false, turbo: false };

    document.body.classList.toggle('is-touch', this.isTouch);

    // ----- HUD refs -----
    this.hud = {
      root: el('hud'),
      coins: el('hud-coins'),
      crowns: el('hud-crowns'),
      score: el('hud-score'),
      speed: el('hud-speed'),
      time: el('hud-time'),
      lives: el('hud-lives'),
      turbo: el('hud-turbo-fill'),
      distance: el('hud-distance'),
      levelName: el('hud-level-name'),
      levelNum: el('hud-level-num'),
      timePill: el('hud-time-pill')
    };

    // ----- Overlays -----
    this.overlays = {
      menu: el('menu-overlay'),
      levelSelect: el('level-select-overlay'),
      levelSelectGrid: el('level-select-grid'),
      levelSelectClose: el('level-select-close'),
      shop: el('shop-overlay'),
      shopContainer: el('shop-container'),
      gameOver: el('game-over-overlay'),
      finalScore: el('final-score'),
      restartButton: el('restart-button'),
      menuButton: el('menu-button'),
      win: el('win-overlay'),
      winScore: el('win-score'),
      winMenuButton: el('win-menu-button'),
      prize: el('prize-overlay'),
      prizeCoins: el('prize-coins'),
      prizeCrowns: el('prize-crowns'),
      prizeDistance: el('prize-distance'),
      prizeTime: el('prize-time'),
      prizeTotal: el('prize-total'),
      prizeClaim: el('prize-claim-btn'),
      goBtn: el('go-button'),
      shopBtn: el('shop-button'),
      helpBtn: el('help-button'),
      settingsBtn: el('settings-button'),
      helpPanel: el('help-panel'),
      settingsPanel: el('settings-panel'),
      pause: el('pause-overlay'),
      menuCoins: el('menu-wallet-coins'),
      menuCrowns: el('menu-wallet-crowns'),
      levelCompleteBanner: el('level-complete-banner')
    };

    // ----- Shop -----
    this.shop = new Shop({
      container: this.overlays.shopContainer,
      onSelectSkin: (id) => {
        this.car.setSkin(id);
        this._refreshWallet();
      },
      onClose: () => this._closeShop(),
      onWalletChange: () => this._refreshWallet()
    });

    // Bind input after overlays and shop refs exist
    this._bindInput();

    // ----- Initial UI -----
    this.world.showMenuPlatform(true);
    this.effects.overlayFade(this.overlays.menu, true);
    this.effects.overlayFade(this.overlays.levelSelect, false);
    this.effects.overlayFade(this.overlays.gameOver, false);
    this.effects.overlayFade(this.overlays.prize, false);
    this.effects.overlayFade(this.overlays.win, false);
    this.effects.overlayFade(this.overlays.shop, false);
    this._applyMenuCamera();
    this.effects.startMenuBounce(this.car.group);
    this._refreshWallet();
    this._refreshLevelHud();

    // Resize
    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    // ----- Loop -----
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  // ===========================================================================
  // INPUT
  // ===========================================================================
  _bindInput() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      const preventCodes = [
        ...INPUT.gas, ...INPUT.brake, ...INPUT.steerLeft, ...INPUT.steerRight,
        ...INPUT.turbo, ...(INPUT.boost || []), ...(INPUT.drift || []),
        ...(INPUT.pause || []), ...INPUT.start, ...INPUT.restart
      ];
      if (preventCodes.includes(code)) e.preventDefault();
      const wasDown = !!this.keys[code];
      this.keys[code] = true;

      // Pause toggle (only on the initial press)
      if (!wasDown && (INPUT.pause || []).includes(code)) this._togglePause();

      if (!wasDown && INPUT.start.includes(code)) this._onStartInput();
      if (!wasDown && INPUT.restart.includes(code)) this._onRestartInput();
      if (!wasDown && (INPUT.cycleColor || []).includes(code) && this.car && this.car.cycleColor) {
        this.car.cycleColor();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
      this.touch = { left: false, right: false, gas: false, brake: false, turbo: false, drift: false };
      this.analogSteer = 0;
      document.querySelectorAll('.touch-btn.active').forEach((b) => b.classList.remove('active'));
    });

    // Analog steering: drag horizontally anywhere on the canvas to steer.
    this.analogSteer = 0;
    const canvas = this.renderer && this.renderer.domElement;
    if (canvas) {
      let dragId = null;
      let startX = 0;
      const sensitivity = (ANALOG && ANALOG.dragSensitivity) || 0.0035;
      const maxSteer = (ANALOG && ANALOG.maxSteer) || 1;
      canvas.addEventListener('pointerdown', (e) => {
        if (dragId !== null) return;
        dragId = e.pointerId;
        startX = e.clientX;
        this.analogSteer = 0;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      });
      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerId !== dragId) return;
        this.analogSteer = clamp((e.clientX - startX) * sensitivity, -maxSteer, maxSteer);
      });
      const end = (e) => {
        if (dragId !== null && e.pointerId !== dragId) return;
        dragId = null;
        this.analogSteer = 0;
        try { if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('lostpointercapture', () => { dragId = null; this.analogSteer = 0; });
    }

    // Menu buttons
    if (this.overlays.goBtn) {
      this.overlays.goBtn.addEventListener('click', () => this._onStartInput());
    }
    if (this.overlays.shopBtn) {
      this.overlays.shopBtn.addEventListener('click', () => this._openShop());
    }
    if (this.overlays.helpBtn) {
      this.overlays.helpBtn.addEventListener('click', () =>
        this._togglePanel(this.overlays.helpPanel)
      );
    }
    if (this.overlays.settingsBtn) {
      this.overlays.settingsBtn.addEventListener('click', () =>
        this._togglePanel(this.overlays.settingsPanel)
      );
    }
    [this.overlays.helpPanel, this.overlays.settingsPanel].forEach((p) => {
      if (!p) return;
      p.addEventListener('click', (e) => {
        if (e.target === p) this._hidePanel(p);
      });
    });

    if (this.overlays.levelSelectClose) {
      this.overlays.levelSelectClose.addEventListener('click', () => this._hideLevelSelect());
    }

    if (this.overlays.restartButton) {
      this.overlays.restartButton.addEventListener('click', () => this._restartLevel());
    }
    if (this.overlays.menuButton) {
      this.overlays.menuButton.addEventListener('click', () => this._backToMenu());
    }
    if (this.overlays.winMenuButton) {
      this.overlays.winMenuButton.addEventListener('click', () => this._backToMenu());
    }
    if (this.overlays.prizeClaim) {
      this.overlays.prizeClaim.addEventListener('click', () => this._claimPrize());
    }

    // Touch buttons (pointer events: finger + mouse + stylus, multi-touch safe)
    this._bindTouchButton('touch-left', 'left');
    this._bindTouchButton('touch-right', 'right');
    this._bindTouchButton('touch-gas', 'gas');
    this._bindTouchButton('touch-brake', 'brake');
    this._bindTouchButton('touch-turbo', 'turbo');
    this._bindTouchButton('touch-drift', 'drift');
  }

  _bindTouchButton(id, key) {
    const elBtn = el(id);
    if (!elBtn) return;
    const set = (v) => (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.touch[key] = v;
      elBtn.classList.toggle('active', v);
    };
    elBtn.addEventListener('pointerdown', (e) => {
      set(true)(e);
      try { elBtn.setPointerCapture(e.pointerId); } catch (_) {}
    });
    elBtn.addEventListener('pointerup', (e) => {
      set(false)(e);
      try { if (elBtn.hasPointerCapture && elBtn.hasPointerCapture(e.pointerId)) elBtn.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    elBtn.addEventListener('pointercancel', set(false));
    elBtn.addEventListener('lostpointercapture', set(false));
  }

  _readInput() {
    const k = this.keys;
    const has = (arr) => (arr || []).some((c) => k[c]);
    const left = has(INPUT.steerLeft) || this.touch.left;
    const right = has(INPUT.steerRight) || this.touch.right;
    const keySteer = (right ? 1 : 0) - (left ? 1 : 0);
    const steer = Math.abs(this.analogSteer || 0) > 0.01 ? this.analogSteer : keySteer;
    const boost = has(INPUT.boost) || has(INPUT.turbo) || this.touch.turbo;
    return {
      left,
      right,
      steer,
      gas: has(INPUT.gas) || this.touch.gas,
      brake: has(INPUT.brake) || this.touch.brake,
      turbo: boost,
      boost,
      drift: has(INPUT.drift) || this.touch.drift
    };
  }

  _togglePause() {
    this.paused = !this.paused;
    if (this.overlays && this.overlays.pause) {
      this.overlays.pause.style.display = this.paused ? 'flex' : 'none';
    }
    document.body.classList.toggle('is-paused', !!this.paused);
  }

  // ===========================================================================
  // PANELS
  // ===========================================================================
  _togglePanel(panel) {
    if (!panel) return;
    if (panel.classList.contains('show')) this._hidePanel(panel);
    else panel.classList.add('show');
  }

  _hidePanel(panel) {
    if (!panel) return;
    panel.classList.remove('show');
  }

  // ===========================================================================
  // MENU / LEVEL SELECT / SHOP
  // ===========================================================================
  _onStartInput() {
    if (this.state === STATE.MENU) {
      this._showLevelSelect();
    } else if (this.state === STATE.LEVEL_SELECT) {
      // Enter picks the first unlocked un-completed level.
      const level = this._pickRecommendedLevel();
      this._startLevel(level.id);
    }
  }

  _onRestartInput() {
    if (this.state === STATE.GAME_OVER || this.state === STATE.WIN) {
      this._restartLevel();
    } else if (this.state === STATE.PRIZE) {
      this._claimPrize();
    }
  }

  _pickRecommendedLevel() {
    const unlocked = Storage.getUnlockedLevel();
    const completed = Storage.getLevelsCompleted();
    for (const lv of LEVELS) {
      if (lv.id <= unlocked && !completed.includes(lv.id)) return lv;
    }
    return getLevelById(Math.min(unlocked, LEVELS.length));
  }

  _showLevelSelect() {
    this._setState(STATE.LEVEL_SELECT);
    this.effects.stopMenuBounce();
    this._buildLevelSelectGrid();
    this.effects.overlayFade(this.overlays.levelSelect, true);
  }

  _hideLevelSelect() {
    this.effects.overlayFade(this.overlays.levelSelect, false);
    this._setState(STATE.MENU);
    this.effects.startMenuBounce(this.car.group);
  }

  _buildLevelSelectGrid() {
    const grid = this.overlays.levelSelectGrid;
    if (!grid) return;
    grid.innerHTML = '';
    const unlocked = Storage.getUnlockedLevel();
    const completed = Storage.getLevelsCompleted();

    for (const lv of LEVELS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card';
      const isLocked = lv.id > unlocked;
      const isCompleted = completed.includes(lv.id);
      card.classList.toggle('locked', isLocked);
      card.classList.toggle('completed', isCompleted);
      card.innerHTML = `
        <div class="level-card-num">${lv.id}</div>
        <div class="level-card-name">${lv.name}</div>
        <div class="level-card-info">${lv.targetDistance}m · ${lv.timeLimit}s</div>
        ${isLocked ? '<div class="level-card-lock">LOCKED</div>' : ''}
        ${isCompleted ? '<div class="level-card-check">&#10003;</div>' : ''}
      `;
      if (!isLocked) {
        card.addEventListener('click', () => {
          this._hideLevelSelect();
          this._startLevel(lv.id);
        });
      }
      grid.appendChild(card);
    }
  }

  _openShop() {
    if (this.state !== STATE.MENU) return;
    this.effects.stopMenuBounce();
    this._setState(STATE.SHOP);
    this.shop.show();
    this.effects.overlayFade(this.overlays.shop, true);
  }

  _closeShop() {
    this.effects.overlayFade(this.overlays.shop, false);
    this._setState(STATE.MENU);
    this.effects.startMenuBounce(this.car.group);
    this._refreshWallet();
  }

  _refreshWallet() {
    const wallet = Storage.getWallet();
    if (this.overlays.menuCoins) this.overlays.menuCoins.textContent = wallet.coins.toLocaleString();
    if (this.overlays.menuCrowns) this.overlays.menuCrowns.textContent = wallet.crowns.toLocaleString();
  }

  // ===========================================================================
  // LEVELS
  // ===========================================================================
  _refreshLevelHud() {
    if (this.hud.levelName) this.hud.levelName.textContent = this.level.name;
    if (this.hud.levelNum) this.hud.levelNum.textContent = String(this.level.id);
  }

  _startLevel(levelId) {
    this.currentLevelId = levelId;
    this.level = getLevelById(levelId);

    // Apply level theme.
    this.world.applyTheme(this.level.theme);
    this.world.setTrafficDensity(this.level.trafficDensity / 1.0);

    // Reset player / car.
    this.lives = CAR.lives;
    this.timer = this.level.timeLimit;
    this.score = 0;
    this.coins = 0;
    this.crowns = 0;
    this.distance = 0;
    this.combo = 0;
    this.lastPassTime = -999;
    this.invulnTime = 0;
    this.hitFlashTime = 0;
    this.timeWasLow = false;
    this._display = { coins: 0, crowns: 0, score: 0 };
    this.prize = null;

    this.car.reset(0, 0, 0);
    this.car.setSkin(Storage.getSelectedSkinId());
    this.prevPlayerZ = 0;
    this.startZ = 0;

    // Reset world for play.
    this.world.showMenuPlatform(false);
    this.world.resetForPlay(0);

    // Effects cleanup.
    this.effects.stopMenuBounce();
    this.effects.stopBoostPulse();

    // Hide overlays.
    this.effects.overlayFade(this.overlays.menu, false);
    this.effects.overlayFade(this.overlays.levelSelect, false);
    this.effects.overlayFade(this.overlays.gameOver, false);
    this.effects.overlayFade(this.overlays.win, false);
    this.effects.overlayFade(this.overlays.prize, false);
    this.effects.overlayFade(this.overlays.shop, false);
    this._hidePanel(this.overlays.helpPanel);
    this._hidePanel(this.overlays.settingsPanel);

    // HUD.
    if (this.hud.root) this.hud.root.classList.add('playing');
    document.body.classList.add('playing');
    this._setHudText(this.hud.coins, '0');
    this._setHudText(this.hud.crowns, '0');
    this._setHudText(this.hud.score, '0');
    this._setHudText(this.hud.time, Math.ceil(this.timer));
    this._setHudText(this.hud.distance, '0m');
    this._renderLives();
    this._setBoostFill(this.car.boostAmount / BOOST.max);
    this._refreshLevelHud();
    if (this.hud.timePill) this.hud.timePill.classList.remove('warn');

    // Camera reset.
    this.camPos.set(0, CAMERA.offsetUp, CAMERA.offsetBack);
    this.camLookAt.set(0, CAMERA.lookUp, 0);
    this.camFov = CAMERA.fov;
    this.camera.fov = CAMERA.fov;
    this.camera.updateProjectionMatrix();

    if (this.cpTween) {
      this.cpTween.pause();
      this.cpTween = null;
    }

    this._setState(STATE.PLAY);
  }

  _restartLevel() {
    this._startLevel(this.currentLevelId);
  }

  _onLevelComplete() {
    if (this.state !== STATE.PLAY && this.state !== STATE.CHECKPOINT) return;
    this._setState(STATE.LEVEL_COMPLETE);

    // Freeze motion.
    this.car.speed = 0;

    this.effects.stopBoostPulse();
    this.effects.levelCompleteFlash('LEVEL COMPLETE!');

    // Compute prize.
    const baseCoins = this.coins;
    const baseCrowns = this.crowns;
    const distanceBonus = Math.round(this.level.targetDistance * 1.5 * this.level.coinRate);
    const timeBonus = Math.round(Math.max(0, this.timer) * 8 * this.level.coinRate);
    const total = baseCoins + distanceBonus + timeBonus;

    this.prize = {
      coins: baseCoins,
      crowns: baseCrowns,
      distanceBonus,
      timeBonus,
      total,
      score: Math.round(this.score),
      nextLevelId: this.level.id < LEVELS.length ? this.level.id + 1 : null
    };

    // Brief pause, then open prize overlay.
    setTimeout(() => {
      if (this.state === STATE.LEVEL_COMPLETE) this._showPrize();
    }, 900);
  }

  _showPrize() {
    this._setState(STATE.PRIZE);
    const p = this.prize;
    if (!p) return;

    if (this.overlays.prizeCoins) this.overlays.prizeCoins.textContent = p.coins.toLocaleString();
    if (this.overlays.prizeCrowns) this.overlays.prizeCrowns.textContent = p.crowns.toLocaleString();
    if (this.overlays.prizeDistance) this.overlays.prizeDistance.textContent = '+' + p.distanceBonus.toLocaleString();
    if (this.overlays.prizeTime) this.overlays.prizeTime.textContent = '+' + p.timeBonus.toLocaleString();
    if (this.overlays.prizeTotal) this.overlays.prizeTotal.textContent = p.total.toLocaleString();

    this.effects.overlayFade(this.overlays.prize, true);
  }

  _claimPrize() {
    if (!this.prize) return;
    const p = this.prize;

    // Pay out.
    Storage.addCoins(p.total);
    Storage.addCrowns(p.crowns);
    Storage.submitHighScore(p.score);
    Storage.markLevelCompleted(this.level.id);

    // Reset prize so double-click doesn't double-pay.
    this.prize = null;

    this.effects.overlayFade(this.overlays.prize, false);
    this._refreshWallet();

    if (p.nextLevelId) {
      // Start next level after a short delay for the fade.
      setTimeout(() => this._startLevel(p.nextLevelId), 260);
    } else {
      // Last level — victory.
      this._setState(STATE.WIN);
      if (this.overlays.winScore) {
        this.overlays.winScore.textContent = Storage.getHighScore().toLocaleString();
      }
      this.effects.overlayFade(this.overlays.win, true);
      if (this.hud.root) this.hud.root.classList.remove('playing');
      document.body.classList.remove('playing');
    }
  }

  _onGameOver() {
    if (this.state === STATE.GAME_OVER) return;
    this._setState(STATE.GAME_OVER);
    this.effects.stopBoostPulse();

    if (this.overlays.finalScore) {
      this.overlays.finalScore.textContent = Math.round(this.score).toLocaleString();
    }
    Storage.submitHighScore(Math.round(this.score));

    this.effects.overlayFade(this.overlays.gameOver, true);
    if (this.hud.root) this.hud.root.classList.remove('playing');
    document.body.classList.remove('playing');
  }

  _backToMenu() {
    this._setState(STATE.MENU);
    this.car.reset(0, 0, 0);
    this.car.setSkin(Storage.getSelectedSkinId());
    this.world.showMenuPlatform(true);
    this.world.applyTheme('beach');

    this.effects.overlayFade(this.overlays.gameOver, false);
    this.effects.overlayFade(this.overlays.win, false);
    this.effects.overlayFade(this.overlays.prize, false);
    this.effects.overlayFade(this.overlays.levelSelect, false);
    this.effects.overlayFade(this.overlays.shop, false);
    this.effects.overlayFade(this.overlays.menu, true);
    this.effects.startMenuBounce(this.car.group);

    if (this.hud.root) this.hud.root.classList.remove('playing');
    document.body.classList.remove('playing');
    this._refreshWallet();
  }

  _setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  // ===========================================================================
  // HUD HELPERS
  // ===========================================================================
  _setHudText(elRef, value) {
    if (elRef) elRef.textContent = value;
  }

  _renderLives() {
    if (!this.hud.lives) return;
    let html = '';
    for (let i = 0; i < CAR.lives; i++) {
      html += `<span class="life ${i < this.lives ? 'alive' : 'dead'}">&#10084;</span>`;
    }
    this.hud.lives.innerHTML = html;
  }

  _setBoostFill(frac) {
    if (!this.hud.turbo) return;
    const pct = clamp(frac, 0, 1) * 100;
    this.hud.turbo.style.width = `${pct.toFixed(1)}%`;
    const parent = this.hud.turbo.parentElement;
    if (!parent) return;
    parent.classList.toggle('low', frac < 0.2);
    parent.classList.toggle('ready', frac >= 0.5);
  }

  _flashHudHit() {
    if (!this.hud.root) return;
    this.hud.root.classList.add('hit');
    setTimeout(() => this.hud.root.classList.remove('hit'), 260);
  }

  // ===========================================================================
  // CAMERA
  // ===========================================================================
  _applyMenuCamera() {
    const r = CAMERA.menuOrbitRadius;
    const h = CAMERA.menuOrbitHeight;
    this.camera.position.set(
      Math.sin(this.menuOrbitAngle) * r,
      h,
      Math.cos(this.menuOrbitAngle) * r
    );
    this.camera.lookAt(0, CAMERA.menuOrbitLookHeight, 0);
  }

  _updateMenuCamera(dt) {
    this.menuOrbitAngle += dt * CAMERA.menuOrbitSpeed;
    this._applyMenuCamera();
    if (Math.abs(this.camera.fov - CAMERA.fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, CAMERA.fov, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }

  _updateChaseCamera(dt) {
    if (this.cpTween) return;

    const pos = this.car.group.position;
    const heading = this.car.heading;

    const backX = Math.sin(heading) * CAMERA.offsetBack;
    const backZ = Math.cos(heading) * CAMERA.offsetBack;
    const targetX = pos.x + backX;
    const targetZ = pos.z + backZ;
    const targetY = pos.y + CAMERA.offsetUp;

    const kPos = 1 - Math.exp(-CAMERA.followLerp * dt);
    this.camPos.x += (targetX - this.camPos.x) * kPos;
    this.camPos.y += (targetY - this.camPos.y) * kPos;
    this.camPos.z += (targetZ - this.camPos.z) * kPos;

    const fwdX = -Math.sin(heading) * CAMERA.lookAhead;
    const fwdZ = -Math.cos(heading) * CAMERA.lookAhead;
    const lookX = pos.x + fwdX;
    const lookZ = pos.z + fwdZ;
    const lookY = pos.y + CAMERA.lookUp;

    const kLook = 1 - Math.exp(-CAMERA.rotationLerp * dt);
    this.camLookAt.x += (lookX - this.camLookAt.x) * kLook;
    this.camLookAt.y += (lookY - this.camLookAt.y) * kLook;
    this.camLookAt.z += (lookZ - this.camLookAt.z) * kLook;

    const targetFov = this.car.boostActive ? BOOST.fovBoost : CAMERA.fov;
    this.camFov = lerp(this.camFov, targetFov, Math.min(1, dt * BOOST.fovLerp));
    if (Math.abs(this.camera.fov - this.camFov) > 0.02) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }

    this.effects.updateShake(dt);
    const shake = this.effects.getShakeOffset();
    this.camera.position.set(
      this.camPos.x + shake.x,
      this.camPos.y + shake.y,
      this.camPos.z + shake.z
    );
    this.camera.lookAt(this.camLookAt);
  }

  _playCheckpointCameraTween() {
    if (this.cpTween) this.cpTween.pause();

    const pos = this.car.group.position;
    const heading = this.car.heading;
    const start = { x: this.camPos.x, y: this.camPos.y, z: this.camPos.z };
    const end = {
      x: pos.x + Math.sin(heading) * CAMERA.checkpointTweenBack,
      y: pos.y + CAMERA.checkpointTweenUp,
      z: pos.z + Math.cos(heading) * CAMERA.checkpointTweenBack
    };

    const stateT = { t: 0 };
    this.cpTween = anime({
      targets: stateT,
      t: [0, 1],
      duration: CAMERA.checkpointTweenDur * 1000,
      easing: 'easeInOutQuad',
      update: () => {
        const t = stateT.t;
        this.camera.position.set(
          lerp(start.x, end.x, t),
          lerp(start.y, end.y, t),
          lerp(start.z, end.z, t)
        );
        this.camera.lookAt(pos.x, pos.y + CAMERA.lookUp, pos.z);
      },
      complete: () => {
        this.camPos.set(end.x, end.y, end.z);
        this.camLookAt.set(pos.x, pos.y + CAMERA.lookUp, pos.z);
        this.cpTween = null;
        if (this.state === STATE.CHECKPOINT) this._setState(STATE.PLAY);
      }
    });
  }

  // ===========================================================================
  // GAMEPLAY
  // ===========================================================================
  _updateGameplay(dt, input) {
    const allowControl = this.state === STATE.PLAY || this.state === STATE.CHECKPOINT;
    this.car.update(dt, input, allowControl);

    const pos = this.car.group.position;
    const dz = this.prevPlayerZ - pos.z;
    if (dz > 0) this.distance += dz;
    this.prevPlayerZ = pos.z;

    this.score += Math.max(0, dz) * SCORE.perMeter;

    if (this.invulnTime > 0) {
      this.invulnTime -= dt;
      const blink = Math.sin(this.invulnTime * 30) > 0;
      this.car.group.visible = blink;
    } else {
      this.car.group.visible = true;
    }
    if (this.hitFlashTime > 0) this.hitFlashTime -= dt;

    if (this.state === STATE.PLAY) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this._onGameOver();
        return;
      }
      const low = this.timer <= 10;
      if (low !== this.timeWasLow) {
        this.timeWasLow = low;
        if (this.hud.timePill) this.hud.timePill.classList.toggle('warn', low);
      }
    }

    const speedFactor = clamp(Math.abs(this.car.speed) / Math.max(1, CAR.maxSpeed), 0, 1);
    this.world.update(dt, pos.z, pos.x, speedFactor);

    // Pickups
    const collected = this.world.collectNearby(pos, 1.6);
    for (const item of collected) {
      if (item.type === 'coin') this._onCoin(item.position);
      else if (item.type === 'crown') this._onCrown(item.position);
      else if (item.type === 'boost') this._onBoostPickup(item.position);
    }

    // Checkpoints
    const crossed = this.world.checkCheckpointCrossing(this.prevPlayerZ + dz, pos.z);
    if (crossed.length > 0) this._onCheckpoint(crossed[0]);

    // Traffic
    if (this.invulnTime <= 0) {
      const hit = this.world.detectTrafficCollision(pos, this.car.getBoundingRadius());
      if (hit) this._onCollision();
    }

    // Traffic pass detection + scoring
    for (let i = 0; i < this.world.traffic.length; i++) {
      const t = this.world.traffic[i];
      if (t.userData.passedByPlayer && !t.userData.scored) {
        t.userData.scored = true;
        this._onTrafficPassed(t);
      }
      if (!t.userData.passedByPlayer) t.userData.scored = false;
    }

    // Boost visuals
    if (this.car.boostActive) {
      if (!this._boostPulseActive) {
        this._boostPulseActive = true;
        this.effects.startBoostPulse(this.car);
      }
      this._spawnBoostSparklesIfActive(dt);
    } else if (this._boostPulseActive) {
      this._boostPulseActive = false;
      this.effects.stopBoostPulse();
    }

    // Effects
    this.effects.update(dt, this.car, speedFactor);

    // Level completion check
    if (this.distance >= this.level.targetDistance && this.state === STATE.PLAY) {
      this._onLevelComplete();
      return;
    }

    this._updateHud();
  }

  _spawnBoostSparklesIfActive(dt) {
    this._boostSparkleTimer += dt;
    const interval = 1 / BOOST.flameRate;
    while (this._boostSparkleTimer >= interval) {
      this._boostSparkleTimer -= interval;
      const pos = this.car.group.position;
      const h = this.car.heading;
      const fx = -Math.sin(h);
      const fz = -Math.cos(h);
      const px = pos.x - fx * 2.4;
      const pz = pos.z - fz * 2.4;
      const world = new THREE.Vector3(px, 0.75, pz);
      this.effects.spawnBoostSparkles(world);
    }
  }

  _onCoin(worldPos) {
    this.coins += 1;
    this.score += SCORE.coin;
    this.car.addBoost(BOOST.coinRegen);
    this.effects.coinPop(worldPos);
    this.effects.tweenCounter(this.hud.coins, this._display.coins, this.coins);
    this._display.coins = this.coins;
  }

  _onCrown(worldPos) {
    this.crowns += 1;
    this.score += SCORE.crown;
    this.car.addBoost(BOOST.crownRegen);
    this.effects.crownPop(worldPos);
    this.effects.tweenCounter(this.hud.crowns, this._display.crowns, this.crowns);
    this._display.crowns = this.crowns;
  }

  _onBoostPickup(worldPos) {
    this.car.addBoost(BOOST.pickupRegen);
    this.effects.boostPop(worldPos);
  }

  _onCheckpoint(cp) {
    this.timer = Math.min(this.level.timeLimit + 30, this.timer + 8);
    this.score += SCORE.checkpoint;
    this.effects.pulseCheckpoint(cp);
    const cpPos = cp.position.clone();
    cpPos.y = 3;
    this.effects.checkpointPop(cpPos);
    this._setState(STATE.CHECKPOINT);
    this._playCheckpointCameraTween();
  }

  _onCollision() {
    this.lives -= 1;
    this.car.onCollision();
    this.invulnTime = CAR.collisionInvulnTime;
    this.hitFlashTime = CAR.collisionInvulnTime;
    this.combo = 0;

    const pos = this.car.group.position.clone();
    pos.y += 0.8;
    this.effects.spawnCollisionBurst(pos, 0xffa033);
    this.effects.triggerShake(CAR.collisionShakeAmp, CAR.collisionShakeDur);
    this._flashHudHit();
    this._renderLives();

    if (this.lives <= 0) this._onGameOver();
  }

  _onTrafficPassed(carGroup) {
    const now = performance.now() / 1000;
    if (now - this.lastPassTime <= SCORE.comboWindow) {
      this.combo = Math.min(this.combo + 1, SCORE.comboMax);
    } else {
      this.combo = 1;
    }
    this.lastPassTime = now;

    const comboMult = 1 + (this.combo - 1) * 0.15;
    const gain = Math.round(SCORE.passTraffic * comboMult);
    this.score += gain;
    this.car.addBoost(BOOST.passRegen);

    const p = carGroup.position.clone();
    p.y += 1.2;
    this.effects.passPop(p);
  }

  _updateHud() {
    if (this.hud.time) this.hud.time.textContent = Math.ceil(this.timer);
    if (this.hud.speed) this.hud.speed.textContent = Math.round(Math.abs(this.car.speed) * 3.6);

    const speedBigEl = document.getElementById('hud-speed-big');
    if (speedBigEl && this.car) speedBigEl.textContent = `${Math.round(Math.abs(this.car.speed || 0))}`;
    const comboEl = document.getElementById('hud-combo');
    if (comboEl) {
      const c = this.combo || 0;
      comboEl.textContent = c > 1 ? `x${c} COMBO` : '';
    }
    const hintsEl = document.getElementById('desktop-hints');
    if (hintsEl) hintsEl.style.display = this.isTouch ? 'none' : 'flex';

    const scoreInt = Math.round(this.score);
    if (scoreInt !== this._display.score) {
      this.effects.tweenCounter(this.hud.score, this._display.score, scoreInt, 180);
      this._display.score = scoreInt;
    }

    if (this.hud.distance) this.hud.distance.textContent = `${Math.floor(this.distance)}m`;
    this._setBoostFill(this.car.boostAmount / BOOST.max);
  }

  // ===========================================================================
  // LOOP
  // ===========================================================================
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));

    const dtRaw = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(dtRaw, 0.05);
    this.stateTime += dt;

    const input = this._readInput();

    if (this.state === STATE.MENU || this.state === STATE.LEVEL_SELECT || this.state === STATE.SHOP) {
      this._updateMenuCamera(dt);
      this.car.update(dt, { left: false, right: false, gas: false, brake: false, turbo: false }, false);
      this.world.update(dt, this.car.group.position.z, this.car.group.position.x);
      this.effects.update(dt, this.car, 0);
    } else if (this.state === STATE.PLAY || this.state === STATE.CHECKPOINT) {
      if (!this.paused) {
        this._updateGameplay(dt, input);
        this._updateChaseCamera(dt);
      }
    } else if (this.state === STATE.LEVEL_COMPLETE || this.state === STATE.PRIZE) {
      this.car.update(dt, { left: false, right: false, gas: false, brake: false, turbo: false }, false);
      this.world.update(dt, this.car.group.position.z, this.car.group.position.x);
      this._updateChaseCamera(dt);
      this.effects.update(dt, this.car, 0);
    } else if (this.state === STATE.GAME_OVER || this.state === STATE.WIN) {
      this.car.update(dt, { left: false, right: false, gas: false, brake: false, turbo: false }, false);
      this.world.update(dt, this.car.group.position.z, this.car.group.position.x);
      this._updateChaseCamera(dt);
      this.effects.update(dt, this.car, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ===========================================================================
  // RESIZE
  // ===========================================================================
  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.perfTier.pixelRatioCap)
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================
  dispose() {
    if (this.cpTween) this.cpTween.pause();
    this.effects.dispose();
    this.world.dispose();
    this.car.dispose();
    this.shop.dispose();
    this.renderer.dispose();
  }
}

// -----------------------------------------------------------------------------
// BOOTSTRAP
// -----------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  const boot = () => {
    if (!document.getElementById('game-canvas')) {
      console.error('[Meow Racing] Missing #game-canvas');
      return;
    }
    try {
      window.__MEOW_GAME__ = new Game();
    } catch (err) {
      console.error('[Meow Racing] Boot failed:', err);
    }
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

export default Game;