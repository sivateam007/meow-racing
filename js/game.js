// js/game.js
// Meow Racing — main loop, state machine, input, camera, scoring, HUD.
// Ties together Car, World, Effects and drives the game with the verified
// FullSpeed Racing constants from config.js.

import * as THREE from 'three';
import anime from 'animejs';
import {
  CAR,
  CAMERA,
  WORLD,
  STATE,
  UI,
  INPUT,
  SCORE,
  SPAWN,
  PICKUPS,
  EFFECTS,
  RENDER,
  WIN_DISTANCE,
  clamp,
  lerp,
  randRange
} from './config.js';
import { Car } from './car.js';
import { World } from './world.js';
import { Effects } from './effects.js';

const TWO_PI = Math.PI * 2;

export class Game {
  constructor() {
    // DOM refs
    this.canvas = document.getElementById('game-canvas');
    this.hud = {
      root: document.getElementById('hud'),
      coins: document.getElementById('hud-coins'),
      crowns: document.getElementById('hud-crowns'),
      score: document.getElementById('hud-score'),
      speed: document.getElementById('hud-speed'),
      time: document.getElementById('hud-time'),
      lives: document.getElementById('hud-lives'),
      turbo: document.getElementById('hud-turbo-fill'),
      distance: document.getElementById('hud-distance')
    };
    this.overlays = {
      menu: document.getElementById('menu-overlay'),
      gameOver: document.getElementById('game-over-overlay'),
      win: document.getElementById('win-overlay'),
      goBtn: document.getElementById('go-button'),
      restartBtn: document.getElementById('restart-button'),
      winRestartBtn: document.getElementById('win-restart-button'),
      finalScore: document.getElementById('final-score'),
      winScore: document.getElementById('win-score'),
      helpBtn: document.getElementById('help-button'),
      settingsBtn: document.getElementById('settings-button'),
      helpPanel: document.getElementById('help-panel'),
      settingsPanel: document.getElementById('settings-panel')
    };

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: RENDER.antialias,
      powerPreference: RENDER.powerPreference
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.pixelRatioCap));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER.toneMappingExposure;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      CAMERA.near,
      CAMERA.far
    );
    this.camera.position.set(0, 6, 12);
    this.camera.lookAt(0, 0, 0);

    // Effects needs camera + renderer
    this.effects = new Effects(this.scene, this.camera, this.renderer);

    // World
    this.world = new World(this.scene);

    // Car
    this.car = new Car(this.scene, 0);
    this.car.reset(0, 0, 0);

    // State
    this.state = STATE.MENU;
    this.stateTime = 0;
    this.lastTime = performance.now();
    this.accumulator = 0;

    // Input
    this.keys = {};
    this.touch = { left: false, right: false, gas: false, brake: false, turbo: false };
    this._bindInput();

    // Menu / gameplay variables
    this.menuOrbitAngle = 0;
    this.lives = CAR.lives;
    this.timer = CAR.tiempoMax;
    this.score = 0;
    this.coins = 0;
    this.crowns = 0;
    this.distance = 0;
    this.prevPlayerZ = 0;
    this.startZ = 0;
    this.combo = 0;
    this.lastPassTime = -999;
    this.invulnTime = 0;
    this.hitFlashTime = 0;
    this.timeWasLow = false;

    // Camera smoothing state
    this.camPos = new THREE.Vector3(0, CAMERA.offsetUp, CAMERA.offsetBack);
    this.camLookAt = new THREE.Vector3(0, CAMERA.lookUp, 0);
    this.camFov = CAMERA.fov;
    this.camShakeOffset = new THREE.Vector3();

    // Checkpoint tween
    this.cpTween = null;

    // Displayed HUD values (for tween sync)
    this._display = { coins: 0, crowns: 0, score: 0 };

    // Handle resize
    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    // Start in menu
    this.world.showMenuPlatform(true);
    this._applyMenuCamera();
    this.effects.startMenuBounce(this.car.group);

    // Kick off loop
    requestAnimationFrame((t) => this._loop(t));
  }

  // ===========================================================================
  // INPUT
  // ===========================================================================
  _bindInput() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (
        INPUT.gas.includes(code) ||
        INPUT.brake.includes(code) ||
        INPUT.steerLeft.includes(code) ||
        INPUT.steerRight.includes(code) ||
        INPUT.turbo.includes(code) ||
        INPUT.start.includes(code) ||
        INPUT.restart.includes(code) ||
        INPUT.cycleColor.includes(code)
      ) {
        e.preventDefault();
      }
      this.keys[code] = true;

      if (INPUT.start.includes(code)) this._onStartInput();
      if (INPUT.restart.includes(code)) this._onRestartInput();
      if (INPUT.cycleColor.includes(code) && this.state === STATE.MENU) {
        this.car.cycleColor();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
    });

    // Menu buttons
    if (this.overlays.goBtn) {
      this.overlays.goBtn.addEventListener('click', () => this._onStartInput());
    }
    if (this.overlays.restartBtn) {
      this.overlays.restartBtn.addEventListener('click', () => this._onRestartInput());
    }
    if (this.overlays.winRestartBtn) {
      this.overlays.winRestartBtn.addEventListener('click', () => this._onRestartInput());
    }

    // Help / settings panels
    if (this.overlays.helpBtn) {
      this.overlays.helpBtn.addEventListener('click', () => this._togglePanel(this.overlays.helpPanel));
    }
    if (this.overlays.settingsBtn) {
      this.overlays.settingsBtn.addEventListener('click', () => this._togglePanel(this.overlays.settingsPanel));
    }
    // Close panels on click-outside
    [this.overlays.helpPanel, this.overlays.settingsPanel].forEach((p) => {
      if (!p) return;
      p.addEventListener('click', (e) => {
        if (e.target === p) this._hidePanel(p);
      });
    });

    // Touch controls
    this._bindTouchButton('touch-left', 'left');
    this._bindTouchButton('touch-right', 'right');
    this._bindTouchButton('touch-gas', 'gas');
    this._bindTouchButton('touch-brake', 'brake');
    this._bindTouchButton('touch-turbo', 'turbo');
  }

  _bindTouchButton(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    const set = (v) => (e) => {
      e.preventDefault();
      this.touch[key] = v;
      el.classList.toggle('active', v);
    };
    el.addEventListener('touchstart', set(true), { passive: false });
    el.addEventListener('touchend', set(false), { passive: false });
    el.addEventListener('touchcancel', set(false), { passive: false });
    el.addEventListener('mousedown', set(true));
    el.addEventListener('mouseup', set(false));
    el.addEventListener('mouseleave', set(false));
  }

  _togglePanel(panel) {
    if (!panel) return;
    if (panel.classList.contains('show')) this._hidePanel(panel);
    else panel.classList.add('show');
  }

  _hidePanel(panel) {
    if (!panel) return;
    panel.classList.remove('show');
  }

  _readInput() {
    const k = this.keys;
    const has = (arr) => arr.some((c) => k[c]);
    return {
      left: has(INPUT.steerLeft) || this.touch.left,
      right: has(INPUT.steerRight) || this.touch.right,
      gas: has(INPUT.gas) || this.touch.gas,
      brake: has(INPUT.brake) || this.touch.brake,
      turbo: has(INPUT.turbo) || this.touch.turbo
    };
  }

  // ===========================================================================
  // STATE TRANSITIONS
  // ===========================================================================
  _onStartInput() {
    if (this.state === STATE.MENU) this._startGame();
  }

  _onRestartInput() {
    if (this.state === STATE.GAME_OVER || this.state === STATE.WIN) {
      this._startGame();
    }
  }

  _setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  // ===========================================================================
  // GAME START / RESTART / END
  // ===========================================================================
  _startGame() {
    // Reset player state
    this.lives = CAR.lives;
    this.timer = CAR.tiempoMax;
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

    // Reset car
    this.car.reset(0, 0, 0);
    this.startZ = this.car.group.position.z;
    this.prevPlayerZ = this.car.group.position.z;

    // Reset world
    this.world.showMenuPlatform(false);
    this.world.resetForPlay(this.car.group.position.z);

    // Stop menu bounce, turbo pulse
    this.effects.stopMenuBounce();
    this.effects.stopTurboPulse();

    // Hide overlays
    this.effects.overlayFade(this.overlays.menu, false);
    this.effects.overlayFade(this.overlays.gameOver, false);
    this.effects.overlayFade(this.overlays.win, false);
    this._hidePanel(this.overlays.helpPanel);
    this._hidePanel(this.overlays.settingsPanel);

    // Show HUD
    if (this.hud.root) this.hud.root.classList.add('playing');
    document.body.classList.add('playing');

    // Reset HUD values
    this._setHudText(this.hud.coins, '0');
    this._setHudText(this.hud.crowns, '0');
    this._setHudText(this.hud.score, '0');
    this._setHudText(this.hud.time, Math.ceil(this.timer));
    this._setHudText(this.hud.distance, '0m');
    this._renderLives();
    this._setTurboFill(this.car.turboAmount / CAR.turboMax);

    // Reset camera behind car
    this.camPos.set(0, CAMERA.offsetUp, CAMERA.offsetBack);
    this.camLookAt.set(0, CAMERA.lookUp, 0);
    this.camFov = CAMERA.fov;
    this.camera.fov = CAMERA.fov;
    this.camera.updateProjectionMatrix();

    // Cancel any checkpoint tween
    if (this.cpTween) {
      this.cpTween.pause();
      this.cpTween = null;
    }

    this._setState(STATE.PLAY);
  }

  _endGame(didWin) {
    if (this.state !== STATE.PLAY && this.state !== STATE.CHECKPOINT) return;

    this._setState(didWin ? STATE.WIN : STATE.GAME_OVER);

    // Stop gameplay effects
    this.effects.stopTurboPulse();

    // Pause; show relevant overlay
    if (didWin) {
      if (this.overlays.winScore) {
        this.overlays.winScore.textContent = Math.round(this.score).toLocaleString();
      }
      this.effects.overlayFade(this.overlays.win, true);
    } else {
      if (this.overlays.finalScore) {
        this.overlays.finalScore.textContent = Math.round(this.score).toLocaleString();
      }
      this.effects.overlayFade(this.overlays.gameOver, true);
    }

    if (this.hud.root) this.hud.root.classList.remove('playing');
    document.body.classList.remove('playing');
  }

  _backToMenu() {
    this._setState(STATE.MENU);
    this.car.reset(0, 0, 0);
    this.world.showMenuPlatform(true);
    this.effects.overlayFade(this.overlays.gameOver, false);
    this.effects.overlayFade(this.overlays.win, false);
    this.effects.overlayFade(this.overlays.menu, true);
    this.effects.startMenuBounce(this.car.group);
    if (this.hud.root) this.hud.root.classList.remove('playing');
    document.body.classList.remove('playing');
  }

  // ===========================================================================
  // HUD HELPERS
  // ===========================================================================
  _setHudText(el, value) {
    if (el) el.textContent = value;
  }

  _renderLives() {
    if (!this.hud.lives) return;
    const total = CAR.lives;
    let html = '';
    for (let i = 0; i < total; i++) {
      html += `<span class="life ${i < this.lives ? 'alive' : 'dead'}">&#10084;</span>`;
    }
    this.hud.lives.innerHTML = html;
  }

  _setTurboFill(frac) {
    if (!this.hud.turbo) return;
    const pct = clamp(frac, 0, 1) * 100;
    this.hud.turbo.style.width = `${pct.toFixed(1)}%`;
    this.hud.turbo.parentElement.classList.toggle('low', frac < 0.2);
    this.hud.turbo.parentElement.classList.toggle('ready', frac >= 0.5);
  }

  _flashHudHit() {
    if (!this.hud.root) return;
    const el = this.hud.root;
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 260);
  }

  // ===========================================================================
  // CAMERA
  // ===========================================================================
  _applyMenuCamera() {
    // Slow orbit around the car on the menu platform.
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
    // Gentle FOV settle
    if (Math.abs(this.camera.fov - CAMERA.fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, CAMERA.fov, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }

  _updateChaseCamera(dt) {
    const pos = this.car.group.position;
    const heading = this.car.heading;

    // Desired camera position (behind car).
    // Forward is (-sin h, 0, -cos h); behind is +offsetBack along -forward = (sin h, 0, cos h).
    const backX = Math.sin(heading) * CAMERA.offsetBack;
    const backZ = Math.cos(heading) * CAMERA.offsetBack;
    const targetX = pos.x + backX;
    const targetZ = pos.z + backZ;
    const targetY = pos.y + CAMERA.offsetUp;

    // Smooth follow (lerp).
    const kPos = 1 - Math.exp(-CAMERA.followLerp * dt);
    this.camPos.x += (targetX - this.camPos.x) * kPos;
    this.camPos.y += (targetY - this.camPos.y) * kPos;
    this.camPos.z += (targetZ - this.camPos.z) * kPos;

    // Desired look-at (ahead of car).
    const fwdX = -Math.sin(heading) * CAMERA.lookAhead;
    const fwdZ = -Math.cos(heading) * CAMERA.lookAhead;
    const lookX = pos.x + fwdX;
    const lookZ = pos.z + fwdZ;
    const lookY = pos.y + CAMERA.lookUp;

    const kLook = 1 - Math.exp(-CAMERA.rotationLerp * dt);
    this.camLookAt.x += (lookX - this.camLookAt.x) * kLook;
    this.camLookAt.y += (lookY - this.camLookAt.y) * kLook;
    this.camLookAt.z += (lookZ - this.camLookAt.z) * kLook;

    // Checkpoint tween overrides (if active) — handled separately.
    if (this.cpTween) {
      return;
    }

    // FOV boost on turbo.
    const targetFov = this.car.turboActive ? CAMERA.fovTurboBoost : CAMERA.fov;
    this.camFov = lerp(this.camFov, targetFov, Math.min(1, dt * CAMERA.fovLerp));
    if (Math.abs(this.camera.fov - this.camFov) > 0.02) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }

    // Apply position + shake.
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
    const start = {
      x: this.camPos.x,
      y: this.camPos.y,
      z: this.camPos.z
    };
    const end = {
      x: pos.x + Math.sin(heading) * CAMERA.checkpointTweenBack,
      y: pos.y + CAMERA.checkpointTweenUp,
      z: pos.z + Math.cos(heading) * CAMERA.checkpointTweenBack
    };

    const state = { t: 0 };

    this.cpTween = anime({
      targets: state,
      t: [0, 1],
      duration: CAMERA.checkpointTweenDur * 1000,
      easing: 'easeInOutQuad',
      update: () => {
        const t = state.t;
        const cx = lerp(start.x, end.x, t);
        const cy = lerp(start.y, end.y, t);
        const cz = lerp(start.z, end.z, t);
        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(pos.x, pos.y + CAMERA.lookUp, pos.z);
      },
      complete: () => {
        this.camPos.set(end.x, end.y, end.z);
        this.camLookAt.set(pos.x, pos.y + CAMERA.lookUp, pos.z);
        this.cpTween = null;
        if (this.state === STATE.CHECKPOINT) {
          this._setState(STATE.PLAY);
        }
      }
    });
  }
  // ===========================================================================
  // GAMEPLAY UPDATE
  // ===========================================================================
  _updateGameplay(dt, input) {
    // Car update
    this.car.update(dt, input, this.state === STATE.PLAY || this.state === STATE.CHECKPOINT);

    // Track distance
    const pos = this.car.group.position;
    const dz = this.prevPlayerZ - pos.z; // positive when moving forward (-Z)
    if (dz > 0) this.distance += dz;
    this.prevPlayerZ = pos.z;

    // Passive distance score
    this.score += dz * SCORE.perMeter;

    // Invuln timer
    if (this.invulnTime > 0) {
      this.invulnTime -= dt;
      // Blink car
      const blink = (Math.sin(this.invulnTime * 30) > 0);
      this.car.group.visible = blink;
    } else {
      this.car.group.visible = true;
    }
    if (this.hitFlashTime > 0) this.hitFlashTime -= dt;

    // Timer countdown
    if (this.state === STATE.PLAY) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this._endGame(false);
        return;
      }
      // Low-time warning
      const low = this.timer <= 10;
      if (low !== this.timeWasLow) {
        this.timeWasLow = low;
        if (this.hud.time) this.hud.time.parentElement.classList.toggle('warn', low);
      }
    }

    // World update
    this.world.update(dt, pos.z, pos.x);

    // Pickup collection
    const collected = this.world.collectNearby(pos, 1.6);
    for (const item of collected) {
      if (item.type === 'coin') this._onCoin(item.position);
      else if (item.type === 'crown') this._onCrown(item.position);
      else if (item.type === 'turbo') this._onTurboPickup(item.position);
    }

    // Checkpoint crossing
    const crossed = this.world.checkCheckpointCrossing(this.prevPlayerZ + dz, pos.z);
    if (crossed.length > 0) this._onCheckpoint(crossed[0]);

    // Traffic collision
    if (this.invulnTime <= 0) {
      const hit = this.world.detectTrafficCollision(pos, this.car.getBoundingRadius());
      if (hit) this._onCollision();
    }

    // Turbo glow pulse start/stop
    if (this.car.turboActive) {
      this.effects.startTurboPulse(this.car);
    } else {
      this.effects.stopTurboPulse();
    }

    // Effects update
    const speedFactor = clamp(Math.abs(this.car.speed) / CAR.maxSpeed, 0, 1);
    this.effects.update(dt, this.car, speedFactor);

    // HUD updates
    this._updateHud();
  }

  // ===========================================================================
  // COLLECT / HIT HANDLERS
  // ===========================================================================
  _onCoin(worldPos) {
    this.coins += 1;
    this.score += SCORE.coin;
    this.car.addTurbo(CAR.turboRegenCoin);
    this.effects.coinPop(worldPos);
    this.effects.tweenCounter(this.hud.coins, this._display.coins, this.coins);
    this._display.coins = this.coins;
  }

  _onCrown(worldPos) {
    this.crowns += 1;
    this.score += SCORE.crown;
    this.car.addTurbo(CAR.turboRegenCrown);
    this.effects.crownPop(worldPos);
    this.effects.tweenCounter(this.hud.crowns, this._display.crowns, this.crowns);
    this._display.crowns = this.crowns;
  }

  _onTurboPickup(worldPos) {
    this.car.addTurbo(CAR.turboMax * 0.5);
    this.effects.turboPop(worldPos);
  }

  _onCheckpoint(cp) {
    // Extend timer, add score, pulse gate, camera tween.
    this.timer = Math.min(CAR.tiempoMax + 30, this.timer + CAR.checkpointTimeBonus);
    this.score += SCORE.checkpoint;
    this.effects.pulseCheckpoint(cp);
    this.effects.checkpointPop(cp.position.clone().setY(3));
    this._setState(STATE.CHECKPOINT);
    this._playCheckpointCameraTween();
  }

  _onCollision() {
    this.lives -= 1;
    this.car.onCollision();
    this.invulnTime = CAR.collisionInvulnTime;
    this.hitFlashTime = CAR.collisionInvulnTime;

    // Effects: burst, shake, flash HUD
    const pos = this.car.group.position.clone();
    pos.y += 0.8;
    this.effects.spawnCollisionBurst(pos, 0xffa033);
    this.effects.triggerShake(CAR.collisionShakeAmp, CAR.collisionShakeDur);
    this._flashHudHit();

    // Combo reset
    this.combo = 0;

    // Update lives HUD
    this._renderLives();

    if (this.lives <= 0) {
      this._endGame(false);
    }
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
    this.car.addTurbo(CAR.turboRegenPass);

    const p = carGroup.position.clone();
    p.y += 1.2;
    this.effects.passPop(p);
  }

  // ===========================================================================
  // HUD REFRESH
  // ===========================================================================
  _updateHud() {
    // Time
    if (this.hud.time) {
      this.hud.time.textContent = Math.ceil(this.timer);
    }

    // Speed (in "km/h" display only)
    if (this.hud.speed) {
      const kmh = Math.round(Math.abs(this.car.speed) * 3.6);
      this.hud.speed.textContent = kmh;
    }

    // Score (only tween when value changes)
    const scoreInt = Math.round(this.score);
    if (scoreInt !== this._display.score) {
      this.effects.tweenCounter(this.hud.score, this._display.score, scoreInt, 180);
      this._display.score = scoreInt;
    }

    // Distance
    if (this.hud.distance) {
      this.hud.distance.textContent = `${Math.floor(this.distance)}m`;
    }

    // Turbo fill
    this._setTurboFill(this.car.turboAmount / CAR.turboMax);

    // Win check
    if (this.distance >= WIN_DISTANCE && this.state === STATE.PLAY) {
      this._endGame(true);
    }
  }

  // ===========================================================================
  // MAIN LOOP
  // ===========================================================================
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));

    const dtRaw = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(dtRaw, 0.05); // clamp huge frames

    this.stateTime += dt;

    const input = this._readInput();

    if (this.state === STATE.MENU) {
      this._updateMenuCamera(dt);
      this.car.update(dt, { left: false, right: false, gas: false, brake: false, turbo: false }, false);
      this.world.update(dt, this.car.group.position.z, this.car.group.position.x);
      // Menu doesn't update traffic collisions/pickups visibly but keeps anim.
      this.effects.update(dt, this.car, 0);
    } else if (this.state === STATE.PLAY || this.state === STATE.CHECKPOINT) {
      this._updateGameplay(dt, input);
      this._updateChaseCamera(dt);

      // Detect newly-passed traffic and award points.
      for (let i = 0; i < this.world.traffic.length; i++) {
        const t = this.world.traffic[i];
        if (t.userData.passedByPlayer && !t.userData.scored) {
          t.userData.scored = true;
          this._onTrafficPassed(t);
        }
        if (!t.userData.passedByPlayer) t.userData.scored = false;
      }
    } else if (this.state === STATE.GAME_OVER || this.state === STATE.WIN) {
      // Slow drift / idle cam behind car, keep world updating gently.
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.pixelRatioCap));
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
    this.renderer.dispose();
  }
}

// -----------------------------------------------------------------------------
// BOOTSTRAP
// -----------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Guard: ensure renderer canvas exists.
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('[Meow Racing] Missing #game-canvas element.');
    return;
  }
  try {
    window.__MEOW_GAME__ = new Game();
  } catch (err) {
    console.error('[Meow Racing] Failed to boot:', err);
  }
});

export default Game;