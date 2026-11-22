// js/car.js
// Meow Racing — procedural low-poly car builder + controller.
// The car is kinematic (not a cannon-es rigid body) for a reliable arcade feel
// matching the original AutoControl behavior: speed/steer/drift are applied
// directly, but all verified constants (maxSpeed, speedGiro, drift, etc.) from
// config.js drive the motion and visuals.

import * as THREE from 'three';
import {
  CAR,
  CAR_COLORS,
  clamp
} from './config.js';

const TWO_PI = Math.PI * 2;

// -----------------------------------------------------------------------------
// Car
// -----------------------------------------------------------------------------
export class Car {
  constructor(scene, colorIndex = 0) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'MeowCar';

    // State
    this.colorIndex = colorIndex;
    this.speed = 0;          // forward speed (units/s); negative = reverse
    this.heading = 0;        // yaw (radians); 0 = facing -Z
    this.steer = 0;          // smoothed visual steering angle (radians)
    this.steerTarget = 0;
    this.roll = 0;           // body roll (radians)
    this.pitch = 0;          // body pitch (radians)
    this.wheelSpin = 0;      // accumulated wheel rotation (radians)
    this.turboActive = false;
    this.turboAmount = CAR.turboMax * 0.5;
    this.braking = false;
    this._wheelRadius = 0.35;

    // Materials and parts (populated by _buildModel)
    this.bodyMat = null;
    this.accentMat = null;
    this.brakeMat = null;
    this.bodyGroup = null;
    this.wheels = [];
    this.glowPlane = null;
    this.shadowBlob = null;

