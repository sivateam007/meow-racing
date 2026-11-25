import * as THREE from 'three';
import anime from 'animejs';
import { WORLD_CFG, CAR_CFG, COLORS, INPUT, SURVIVAL, FUEL, TRAIN, TAXI, SHOP, clamp } from './config.js';
import Car from './car.js';
import World from './world.js';
import Effects from './effects.js';
import { CityStorage } from './cityStorage.js';

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
    this.profile = CityStorage.get();
    this.coins = this.profile.coins || 0;
    this.level = this.profile.level || 1;
    this.ownedVehicles = (this.profile.ownedVehicles || ['sedan']).slice();
    this.currentVehicle = this.profile.currentVehicle || 'sedan';
    this.controlLayout = this.profile.layout || 'compact';
    this._lastCarPos = null;
    this._distanceAccum = 0;
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
    this._applyLayoutPreset(this.controlLayout || 'compact');
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
      const wasDown = this.keys.has(e.code);
      this.keys.add(e.code);
      if (wasDown) return;
      if (e.code === 'KeyT') {
        this.taxiMode = !this.taxiMode;
        if (!this.taxiMode) {
          this.taxiPassenger = null;
          this.taxiPickupPoint = null;
          if (typeof this._clearFareMarker === 'function') this._clearFareMarker();
          if (this.world) this.world.taxiTarget = null;
        } else if (typeof this._startFare === 'function') {
          this._startFare();
        }
        this._updateHud();
      } else if (e.code === 'KeyB') {
        const panel = document.getElementById('shop-panel-vehicles');
        if (panel) panel.classList.toggle('hidden');
      }
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

    document.querySelectorAll('[data-vehicle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vType = btn.getAttribute('data-vehicle');
        if (!vType) return;
        const freeTypes = ['bike', 'coupe', 'muscle', 'supercar', 'bus', 'sedan', 'taxi', 'police'];
        if (!freeTypes.includes(vType)) return;
        if (!this.ownedVehicles) this.ownedVehicles = ['sedan'];
        let unlocked = false;
        if (!this.ownedVehicles.includes(vType)) {
          this.ownedVehicles.push(vType);
          unlocked = true;
        }
        CityStorage.unlockVehicle(vType);
        this.currentVehicle = vType;
        if (this.car && typeof this.car.setVehicleType === 'function') {
          this.car.setVehicleType(vType);
        }
        if (typeof this._toast === 'function') {
          this._toast(unlocked && vType === 'bike' ? 'BIKE UNLOCKED - PRESS GAS TO RIDE'
            : unlocked ? `${vType.toUpperCase()} UNLOCKED - READY TO DRIVE`
            : `${vType.toUpperCase()} SELECTED`);
        }
        this._updateHud();
      });
    });

    const helpBtn = document.getElementById('help-button');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        const panel = document.getElementById('help-panel');
        if (panel) panel.classList.remove('hidden');
      });
    }

    const settingsBtn = document.getElementById('settings-button');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if (typeof this._openSettings === 'function') this._openSettings();
        const panel = document.getElementById('settings-panel');
        if (panel) panel.classList.remove('hidden');
      });
    }

    const resumeBtn = document.getElementById('resume-button');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        this.paused = false;
        const pOv = document.getElementById('pause-overlay');
        if (pOv) pOv.classList.add('hidden');
      });
    }

    const touchTaxi = document.getElementById('touch-taxi');
    if (touchTaxi) {
      touchTaxi.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.taxiMode = !this.taxiMode;
        if (!this.taxiMode) {
          this.taxiPassenger = null;
          this.taxiPickupPoint = null;
          if (typeof this._clearFareMarker === 'function') this._clearFareMarker();
          if (this.world) this.world.taxiTarget = null;
        } else if (typeof this._startFare === 'function') {
          this._startFare();
        }
        this._updateHud();
      });
    }

    const touchShop = document.getElementById('touch-shop');
    if (touchShop) {
      touchShop.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const shopPanel = document.getElementById('shop-panel-vehicles');
        if (shopPanel) shopPanel.classList.toggle('hidden');
      });
    }

    const touchPause = document.getElementById('touch-pause');
    if (touchPause) {
      touchPause.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.paused = !this.paused;
        const pOv = document.getElementById('pause-overlay');
        if (pOv) pOv.classList.toggle('hidden', !this.paused);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP') {
        this.paused = !this.paused;
        const pOv = document.getElementById('pause-overlay');
        if (pOv) pOv.classList.toggle('hidden', !this.paused);
      }
    });
  }

