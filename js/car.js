import * as THREE from 'three';
import { CAR_CFG, SPEED_LEVELS, COLORS, VEHICLE_TYPES, clamp, lerp } from './config.js';

export class Car {
  constructor(scene, initialSkinId = 'meow_orange') {
    this.scene = scene;
    this.group = new THREE.Group();
    this.chassis = new THREE.Group();
    this.group.add(this.chassis);

    this.speed = 0;
    this.lateralSpeed = 0;
    this.heading = 0;
    this.drifting = false;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.roll = 0;
    this.pitch = 0;

    this.speedLevel = 1;
    this.maxSpeed = CAR_CFG.maxSpeed;
    this.accel = CAR_CFG.accel;
    this.driftMaxSpeed = CAR_CFG.driftMaxSpeed;

    this.wheels = [];
    this.frontPivots = [];
    this.rearWheelPositions = [];

    this._buildModel();
    this.setSkin(initialSkinId);
    this.scene.add(this.group);
    this.reset(0, 0, 0);
  }

  _buildModel() {
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: COLORS.carBodyDefault,
      roughness: 0.28,
      metalness: 0.35
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: COLORS.carAccentDefault,
      roughness: 0.4,
      metalness: 0.15
    });
    this.trimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.6
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.12,
      metalness: 0.8
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.85,
      metalness: 0.1
    });

    const lowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_CFG.width, CAR_CFG.height * 0.5, CAR_CFG.length),
      this.bodyMat
    );
    lowerBody.position.y = CAR_CFG.wheelRadius + CAR_CFG.height * 0.24;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    this.chassis.add(lowerBody);

    const hoodStripe = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_CFG.width * 0.28, CAR_CFG.height * 0.52, CAR_CFG.length * 0.96),
      this.accentMat
    );
    hoodStripe.position.y = CAR_CFG.wheelRadius + CAR_CFG.height * 0.25;
    this.chassis.add(hoodStripe);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_CFG.width * 0.78, CAR_CFG.height * 0.45, CAR_CFG.length * 0.48),
      glassMat
    );
    cabin.position.set(0, CAR_CFG.wheelRadius + CAR_CFG.height * 0.68, -0.15);
    cabin.castShadow = true;
    this.chassis.add(cabin);

    const earGeo = new THREE.ConeGeometry(0.26, 0.5, 4);
    [-0.45, 0.45].forEach((xOff, idx) => {
      const ear = new THREE.Mesh(earGeo, this.bodyMat);
      ear.position.set(xOff, CAR_CFG.wheelRadius + CAR_CFG.height * 1.02, 0.45);
      ear.rotation.set(0.16, Math.PI * 0.25, idx === 0 ? 0.14 : -0.14);
      ear.castShadow = true;
      this.chassis.add(ear);
    });

    const wheelGeo = new THREE.CylinderGeometry(
      CAR_CFG.wheelRadius,
      CAR_CFG.wheelRadius,
      CAR_CFG.wheelWidth,
      14
    );
    wheelGeo.rotateZ(Math.PI * 0.5);

    const rimGeo = new THREE.CylinderGeometry(
      CAR_CFG.wheelRadius * 0.56,
      CAR_CFG.wheelRadius * 0.56,
      CAR_CFG.wheelWidth + 0.02,
      8
    );
    rimGeo.rotateZ(Math.PI * 0.5);

    const wheelConfigs = [
      { x: -CAR_CFG.width * 0.52, z: CAR_CFG.length * 0.32, front: true },
      { x: CAR_CFG.width * 0.52, z: CAR_CFG.length * 0.32, front: true },
      { x: -CAR_CFG.width * 0.52, z: -CAR_CFG.length * 0.32, front: false },
      { x: CAR_CFG.width * 0.52, z: -CAR_CFG.length * 0.32, front: false }
    ];

    wheelConfigs.forEach((cfg) => {
      const pivot = new THREE.Group();
      pivot.position.set(cfg.x, CAR_CFG.wheelRadius, cfg.z);

      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, this.trimMat);
      tire.add(rim);

      pivot.add(tire);
      this.chassis.add(pivot);
      this.wheels.push(tire);

      if (cfg.front) {
        this.frontPivots.push(pivot);
      } else {
        this.rearWheelPositions.push(new THREE.Vector3(cfg.x, 0.15, cfg.z));
      }
    });
  }

  setSkin(skinId) {
    const found = CAR_CFG.skins.find((s) => s.id === skinId) || CAR_CFG.skins[0];
    this.skinId = found.id;
    this.bodyMat.color.setHex(found.body);
    this.accentMat.color.setHex(found.accent);
    this.trimMat.color.setHex(found.trim);
  }

