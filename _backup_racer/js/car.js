// js/car.js
// Meow Racing — procedural low-poly sports car builder + controller.
// The car is kinematic (arcade feel). All verified AutoControl constants
// (maxSpeed, speedGiro, drift, etc.) from config.js drive motion and visuals.
// v2: improved geometry (bevels, rims, mirrors, roof), glossy clearcoat paint,
// skins, and a boost-flame pool emitted from twin exhausts.

import * as THREE from 'three';
import {
  CAR,
  SKINS,
  BOOST,
  DRIFT,
  ROAD,
  clamp
} from './config.js';

const TWO_PI = Math.PI * 2;

// -----------------------------------------------------------------------------
// Car
// -----------------------------------------------------------------------------
export class Car {
  constructor(scene, skinId = 'banana') {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'MeowCar';

    // Kinematic state
    this.skinId = skinId;
    this.speed = 0;
    this.heading = 0;
    this.steer = 0;
    this.steerTarget = 0;
    this.roll = 0;
    this.pitch = 0;
    this.wheelSpin = 0;

    // Boost
    this.boostActive = false;
    this.boostAmount = BOOST.startAmount;
    this.braking = false;
    this._wheelRadius = 0.36;
    this._boostFlameTimer = 0;

    // Refs (filled in _buildModel)
    this.bodyMat = null;
    this.accentMat = null;
    this.brakeMat = null;
    this.bodyGroup = null;
    this.wheels = [];
    this.boostGroup = null;
    this.boostFlames = [];
    this.exhaustPoints = [];
    this.shadowBlob = null;
    this.glowPlane = null;

    this._tmpV = new THREE.Vector3();

    this._buildModel();
    scene.add(this.group);
  }

  // ---------------------------------------------------------------------------
  // Model construction
  // ---------------------------------------------------------------------------
  _buildModel() {
    this._buildBody();
    this._buildWheels();
    this._buildBoostFlames();
    this._buildShadow();
    this._applySkin(this.skinId);

    this.group.traverse((obj) => {
      if (obj.isMesh && obj !== this.shadowBlob) {
        obj.castShadow = true;
      }
    });
    if (this.shadowBlob) this.shadowBlob.castShadow = false;
    this._applyGlossUpgrade();
  }