    this._buildModel();
    scene.add(this.group);
  }

  // ---------------------------------------------------------------------------
  // Model construction
  // ---------------------------------------------------------------------------
  _buildModel() {
    const color = CAR_COLORS[this.colorIndex] || CAR_COLORS[0];

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: color.body,
      flatShading: true,
      metalness: 0.35,
      roughness: 0.5
    });

    this.accentMat = new THREE.MeshStandardMaterial({
      color: color.accent,
      flatShading: true,
      roughness: 0.75
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x141414,
      flatShading: true,
      roughness: 0.9
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      flatShading: true,
      metalness: 0.55,
      roughness: 0.15,
      transparent: true,
      opacity: 0.82
    });

    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xfff6c8,
      emissive: 0xfff6c8,
      emissiveIntensity: 0.9,
      flatShading: true
    });

    this.brakeMat = new THREE.MeshStandardMaterial({
      color: 0x440808,
      emissive: 0xff3b30,
      emissiveIntensity: 0.2,
      flatShading: true
    });

    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x141414,
      flatShading: true,
      roughness: 0.9
    });

    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xbfbfbf,
      flatShading: true,
      metalness: 0.7,
      roughness: 0.35
    });

    // --- Body group (tilted by roll/pitch) ---
    const bodyGroup = new THREE.Group();
    this.bodyGroup = bodyGroup;
    this.group.add(bodyGroup);

    // Lower chassis
    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.35, 4.2),
      this.bodyMat
    );
    lower.position.y = 0.55;
    bodyGroup.add(lower);

    // Mid section (slightly narrower)
    const mid = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.28, 3.8),
      this.bodyMat
    );
    mid.position.y = 0.86;
    bodyGroup.add(mid);

    // Nose (front taper)
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.15, 0.6),
      this.bodyMat
    );
    nose.position.set(0, 0.7, -2.05);
    bodyGroup.add(nose);

    // Rear bumper
    const rear = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.22, 0.35),
      this.bodyMat
    );
    rear.position.set(0, 0.55, 2.05);
    bodyGroup.add(rear);

    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.42, 1.7),
      this.bodyMat
    );
    cabin.position.set(0, 1.16, -0.1);
    bodyGroup.add(cabin);

    // Windshield (slanted)
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.5, 0.08),
      glassMat
    );
    windshield.position.set(0, 1.2, 0.82);
    windshield.rotation.x = -0.55;
    bodyGroup.add(windshield);

    // Rear window
    const rearWin = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.42, 0.08),
      glassMat
    );
    rearWin.position.set(0, 1.2, -1.02);
    rearWin.rotation.x = 0.55;
    bodyGroup.add(rearWin);

    // Side windows
    const sideWinGeo = new THREE.BoxGeometry(0.06, 0.35, 1.5);
    const sideWinL = new THREE.Mesh(sideWinGeo, glassMat);
    sideWinL.position.set(-0.76, 1.2, -0.1);
    bodyGroup.add(sideWinL);
    const sideWinR = new THREE.Mesh(sideWinGeo, glassMat);
    sideWinR.position.set(0.76, 1.2, -0.1);
    bodyGroup.add(sideWinR);

    // Rear spoiler
    const spoilerBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.08, 0.35),
      this.bodyMat
    );
    spoilerBar.position.set(0, 1.45, 2.0);
    bodyGroup.add(spoilerBar);

    const postGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
    const postL = new THREE.Mesh(postGeo, darkMat);
    postL.position.set(-0.7, 1.25, 2.0);
    bodyGroup.add(postL);
    const postR = new THREE.Mesh(postGeo, darkMat);
    postR.position.set(0.7, 1.25, 2.0);
    bodyGroup.add(postR);

    // Front splitter
    const splitter = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.08, 0.4),
      this.accentMat
    );
    splitter.position.set(0, 0.32, -2.0);
    bodyGroup.add(splitter);

    // Headlights
    const headGeo = new THREE.BoxGeometry(0.42, 0.14, 0.1);
    const headL = new THREE.Mesh(headGeo, headlightMat);
    headL.position.set(-0.62, 0.72, -2.09);
    bodyGroup.add(headL);
    const headR = new THREE.Mesh(headGeo, headlightMat);
    headR.position.set(0.62, 0.72, -2.09);
    bodyGroup.add(headR);

    // Brake lights
    const brakeGeo = new THREE.BoxGeometry(0.44, 0.14, 0.1);
    const brakeL = new THREE.Mesh(brakeGeo, this.brakeMat);
    brakeL.position.set(-0.6, 0.72, 2.11);
    bodyGroup.add(brakeL);
    const brakeR = new THREE.Mesh(brakeGeo, this.brakeMat);
    brakeR.position.set(0.6, 0.72, 2.11);
    bodyGroup.add(brakeR);

    // Side skirts
    const skirtGeo = new THREE.BoxGeometry(0.05, 0.15, 3.0);
    const skirtL = new THREE.Mesh(skirtGeo, this.accentMat);
    skirtL.position.set(-1.01, 0.45, 0);
    bodyGroup.add(skirtL);
    const skirtR = new THREE.Mesh(skirtGeo, this.accentMat);
    skirtR.position.set(1.01, 0.45, 0);
    bodyGroup.add(skirtR);

    // --- Wheels ---
    const wheelRadius = this._wheelRadius;
    const wheelWidth = 0.28;

    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 14);
    tireGeo.rotateZ(Math.PI / 2);

    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, wheelWidth + 0.02, 8);
    hubGeo.rotateZ(Math.PI / 2);

    const spokeVGeo = new THREE.BoxGeometry(wheelWidth + 0.02, 0.34, 0.05);
    const spokeHGeo = new THREE.BoxGeometry(wheelWidth + 0.02, 0.05, 0.34);

    const wheelPositions = [
      { x: -0.95, z: -1.4, front: true },
      { x: 0.95, z: -1.4, front: true },
      { x: -0.95, z: 1.4, front: false },
      { x: 0.95, z: 1.4, front: false }
    ];

    this.wheels = [];
    for (const wp of wheelPositions) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wp.x, wheelRadius, wp.z);

      const spinGroup = new THREE.Group();
      wheelGroup.add(spinGroup);

      const tire = new THREE.Mesh(tireGeo, wheelMat);
      spinGroup.add(tire);

      const hub = new THREE.Mesh(hubGeo, hubMat);
      spinGroup.add(hub);

      const spokeV = new THREE.Mesh(spokeVGeo, hubMat);
      spinGroup.add(spokeV);
      const spokeH = new THREE.Mesh(spokeHGeo, hubMat);
      spinGroup.add(spokeH);

      wheelGroup.userData = { spin: spinGroup, isFront: wp.front };
      this.group.add(wheelGroup);
      this.wheels.push(wheelGroup);
    }

    // --- Turbo glow plane ---
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.8), glowMat);
    this.glowPlane.rotation.x = -Math.PI / 2;
    this.glowPlane.position.y = 0.02;
    this.group.add(this.glowPlane);

    // --- Shadow blob ---
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    this.shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), shadowMat);
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.y = 0.01;
    this.shadowBlob.scale.set(1, 1.6, 1);
    this.group.add(this.shadowBlob);

    // --- Shadows on real geometry (skip glow/shadow-blob) ---
    this.group.traverse((obj) => {
      if (obj.isMesh && obj !== this.glowPlane && obj !== this.shadowBlob) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });
    this.glowPlane.castShadow = false;
    this.shadowBlob.castShadow = false;
  }

  // ---------------------------------------------------------------------------
  // Colour skin cycling (KeyC)
  // ---------------------------------------------------------------------------
  setColor(index) {
    const n = CAR_COLORS.length;
    this.colorIndex = ((index % n) + n) % n;
    const color = CAR_COLORS[this.colorIndex];
    if (this.bodyMat) this.bodyMat.color.setHex(color.body);
    if (this.accentMat) this.accentMat.color.setHex(color.accent);
  }

  cycleColor() {
    this.setColor(this.colorIndex + 1);
    return this.colorIndex;
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------
  update(dt, input, allowControl = true) {
    if (dt <= 0) return;

    if (!allowControl) {
      input = { left: false, right: false, gas: false, brake: false, turbo: false };
    }

    // ----- Turbo -----
    const wantTurbo = !!input.turbo && this.turboAmount >= CAR.turboMinToActivate;
    if (wantTurbo) {
      this.turboActive = true;
      this.turboAmount = Math.max(0, this.turboAmount - CAR.turboDrain * dt);
      if (this.turboAmount <= 0) this.turboActive = false;
    } else {
      this.turboActive = false;
      this.turboAmount = Math.min(CAR.turboMax, this.turboAmount + CAR.turboRegenIdle * dt);
    }

    // ----- Steering -----
    const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speedAbs = Math.abs(this.speed);
    const speedFactor = Math.min(1, speedAbs / 15);
    const sign = this.speed >= 0 ? 1 : -1;
    const turnRate = CAR.speedGiro * (Math.PI / 180) * speedFactor * sign;

    // Right turn -> heading decreases (verified forward = (-sin h, 0, -cos h)).
    this.heading -= steerInput * turnRate * dt;

    // Smoothed visual steer for front wheels (negative = wheels point right).
    this.steerTarget = -steerInput * 0.5;
    this.steer += (this.steerTarget - this.steer) * Math.min(1, dt * 10);

    // ----- Longitudinal speed -----
    const maxSpeed = CAR.maxSpeed * (this.turboActive ? CAR.turboSpeedMult : 1);

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

    // ----- Body roll (lean into turn, arcade style) -----
    const rollTarget = -steerInput * 0.11 * speedFactor;
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 8);

    // ----- Body pitch (nose up on accel, dip on brake) -----
    let pitchTarget = 0;
    if (input.brake) pitchTarget = -0.05;
    else if (input.gas) pitchTarget = 0.025;
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 6);

    // ----- Position (kinematic forward advance) -----
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    this.group.position.x += fx * this.speed * dt;
    this.group.position.z += fz * this.speed * dt;

    // ----- Wheel spin -----
    this.wheelSpin -= (this.speed * dt) / this._wheelRadius;
    this.wheelSpin %= TWO_PI;

    this._applyVisuals(dt);
  }

  // ---------------------------------------------------------------------------
  // Apply state to visuals
  // ---------------------------------------------------------------------------
  _applyVisuals(dt) {
    this.group.rotation.y = this.heading;

    if (this.bodyGroup) {
      this.bodyGroup.rotation.z = this.roll;
      this.bodyGroup.rotation.x = this.pitch;
    }

    if (this.brakeMat) {
      this.brakeMat.emissiveIntensity = this.braking ? 2.0 : 0.2;
    }

    if (this.glowPlane) {
      const target = this.turboActive ? 0.55 : 0;
      const k = Math.min(1, (dt || 0.016) * 8);
      this.glowPlane.material.opacity += (target - this.glowPlane.material.opacity) * k;
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

  addTurbo(amount) {
    this.turboAmount = clamp(this.turboAmount + amount, 0, CAR.turboMax);
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
    this.turboActive = false;
    this.turboAmount = CAR.turboMax * 0.5;
    this.braking = false;
    this._applyVisuals(0.016);
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      }
    });
    if (this.scene) this.scene.remove(this.group);
  }
}

export default Car;