_applyLayoutPreset(preset = 'compact') {
    const valid = ['compact', 'large', 'left', 'right'];
    const chosen = valid.includes(preset) ? preset : 'compact';
    this.controlLayout = chosen;
    if (document.body) {
      document.body.dataset.layout = chosen;
    }
    CityStorage.setLayout(chosen);
  }

  _openSettings() {
    let saved = this.controlLayout;
    if (!saved) {
      try {
        saved = localStorage.getItem('meow_open_city_layout') || 'compact';
      } catch (_) {
        saved = 'compact';
      }
    }
    this._applyLayoutPreset(saved);
    const panel = document.getElementById('settings-panel');
    if (panel) panel.classList.remove('hidden');

    panel?.querySelectorAll('[data-layout]').forEach((btn) => {
      btn.onclick = () => {
        this._applyLayoutPreset(btn.getAttribute('data-layout'));
      };
    });
  }

  _closeSettings() {
    const panel = document.getElementById('settings-panel');
    if (panel) panel.classList.add('hidden');
  }

  startGame() {
    this.state = 'play';
    this.taxiMode = false;
    this.taxiPassenger = null;
    this.taxiEarnings = 0;
    const profile = CityStorage.get();
    this.coins = profile.coins || 0;
    this.level = profile.level || 1;
    this.ownedVehicles = Array.isArray(profile.ownedVehicles) && profile.ownedVehicles.length
      ? profile.ownedVehicles.slice() : ['sedan'];
    this.currentVehicle = this.ownedVehicles.includes(profile.currentVehicle) ? profile.currentVehicle : 'sedan';
    if (this.car && typeof this.car.setVehicleType === 'function') {
      this.car.setVehicleType(this.currentVehicle);
    }
    this._lastCarPos = null;
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
      this.car.reset(0, 0, 0);
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

_toast(msg, ms = 1800) {
    if (!document.body) return;
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = String(msg || '');
    el.style.opacity = '1';
    if (typeof anime === 'function') {
      anime.remove(el);
      anime({
        targets: el,
        opacity: [0, 1, 1, 0],
        translateY: [-8, 0, 0, -6],
        duration: ms,
        easing: 'easeOutQuad',
        complete: () => {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
      });
    } else {
      setTimeout(() => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, ms);
    }
  }

  _clearFareMarker() {
    if (this.taxiFareMarker) {
      if (this.taxiFareMarker.parent) this.taxiFareMarker.parent.remove(this.taxiFareMarker);
      this.taxiFareMarker = null;
    }
  }

  _startFare() {
    if (!this.taxiMode || !this.world) return;
    this._clearFareMarker();
    this.taxiTarget = null;
    this.taxiPickupPoint = null;
    if (this.world) this.world.taxiTarget = null;

    const pPos = this.car && typeof this.car.getPosition === 'function'
      ? this.car.getPosition() : { x: 0, z: 0 };
    const streets = Array.isArray(this.world.streetCoords) && this.world.streetCoords.length
      ? this.world.streetCoords : [0];
    const min = (typeof TAXI !== 'undefined' && TAXI.fareSpawnMin) || 30;
    const max = (typeof TAXI !== 'undefined' && TAXI.fareSpawnMax) || 70;
    const mid = (min + max) * 0.5;
    let best = null;
    for (let i = 0; i < 30; i++) {
      const sx = streets[Math.floor(Math.random() * streets.length)] || 0;
      const sz = streets[Math.floor(Math.random() * streets.length)] || 0;
      const d = Math.hypot(sx - pPos.x, sz - pPos.z);
      if (!best || Math.abs(d - mid) < Math.abs(Math.hypot(best.x - pPos.x, best.z - pPos.z) - mid)) {
        best = { x: sx, z: sz };
      }
      if (d >= min && d <= max) { best = { x: sx, z: sz }; break; }
    }
    if (!best) best = { x: pPos.x + min, z: pPos.z + min };
    this.taxiPickupPoint = best;

    try {
      const marker = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.2, 3.0, 24),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      marker.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.7, 9, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.28, depthWrite: false })
      );
      beam.position.y = 4.5;
      marker.add(beam);
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1.1, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })
      );
      body.position.y = 1.5;
      marker.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xfef3c7 })
      );
      head.position.y = 2.6;
      marker.add(head);
      marker.position.set(best.x, 0, best.z);
      const parent = this.world.scene || this.world.cityGroup;
      if (parent) parent.add(marker);
      this.taxiFareMarker = marker;
    } catch (_) {}

    if (typeof this._toast === 'function') this._toast('NEW FARE - FOLLOW THE MAP MARKER', 2200);
    this._updateHud();
  }

  _endFare(farePaid = 0) {
    this.taxiPassenger = null;
    this.taxiTarget = null;
    this.taxiPickupPoint = null;
    if (this.world) this.world.taxiTarget = null;
    this._clearFareMarker();
    if (farePaid > 0) {
      const p = CityStorage.addFare(farePaid);
      this.coins = p.coins;
      this.level = p.level;
      if (typeof this._toast === 'function') {
        this._toast(`FARE PAID $${Math.round(farePaid)} • LV ${p.level}`, 2000);
      }
    }
    if (this.taxiMode) this._startFare();
    this._updateHud();
  }

  _pickupHint(playerPos = { x: 0, z: 0 }) {
    if (!this.taxiMode) return 'EARN COINS VIA TAXI/RACE • OPEN SHOP - ALL VEHICLES FREE';
    if (this.taxiPassenger && this.taxiTarget) {
      const dist = Math.round(Math.hypot((playerPos.x || 0) - this.taxiTarget.x, (playerPos.z || 0) - this.taxiTarget.z));
      return `FARE TO MARKER (${dist}m)`;
    }
    if (this.taxiPickupPoint) {
      const dist = Math.round(Math.hypot((playerPos.x || 0) - this.taxiPickupPoint.x, (playerPos.z || 0) - this.taxiPickupPoint.z));
      return `PICK UP PASSENGER (${dist}m) - FOLLOW YELLOW ROUTE`;
    }
    const radius = (typeof TAXI !== 'undefined' && TAXI.pickupRadius) || 8;
    const peds = this.world && Array.isArray(this.world.pedPool) ? this.world.pedPool : [];
    for (let i = 0; i < peds.length; i++) {
      const ped = peds[i];
      if (!ped || !ped.root || !ped.root.position) continue;
      const d = Math.hypot((playerPos.x || 0) - ped.root.position.x, (playerPos.z || 0) - ped.root.position.z);
      if (d <= radius * 1.4) {
        return 'PICKUP AVAILABLE — STOP NEAR PEDESTRIAN';
      }
    }
    return 'DRIVE NEAR A PEDESTRIAN TO PICK UP';
  }

  _updateHud() {
    const coinsEl = document.getElementById('hud-coins');
    if (coinsEl) {
      coinsEl.textContent = String(Math.floor(this.coins ?? 0));
    }

    const levelEl = document.getElementById('hud-level');
    if (levelEl) levelEl.textContent = `LV ${Math.max(1, Math.floor(this.level || 1))}`;

    const timeEl = document.getElementById('hud-time');
    if (timeEl) {
      const totalSec = Math.max(0, Math.floor(this.elapsedTime ?? this.time ?? 0));
      const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const secs = String(totalSec % 60).padStart(2, '0');
      timeEl.textContent = `${mins}:${secs}`;
    }

    const speedEl = document.getElementById('hud-speed-big');
    if (speedEl && this.car) {
      const kmh = Math.round(Math.abs(this.car.speed ?? 0) * 3.6);
      speedEl.textContent = String(kmh);
    }

    const comboEl = document.getElementById('hud-combo');
    if (comboEl) {
      const combo = this.combo ?? 0;
      comboEl.textContent = combo > 1 ? `${combo}X` : '';
    }

    const hpFill = document.getElementById('hud-health-fill');
    if (hpFill) {
      const maxHp = (typeof SURVIVAL !== 'undefined' && SURVIVAL.maxHealth) || 100;
      const curHp = typeof this.health === 'number' ? this.health : maxHp;
      hpFill.style.width = `${clamp((curHp / maxHp) * 100, 0, 100)}%`;
    }

    const wantedEl = document.getElementById('hud-wanted');
    if (wantedEl) {
      const maxStars = (typeof SURVIVAL !== 'undefined' && SURVIVAL.wantedMax) || 5;
      const stars = clamp(Math.round(this.wanted ?? 0), 0, maxStars);
      wantedEl.textContent = '★'.repeat(stars) + '☆'.repeat(maxStars - stars);
    }

    const fuelEl = document.getElementById('hud-fuel');
    if (fuelEl) {
      const maxFuel = (typeof FUEL !== 'undefined' && FUEL.max) || 100;
      const curFuel = typeof this.fuel === 'number' ? this.fuel : maxFuel;
      fuelEl.textContent = `${Math.ceil((curFuel / maxFuel) * 100)}%`;
    }

    const taxiEl = document.getElementById('hud-taxi');
    if (taxiEl) {
      const earned = Math.floor(this.taxiEarnings ?? 0);
      if (!this.taxiMode) {
        taxiEl.textContent = earned > 0 ? `TAXI: OFF ($${earned})` : 'TAXI: OFF';
        taxiEl.classList.remove('active');
      } else {
        taxiEl.textContent = this.taxiPassenger
          ? `TAXI: FARE • $${earned}`
          : `TAXI: ON • $${earned}`;
        taxiEl.classList.add('active');
      }
    }

    const missionEl = document.getElementById('hud-mission');
    if (missionEl) {
      const pPos = this.car && typeof this.car.getPosition === 'function'
        ? this.car.getPosition()
        : { x: 0, z: 0 };

      if (this.taxiMode) {
        if (this.taxiPassenger && this.taxiTarget) {
          const dist = Math.round(Math.hypot(pPos.x - this.taxiTarget.x, pPos.z - this.taxiTarget.z));
          const origin = this.taxiPickupPos || pPos;
          const tripDist = Math.hypot(this.taxiTarget.x - origin.x, this.taxiTarget.z - origin.z);
          const base = (typeof TAXI !== 'undefined' && TAXI.fareBase) || 35;
          const perM = (typeof TAXI !== 'undefined' && TAXI.farePerMeter) || 0.5;
          const estFare = Math.round(base + tripDist * perM);
          const etaSec = Math.max(1, Math.round(dist / 16));
          missionEl.textContent = `DRIVE TO MARKER (${dist}m • ~${etaSec}s) - FARE $${estFare}`;
        } else if (typeof this._pickupHint === 'function') {
          missionEl.textContent = this._pickupHint(pPos);
        } else {
          missionEl.textContent = 'DRIVE NEAR A PEDESTRIAN TO PICK UP';
        }
      } else if (this.world && this.world.raceActive) {
        const cpTotal = (this.world.raceCheckpoints && this.world.raceCheckpoints.length) || 3;
        const cpNum = Math.min((this.world.raceIndex ?? 0) + 1, cpTotal);
        const rem = Math.max(0, Math.ceil(this.world.raceTime ?? 0));
        missionEl.textContent = `RACE CP ${cpNum}/${cpTotal} • ${rem}s LEFT`;
      } else {
        missionEl.textContent = 'EARN COINS VIA TAXI/RACE • OPEN SHOP - ALL VEHICLES FREE';
      }
    }
  }

  _updateMinimap() {
    if (!this.minimapCanvas || !this.minimapCtx || !this.world) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const range = 170;
    const carPos = this.car.getPosition();
    const t = this.world.time || 0;
    const toX = (wx) => cx + ((wx - carPos.x) / (range * 2)) * w;
    const toY = (wz) => cy + ((wz - carPos.z) / (range * 2)) * h;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(cx, cy) - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(10, 16, 32, 0.94)';
    ctx.fillRect(0, 0, w, h);

    const streets = this.world.streetCoords || [];
    const roadPx = Math.max(2, (WORLD_CFG.roadWidth / (range * 2)) * w);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
    for (const s of streets) {
      const sx = toX(s) - roadPx * 0.5;
      const sy = toY(s) - roadPx * 0.5;
      if (sx < w && sx + roadPx > 0) ctx.fillRect(sx, 0, roadPx, h);
      if (sy < h && sy + roadPx > 0) ctx.fillRect(0, sy, w, roadPx);
    }

    const stations = (this.world.fuelStations && this.world.fuelStations.length)
      ? this.world.fuelStations
      : (this.world.fuelStation ? [this.world.fuelStation] : []);
    for (const st of stations) {
      const fx = toX(st.x);
      const fy = toY(st.z);
      if (fx < -6 || fx > w + 6 || fy < -6 || fy > h + 6) continue;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(fx - 3, fy - 3, 6, 6);
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(fx - 5, fy - 5, 10, 10);
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText('F', fx - 2, fy - 7);
    }

    let obj = null;
    let color = '#facc15';
    let label = 'P';
    if (this.taxiMode) {
      if (this.taxiTarget) { obj = this.taxiTarget; color = '#4ade80'; label = 'D'; }
      else if (this.taxiPickupPoint) { obj = this.taxiPickupPoint; color = '#facc15'; label = 'P'; }
    } else if (this.world.raceActive && Array.isArray(this.world.raceCheckpoints)) {
      const cp = this.world.raceCheckpoints[this.world.raceIndex || 0];
      if (cp) { obj = cp; color = '#f472b6'; label = 'R'; }
    }

    if (obj) {
      const ox = toX(obj.x || 0);
      const oy = toY(obj.z || 0);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -t * 14;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ox, cy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.restore();

      const pulse = 5 + Math.sin(t * 5) * 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(ox, oy, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(label, ox + 6, oy - 5);
    }

    if (this.world.trafficPool) {
      ctx.fillStyle = '#facc15';
      for (const agent of this.world.trafficPool) {
        const p = agent && agent.group && agent.group.position;
        if (!p) continue;
        ctx.fillRect(toX(p.x) - 1.5, toY(p.z) - 1.5, 3, 3);
      }
    }

    ctx.save();
    ctx.translate(cx, cy);
    const heading = typeof this.car.getHeading === 'function' ? this.car.getHeading() : 0;
    ctx.rotate(-heading);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(cx, cy) - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('N', cx - 3, 12);
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

    if (this.state === 'play') {
      if (this._lastCarPos) {
        const moved = Math.hypot(carPos.x - this._lastCarPos.x, carPos.z - this._lastCarPos.z);
        if (moved > 0.01 && moved < 6) this._distanceAccum += moved;
      }
      this._lastCarPos = { x: carPos.x, z: carPos.z };
      if (this._distanceAccum >= 60) {
        const p = CityStorage.addDistance(this._distanceAccum);
        this.level = p.level;
        this._distanceAccum = 0;
      }
    }

    if (this.state === 'play' && this.taxiMode && typeof TAXI !== 'undefined') {
      const pPos = this.car.getPosition();

      if (this.taxiFareMarker) {
        this.taxiFareMarker.position.y = Math.sin((this.world ? this.world.time : 0) * 3) * 0.28;
        this.taxiFareMarker.rotation.y += dt * 0.8;
      }

      if (!this.taxiPassenger && !this.taxiPickupPoint) {
        if (typeof this._startFare === 'function') this._startFare();
      } else if (!this.taxiPassenger && this.taxiPickupPoint) {
        const d = Math.hypot(pPos.x - this.taxiPickupPoint.x, pPos.z - this.taxiPickupPoint.z);
        if (d <= ((typeof TAXI !== 'undefined' && TAXI.pickupMarkerRadius) || 8)) {
          let ped = null;
          const peds = this.world && Array.isArray(this.world.pedPool) ? this.world.pedPool : [];
          let bestD = Infinity;
          for (let i = 0; i < peds.length; i++) {
            const p = peds[i];
            if (!p || !p.root || !p.root.position) continue;
            const pd = Math.hypot(pPos.x - p.root.position.x, pPos.z - p.root.position.z);
            if (pd < bestD) { bestD = pd; ped = p; }
          }
          this.taxiPassenger = ped || { root: { position: { x: this.taxiPickupPoint.x, z: this.taxiPickupPoint.z } } };
          const streets = this.world && Array.isArray(this.world.streetCoords) && this.world.streetCoords.length
            ? this.world.streetCoords : [0];
          let tx = pPos.x + 90;
          let tz = pPos.z + 90;
          let bestTrip = Infinity;
          for (let k = 0; k < 30; k++) {
            const cx = streets[Math.floor(Math.random() * streets.length)] || 0;
            const cz = streets[Math.floor(Math.random() * streets.length)] || 0;
            const d = Math.hypot(cx - pPos.x, cz - pPos.z);
            if (d > 45 && d < 200) { tx = cx; tz = cz; break; }
            if (Math.abs(d - 120) < bestTrip) { bestTrip = Math.abs(d - 120); tx = cx; tz = cz; }
          }
          this.taxiPickupPos = { x: this.taxiPickupPoint.x, z: this.taxiPickupPoint.z };
          this.taxiTarget = { x: tx, z: tz };
          if (this.world) this.world.taxiTarget = this.taxiTarget;
          this.taxiPickupPoint = null;
          this._clearFareMarker();
          if (typeof this._toast === 'function') this._toast('PICKED UP - DRIVE TO GREEN MARKER', 1800);
          this._updateHud();
        }
      } else if (this.taxiPassenger && this.taxiTarget) {
        const dDrop = Math.hypot(pPos.x - this.taxiTarget.x, pPos.z - this.taxiTarget.z);
        if (dDrop <= (TAXI.dropoffRadius || 10)) {
          const tripDist = Math.hypot(
            this.taxiTarget.x - (this.taxiPickupPos ? this.taxiPickupPos.x : pPos.x),
            this.taxiTarget.z - (this.taxiPickupPos ? this.taxiPickupPos.z : pPos.z)
          );
          const fare = Math.round((TAXI.fareBase || 35) + tripDist * (TAXI.farePerMeter || 0.5));
          this.taxiEarnings = (this.taxiEarnings || 0) + fare;
          if (typeof this._endFare === 'function') this._endFare(fare);
          else {
            this.taxiPassenger = null;
            this.taxiTarget = null;
            if (this.world) this.world.taxiTarget = null;
          }
          this._updateHud();
        }
      }
    }

    if (this.state === 'play' && typeof FUEL !== 'undefined') {
      const maxFuel = FUEL.max || 100;
      this.fuel = typeof this.fuel === 'number' ? this.fuel : maxFuel;
      const nearStation = this.world && typeof this.world._updateFuelStation === 'function'
        ? this.world._updateFuelStation(dt, carPos)
        : false;
      if (nearStation) {
        this.fuel = clamp(this.fuel + (FUEL.refillRate || 55) * dt, 0, maxFuel);
      } else if (Math.abs((this.car && this.car.speed) || 0) > 0.5) {
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