  _applyGlossUpgrade() {
    const root = this.group;
    if (!root) return;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if ('metalness' in mat) mat.metalness = Math.max(mat.metalness || 0, 0.35);
        if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 0.5, 0.28);
        if ('clearcoat' in mat) mat.clearcoat = 0.85;
        if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = 0.12;
        mat.needsUpdate = true;
      });
    });
    if (!this._glossTrimAdded) {
      this._glossTrimAdded = true;
      const bumperMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.75 });
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.22, 0.24), bumperMat);
      bumper.position.set(0, 0.34, -2.05);
      root.add(bumper);
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.32), bumperMat);
      spoiler.position.set(0, 1.05, 1.85);
      root.add(spoiler);
    }
  }

  _buildBody() {
    const accentColor = 0x1a1a1a;

    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffd21a,
      flatShading: true,
      metalness: 0.35,
      roughness: 0.38,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22
    });

    this.accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      flatShading: true,
      roughness: 0.72,
      metalness: 0.3
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fd8ff,
      flatShading: true,
      metalness: 0.55,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
      clearcoat: 1.0
    });

    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xfff6c8,
      emissive: 0xfff6c8,
      emissiveIntensity: 1.2,
      flatShading: true
    });

    this.brakeMat = new THREE.MeshStandardMaterial({
      color: 0x440808,
      emissive: 0xff3b30,
      emissiveIntensity: 0.2,
      flatShading: true
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x141414,
      flatShading: true,
      roughness: 0.9
    });

    const bodyGroup = new THREE.Group();
    this.bodyGroup = bodyGroup;
    this.group.add(bodyGroup);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 4.3), this.bodyMat);
    lower.position.y = 0.55;
    bodyGroup.add(lower);

    const bevel = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.12, 4.24), this.accentMat);
    bevel.position.y = 0.34;
    bodyGroup.add(bevel);

    const mid = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.3, 3.85), this.bodyMat);
    mid.position.y = 0.9;
    bodyGroup.add(mid);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.35), this.bodyMat);
    hood.position.set(0, 1.05, -1.25);
    bodyGroup.add(hood);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.18, 0.55), this.bodyMat);
    nose.position.set(0, 0.72, -2.1);
    bodyGroup.add(nose);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.08, 0.42), this.accentMat);
    splitter.position.set(0, 0.35, -2.02);
    bodyGroup.add(splitter);

    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.4), this.bodyMat);
    rear.position.set(0, 0.58, 2.1);
    bodyGroup.add(rear);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.44, 1.75), this.bodyMat);
    cabin.position.set(0, 1.22, -0.05);
    bodyGroup.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.52, 0.08), glassMat);
    windshield.position.set(0, 1.28, 0.85);
    windshield.rotation.x = -0.58;
    bodyGroup.add(windshield);

    const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.44, 0.08), glassMat);
    rearWin.position.set(0, 1.28, -1.05);
    rearWin.rotation.x = 0.58;
    bodyGroup.add(rearWin);

    const sideWinGeo = new THREE.BoxGeometry(0.06, 0.36, 1.55);
    const sideWinL = new THREE.Mesh(sideWinGeo, glassMat);
    sideWinL.position.set(-0.77, 1.28, -0.05);
    bodyGroup.add(sideWinL);
    const sideWinR = new THREE.Mesh(sideWinGeo, glassMat);
    sideWinR.position.set(0.77, 1.28, -0.05);
    bodyGroup.add(sideWinR);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.1, 1.65), this.accentMat);
    roof.position.set(0, 1.48, -0.05);
    bodyGroup.add(roof);

    const spoilerBar = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 0.36), this.accentMat);
    spoilerBar.position.set(0, 1.5, 2.02);
    bodyGroup.add(spoilerBar);

    const postGeo = new THREE.BoxGeometry(0.1, 0.42, 0.1);
    const postL = new THREE.Mesh(postGeo, darkMat);
    postL.position.set(-0.7, 1.28, 2.02);
    bodyGroup.add(postL);
    const postR = new THREE.Mesh(postGeo, darkMat);
    postR.position.set(0.7, 1.28, 2.02);
    bodyGroup.add(postR);

    const headGeo = new THREE.BoxGeometry(0.44, 0.16, 0.1);
    const headL = new THREE.Mesh(headGeo, headlightMat);
    headL.position.set(-0.62, 0.78, -2.12);
    bodyGroup.add(headL);
    const headR = new THREE.Mesh(headGeo, headlightMat);
    headR.position.set(0.62, 0.78, -2.12);
    bodyGroup.add(headR);

    const brakeGeo = new THREE.BoxGeometry(0.46, 0.15, 0.1);
    const brakeL = new THREE.Mesh(brakeGeo, this.brakeMat);
    brakeL.position.set(-0.62, 0.75, 2.15);
    bodyGroup.add(brakeL);
    const brakeR = new THREE.Mesh(brakeGeo, this.brakeMat);
    brakeR.position.set(0.62, 0.75, 2.15);
    bodyGroup.add(brakeR);

    const skirtGeo = new THREE.BoxGeometry(0.06, 0.16, 3.05);
    const skirtL = new THREE.Mesh(skirtGeo, this.accentMat);
    skirtL.position.set(-1.02, 0.48, 0);
    bodyGroup.add(skirtL);
    const skirtR = new THREE.Mesh(skirtGeo, this.accentMat);
    skirtR.position.set(1.02, 0.48, 0);
    bodyGroup.add(skirtR);

    const mirrorGeo = new THREE.BoxGeometry(0.14, 0.12, 0.22);
    const mirrorL = new THREE.Mesh(mirrorGeo, this.accentMat);
    mirrorL.position.set(-1.0, 1.15, -0.55);
    bodyGroup.add(mirrorL);
    const mirrorR = new THREE.Mesh(mirrorGeo, this.accentMat);
    mirrorR.position.set(1.0, 1.15, -0.55);
    bodyGroup.add(mirrorR);

    this.exhaustPoints = [
      new THREE.Vector3(-0.5, 0.36, 2.16),
      new THREE.Vector3(0.5, 0.36, 2.16)
    ];
  }

  _buildWheels() {
    const wheelRadius = this._wheelRadius;
    const wheelWidth = 0.3;

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x141414,
      flatShading: true,
      roughness: 0.92
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd8d8dc,
      flatShading: true,
      metalness: 0.85,
      roughness: 0.25
    });
    const rimHubMat = new THREE.MeshStandardMaterial({
      color: 0x8a8a90,
      flatShading: true,
      metalness: 0.9,
      roughness: 0.35
    });

    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
    tireGeo.rotateZ(Math.PI / 2);

    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.68, wheelRadius * 0.68, wheelWidth + 0.02, 12);
    rimGeo.rotateZ(Math.PI / 2);

    const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.22, wheelRadius * 0.22, wheelWidth + 0.04, 8);
    hubGeo.rotateZ(Math.PI / 2);

    const spokeGeoV = new THREE.BoxGeometry(wheelWidth + 0.03, wheelRadius * 1.3, 0.055);
    const spokeGeoH = new THREE.BoxGeometry(wheelWidth + 0.03, 0.055, wheelRadius * 1.3);

    const positions = [
      { x: -1.0, z: -1.42, front: true },
      { x: 1.0, z: -1.42, front: true },
      { x: -1.0, z: 1.42, front: false },
      { x: 1.0, z: 1.42, front: false }
    ];

    this.wheels = [];
    for (const wp of positions) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wp.x, wheelRadius, wp.z);

      const spinGroup = new THREE.Group();
      wheelGroup.add(spinGroup);

      const tire = new THREE.Mesh(tireGeo, tireMat);
      spinGroup.add(tire);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      spinGroup.add(rim);

      const hub = new THREE.Mesh(hubGeo, rimHubMat);
      spinGroup.add(hub);

      const spokeV = new THREE.Mesh(spokeGeoV, rimMat);
      spinGroup.add(spokeV);
      const spokeH = new THREE.Mesh(spokeGeoH, rimMat);
      spinGroup.add(spokeH);

      wheelGroup.userData = { spin: spinGroup, isFront: wp.front };
      this.group.add(wheelGroup);
      this.wheels.push(wheelGroup);
    }
  }

  _buildBoostFlames() {
    const group = new THREE.Group();
    this.boostGroup = group;
    this.group.add(group);

    const flameGeo = new THREE.ConeGeometry(0.18, 0.9, 8, 1, true);
    flameGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff9a3d : 0xffe066,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const flame = new THREE.Mesh(flameGeo, mat);
      flame.visible = false;
      flame.userData = { life: 0, maxLife: 0.28, vx: 0, vy: 0, vz: 0 };
      group.add(flame);
      this.boostFlames.push(flame);
    }
    this._flameGeo = flameGeo;
  }

  _buildShadow() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });
    const blob = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), mat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.scale.set(1, 1.65, 1);
    blob.renderOrder = 2;
    this.shadowBlob = blob;
    this.group.add(blob);
  }

  // ---------------------------------------------------------------------------
  // Skins
  // ---------------------------------------------------------------------------
  _applySkin(skinId) {
    const skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
    this.skinId = skin.id;
    if (this.bodyMat) this.bodyMat.color.setHex(skin.body);
    if (this.accentMat) this.accentMat.color.setHex(skin.accent);
  }

  setSkin(skinId) {
    this._applySkin(skinId);
    return this.skinId;
  }

  setColor(index) {
    const idx = ((index % SKINS.length) + SKINS.length) % SKINS.length;
    this._applySkin(SKINS[idx].id);
    return this.skinId;
  }

  cycleColor() {
    const idx = SKINS.findIndex((s) => s.id === this.skinId);
    return this.setColor(idx + 1);
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------
  update(dt, input, allowControl = true) {
    if (dt <= 0) return;
    this.offRoadTouch = false;

    if (!allowControl) {
      input = { left: false, right: false, gas: false, brake: false, turbo: false };
    }

    // ----- Boost -----
    const wantBoost = !!input.turbo && this.boostAmount >= BOOST.minToActivate;
    if (wantBoost) {
      this.boostActive = true;
      this.boostAmount = Math.max(0, this.boostAmount - BOOST.drainRate * dt);
      if (this.boostAmount <= 0) this.boostActive = false;
    } else {
      this.boostActive = false;
      this.boostAmount = Math.min(BOOST.max, this.boostAmount + BOOST.idleRegen * dt);
    }

    // ----- Steering (analog: input.steer in -1..1, or left/right fallback) -----
    let steerInput = 0;
    if (typeof input.steer === 'number' && isFinite(input.steer)) {
      steerInput = clamp(input.steer, -1, 1);
    } else {
      steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    }
    const speedAbs = Math.abs(this.speed);
    // Steering stays responsive at cruising speed instead of collapsing to zero.
    const speedFactor = clamp(0.35 + (speedAbs / Math.max(1, CAR.maxSpeed)) * 0.65, 0, 1);

    // ----- Drift -----
    const driftCfg = (typeof DRIFT !== 'undefined') ? DRIFT : { grip: 0.3, yawBoost: 1.25, minSpeed: 8 };
    this.drifting = !!input.drift && speedAbs >= driftCfg.minSpeed && Math.abs(steerInput) > 0.05;
    this.driftIntensity = this.drifting ? Math.abs(steerInput) : 0;

    const yawBoost = this.drifting ? driftCfg.yawBoost : 1;
    const turnRate = CAR.speedGiro * (Math.PI / 180) * speedFactor * yawBoost;
    this.heading -= steerInput * turnRate * dt;

    this.steerTarget = -steerInput * 0.5;
    this.steer += (this.steerTarget - this.steer) * Math.min(1, dt * 10);

    // ----- Longitudinal speed (MANUAL GAS / BRAKE / COAST) -----
    const maxSpeed = CAR.maxSpeed * (this.boostActive ? BOOST.speedMult : 1);
    if (input.gas) {
      this.speed += CAR.accel * dt;
    } else if (input.brake) {
      this.speed -= CAR.brakeDecel * dt;
    } else {
      const decel = CAR.coastDecel * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - decel);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + decel);
    }
    this.speed = clamp(this.speed, -CAR.reverseMax, maxSpeed);

    this.braking = !!input.brake;

    // ----- Body roll / pitch -----
    const rollTarget = -steerInput * 0.11 * speedFactor * (this.drifting ? 1.35 : 1);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 8);

    let pitchTarget = 0;
    if (input.brake) pitchTarget = -0.05;
    else if (this.boostActive) pitchTarget = 0.03;
    else pitchTarget = 0.012;
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 6);

    // ----- Position -----
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const half = ROAD.width / 2 - this.getBoundingRadius() * 0.6;
    const nx = this.group.position.x + fx * this.speed * dt;
    this.group.position.x = clamp(nx, -half, half);
    this.group.position.z += fz * this.speed * dt;
    if (Math.abs(nx) > half) { this.speed *= 0.985; this.offRoadTouch = true; }

    // ----- Wheel spin -----
    this.wheelSpin -= (this.speed * dt) / this._wheelRadius;
    this.wheelSpin %= TWO_PI;

    // ----- Boost flames -----
    this._updateBoostFlames(dt);

    this._applyVisuals(dt);
  }

  _updateBoostFlames(dt) {
    if (!this.boostGroup) return;

    const rate = this.boostActive ? BOOST.flameRate : 0;
    this._boostFlameTimer += dt;
    const spawnInterval = rate > 0 ? 1 / rate : Infinity;

    while (this._boostFlameTimer >= spawnInterval) {
      this._boostFlameTimer -= spawnInterval;
      // Spawn a flame from each exhaust.
      for (const ep of this.exhaustPoints) {
        const flame = this.boostFlames.find((f) => f.userData.life <= 0);
        if (!flame) break;
        const world = ep.clone();
        this.group.localToWorld(world);
        flame.position.copy(this.group.worldToLocal(world.clone()));
        flame.position.x = ep.x + (Math.random() - 0.5) * 0.12;
        flame.position.y = ep.y + (Math.random() - 0.5) * 0.08;
        flame.position.z = ep.z + Math.random() * 0.15;
        flame.rotation.set(Math.PI / 2, 0, Math.random() * TWO_PI);
        const s = 0.7 + Math.random() * 0.6;
        flame.scale.setScalar(s);
        flame.material.opacity = 0.9;
        flame.visible = true;
        flame.userData.life = 0.28;
        flame.userData.maxLife = 0.28;
      }
    }

    for (const flame of this.boostFlames) {
      if (flame.userData.life <= 0) {
        if (flame.visible) {
          flame.visible = false;
          flame.material.opacity = 0;
        }
        continue;
      }
      flame.userData.life -= dt;
      const t = Math.max(0, flame.userData.life / flame.userData.maxLife);
      flame.material.opacity = t * 0.9;
      flame.position.z += dt * 6;
      flame.scale.setScalar(flame.scale.x * (1 + dt * 1.2));
      if (flame.userData.life <= 0) {
        flame.visible = false;
        flame.material.opacity = 0;
      }
    }
  }

  _applyVisuals(dt) {
    this.group.rotation.y = this.heading;

    if (this.bodyGroup) {
      this.bodyGroup.rotation.z = this.roll;
      this.bodyGroup.rotation.x = this.pitch;
    }

    if (this.brakeMat) {
      this.brakeMat.emissiveIntensity = this.braking ? 2.2 : 0.2;
    }

    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      const data = w.userData;
      data.spin.rotation.x = this.wheelSpin;
      if (data.isFront) {
        w.rotation.y = this.steer;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Events / helpers
  // ---------------------------------------------------------------------------
  onCollision() {
    this.speed *= CAR.collisionSpeedPenalty;
    if (Math.abs(this.speed) < 2) this.speed = 0;
  }

  addBoost(amount) {
    this.boostAmount = clamp(this.boostAmount + amount, 0, BOOST.max);
  }

  addTurbo(amount) {
    this.addBoost(amount);
  }

  getForward() {
    return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  getPosition() {
    return this.group.position;
  }

  getBoundingRadius() {
    return CAR.collisionRadius;
  }

  reset(x = 0, z = 0, heading = 0) {
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.steerTarget = 0;
    this.roll = 0;
    this.pitch = 0;
    this.wheelSpin = 0;
    this.boostActive = false;
    this.boostAmount = BOOST.startAmount;
    this.braking = false;
    for (const flame of this.boostFlames) {
      flame.visible = false;
      flame.material.opacity = 0;
      flame.userData.life = 0;
    }
    this._applyVisuals(0.016);
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
    });
    if (this.scene) this.scene.remove(this.group);
  }
}

export default Car;