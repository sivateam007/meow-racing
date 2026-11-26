import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import anime from 'animejs';
import { WORLD_CFG, CAR_CFG, SPEED_LEVELS, COLORS, INPUT, SURVIVAL, FUEL, PIZZA, TRAIN, TAXI, SHOP, VEHICLE_TYPES, MISSION_LIST, LEVEL_TITLES, clamp } from './config.js';
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
    this.speedLevel = this.profile.speedLevel ?? 1;
    this.faresCompleted = this.profile.faresCompleted || 0;
    this.activeMission = null;
    this.rideMode = null;
    this.rideVehicle = null;
    this.planeRide = null;
    this.health = SURVIVAL.maxHealth;
    this._lastCrashTime = -999;
    this._lastCarPos = null;
    this._distanceAccum = 0;
    this.collisionCooldown = 0;

    this.keys = new Set();
    this.touchInput = {
      left: false,
      right: false,
      gas: false,
      brake: false,
      nos: false,
    };

    this._initScene();
    this.car = new Car(this.scene);
    if (typeof this.car.setSpeedLevel === 'function') this.car.setSpeedLevel(this.speedLevel);
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

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.4, 900);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;

    this.composer = null;
    this._bloomPass = null;
    try {
      const res = new THREE.Vector2(Math.max(1, width * 0.5), Math.max(1, height * 0.5));
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      composer.setSize(width, height);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloomPass = new UnrealBloomPass(res, 0.35, 0.4, 0.85);
      composer.addPass(bloomPass);
      this.composer = composer;
      this._bloomPass = bloomPass;
    } catch (_e) {
      this.composer = null;
      this._bloomPass = null;
    }

    if ('useLegacyLights' in this.renderer) {
      this.renderer.useLegacyLights = false;
    }

    if (!this.canvas && this.renderer.domElement) {
      document.body.appendChild(this.renderer.domElement);
    }

    this.hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x64748b, 1.25);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.65);
    this.sunLight.position.set(60, 95, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 260;
    const d = 90;
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
      ...(INPUT.nos || [])
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
      this.touchInput.nos = false;
    });

    const touchMap = [
      { id: 'touch-left', key: 'left' },
      { id: 'touch-right', key: 'right' },
      { id: 'touch-gas', key: 'gas' },
      { id: 'touch-brake', key: 'brake' },
      { id: 'touch-nos', key: 'nos' }
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
        const freeTypes = typeof VEHICLE_TYPES !== 'undefined' ? Object.keys(VEHICLE_TYPES) : [];
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
        const savedColor = CityStorage.get().vehicleColors[vType];
        if (typeof savedColor === 'number' && this.car && typeof this.car.setBodyColor === 'function') {
          this.car.setBodyColor(savedColor);
        }
        if (typeof this._toast === 'function') {
          this._toast(unlocked && vType === 'bike' ? 'BIKE UNLOCKED - PRESS GAS TO RIDE'
            : unlocked ? `${vType.toUpperCase()} UNLOCKED - READY TO DRIVE`
            : `${vType.toUpperCase()} SELECTED`);
        }
        this._updateHud();
      });
    });

    document.querySelectorAll('#shop-panel-vehicles [data-category]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = tabBtn.getAttribute('data-category') || 'all';
        document.querySelectorAll('#shop-panel-vehicles [data-category]').forEach((b) => {
          b.classList.toggle('active', b === tabBtn);
        });
        document.querySelectorAll('#shop-panel-vehicles [data-vehicle]').forEach((vBtn) => {
          const vCat = vBtn.getAttribute('data-category') || '';
          const show = cat === 'all' || vCat === cat;
          vBtn.style.display = show ? '' : 'none';
        });
      });
    });

    document.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hex = Number(btn.getAttribute('data-color'));
        if (!Number.isFinite(hex)) return;
        if (this.car && typeof this.car.setBodyColor === 'function') this.car.setBodyColor(hex);
        CityStorage.setVehicleColor(this.currentVehicle, hex);
        document.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('active', b === btn));
        this._toast('COLOUR APPLIED', 1400);
      });
    });



    const missionBtn = document.getElementById('touch-missions');
    if (missionBtn) {
      missionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof this._openMissions === 'function') this._openMissions();
      });
    }
    const deliveryBtn = document.getElementById('touch-delivery');
    if (deliveryBtn) {
      deliveryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.deliveryMode && this.deliveryMode.active) {
          if (typeof this._stopContinuousDelivery === 'function') this._stopContinuousDelivery();
          if (typeof this._toast === 'function') this._toast('DELIVERY MODE OFF', 1500);
        } else {
          if (typeof this._startContinuousDelivery === 'function') this._startContinuousDelivery();
          if (typeof this._toast === 'function') this._toast('DELIVERY MODE ON', 1500);
        }
        this._updateHud();
      });
    }

    const missionCloseBtn = document.getElementById('mission-close-button');
    if (missionCloseBtn) {
      missionCloseBtn.addEventListener('click', () => {
        const panel = document.getElementById('mission-panel');
        if (panel) panel.classList.add('hidden');
      });
    }

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

    const shopClose = document.getElementById('shop-close');
    if (shopClose) {
      shopClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const shopPanel = document.getElementById('shop-panel-vehicles');
        if (shopPanel) shopPanel.classList.add('hidden');
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

    const touchSpeed = document.getElementById('touch-speed');
    if (touchSpeed) {
      touchSpeed.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.speedLevel = ((this.speedLevel || 0) + 1) % SPEED_LEVELS.length;
        if (this.car && typeof this.car.setSpeedLevel === 'function') {
          this.car.setSpeedLevel(this.speedLevel);
        }
        CityStorage.save({ speedLevel: this.speedLevel });
        this._updateHud();
        if (typeof this._toast === 'function') {
          this._toast(`SPEED ${SPEED_LEVELS[this.speedLevel].label}`, 1400);
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP') {
        this.paused = !this.paused;
        const pOv = document.getElementById('pause-overlay');
        if (pOv) pOv.classList.toggle('hidden', !this.paused);
      }
      if (e.code === 'KeyV') {
        const btn = document.getElementById('touch-speed');
        if (btn) btn.click();
      }
      if (e.code === 'KeyE') {
        this._tryRide();
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
    this.faresCompleted = profile.faresCompleted || 0;
    this.activeMission = null;
    this.rideMode = null;
    this.rideVehicle = null;
    this.planeRide = null;
    this._clearPizzaMarker();
    this.pizzaJob = null;
    if (this.rideMode) this.car.group.visible = true;
    this.rideMode = null;
    this.rideVehicle = null;
    this.planeRide = null;
    this.ownedVehicles = Array.isArray(profile.ownedVehicles) && profile.ownedVehicles.length
      ? profile.ownedVehicles.slice() : ['sedan'];
    this.currentVehicle = this.ownedVehicles.includes(profile.currentVehicle) ? profile.currentVehicle : 'sedan';
    this.speedLevel = typeof profile.speedLevel === 'number' ? profile.speedLevel : this.speedLevel;
    if (this.car && typeof this.car.setSpeedLevel === 'function') {
      this.car.setSpeedLevel(this.speedLevel);
    }
    if (this.car && typeof this.car.setVehicleType === 'function') {
      this.car.setVehicleType(this.currentVehicle);
    }
    const startColor = profile.vehicleColors && profile.vehicleColors[this.currentVehicle];
    if (typeof startColor === 'number' && this.car && typeof this.car.setBodyColor === 'function') {
      this.car.setBodyColor(startColor);
    }
    this.health = SURVIVAL.maxHealth;
    this._lastCarPos = null;
    if (typeof FUEL !== 'undefined') this.fuel = FUEL.startAmount ?? FUEL.max ?? 100;
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
    const nos = hasCode(INPUT.nos) || this.touchInput.nos;

    return {
      forward,
      backward,
      left,
      right,
      nos
    };
  }

  _resolveCollisions(dt) {
    if (this.collisionCooldown > 0) {
      this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    }

    const pos = this.car.getPosition();
    const radius = CAR_CFG.collisionRadius || 2.1;

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
    this._lastCrashTime = this.elapsedTime || 0;
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
      this.faresCompleted = p.faresCompleted;
      if (typeof this._toast === 'function') {
        this._toast(`FARE PAID $${Math.round(farePaid)} • LV ${p.level}`, 2000);
      }
    }
    if (this.taxiMode) this._startFare();
    this._updateHud();
  }

  _pickupHint(playerPos = { x: 0, z: 0 }) {
    if (!this.taxiMode) return 'EARN COINS VIA TAXI • JOBS • OPEN SHOP - ALL VEHICLES FREE';
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

_clearMissionMarker() {
    if (this.activeMission && this.activeMission.marker && this.world && this.world.scene) {
      this.world.scene.remove(this.activeMission.marker);
      this.activeMission.marker = null;
    }
  }

  _createMissionRing(x, z, colorHex = 0x22d3ee) {
    if (!this.world || !this.world.scene || typeof THREE === 'undefined') return null;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.5, 2.2, 22, 1, true),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    mesh.position.set(x, 1.1, z);
    this.world.scene.add(mesh);
    return mesh;
  }

  _pickMissionStreetPoint(playerPos, minDist = 60) {
    const streets = this.world && Array.isArray(this.world.streetCoords) && this.world.streetCoords.length > 0
      ? this.world.streetCoords
      : [0];
    const px = (playerPos && playerPos.x) || 0;
    const pz = (playerPos && playerPos.z) || 0;
    let best = {
      x: streets[Math.floor(Math.random() * streets.length)] || 0,
      z: streets[Math.floor(Math.random() * streets.length)] || 0
    };
    for (let attempt = 0; attempt < 8; attempt++) {
      const cx = streets[Math.floor(Math.random() * streets.length)] || 0;
      const cz = streets[Math.floor(Math.random() * streets.length)] || 0;
      best = { x: cx, z: cz };
      if (Math.hypot(cx - px, cz - pz) >= minDist) break;
    }
    return best;
  }

  _openMissions() {
    const panel = document.getElementById('mission-panel');
    const listEl = document.getElementById('mission-list');
    const lvlEl = document.getElementById('mission-level');
    if (!panel || !listEl) return;

    const prof = typeof CityStorage !== 'undefined' && CityStorage.get ? CityStorage.get() : (this.profile || {});
    const curLevel = prof.level || this.level || 1;
    const completedIds = Array.isArray(prof.missionsCompleted) ? prof.missionsCompleted : [];
    const titles = typeof LEVEL_TITLES !== 'undefined' ? LEVEL_TITLES : [];
    const title = titles[Math.min(titles.length - 1, Math.max(0, curLevel - 1))] || 'Driver';

    if (lvlEl) {
      lvlEl.textContent = `LEVEL ${curLevel} — ${title.toUpperCase()}`;
    }

    const missions = typeof MISSION_LIST !== 'undefined' ? MISSION_LIST : [];
    listEl.innerHTML = '';

    for (let i = 0; i < missions.length; i++) {
      const m = missions[i];
      const unlocked = curLevel >= (m.minLevel || 1);
      const isDone = completedIds.includes(m.id);
      const payout = isDone ? Math.max(40, Math.round((m.reward || 100) * 0.45)) : (m.reward || 100);

      const row = document.createElement('div');
      row.className = `mission-item${unlocked ? '' : ' locked'}`;

      const info = document.createElement('div');
      info.innerHTML = `<strong>${m.name}</strong> <small>(LV ${m.minLevel || 1})</small><div>${m.description} +${payout} / +${m.xp || 50}XP</div>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !unlocked;
      btn.textContent = !unlocked ? `LV ${m.minLevel}` : (isDone ? 'REPLAY' : 'START');
      btn.addEventListener('click', () => {
        this._startMission(m.id);
        panel.classList.add('hidden');
      });

      row.appendChild(info);
      row.appendChild(btn);
      listEl.appendChild(row);
    }

    panel.classList.remove('hidden');
  }

  _clearPizzaMarker() {
    if (this.pizzaJob && this.pizzaJob.marker) {
      if (this.pizzaJob.marker.parent) this.pizzaJob.marker.parent.remove(this.pizzaJob.marker);
      this.pizzaJob.marker = null;
    }
  }

  _makePizzaMarker(x, z, colorHex) {
    try {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.2, 4.6, 24),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI * 0.5;
      ring.position.y = 0.08;
      g.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 1.5, 8, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.28, depthWrite: false })
      );
      beam.position.y = 4;
      g.add(beam);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.2, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, emissiveIntensity: 0.5 })
      );
      box.position.y = 2.2;
      g.add(box);
      g.position.set(x, 0, z);
      if (this.world && this.world.scene) this.world.scene.add(g);
      return g;
    } catch (_) {
      return null;
    }
  }

  _setPizzaTarget(x, z, phase) {
    this._clearPizzaMarker();
    this.pizzaJob.target = { x, z };
    this.pizzaJob.marker = this._makePizzaMarker(x, z, phase === 'pickup' ? 0xfacc15 : 0x4ade80);
  }

  _randomDeliveryPoint(center, forceOutside = false) {
    const p = center || { x: 0, z: 0 };
    const streets = this.world && Array.isArray(this.world.streetCoords) && this.world.streetCoords.length
      ? this.world.streetCoords : [0];
    const half = WORLD_CFG.halfSpan || 300;
    if (forceOutside || Math.random() < 0.6) {
      const d = 150 + Math.random() * 220;
      const a = Math.random() * Math.PI * 2;
      let x = p.x + Math.cos(a) * d;
      let z = p.z + Math.sin(a) * d;
      if (Math.abs(x) < half + 50 && Math.abs(z) < half + 50) {
        const out = half + 70 + Math.random() * 90;
        if (Math.abs(x) > Math.abs(z)) x = (x < 0 ? -1 : 1) * out;
        else z = (z < 0 ? -1 : 1) * out;
      }
      return { x: Math.round(x), z: Math.round(z), outside: true };
    }
    let best = { x: streets[0] || 0, z: streets[0] || 0 };
    let bestD = -1;
    for (let i = 0; i < 24; i++) {
      const sx = streets[Math.floor(Math.random() * streets.length)] || 0;
      const sz = streets[Math.floor(Math.random() * streets.length)] || 0;
      const dd = Math.hypot(sx - p.x, sz - p.z);
      if (dd > bestD && dd < 220) { bestD = dd; best = { x: sx, z: sz }; }
    }
    return best;
  }

  _startPizzaJob(def) {
    if (!this.world) return false;
    const shops = this.world.pizzaShops || [];
    if (!shops.length) return false;
    const p = this.car.getPosition();
    let shop = shops[0];
    let best = Infinity;
    for (const s of shops) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < best) { best = d; shop = s; }
    }
    this.pizzaJob = {
      def, done: 0, orders: def.orders || 1,
      timeLeft: def.orderTime || PIZZA.orderTime || 40,
      tips: 0, phase: 'pickup', target: null, marker: null,
      active: true, finished: false, success: false
    };
    this._setPizzaTarget(shop.x, shop.z, 'pickup');
    this._toast('PIZZA JOB - PICK UP AT RESTAURANT', 2200);
    return true;
  }

  _pizzaText(pos = null) {
    const j = this.pizzaJob;
    if (!j || !j.active) return '';
    let dist = '';
    if (pos && j.target) {
      dist = ` • ${Math.round(Math.hypot(pos.x - j.target.x, pos.z - j.target.z))}m`;
    }
    return `${j.phase === 'pickup' ? 'PICKUP' : 'DELIVER'} ${j.done}/${j.orders}${dist} • ${Math.max(0, Math.ceil(j.timeLeft))}s • TIP $${j.tips}`;
  }

  _updatePizzaJob(dt, carPos) {
    const j = this.pizzaJob;
    if (!j || !j.active || j.finished) return;
    const safeDt = Math.min(dt, 0.05);
    j.timeLeft -= safeDt;
    if (j.timeLeft <= 0) { this._endPizzaJob(false); return; }
    if (j.marker) j.marker.rotation.y += safeDt * 1.5;

    const t = j.target;
    if (!t) return;
    const radius = j.phase === 'pickup' ? (PIZZA.pickupRadius || 12) : (PIZZA.deliverRadius || 12);
    if (Math.hypot(carPos.x - t.x, carPos.z - t.z) > radius) return;

    if (j.phase === 'pickup') {
      j.phase = 'deliver';
      const drop = this._randomDeliveryPoint(carPos);
      this._setPizzaTarget(drop.x, drop.z, 'deliver');
      this._toast(drop.outside ? 'OUT-OF-TOWN ORDER - DELIVER HOT' : 'PIZZA PICKED UP - DELIVER HOT', 1800);
    } else {
      const tip = Math.max(PIZZA.minTip || 3, Math.floor(j.timeLeft * (PIZZA.tipPerSecond || 0.8)));
      j.tips += tip;
      j.done += 1;
      if (j.done >= j.orders) { this._endPizzaJob(true); return; }
      j.phase = 'pickup';
      j.timeLeft = j.def.orderTime || PIZZA.orderTime || 40;
      const shops = this.world.pizzaShops || [];
      let shop = shops[0];
      let best = Infinity;
      for (const s of shops) {
        const d = Math.hypot(s.x - carPos.x, s.z - carPos.z);
        if (d < best) { best = d; shop = s; }
      }
      if (shop) this._setPizzaTarget(shop.x, shop.z, 'pickup');
      this._toast(`ORDER DELIVERED +$${tip} TIP - NEXT PICKUP`, 1800);
    }
  }

  _endPizzaJob(success) {
    const j = this.pizzaJob;
    if (!j || !j.active) return;
    j.active = false;
    j.finished = true;
    j.success = success;
    this._clearPizzaMarker();
    if (success) {
      const prof = CityStorage.get();
      CityStorage.save({
        deliveriesCompleted: (prof.deliveriesCompleted || 0) + j.done,
        bestPizzaRun: prof.bestPizzaRun ? Math.max(prof.bestPizzaRun, j.tips) : j.tips
      });
      CityStorage.addCoins(j.tips);
      if (this.activeMission) this.activeMission.progress = this.activeMission.target;
      this._toast(`ALL PIZZAS DELIVERED +$${j.tips} TIPS`, 2400);
    } else {
      if (this.activeMission) this.activeMission.failed = true;
      this._toast('PIZZA COLD - JOB FAILED', 2000);
    }
  }

  _tryRide() {
    if (this.rideMode) { this._exitRide(); return; }
    const w = this.world;
    if (!w) return;
    const p = this.car.getPosition();
    let best = null;
    let bestD = Infinity;
    let kind = null;
    for (const tc of (w.trainCars || [])) {
      const q = tc.group.position;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 10 && d < bestD) { bestD = d; best = tc.group; kind = 'train'; }
    }
    for (const pl of (w.planes || [])) {
      const q = pl.group.position;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 12 && d < bestD) { bestD = d; best = pl.group; kind = 'plane'; }
    }
    if (!best) { this._toast('NO TRAIN OR PLANE NEARBY', 1800); return; }
    this.rideMode = kind;
    this.rideVehicle = best;
    this.car.group.visible = false;
    if (kind === 'plane') {
      this.planeRide = { speed: 0, heading: best.rotation.y || 0, alt: best.position.y };
    }
    this._toast(kind === 'train' ? 'RIDING TRAIN - RIDE AGAIN TO EXIT' : 'RIDING PLANE - RIDE AGAIN TO EXIT', 2200);
  }

  _exitRide() {
    if (!this.rideMode) return;
    const pos = this.rideVehicle ? this.rideVehicle.position : this.car.getPosition();
    this.car.group.position.set(pos.x, 0, pos.z);
    this.car.group.visible = true;
    this.car.speed = 0;
    this.rideMode = null;
    this.rideVehicle = null;
    this.planeRide = null;
    this._toast('LEFT VEHICLE', 1600);
  }

  _updateRide(dt, input) {
    if (!this.rideMode || !this.rideVehicle) return;
    const v = this.rideVehicle;
    if (this.rideMode === 'train') {
      this.car.group.position.set(v.position.x, 0, v.position.z);
      this.car.heading = 0;
      return;
    }
    const r = this.planeRide;
    if (!r) return;
    const safe = Math.min(dt, 0.05);
    if (input.forward) r.speed = Math.min(48, r.speed + 18 * safe);
    else if (input.backward) r.speed = Math.max(0, r.speed - 20 * safe);
    else r.speed = Math.max(0, r.speed - 4 * safe);
    if (input.left) r.heading += 0.7 * safe;
    if (input.right) r.heading -= 0.7 * safe;
    const targetAlt = r.speed > 16 ? Math.min(90, 1.15 + (r.speed - 16) * 2.2) : 1.15;
    r.alt += (targetAlt - r.alt) * Math.min(1, safe * 0.8);
    v.position.x += -Math.sin(r.heading) * r.speed * safe;
    v.position.z += -Math.cos(r.heading) * r.speed * safe;
    v.position.y = r.alt;
    v.rotation.y = r.heading;
    v.rotation.x = Math.max(-0.25, Math.min(0.25, (targetAlt - r.alt) * 0.02));
    this.car.group.position.set(v.position.x, 0, v.position.z);
  }

_clearContinuousMarker() {
    if (this.deliveryMode && this.deliveryMode.marker && this.world && this.world.scene) {
      this.world.scene.remove(this.deliveryMode.marker);
      this.deliveryMode.marker = null;
    }
  }

  _startContinuousDelivery() {
    if (this.deliveryMode && this.deliveryMode.active) {
      this._stopContinuousDelivery();
    }
    const pPos = this.car && typeof this.car.getPosition === 'function'
      ? this.car.getPosition()
      : { x: 0, z: 0 };

    const shops = this.world && Array.isArray(this.world.pizzaShops) && this.world.pizzaShops.length > 0
      ? this.world.pizzaShops
      : [];

    let shopPt = { x: 0, z: 0 };
    if (shops.length > 0) {
      let best = shops[0];
      let bestD = Math.hypot((pPos.x || 0) - (best.x || 0), (pPos.z || 0) - (best.z || 0));
      for (let i = 1; i < shops.length; i++) {
        const s = shops[i];
        if (!s) continue;
        const d = Math.hypot((pPos.x || 0) - (s.x || 0), (pPos.z || 0) - (s.z || 0));
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      shopPt = { x: best.x || 0, z: best.z || 0 };
    } else if (typeof this._randomDeliveryPoint === 'function') {
      shopPt = this._randomDeliveryPoint(pPos, false);
    }

    const marker = typeof this._makePizzaMarker === 'function'
      ? this._makePizzaMarker(shopPt.x, shopPt.z, 0xfacc15)
      : null;

    this.deliveryMode = {
      active: true,
      delivered: 0,
      earned: 0,
      phase: 'pickup',
      target: shopPt,
      marker,
      timeLeft: 75
    };
  }

  _stopContinuousDelivery() {
    this._clearContinuousMarker();
    this.deliveryMode = {
      active: false,
      delivered: 0,
      earned: 0,
      phase: 'idle',
      target: null,
      marker: null,
      timeLeft: 0
    };
  }

  _updateContinuousDelivery(dt, carPos = { x: 0, z: 0 }) {
    const dm = this.deliveryMode;
    if (!dm || !dm.active || this.state !== 'play' || this.paused) return;

    const safeDt = Math.min(dt, 0.05);
    dm.timeLeft = Math.max(0, (typeof dm.timeLeft === 'number' ? dm.timeLeft : 75) - safeDt);
    if (dm.timeLeft <= 0) {
      dm.timeLeft = 75;
      if (typeof this._toast === 'function') {
        this._toast('DELIVERY TIMER RESET', 1400);
      }
    }

    if (dm.marker && dm.marker.rotation) {
      dm.marker.rotation.y += safeDt * 2.2;
    }

    const px = carPos.x || 0;
    const pz = carPos.z || 0;
    const tx = (dm.target && dm.target.x) || 0;
    const tz = (dm.target && dm.target.z) || 0;
    const dist = Math.hypot(px - tx, pz - tz);

    if (dm.phase === 'pickup' && dist <= 9) {
      this._clearContinuousMarker();
      const outside = Math.random() < 0.6;
      const dropPt = typeof this._randomDeliveryPoint === 'function'
        ? this._randomDeliveryPoint({ x: px, z: pz }, outside)
        : { x: tx + 45, z: tz + 45 };

      dm.phase = 'dropoff';
      dm.target = dropPt;
      dm.timeLeft = 80;
      dm.marker = typeof this._makePizzaMarker === 'function'
        ? this._makePizzaMarker(dropPt.x, dropPt.z, 0x4ade80)
        : null;

      if (typeof this._toast === 'function') {
        this._toast('PIZZA PICKED UP - DELIVER TO MARKER', 1700);
      }
    } else if (dm.phase === 'dropoff' && dist <= 10) {
      this._clearContinuousMarker();
      const tip = Math.max(25, Math.round(45 + dm.timeLeft * 1.2));
      dm.delivered = (dm.delivered || 0) + 1;
      dm.earned = (dm.earned || 0) + tip;

      if (typeof CityStorage !== 'undefined') {
        if (typeof CityStorage.addCoins === 'function') {
          CityStorage.addCoins(tip);
        }
        const prof = CityStorage.get ? CityStorage.get() : {};
        const nextCount = (prof.deliveriesCompleted || 0) + 1;
        if (typeof CityStorage.save === 'function') {
          CityStorage.save({ deliveriesCompleted: nextCount });
        }
        this.coins = typeof prof.coins === 'number' ? prof.coins : (this.coins || 0);
      } else {
        this.coins = (this.coins || 0) + tip;
      }

      const shops = this.world && Array.isArray(this.world.pizzaShops) && this.world.pizzaShops.length > 0
        ? this.world.pizzaShops
        : [];
      const nextShop = shops.length > 0
        ? shops[Math.floor(Math.random() * shops.length)]
        : (typeof this._randomDeliveryPoint === 'function' ? this._randomDeliveryPoint({ x: px, z: pz }, false) : { x: 0, z: 0 });

      dm.phase = 'pickup';
      dm.target = { x: nextShop.x || 0, z: nextShop.z || 0 };
      dm.timeLeft = 75;
      dm.marker = typeof this._makePizzaMarker === 'function'
        ? this._makePizzaMarker(dm.target.x, dm.target.z, 0xfacc15)
        : null;

      if (typeof this._toast === 'function') {
        this._toast(`PIZZA DELIVERED +${tip} TIP`, 1900);
      }
    }
  }

  _continuousText(pos = { x: 0, z: 0 }) {
    const dm = this.deliveryMode;
    if (!dm || !dm.active) {
      return typeof this._pizzaText === 'function' ? this._pizzaText(pos) : 'PIZZA: OFF';
    }
    const tx = (dm.target && dm.target.x) || 0;
    const tz = (dm.target && dm.target.z) || 0;
    const dist = Math.round(Math.hypot((pos.x || 0) - tx, (pos.z || 0) - tz));
    const sec = Math.max(0, Math.ceil(dm.timeLeft || 0));
    const stepLabel = dm.phase === 'dropoff' ? 'DROP' : 'SHOP';
    return `PIZZA ${stepLabel} ${dist}m • ${sec}s • ${dm.earned || 0}`;
  }

  _startMission(id) {
    this._clearMissionMarker();
    const missions = typeof MISSION_LIST !== 'undefined' ? MISSION_LIST : [];
    const def = missions.find((m) => m.id === id);
    if (!def) return;

    const prof = typeof CityStorage !== 'undefined' && CityStorage.get ? CityStorage.get() : (this.profile || {});
    const isReplay = Array.isArray(prof.missionsCompleted) && prof.missionsCompleted.includes(def.id);
    const pPos = this.car && typeof this.car.getPosition === 'function' ? this.car.getPosition() : { x: 0, z: 0 };

    if (def.type === 'pizza') {
      if (!this._startPizzaJob(def)) return;
      this.activeMission = { id: def.id, def, isReplay, progress: 0, target: def.orders || 1, pizza: true };
      this._updateHud();
      return;
    }

    const totalCheckpoints = def.type === 'sprint' ? (def.checkpointCount || 3) : 1;
    const pt = this._pickMissionStreetPoint(pPos, 65);
    const marker = (def.type === 'delivery' || def.type === 'sprint')
      ? this._createMissionRing(pt.x, pt.z, def.type === 'sprint' ? 0x00f5d4 : 0xfacc15)
      : null;

    this.activeMission = {
      id: def.id,
      def,
      isReplay,
      progress: 0,
      target: def.type === 'cruise'
        ? (def.target || 300)
        : def.type === 'taxi'
          ? (def.fareCount || 1)
          : def.type === 'survive'
            ? (def.timeLimit || 45)
            : totalCheckpoints,
      timeLeft: def.timeLimit || null,
      lastPos: { x: pPos.x || 0, z: pPos.z || 0 },
      lastFares: this.taxiEarnings || 0,
      lastFareCount: typeof this.faresCompleted === 'number' ? this.faresCompleted : (prof.faresCompleted || 0),
      checkpointIdx: 0,
      checkpointTarget: pt,
      marker
    };

    if (typeof CityStorage !== 'undefined' && CityStorage.save) {
      CityStorage.save({ activeMission: def.id });
    }
    if (typeof this._toast === 'function') {
      this._toast(`MISSION STARTED: ${def.name.toUpperCase()}`, 1800);
    }
  }

  _updateMissions(dt, carPos = { x: 0, z: 0 }) {
    const mState = this.activeMission;
    if (!mState || !mState.def) return;
    if (this.state !== 'play' || this.paused) return;

    const safeDt = Math.min(dt, 0.05);
    const def = mState.def;
    const px = carPos.x || 0;
    const pz = carPos.z || 0;

    if (def.type === 'pizza') {
      if (mState.failed) {
        this.activeMission = null;
      } else if (this.pizzaJob && this.pizzaJob.finished && this.pizzaJob.success) {
        mState.progress = mState.target;
        this._completeMission();
      }
      return;
    }

    if (typeof mState.timeLeft === 'number') {
      mState.timeLeft = Math.max(0, mState.timeLeft - safeDt);
      if (mState.timeLeft <= 0) {
        this._clearMissionMarker();
        this.activeMission = null;
        if (typeof this._toast === 'function') {
          this._toast('MISSION FAILED - TIME UP', 1800);
        }
        return;
      }
    }

    if (def.type === 'cruise') {
      const last = mState.lastPos || { x: px, z: pz };
      mState.progress += Math.hypot(px - last.x, pz - last.z);
      mState.lastPos = { x: px, z: pz };
    } else if (def.type === 'taxi') {
      const curFares = typeof this.faresCompleted === 'number'
        ? this.faresCompleted
        : ((this.taxiEarnings || 0) > (mState.lastFares || 0) ? (mState.lastFareCount || 0) + 1 : (mState.lastFareCount || 0));
      if (curFares > (mState.lastFareCount || 0)) {
        mState.progress += curFares - (mState.lastFareCount || 0);
        mState.lastFareCount = curFares;
        mState.lastFares = this.taxiEarnings || 0;
      }
    } else if (def.type === 'survive') {
      if (typeof this._lastCrashTime === 'number' && (this.elapsedTime || 0) - this._lastCrashTime < 0.25) {
        mState.progress = 0;
      } else {
        mState.progress += safeDt;
      }
    } else if (def.type === 'delivery' || def.type === 'sprint') {
      if (mState.marker) {
        mState.marker.rotation.y += safeDt * 2.2;
      }
      const target = mState.checkpointTarget;
      const radius = 12;
      if (target && Math.hypot(px - target.x, pz - target.z) <= radius) {
        mState.progress += 1;
        this._clearMissionMarker();
        if (mState.progress < mState.target) {
          const nextPt = this._pickMissionStreetPoint({ x: px, z: pz }, 70);
          mState.checkpointTarget = nextPt;
          mState.marker = this._createMissionRing(nextPt.x, nextPt.z, 0x00f5d4);
        }
      }
    }

    if (mState.progress >= mState.target) {
      this._completeMission();
    }
  }

  _completeMission() {
    const mState = this.activeMission;
    if (!mState || !mState.def) return;

    const def = mState.def;
    const reward = mState.isReplay ? Math.max(40, Math.round((def.reward || 100) * 0.45)) : (def.reward || 100);
    const xpGain = mState.isReplay ? Math.max(15, Math.round((def.xp || 50) * 0.5)) : (def.xp || 50);

    this._clearMissionMarker();

    if (typeof CityStorage !== 'undefined') {
      if (typeof CityStorage.addCoins === 'function') {
        CityStorage.addCoins(reward);
      }
      if (typeof CityStorage.addXp === 'function') {
        const updated = CityStorage.addXp(xpGain);
        if (updated && typeof updated.level === 'number') {
          this.level = updated.level;
        }
      }
      const prof = CityStorage.get ? CityStorage.get() : {};
      const doneList = Array.isArray(prof.missionsCompleted) ? prof.missionsCompleted.slice() : [];
      if (!doneList.includes(def.id)) {
        doneList.push(def.id);
      }
      if (typeof CityStorage.save === 'function') {
        CityStorage.save({ missionsCompleted: doneList, activeMission: null });
      }
      this.coins = typeof prof.coins === 'number' ? prof.coins : (this.coins || 0);
    } else {
      this.coins = (this.coins || 0) + reward;
    }

    this.activeMission = null;
    if (typeof this._toast === 'function') {
      this._toast(`MISSION COMPLETE +${reward} • +${xpGain}XP`, 2200);
    }
  }

  _missionText() {
    const mState = this.activeMission;
    if (!mState || !mState.def) return '';
    const def = mState.def;
    const cur = Math.min(mState.target, Math.floor(mState.progress || 0));
    const tgt = Math.floor(mState.target || 1);
    const timerPart = typeof mState.timeLeft === 'number' ? ` • ${Math.ceil(mState.timeLeft)}s` : '';

    if (def.type === 'pizza') {
      const pp = this.car && typeof this.car.getPosition === 'function' ? this.car.getPosition() : null;
      return `PIZZA: ${this._pizzaText(pp) || 'GET READY'}`;
    }
    if (def.type === 'cruise') {
      return `JOB: ${def.name.toUpperCase()} (${cur}/${tgt}m)${timerPart}`;
    }
    if (def.type === 'survive') {
      return `JOB: ${def.name.toUpperCase()} (${cur}/${tgt}s)${timerPart}`;
    }
    return `JOB: ${def.name.toUpperCase()} (${cur}/${tgt})${timerPart}`;
  }

  _updateHud() {
    const coinsEl = document.getElementById('hud-coins');
    if (coinsEl) {
      coinsEl.textContent = String(Math.floor(this.coins ?? 0));
    }

    const levelEl = document.getElementById('hud-level');
    if (levelEl) levelEl.textContent = `LV ${Math.max(1, Math.floor(this.level || 1))}`;

    const speedBtn = document.getElementById('touch-speed');
    if (speedBtn) {
      const idx = Math.min(SPEED_LEVELS.length - 1, Math.max(0, this.speedLevel || 0));
      speedBtn.textContent = `SPD ${idx + 1}`;
      speedBtn.setAttribute('aria-label', `Speed level ${idx + 1}: ${SPEED_LEVELS[idx].label}`);
    }

    const nitroEl = document.getElementById('hud-nitro');
    if (nitroEl) {
      const nVal = Math.ceil((this.car && typeof this.car.nitro === 'number') ? this.car.nitro : 100);
      nitroEl.textContent = `NOS ${nVal}%`;
      nitroEl.classList.toggle('active', nVal < 30);
    }

    const pizzaHud = document.getElementById('pizza-hud');
    if (pizzaHud) {
      const pizzaPos = this.car && typeof this.car.getPosition === 'function' ? this.car.getPosition() : { x: 0, z: 0 };
      if (this.deliveryMode && this.deliveryMode.active && typeof this._continuousText === 'function') {
        pizzaHud.textContent = this._continuousText(pizzaPos);
        pizzaHud.classList.remove('hidden');
      } else if (typeof this._pizzaText === 'function' && this._pizzaText(pizzaPos)) {
        pizzaHud.textContent = this._pizzaText(pizzaPos);
        pizzaHud.classList.remove('hidden');
      } else {
        pizzaHud.classList.add('hidden');
      }
    }

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
      } else if (this.activeMission && typeof this._missionText === 'function') {
        missionEl.textContent = this._missionText();
      } else {
        missionEl.textContent = 'EARN COINS VIA TAXI • JOBS • OPEN SHOP - ALL VEHICLES FREE';
      }
    }
  }

_updateMinimap() {
    const canvas = document.getElementById('minimap') || this.minimapCanvas;
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width || 152;
    const h = canvas.height || 152;
    const span = (typeof WORLD_CFG !== 'undefined' && WORLD_CFG.gridSpan) ? WORLD_CFG.gridSpan : 1100;
    const halfSpan = span * 0.5;

    const toX = (wx) => ((wx + halfSpan) / span) * w;
    const toY = (wz) => ((wz + halfSpan) / span) * h;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);

    // Block outlines
    if (this.world && Array.isArray(this.world.blockCenters) && typeof WORLD_CFG !== 'undefined') {
      const bw = Math.max(2, ((WORLD_CFG.blockSize || 50) / span) * w);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.72)';
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < this.world.blockCenters.length; i++) {
        const b = this.world.blockCenters[i];
        if (!b) continue;
        const bx = toX(b.x) - bw * 0.5;
        const by = toY(b.z) - bw * 0.5;
        ctx.fillRect(bx, by, bw, bw);
        ctx.strokeRect(bx, by, bw, bw);
      }
    }

    // Street grid
    if (this.world && Array.isArray(this.world.streetCoords)) {
      const roadPx = Math.max(1.5, ((WORLD_CFG.roadWidth || 14) / span) * w);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = roadPx;
      for (let i = 0; i < this.world.streetCoords.length; i++) {
        const s = this.world.streetCoords[i];
        const px = toX(s);
        const py = toY(s);

        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }
    }

    // Landmarks: Station (T) and Airport (A)
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const stationX = this.world && typeof this.world.railX === 'number' ? toX(this.world.railX) : w * 0.5;
    const stationY = toY(0);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('T', stationX, stationY);

    const airportX = toX(halfSpan * 0.55);
    const airportY = toY(halfSpan * 0.55);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('A', airportX, airportY);

    // Fuel stations (F)
    if (this.world && Array.isArray(this.world.fuelStations)) {
      for (let i = 0; i < this.world.fuelStations.length; i++) {
        const fs = this.world.fuelStations[i];
        if (!fs) continue;
        const fx = toX(fs.x || 0);
        const fy = toY(fs.z || 0);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#090d16';
        ctx.fillText('F', fx, fy + 0.5);
      }
    }

    // Pizza shops (P)
    if (this.world && Array.isArray(this.world.pizzaShops)) {
      for (let i = 0; i < this.world.pizzaShops.length; i++) {
        const ps = this.world.pizzaShops[i];
        if (!ps) continue;
        const px = toX(ps.x || 0);
        const py = toY(ps.z || 0);
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#090d16';
        ctx.fillText('P', px, py + 0.5);
      }
    }

    // Traffic dots
    if (this.world && Array.isArray(this.world.trafficPool)) {
      ctx.fillStyle = '#94a3b8';
      for (let i = 0; i < this.world.trafficPool.length; i++) {
        const t = this.world.trafficPool[i];
        const pos = t && t.group && t.group.position ? t.group.position : (t && t.mesh ? t.mesh.position : null);
        if (!pos) continue;
        ctx.fillRect(toX(pos.x) - 1, toY(pos.z) - 1, 2, 2);
      }
    }

    // Active objective (pizza / continuous delivery / taxi / mission)
    let activeTarget = null;
    let ringColor = '#22d3ee';
    if (this.deliveryMode && this.deliveryMode.active && this.deliveryMode.target) {
      activeTarget = this.deliveryMode.target;
      ringColor = '#4ade80';
    } else if (this.pizzaJob && this.pizzaJob.active && this.pizzaJob.target) {
      activeTarget = this.pizzaJob.target;
      ringColor = '#fb923c';
    } else if (this.taxiMode && this.taxiPassenger && this.taxiPassenger.pos) {
      activeTarget = this.taxiPassenger.pos;
      ringColor = '#facc15';
    } else if (this.activeMission && this.activeMission.checkpointTarget) {
      activeTarget = this.activeMission.checkpointTarget;
      ringColor = '#38bdf8';
    }

    const carPos = this.car && typeof this.car.getPosition === 'function' ? this.car.getPosition() : { x: 0, z: 0 };
    const carHeading = this.car && typeof this.car.getHeading === 'function' ? this.car.getHeading() : 0;
    const playerX = toX(carPos.x || 0);
    const playerY = toY(carPos.z || 0);

    if (activeTarget && typeof activeTarget.x === 'number' && typeof activeTarget.z === 'number') {
      const ox = toX(activeTarget.x);
      const oy = toY(activeTarget.z);

      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(playerX, playerY);
      ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player arrow
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate(-carHeading);
    ctx.fillStyle = '#00f5d4';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _loop(now) {
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = clamp(rawDt, 0.001, 0.05);

    const input = this.state === 'play'
      ? this._readInput()
      : { forward: false, backward: false, left: false, right: false, nos: false };

    if (this.state === 'play') {
      this.elapsedTime += dt;
      this.wanted = Math.max(0, (this.wanted || 0) - SURVIVAL.wantedDecay * dt);

      const maxHp = SURVIVAL.maxHealth || 100;
      const sinceCrash = this.elapsedTime - (this._lastCrashTime || 0);
      if (sinceCrash >= (SURVIVAL.healthRegenDelay || 6)) {
        this.health = Math.min(maxHp,
          (typeof this.health === 'number' ? this.health : maxHp) + (SURVIVAL.healthRegenPerSec || 0) * dt);
      }
    }

    if (this.rideMode) {
      this._updateRide(dt, input);
    } else {
      this.car.update(dt, input);
      if (this.state === 'play') {
        this._resolveCollisions(dt);
      }
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
      if (typeof this._updateMissions === 'function') {
        this._updateMissions(dt, carPos);
      }
      if (this.pizzaJob && this.pizzaJob.active && typeof this._updatePizzaJob === 'function') {
        this._updatePizzaJob(dt, carPos);
      }
      if (this.deliveryMode && this.deliveryMode.active && typeof this._updateContinuousDelivery === 'function') {
        this._updateContinuousDelivery(dt, carPos);
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

    const speedFactor = clamp(Math.abs(this.car.speed) / Math.max(1, CAR_CFG.maxSpeed), 0, 1);
    this.effects.update(dt, this.car, speedFactor);

    this._updateCamera(dt);
    this._updateHud();
    this._updateMinimap();
    if (this._bloomPass && this.world && typeof this.world.lightPhase === 'number') {
      const phase = ((this.world.lightPhase % 1) + 1) % 1;
      const dayLight = clamp(0.5 + 0.5 * Math.cos(phase * Math.PI * 2), 0, 1);
      this._bloomPass.strength = 0.12 + 0.55 * (1 - dayLight);
    }
    if (this.composer) {
      try { this.composer.render(); }
      catch (_e) { this.renderer.render(this.scene, this.camera); }
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    requestAnimationFrame(this._loop);
  }
}

export default Game;