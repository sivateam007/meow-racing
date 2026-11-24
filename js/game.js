import * as THREE from 'three';
import anime from 'animejs';
import { WORLD_CFG, CAR_CFG, COLORS, INPUT, SURVIVAL, FUEL, clamp } from './config.js';
import Car from './car.js';
import World from './world.js';
import Effects from './effects.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.minimapCanvas = document.getElementById('minimap');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
    this.menuOverlay = document.getElementById('menu-overlay');
    this.goButton = document.getElementById('go-button');

    this.speedEl = document.getElementById('hud-speed-big');
    this.timeEl = document.getElementById('hud-time');
    this.coinsEl = document.getElementById('hud-coins');

    this.state = 'menu';
    this.elapsedTime = 0;
    this.displayedCoins = 0;
    this.coins = 0;
    this.collisionCooldown = 0;

    this.keys = new Set();
    this.touchInput = {
      left: false,
      right: false,
      gas: false,
      brake: false,
      drift: false
    };

    this._initScene();
    this.car = new Car(this.scene);
    this.world = new World(this.scene, this.sunLight);
    this.effects = new Effects(this.scene, this.camera, this.sunLight);

    this._bindEvents();
    this._updateHud();
    this._updateMinimap();

    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.skyDayTop);
    this.scene.fog = new THREE.FogExp2(COLORS.fogDay, WORLD_CFG.fogDensity);

    const width = window.innerWidth || 1280;
    const height = window.innerHeight || 720;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.4, 450);
    this.camera.position.set(
      CAR_CFG.cameraOffset.x,
      CAR_CFG.cameraOffset.y,
      CAR_CFG.cameraOffset.z
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas || undefined,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    if (!this.canvas && this.renderer.domElement) {
      document.body.appendChild(this.renderer.domElement);
    }

    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x94a3b8, 1.55);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(COLORS.sunDay, 2.1);
    this.sunLight.position.set(45, 75, 40);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 220;
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      const rotEl = document.getElementById('rotate-overlay');
      if (rotEl) {
        const isPortraitPhone = h > w && Boolean(this.isTouch || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
        rotEl.style.display = isPortraitPhone ? 'flex' : 'none';
      }
    });

    const allMappedCodes = new Set([
      ...(INPUT.forward || []),
      ...(INPUT.backward || []),
      ...(INPUT.left || []),
      ...(INPUT.right || []),
      ...(INPUT.drift || [])
    ]);

    window.addEventListener('keydown', (e) => {
      if (allMappedCodes.has(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchInput.left = false;
      this.touchInput.right = false;
      this.touchInput.gas = false;
      this.touchInput.brake = false;
      this.touchInput.drift = false;
    });

    const touchMap = [
      { id: 'touch-left', key: 'left' },
      { id: 'touch-right', key: 'right' },
      { id: 'touch-gas', key: 'gas' },
      { id: 'touch-brake', key: 'brake' },
      { id: 'touch-drift', key: 'drift' }
    ];

    for (const item of touchMap) {
      const el = document.getElementById(item.id);
      if (!el) continue;

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}
        this.touchInput[item.key] = true;
      });

      const release = (e) => {
        e.preventDefault();
        this.touchInput[item.key] = false;
        if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
          try {
            el.releasePointerCapture(e.pointerId);
          } catch (_) {}
        }
      };

      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', () => {
        this.touchInput[item.key] = false;
      });
    }

    if (this.goButton) {
      this.goButton.addEventListener('click', () => {
        this.startGame();
      });
    }
  }

  startGame() {
    this.state = 'play';
    if (typeof FUEL !== 'undefined') this.fuel = FUEL.startAmount ?? FUEL.max ?? 100;
    if (this.world && typeof this.world._startStreetRace === 'function') {
      this.world._startStreetRace(this.car.getPosition());
    }
    if (this.menuOverlay) {
      this.menuOverlay.style.display = 'none';
      this.menuOverlay.classList.add('hidden');
    }
    anime({
      targets: this.camera.position,
      y: [CAR_CFG.cameraOffset.y + 1.8, CAR_CFG.cameraOffset.y],
      duration: 450,
      easing: 'easeOutCubic'
    });
  }

  _readInput() {
    const hasCode = (list) => Array.isArray(list) && list.some((code) => this.keys.has(code));

    const forward = hasCode(INPUT.forward) || this.touchInput.gas;
    const backward = hasCode(INPUT.backward) || this.touchInput.brake;
    const left = hasCode(INPUT.left) || this.touchInput.left;
    const right = hasCode(INPUT.right) || this.touchInput.right;
    const drift = hasCode(INPUT.drift) || this.touchInput.drift;

    return {
      forward,
      backward,
      left,
      right,
      drift
    };
  }

  _resolveCollisions(dt) {
    if (this.collisionCooldown > 0) {
      this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    }

    const pos = this.car.getPosition();
    const radius = CAR_CFG.collisionRadius || 2.1;

    const boundLimit = WORLD_CFG.halfSpan - 1.5;
    if (pos.x < -boundLimit) {
      pos.x = -boundLimit;
      this.car.collide(1, 0, 0.8);
    } else if (pos.x > boundLimit) {
      pos.x = boundLimit;
      this.car.collide(-1, 0, 0.8);
    }
    if (pos.z < -boundLimit) {
      pos.z = -boundLimit;
      this.car.collide(0, 1, 0.8);
    } else if (pos.z > boundLimit) {
      pos.z = boundLimit;
      this.car.collide(0, -1, 0.8);
    }

    const colliders = this.world.getColliders ? this.world.getColliders() : [];
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      const closestX = clamp(pos.x, box.minX, box.maxX);
      const closestZ = clamp(pos.z, box.minZ, box.maxZ);
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        let nx = 0;
        let nz = 1;
        let overlap = radius;

        if (dist > 0.0001) {
          nx = dx / dist;
          nz = dz / dist;
          overlap = radius - dist;
        } else {
          const penLeft = Math.abs(pos.x - box.minX);
          const penRight = Math.abs(box.maxX - pos.x);
          const penTop = Math.abs(pos.z - box.minZ);
          const penBottom = Math.abs(box.maxZ - pos.z);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) { nx = -1; nz = 0; overlap = penLeft + radius; }
          else if (minPen === penRight) { nx = 1; nz = 0; overlap = penRight + radius; }
          else if (minPen === penTop) { nx = 0; nz = -1; overlap = penTop + radius; }
          else { nx = 0; nz = 1; overlap = penBottom + radius; }
        }

        pos.x += nx * overlap;
        pos.z += nz * overlap;
        this.car.collide(nx, nz, 1.0);

        if (this.collisionCooldown <= 0) {
          this.collisionCooldown = 0.22;
          this.effects.shake(0.45, 240);
          this.effects.impact({ x: closestX, y: 0.7, z: closestZ });
          this._onCrash({ x: closestX, y: 0.7, z: closestZ });
        }
      }
    }

    if (this.world.trafficPool) {
      for (let i = 0; i < this.world.trafficPool.length; i++) {
        const agent = this.world.trafficPool[i];
        const tPos = agent.group.position;
        const dx = pos.x - tPos.x;
        const dz = pos.z - tPos.z;
        const dist = Math.hypot(dx, dz);
        const minDist = radius + Math.max(agent.width || 2, (agent.length || 4) * 0.45);

        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;
          pos.x += nx * overlap * 0.75;
          pos.z += nz * overlap * 0.75;
          this.car.collide(nx, nz, 1.15);

          if (this.collisionCooldown <= 0) {
            this.collisionCooldown = 0.25;
            this.effects.shake(0.55, 280);
            this.effects.impact({ x: (pos.x + tPos.x) * 0.5, y: 0.8, z: (pos.z + tPos.z) * 0.5 });
            this._onCrash({ x: (pos.x + tPos.x) * 0.5, y: 0.8, z: (pos.z + tPos.z) * 0.5 });
          }
        }
      }
    }
  }

  _onCrash(worldPos) {
    this.health = (typeof this.health === 'number' ? this.health : SURVIVAL.maxHealth) - SURVIVAL.crashDamage;
    this.wanted = Math.min(SURVIVAL.wantedMax, (this.wanted || 0) + 1);
    if (this.health <= 0) {
      this.health = SURVIVAL.maxHealth;
      this.wanted = 0;
      this.car.reset(29, 29, 0);
    }
  }

  _updateCamera(dt) {
    const pos = this.car.getPosition();
    const heading = this.car.getHeading();

    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);

    const offX = CAR_CFG.cameraOffset.x;
    const offY = CAR_CFG.cameraOffset.y;
    const offZ = CAR_CFG.cameraOffset.z;

    const desiredX = pos.x + offX * cosH + offZ * sinH;
    const desiredY = pos.y + offY;
    const desiredZ = pos.z - offX * sinH + offZ * cosH;

    const lerpFactor = Math.min(1, dt * CAR_CFG.cameraLerp);
    this.camera.position.x += (desiredX - this.camera.position.x) * lerpFactor;
    this.camera.position.y += (desiredY - this.camera.position.y) * lerpFactor;
    this.camera.position.z += (desiredZ - this.camera.position.z) * lerpFactor;

    const lookX = pos.x - sinH * Math.abs(CAR_CFG.cameraLookAhead.z);
    const lookY = pos.y + CAR_CFG.cameraLookAhead.y;
    const lookZ = pos.z - cosH * Math.abs(CAR_CFG.cameraLookAhead.z);

    this.camera.lookAt(lookX, lookY, lookZ);

    if (this.sunLight) {
      this.sunLight.position.set(pos.x + 45, 75, pos.z + 40);
      this.sunLight.target.position.set(pos.x, 0, pos.z);
      this.sunLight.target.updateMatrixWorld();
    }
  }

  _updateHud() {
    const fuelEl = document.getElementById('hud-fuel');
    if (fuelEl) {
      const maxFuel = (typeof FUEL !== 'undefined' && FUEL.max) || 100;
      const curFuel = typeof this.fuel === 'number' ? this.fuel : maxFuel;
      fuelEl.textContent = `${Math.ceil((curFuel / maxFuel) * 100)}%`;
    }
    const missionEl = document.getElementById('hud-mission');
    if (missionEl && this.world) {
      if (this.world.raceActive) {
        const cpNum = Math.min((this.world.raceIndex || 0) + 1, (this.world.raceCheckpoints && this.world.raceCheckpoints.length) || 3);
        const cpTotal = (this.world.raceCheckpoints && this.world.raceCheckpoints.length) || 3;
        missionEl.textContent = `RACE CP ${cpNum}/${cpTotal} • ${Math.ceil(this.world.raceTime || 0)}s`;
      } else {
        missionEl.textContent = 'MISSION: VISIT OIL CO';
      }
    }
    const hpFill = document.getElementById('hud-health-fill');
    if (hpFill) {
      const hpPct = Math.max(0, Math.min(100, ((this.health ?? SURVIVAL.maxHealth) / SURVIVAL.maxHealth) * 100));
      hpFill.style.width = `${hpPct}%`;
    }
    const wantedEl = document.getElementById('hud-wanted');
    if (wantedEl) {
      const stars = Math.max(0, Math.min(SURVIVAL.wantedMax, Math.round(this.wanted || 0)));
      wantedEl.textContent = '★'.repeat(stars) + '☆'.repeat(SURVIVAL.wantedMax - stars);
    }
    if (this.speedEl) {
      const kmh = Math.round(Math.abs(this.car.speed || 0) * 3.6);
      this.speedEl.textContent = String(kmh);
    }

    if (this.timeEl) {
      const totalSec = Math.floor(this.elapsedTime);
      const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const secs = String(totalSec % 60).padStart(2, '0');
      this.timeEl.textContent = `${mins}:${secs}`;
    }

    if (this.coinsEl && this.displayedCoins !== this.coins) {
      const prev = this.displayedCoins;
      this.displayedCoins = this.coins;
      this.effects.tweenCounter(this.coinsEl, prev, this.coins, 300);
    } else if (this.coinsEl && !this.coinsEl.textContent) {
      this.coinsEl.textContent = String(this.coins);
    }
  }

  _updateMinimap() {
    if (!this.minimapCanvas || !this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const span = WORLD_CFG.gridSpan || 374;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, w, h);

    const toMapX = (wx) => ((wx + span * 0.5) / span) * w;
    const toMapY = (wz) => ((wz + span * 0.5) / span) * h;
    const roadPx = Math.max(2, (WORLD_CFG.roadWidth / span) * w);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    const streets = this.world.streetCoords || [];
    for (let i = 0; i < streets.length; i++) {
      const sx = toMapX(streets[i]) - roadPx * 0.5;
      const sy = toMapY(streets[i]) - roadPx * 0.5;
      ctx.fillRect(sx, 0, roadPx, h);
      ctx.fillRect(0, sy, w, roadPx);
    }

    if (this.world.trafficPool) {
      ctx.fillStyle = '#facc15';
      for (let i = 0; i < this.world.trafficPool.length; i++) {
        const tp = this.world.trafficPool[i].group.position;
        ctx.fillRect(toMapX(tp.x) - 1.5, toMapY(tp.z) - 1.5, 3, 3);
      }
    }

    const carPos = this.car.getPosition();
    const cx = toMapX(carPos.x);
    const cy = toMapY(carPos.z);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  _loop(now) {
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = clamp(rawDt, 0.001, 0.05);

    const input = this.state === 'play'
      ? this._readInput()
      : { forward: false, backward: false, left: false, right: false, drift: false };

    if (this.state === 'play') {
      this.elapsedTime += dt;
      this.wanted = Math.max(0, (this.wanted || 0) - SURVIVAL.wantedDecay * dt);
    }

    this.car.update(dt, input);
    if (this.state === 'play') {
      this._resolveCollisions(dt);
    }

    const carPos = this.car.getPosition();
    this.world.update(dt, carPos, this.wanted || 0);

    if (this.state === 'play' && typeof FUEL !== 'undefined') {
      const maxFuel = FUEL.max || 100;
      this.fuel = typeof this.fuel === 'number' ? this.fuel : maxFuel;
      const nearStation = this.world && typeof this.world._updateFuelStation === 'function'
        ? this.world._updateFuelStation(dt, carPos)
        : false;
      if (nearStation) {
        this.fuel = clamp(this.fuel + (FUEL.refillRate || 55) * dt, 0, maxFuel);
      } else {
        this.fuel = clamp(this.fuel - (FUEL.drainPerSec || 0.35) * dt, 0, maxFuel);
      }
    }

    const raceReward = this.world && typeof this.world._updateStreetRace === 'function'
      ? this.world._updateStreetRace(dt, carPos)
      : 0;
    if (raceReward > 0) {
      const prevCoins = this.coins || 0;
      this.coins = prevCoins + raceReward;
      this.displayedCoins = this.coins;
      if (this.effects && typeof this.effects.tweenCounter === 'function' && this.coinsEl) {
        this.effects.tweenCounter(this.coinsEl, prevCoins, this.coins, 450);
      }
    }

    const speedFactor = clamp(Math.abs(this.car.speed) / Math.max(1, CAR_CFG.maxSpeed), 0, 1);
    this.effects.update(dt, this.car, speedFactor);

    this._updateCamera(dt);
    this._updateHud();
    this._updateMinimap();
    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(this._loop);
  }
}

export default Game;