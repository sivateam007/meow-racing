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
    this.nitro = 100;
    this.boosting = false;
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

const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.4 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.85 });
    const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
    const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.7 });

    if (typeKey.includes('bike')) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.24, lowerH * 0.85, l * 0.78), this.bodyMat);
      frame.position.set(0, wheelR + lowerH * 0.45, 0);
      frame.castShadow = true;
      this.chassis.add(frame);

      const fairing = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.9, lowerH * 0.75, l * 0.36), this.accentMat);
      fairing.position.set(0, wheelR + lowerH * 0.75, l * 0.18);
      fairing.rotation.x = 0.25;
      fairing.castShadow = true;
      this.chassis.add(fairing);

      const seat = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.82, 0.22, l * 0.36), cabinMat);
      seat.position.set(0, wheelR + lowerH * 0.95, -l * 0.12);
      this.chassis.add(seat);

      const bars = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.35, 0.12, 0.16), chromeMat);
      bars.position.set(0, wheelR + lowerH * 1.15, l * 0.24);
      this.chassis.add(bars);

      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, l * 0.45, 8), chromeMat);
      exhaust.rotation.x = Math.PI * 0.5;
      exhaust.position.set(bodyW * 0.42, wheelR + 0.16, -l * 0.22);
      this.chassis.add(exhaust);

      const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.28), this.accentMat);
      riderBody.position.set(0, wheelR + lowerH + 0.32, -l * 0.05);
      riderBody.rotation.x = 0.35;
      riderBody.castShadow = true;
      this.chassis.add(riderBody);

      const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), skinMat);
      riderHead.position.set(0, wheelR + lowerH + 0.72, l * 0.04);
      riderHead.castShadow = true;
      this.chassis.add(riderHead);

      const hLight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), headLightMat);
      hLight.position.set(0, wheelR + lowerH * 0.95, l * 0.38);
      this.chassis.add(hLight);
    } else {
      const baseY = wheelR + lowerH * 0.5;
      const midBody = new THREE.Mesh(new THREE.BoxGeometry(bodyW, lowerH * 0.78, l * 0.54), this.bodyMat);
      midBody.position.set(0, baseY - lowerH * 0.08, -l * 0.02);
      midBody.castShadow = true;
      midBody.receiveShadow = true;
      this.chassis.add(midBody);

      const hood = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.96, lowerH * 0.62, l * 0.26), this.bodyMat);
      hood.position.set(0, baseY - lowerH * 0.14, l * 0.34);
      hood.rotation.x = 0.06;
      hood.castShadow = true;
      this.chassis.add(hood);

      const trunk = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.96, lowerH * 0.66, l * 0.22), this.bodyMat);
      trunk.position.set(0, baseY - lowerH * 0.12, -l * 0.36);
      trunk.rotation.x = -0.05;
      trunk.castShadow = true;
      this.chassis.add(trunk);

      const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.02, lowerH * 0.26, 0.22), trimMat);
      frontBumper.position.set(0, wheelR + lowerH * 0.16, l * 0.49);
      this.chassis.add(frontBumper);

      const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.02, lowerH * 0.26, 0.22), trimMat);
      rearBumper.position.set(0, wheelR + lowerH * 0.16, -l * 0.49);
      this.chassis.add(rearBumper);

      const grille = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.56, lowerH * 0.24, 0.08), trimMat);
      grille.position.set(0, wheelR + lowerH * 0.42, l * 0.48);
      this.chassis.add(grille);

      const cabinH = Math.max(0.38, h - lowerH * 0.45);
      const cabinL = l * 0.46;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.84, cabinH, cabinL), cabinMat);
      cabin.position.set(0, wheelR + lowerH * 0.78 + cabinH * 0.45, -l * 0.04);
      cabin.castShadow = true;
      this.chassis.add(cabin);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.82, cabinH * 0.72, 0.12), cabinMat);
      windshield.position.set(0, wheelR + lowerH * 0.78 + cabinH * 0.44, l * 0.18);
      windshield.rotation.x = -0.42;
      this.chassis.add(windshield);

      for (const side of [-1, 1]) {
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.14), chromeMat);
        mirror.position.set(side * (bodyW * 0.52), wheelR + lowerH * 0.85, l * 0.14);
        this.chassis.add(mirror);

        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), headLightMat);
        hl.position.set(side * (bodyW * 0.34), wheelR + lowerH * 0.52, l * 0.48);
        this.chassis.add(hl);

        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailLightMat);
        tl.position.set(side * (bodyW * 0.34), wheelR + lowerH * 0.56, -l * 0.48);
        this.chassis.add(tl);

        for (const zSign of [-1, 1]) {
          const arch = new THREE.Mesh(new THREE.BoxGeometry(0.18, wheelR * 1.45, wheelR * 2.1), trimMat);
          arch.position.set(side * (bodyW * 0.48), wheelR * 0.82, zSign * (l * 0.32));
          this.chassis.add(arch);
        }
      }
    }

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

    const roofY = wheelR + h;
    const isBike = typeKey.includes('bike');
    if (isBike) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.08, 0.1), this.trimMat || this.accentMat);
      bar.position.set(0, wheelR + h * 0.82, l * 0.34);
      this.chassis.add(bar);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), this.accentMat);
      head.position.set(0, roofY + 0.18, -0.1);
      this.chassis.add(head);
    }

    if (['police', 'ambulance', 'fire_truck', 'swat_van'].includes(typeKey)) {
      const red = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const blue = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
      for (const [sx, mat] of [[-w * 0.22, red], [w * 0.22, blue]]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, 0.22, 0.34), mat);
        lamp.position.set(sx, roofY + 0.1, -0.05);
        this.chassis.add(lamp);
      }
    }

    if (['pickup', 'tow_truck', 'box_truck', 'cement_mixer', 'dump_truck'].includes(typeKey)) {
      const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.94, h * 0.9, l * 0.48),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.25 })
      );
      cargo.position.set(0, wheelR + lowerH + h * 0.4, l * 0.22);
      cargo.castShadow = true;
      this.chassis.add(cargo);
    }

    if (['coupe', 'muscle', 'supercar', 'sports', 'roadster', 'rally_car', 'drift_car', 'grand_tourer'].includes(typeKey)) {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.14, 0.5), this.accentMat);
      spoiler.position.set(0, roofY + 0.06, l * 0.4);
      this.chassis.add(spoiler);
    }
  }

  setBodyColor(hex) {
    if (typeof hex !== 'number') return;
    if (this.bodyMat) {
      this.bodyMat.color.setHex(hex);
      if (this.bodyMat.emissive) this.bodyMat.emissive.setHex(0x000000);
    }
    if (this.accentMat) {
      const c = new THREE.Color(hex);
      this.accentMat.color.setRGB(
        Math.min(1, c.r * 0.75 + 0.2),
        Math.min(1, c.g * 0.75 + 0.2),
        Math.min(1, c.b * 0.75 + 0.2)
      );
    }
    this.bodyColor = hex;
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
    const nosKey = Boolean(input.nos);
    this.nitro = clamp((typeof this.nitro === 'number' ? this.nitro : 100)
      + (nosKey ? -28 : 9) * safeDt, 0, 100);
    this.boosting = nosKey && this.nitro > 0 && (forward || this.speed > 0);
    const accelMul = this.boosting ? 1.9 : 1;
    const limitMul = this.boosting ? 1.4 : 1;

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
      this.speed += this.accel * accelMul * safeDt;
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

    this.drifting = false;
    const maxFwd = this.maxSpeed * limitMul;
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