setVehicleType(typeKey) {
    const spec = typeof VEHICLE_TYPES !== 'undefined' && VEHICLE_TYPES[typeKey];
    if (!spec || !this.chassis) return;

    this.vehicleType = typeKey;
    const w = spec.w || CAR_CFG.width;
    const h = spec.h || CAR_CFG.height;
    const l = spec.l || CAR_CFG.length;
    const bodyHex = (spec.colors && spec.colors[0]) || COLORS.carBodyDefault;

    while (this.chassis.children.length > 0) {
      this.chassis.remove(this.chassis.children[0]);
    }
    this.wheels = [];
    this.frontPivots = [];
    this.rearWheelPositions = [];

    this.bodyMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.28, metalness: 0.4 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: COLORS.carAccentDefault, roughness: 0.35, metalness: 0.2 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.14, metalness: 0.78 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });

    const wheelR = typeKey === 'bike' ? 0.38 : CAR_CFG.wheelRadius;
    const lowerH = typeKey === 'bike' ? h * 0.45 : h * 0.52;
    const bodyW = typeKey === 'bike' ? Math.max(0.5, w * 0.65) : w;

    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(bodyW, lowerH, l), this.bodyMat);
    bodyMesh.position.y = wheelR + lowerH * 0.5;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.chassis.add(bodyMesh);

    const cabinMesh = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 0.78, Math.max(0.35, h - lowerH), l * 0.52),
      typeKey === 'bike' ? this.accentMat : cabinMat
    );
    cabinMesh.position.set(0, wheelR + lowerH + Math.max(0.35, h - lowerH) * 0.5 - 0.03, -0.1);
    cabinMesh.castShadow = true;
    this.chassis.add(cabinMesh);

    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, CAR_CFG.wheelWidth, 12);
    wheelGeo.rotateZ(Math.PI * 0.5);

    const coords =
      typeKey === 'bike'
        ? [
            { x: 0, z: l * 0.34, front: true },
            { x: 0, z: -l * 0.34, front: false }
          ]
        : [
            { x: -w * 0.52, z: l * 0.32, front: true },
            { x: w * 0.52, z: l * 0.32, front: true },
            { x: -w * 0.52, z: -l * 0.32, front: false },
            { x: w * 0.52, z: -l * 0.32, front: false }
          ];

    for (const c of coords) {
      const pivot = new THREE.Group();
      pivot.position.set(c.x, wheelR, c.z);
      const wm = new THREE.Mesh(wheelGeo, tireMat);
      wm.castShadow = true;
      pivot.add(wm);
      this.chassis.add(pivot);
      this.wheels.push(wm);
      if (c.front) this.frontPivots.push(pivot);
      else this.rearWheelPositions.push(new THREE.Vector3(c.x, 0.15, c.z));
    }
  }
  setSpeedLevel(index = 1) {
    const i = clamp(Math.round(index), 0, SPEED_LEVELS.length - 1);
    const level = SPEED_LEVELS[i];
    this.speedLevel = i;
    this.maxSpeed = level.maxSpeed;
    this.accel = level.accel;
    this.driftMaxSpeed = level.driftMaxSpeed;
    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    return level;
  }

  reset(x = 0, z = 0, heading = 0) {
    this.speed = 0;
    this.lateralSpeed = 0;
    this.heading = heading;
    this.drifting = false;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.roll = 0;
    this.pitch = 0;
    this.group.position.set(x, 0, z);
    this.group.rotation.set(0, heading, 0);
    this.chassis.position.set(0, 0, 0);
    this.chassis.rotation.set(0, 0, 0);
  }

  update(dt, input = {}) {
    const safeDt = Math.min(dt, 0.05);
    const forward = Boolean(input.forward);
    const backward = Boolean(input.backward);
    const left = Boolean(input.left);
    const right = Boolean(input.right);
    const driftKey = Boolean(input.drift);

    let steerDir = 0;
    if (typeof input.steer === 'number' && Number.isFinite(input.steer) && Math.abs(input.steer) > 0.01) {
      steerDir = clamp(input.steer, -1, 1);
    } else if (left && !right) {
      steerDir = -1;
    } else if (right && !left) {
      steerDir = 1;
    }

    const movingForward = this.speed >= 0;
    if (forward && !backward) {
      this.speed += this.accel * safeDt;
    } else if (backward && !forward) {
      if (this.speed > 1.5) {
        this.speed -= CAR_CFG.brakeDecel * safeDt;
      } else {
        this.speed -= CAR_CFG.reverseAccel * safeDt;
      }
    } else {
      const decel = CAR_CFG.coastDecel * safeDt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - decel);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + decel);
    }

    this.drifting = driftKey && Math.abs(this.speed) > 9 && Math.abs(steerDir) > 0.05;
    const maxFwd = this.drifting ? this.driftMaxSpeed : this.maxSpeed;
    this.speed = clamp(this.speed, -CAR_CFG.reverseMaxSpeed, maxFwd);

    const reverseSign = this.speed < -0.25 ? -1 : 1;
    const speedAuthority = clamp(Math.abs(this.speed) / 7, 0.15, 1);
    const steerMult = this.drifting ? CAR_CFG.driftSteerMult : 1;
    const yawDelta = -steerDir * CAR_CFG.steerSpeed * steerMult * speedAuthority * reverseSign * safeDt;
    this.heading += yawDelta;

    const targetLatVel = this.drifting ? steerDir * Math.abs(this.speed) * 0.28 : 0;
    const grip = this.drifting ? CAR_CFG.gripDrift : CAR_CFG.gripNormal;
    this.lateralSpeed = lerp(this.lateralSpeed, targetLatVel, safeDt * grip);

    const fwdX = -Math.sin(this.heading);
    const fwdZ = -Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);

    const moveX = (fwdX * this.speed + rightX * this.lateralSpeed) * safeDt;
    const moveZ = (fwdZ * this.speed + rightZ * this.lateralSpeed) * safeDt;

    this.group.position.x += moveX;
    this.group.position.z += moveZ;
    this.group.rotation.y = this.heading;

    this.steerAngle = lerp(this.steerAngle, -steerDir * 0.48, safeDt * 12);
    this.wheelSpin -= (this.speed * safeDt) / CAR_CFG.wheelRadius;

    const targetRoll = clamp(-steerDir * CAR_CFG.rollMax * (this.drifting ? 1.35 : 0.8), -0.28, 0.28);
    const targetPitch = forward
      ? -CAR_CFG.pitchMax * 0.5
      : backward && this.speed > 1
        ? CAR_CFG.pitchMax
        : 0;

    this.roll = lerp(this.roll, targetRoll, safeDt * 10);
    this.pitch = lerp(this.pitch, targetPitch, safeDt * 9);
    this.chassis.rotation.z = this.roll;
    this.chassis.rotation.x = this.pitch;

    for (const pivot of this.frontPivots) {
      pivot.rotation.y = this.steerAngle;
    }
    for (const wheel of this.wheels) {
      wheel.rotation.x = this.wheelSpin;
    }
  }

  collide(normalX = 0, normalZ = 0, impactStrength = 1) {
    const len = Math.hypot(normalX, normalZ);
    const nx = len > 0.0001 ? normalX / len : 0;
    const nz = len > 0.0001 ? normalZ / len : 1;

    const push = clamp(impactStrength, 0.2, 2.5) * 0.45;
    this.group.position.x += nx * push;
    this.group.position.z += nz * push;

    this.speed *= 1 - CAR_CFG.bounceFactor * clamp(impactStrength, 0.25, 1.4);
    this.lateralSpeed *= 0.4;
  }

  getPosition() {
    return this.group.position;
  }

  getHeading() {
    return this.heading;
  }

  getRearWheelWorldPositions(outArray = []) {
    outArray.length = 0;
    for (const localPt of this.rearWheelPositions) {
      const worldPt = localPt.clone();
      this.chassis.localToWorld(worldPt);
      outArray.push(worldPt);
    }
    return outArray;
  }
}

export default Car;