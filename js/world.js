import * as THREE from 'three';
import {
  WORLD_CFG,
  TRAFFIC_CFG,
  PED_CFG,
  COLORS,
  clamp,
  lerp,
  randRange
} from './config.js';

export class World {
  constructor(scene, sunLight = null) {
    this.scene = scene;
    this.sunLight = sunLight;
    this.time = 0;
    this.lightPhase = 0;

    this.cityGroup = new THREE.Group();
    this.trafficGroup = new THREE.Group();
    this.pedGroup = new THREE.Group();

    this.scene.add(this.cityGroup);
    this.scene.add(this.trafficGroup);
    this.scene.add(this.pedGroup);

    this.streetCoords = [];
    this.blockCenters = [];
    this.colliders = [];
    this.trafficLights = [];
    this.trafficPool = [];
    this.pedPool = [];

    this._windowTextureCache = [];
    this._buildWindowTextures();
    this.buildCity();
    this.buildTraffic();
    this.buildPedestrians();
  }

  _buildWindowTextures() {
    const palettes = [
      { wall: '#334155', lit: '#fde68a', dark: '#0f172a' },
      { wall: '#1e3a5f', lit: '#bae6fd', dark: '#09192c' },
      { wall: '#4a352f', lit: '#fed7aa', dark: '#1c120f' },
      { wall: '#2e3a3f', lit: '#bbf7d0', dark: '#0d171a' }
    ];

    for (const pal of palettes) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = pal.wall;
      ctx.fillRect(0, 0, 128, 128);

      const cols = 4;
      const rows = 8;
      const padX = 8;
      const padY = 5;
      const winW = (128 - padX * (cols + 1)) / cols;
      const winH = (128 - padY * (rows + 1)) / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = padX + c * (winW + padX);
          const y = padY + r * (winH + padY);
          const isLit = Math.random() > 0.45;
          ctx.fillStyle = isLit ? pal.lit : pal.dark;
          ctx.fillRect(x, y, winW, winH);
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this._windowTextureCache.push(tex);
    }
  }

  buildCity() {
    this.cityGroup.clear();
    this.streetCoords.length = 0;
    this.blockCenters.length = 0;
    this.colliders.length = 0;
    this.trafficLights.length = 0;

    const pitch = WORLD_CFG.blockSize + WORLD_CFG.roadWidth;
    const totalStreets = WORLD_CFG.blocksPerSide + 1;
    const startCoord = -WORLD_CFG.halfSpan + WORLD_CFG.roadWidth * 0.5;

    for (let i = 0; i < totalStreets; i++) {
      this.streetCoords.push(startCoord + i * pitch);
    }

    for (let bx = 0; bx < WORLD_CFG.blocksPerSide; bx++) {
      for (let bz = 0; bz < WORLD_CFG.blocksPerSide; bz++) {
        const cx = startCoord + WORLD_CFG.roadWidth * 0.5 + WORLD_CFG.blockSize * 0.5 + bx * pitch;
        const cz = startCoord + WORLD_CFG.roadWidth * 0.5 + WORLD_CFG.blockSize * 0.5 + bz * pitch;
        this.blockCenters.push({ x: cx, z: cz, bx, bz });
      }
    }

    const groundMat = new THREE.MeshStandardMaterial({
      color: COLORS.asphalt,
      roughness: 0.88,
      metalness: 0.06
    });
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_CFG.gridSpan + 260, WORLD_CFG.gridSpan + 260),
      groundMat
    );
    groundMesh.rotation.x = -Math.PI * 0.5;
    groundMesh.receiveShadow = true;
    this.cityGroup.add(groundMesh);

    const stripeMat = new THREE.MeshBasicMaterial({ color: COLORS.laneLine });
    const edgeMat = new THREE.MeshBasicMaterial({ color: COLORS.roadEdge });
    const crosswalkMat = new THREE.MeshBasicMaterial({ color: COLORS.crosswalk });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: COLORS.sidewalk,
      roughness: 0.82,
      metalness: 0.05
    });

    const dashGeo = new THREE.PlaneGeometry(0.22, 4.2);
    dashGeo.rotateX(-Math.PI * 0.5);
    const edgeGeoX = new THREE.PlaneGeometry(WORLD_CFG.gridSpan, 0.24);
    edgeGeoX.rotateX(-Math.PI * 0.5);
    const edgeGeoZ = new THREE.PlaneGeometry(0.24, WORLD_CFG.gridSpan);
    edgeGeoZ.rotateX(-Math.PI * 0.5);
    const cwStripeGeo = new THREE.PlaneGeometry(0.65, 2.8);
    cwStripeGeo.rotateX(-Math.PI * 0.5);

    for (const sCoord of this.streetCoords) {
      const edgeNorth = new THREE.Mesh(edgeGeoX, edgeMat);
      edgeNorth.position.set(0, 0.02, sCoord - WORLD_CFG.roadWidth * 0.5 + 0.16);
      this.cityGroup.add(edgeNorth);

      const edgeSouth = new THREE.Mesh(edgeGeoX, edgeMat);
      edgeSouth.position.set(0, 0.02, sCoord + WORLD_CFG.roadWidth * 0.5 - 0.16);
      this.cityGroup.add(edgeSouth);

      const edgeWest = new THREE.Mesh(edgeGeoZ, edgeMat);
      edgeWest.position.set(sCoord - WORLD_CFG.roadWidth * 0.5 + 0.16, 0.02, 0);
      this.cityGroup.add(edgeWest);

      const edgeEast = new THREE.Mesh(edgeGeoZ, edgeMat);
      edgeEast.position.set(sCoord + WORLD_CFG.roadWidth * 0.5 - 0.16, 0.02, 0);
      this.cityGroup.add(edgeEast);

      for (let d = -WORLD_CFG.halfSpan + 4; d < WORLD_CFG.halfSpan - 4; d += 8.5) {
        const isNearIntersection = this.streetCoords.some(
          (ic) => Math.abs(d - ic) < WORLD_CFG.roadWidth * 0.65
        );
        if (isNearIntersection) continue;

        const dashZ = new THREE.Mesh(dashGeo, stripeMat);
        dashZ.position.set(sCoord, 0.025, d);
        this.cityGroup.add(dashZ);

        const dashX = new THREE.Mesh(dashGeo, stripeMat);
        dashX.rotation.y = Math.PI * 0.5;
        dashX.position.set(d, 0.025, sCoord);
        this.cityGroup.add(dashX);
      }
    }

    for (const ix of this.streetCoords) {
      for (const iz of this.streetCoords) {
        const halfRoad = WORLD_CFG.roadWidth * 0.5;
        for (let k = -4; k <= 4; k += 2) {
          const offset = k * 1.15;

          const cwN = new THREE.Mesh(cwStripeGeo, crosswalkMat);
          cwN.position.set(ix + offset, 0.03, iz - halfRoad - 1.5);
          this.cityGroup.add(cwN);

          const cwS = new THREE.Mesh(cwStripeGeo, crosswalkMat);
          cwS.position.set(ix + offset, 0.03, iz + halfRoad + 1.5);
          this.cityGroup.add(cwS);

          const cwW = new THREE.Mesh(cwStripeGeo, crosswalkMat);
          cwW.rotation.y = Math.PI * 0.5;
          cwW.position.set(ix - halfRoad - 1.5, 0.03, iz + offset);
          this.cityGroup.add(cwW);

          const cwE = new THREE.Mesh(cwStripeGeo, crosswalkMat);
          cwE.rotation.y = Math.PI * 0.5;
          cwE.position.set(ix + halfRoad + 1.5, 0.03, iz + offset);
          this.cityGroup.add(cwE);
        }

        this._createIntersectionTrafficLight(ix, iz);
      }
    }

    const lampPoleMat = new THREE.MeshStandardMaterial({
      color: COLORS.lampPole,
      roughness: 0.5,
      metalness: 0.7
    });
    const lampBulbMat = new THREE.MeshBasicMaterial({ color: COLORS.lampGlow });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.2, 8);
    const bulbGeo = new THREE.SphereGeometry(0.32, 8, 8);

    const bSpan = WORLD_CFG.blockSize;
    const swW = WORLD_CFG.sidewalkWidth;
    const swH = WORLD_CFG.sidewalkHeight;
    const innerSpan = Math.max(8, bSpan - swW * 2);

    for (const block of this.blockCenters) {
      const sidewalkMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bSpan, swH, bSpan),
        sidewalkMat
      );
      sidewalkMesh.position.set(block.x, swH * 0.5, block.z);
      sidewalkMesh.receiveShadow = true;
      this.cityGroup.add(sidewalkMesh);

      const lampOffsets = [
        [-bSpan * 0.44, -bSpan * 0.44],
        [bSpan * 0.44, bSpan * 0.44]
      ];
      for (const [lx, lz] of lampOffsets) {
        const pole = new THREE.Mesh(poleGeo, lampPoleMat);
        pole.position.set(block.x + lx, swH + 3.1, block.z + lz);
        pole.castShadow = true;
        this.cityGroup.add(pole);

        const bulb = new THREE.Mesh(bulbGeo, lampBulbMat);
        bulb.position.set(block.x + lx, swH + 6.2, block.z + lz);
        this.cityGroup.add(bulb);
      }

      const subMode = (block.bx + block.bz) % 3;
      const footprints =
        subMode === 0
          ? [
              { x: -innerSpan * 0.25, z: -innerSpan * 0.25, w: innerSpan * 0.42, d: innerSpan * 0.42 },
              { x: innerSpan * 0.25, z: -innerSpan * 0.25, w: innerSpan * 0.42, d: innerSpan * 0.42 },
              { x: -innerSpan * 0.25, z: innerSpan * 0.25, w: innerSpan * 0.42, d: innerSpan * 0.42 },
              { x: innerSpan * 0.25, z: innerSpan * 0.25, w: innerSpan * 0.42, d: innerSpan * 0.42 }
            ]
          : subMode === 1
            ? [
                { x: -innerSpan * 0.22, z: 0, w: innerSpan * 0.42, d: innerSpan * 0.88 },
                { x: innerSpan * 0.24, z: -innerSpan * 0.22, w: innerSpan * 0.4, d: innerSpan * 0.42 },
                { x: innerSpan * 0.24, z: innerSpan * 0.24, w: innerSpan * 0.4, d: innerSpan * 0.42 }
              ]
            : [
                { x: 0, z: -innerSpan * 0.22, w: innerSpan * 0.88, d: innerSpan * 0.42 },
                { x: -innerSpan * 0.22, z: innerSpan * 0.24, w: innerSpan * 0.42, d: innerSpan * 0.4 },
                { x: innerSpan * 0.24, z: innerSpan * 0.24, w: innerSpan * 0.4, d: innerSpan * 0.4 }
              ];

      for (const fp of footprints) {
        const height = randRange(WORLD_CFG.buildingMinHeight, WORLD_CFG.buildingMaxHeight);
        const tex = this._windowTextureCache[Math.floor(Math.random() * this._windowTextureCache.length)].clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(fp.w / 6)), Math.max(1, Math.round(height / 8)));

        const bldgMat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.45,
          metalness: 0.25
        });
        const bldgMesh = new THREE.Mesh(
          new THREE.BoxGeometry(fp.w, height, fp.d),
          bldgMat
        );
        const bx = block.x + fp.x;
        const bz = block.z + fp.z;
        bldgMesh.position.set(bx, swH + height * 0.5, bz);
        bldgMesh.castShadow = true;
        bldgMesh.receiveShadow = true;
        this.cityGroup.add(bldgMesh);

        this.colliders.push({
          minX: bx - fp.w * 0.5,
          maxX: bx + fp.w * 0.5,
          minZ: bz - fp.d * 0.5,
          maxZ: bz + fp.d * 0.5
        });
      }
    }

    this._buildSkyline();
  }

  _buildSkyline() {
    const skylineMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.2
    });

    for (let i = 0; i < WORLD_CFG.skylineCount; i++) {
      const angle = (i / WORLD_CFG.skylineCount) * Math.PI * 2 + randRange(-0.04, 0.04);
      const radius = randRange(WORLD_CFG.skylineRadiusMin, WORLD_CFG.skylineRadiusMax);
      const w = randRange(14, 28);
      const d = randRange(14, 28);
      const h = randRange(24, 82);

      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skylineMat);
      tower.position.set(Math.cos(angle) * radius, h * 0.5 - 2, Math.sin(angle) * radius);
      tower.rotation.y = randRange(-0.25, 0.25);
      this.cityGroup.add(tower);
    }
  }

  _createIntersectionTrafficLight(ix, iz) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.5 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    const nsMat = new THREE.MeshBasicMaterial({ color: COLORS.trafficGreen });
    const ewMat = new THREE.MeshBasicMaterial({ color: COLORS.trafficRed });

    const offset = WORLD_CFG.roadWidth * 0.5 + 0.8;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.4, 8), postMat);
    post.position.set(ix + offset, 2.7, iz - offset);
    this.cityGroup.add(post);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.35, 0.55), housingMat);
    housing.position.set(ix + offset, 5.2, iz - offset);
    this.cityGroup.add(housing);

    const nsLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), nsMat);
    nsLight.position.set(ix + offset, 5.45, iz - offset + 0.3);
    this.cityGroup.add(nsLight);

    const ewLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), ewMat);
    ewLight.position.set(ix + offset + 0.3, 5.05, iz - offset);
    this.cityGroup.add(ewLight);

    this.trafficLights.push({
      x: ix,
      z: iz,
      nsMat,
      ewMat,
      nsState: 'green',
      ewState: 'red'
    });
  }

  _createVehicleMesh(typeKey, colorHex) {
    const cfg = TRAFFIC_CFG.types[typeKey] || TRAFFIC_CFG.types.sedan;
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.32,
      metalness: 0.35
    });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.15,
      metalness: 0.75
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.85
    });

    const wRadius = 0.42;
    const chassisH = cfg.height * 0.55;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(cfg.width, chassisH, cfg.length), bodyMat);
    lower.position.y = wRadius + chassisH * 0.5;
    lower.castShadow = true;
    lower.receiveShadow = true;
    group.add(lower);

    const upperH = Math.max(0.35, cfg.height - chassisH);
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.width * 0.84, upperH, cfg.length * 0.58),
      typeKey === 'truck' || typeKey === 'bus' ? bodyMat : cabinMat
    );
    upper.position.y = wRadius + chassisH + upperH * 0.5 - 0.04;
    upper.castShadow = true;
    group.add(upper);

    const wheelGeo = new THREE.CylinderGeometry(wRadius, wRadius, 0.32, 10);
    wheelGeo.rotateZ(Math.PI * 0.5);
    const wheels = [];
    const wx = cfg.width * 0.5;
    const wz = cfg.length * 0.32;
    for (const [cx, cz] of [
      [-wx, wz],
      [wx, wz],
      [-wx, -wz],
      [wx, -wz]
    ]) {
      const wm = new THREE.Mesh(wheelGeo, tireMat);
      wm.position.set(cx, wRadius, cz);
      wm.castShadow = true;
      group.add(wm);
      wheels.push(wm);
    }

    return { group, wheels };
  }

  buildTraffic() {
    this.trafficGroup.clear();
    this.trafficPool.length = 0;

    const typeKeys = Object.keys(TRAFFIC_CFG.types);
    for (let i = 0; i < TRAFFIC_CFG.poolSize; i++) {
      const typeKey = typeKeys[i % typeKeys.length];
      const tCfg = TRAFFIC_CFG.types[typeKey];
      const colorHex = tCfg.colors[i % tCfg.colors.length];
      const { group, wheels } = this._createVehicleMesh(typeKey, colorHex);
      this.trafficGroup.add(group);

      const agent = {
        typeKey,
        width: tCfg.width,
        length: tCfg.length,
        baseSpeed: randRange(tCfg.speedMin, tCfg.speedMax),
        currentSpeed: 0,
        group,
        wheels,
        axis: 'z',
        dir: 1,
        laneCoord: 0,
        posAlongAxis: 0,
        heading: 0,
        turning: false,
        turnTargetHeading: 0,
        lastIntersectionKey: ''
      };
      this._respawnTrafficAgent(agent, { x: 0, z: 0 }, true);
      this.trafficPool.push(agent);
    }
  }

  _respawnTrafficAgent(agent, playerPos, initial = false) {
    const axis = Math.random() < 0.5 ? 'z' : 'x';
    const dir = Math.random() < 0.5 ? 1 : -1;
    const street = this.streetCoords[Math.floor(Math.random() * this.streetCoords.length)] || 0;
    const laneCoord = street + dir * WORLD_CFG.laneOffset;

    const minD = initial ? 24 : TRAFFIC_CFG.spawnMinDist;
    const maxD = initial ? 120 : TRAFFIC_CFG.spawnMaxDist;
    const offsetDist = randRange(minD, maxD) * (Math.random() < 0.78 ? 1 : -1);

    let x = 0;
    let z = 0;
    let heading = 0;

    if (axis === 'z') {
      x = laneCoord;
      z = playerPos.z + offsetDist;
      heading = dir > 0 ? 0 : Math.PI;
    } else {
      z = laneCoord;
      x = playerPos.x + offsetDist;
      heading = dir > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    }

    agent.axis = axis;
    agent.dir = dir;
    agent.laneCoord = laneCoord;
    agent.heading = heading;
    agent.turning = false;
    agent.turnTargetHeading = heading;
    agent.currentSpeed = agent.baseSpeed;
    agent.lastIntersectionKey = '';

    agent.group.position.set(x, 0, z);
    agent.group.rotation.y = heading;
  }

  buildPedestrians() {
    this.pedGroup.clear();
    this.pedPool.length = 0;

    const headMat = new THREE.MeshStandardMaterial({ color: 0xfdba74, roughness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });
    const headGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
    const torsoGeo = new THREE.BoxGeometry(0.46, 0.62, 0.28);
    const limbGeo = new THREE.BoxGeometry(0.16, 0.56, 0.16);

    for (let i = 0; i < PED_CFG.poolSize; i++) {
      const shirtColor = PED_CFG.shirtColors[i % PED_CFG.shirtColors.length];
      const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.65 });

      const root = new THREE.Group();
      const bodyPivot = new THREE.Group();
      bodyPivot.position.y = 0.56;
      root.add(bodyPivot);

      const torso = new THREE.Mesh(torsoGeo, shirtMat);
      torso.position.y = 0.32;
      torso.castShadow = true;
      bodyPivot.add(torso);

      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.82;
      head.castShadow = true;
      bodyPivot.add(head);

      const leftLeg = new THREE.Mesh(limbGeo, legMat);
      leftLeg.position.set(-0.12, -0.28, 0);
      bodyPivot.add(leftLeg);

      const rightLeg = new THREE.Mesh(limbGeo, legMat);
      rightLeg.position.set(0.12, -0.28, 0);
      bodyPivot.add(rightLeg);

      const leftArm = new THREE.Mesh(limbGeo, shirtMat);
      leftArm.scale.set(0.85, 0.85, 0.85);
      leftArm.position.set(-0.32, 0.34, 0);
      bodyPivot.add(leftArm);

      const rightArm = new THREE.Mesh(limbGeo, shirtMat);
      rightArm.scale.set(0.85, 0.85, 0.85);
      rightArm.position.set(0.32, 0.34, 0);
      bodyPivot.add(rightArm);

      this.pedGroup.add(root);

      const ped = {
        root,
        bodyPivot,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        speed: randRange(PED_CFG.walkSpeedMin, PED_CFG.walkSpeedMax),
        vx: 0,
        vz: 0,
        phase: randRange(0, Math.PI * 2),
        dodgeOffsetX: 0,
        dodgeOffsetZ: 0
      };
      this._respawnPedestrian(ped, { x: 0, z: 0 }, true);
      this.pedPool.push(ped);
    }
  }

  _respawnPedestrian(ped, playerPos, initial = false) {
    const block = this.blockCenters[Math.floor(Math.random() * this.blockCenters.length)] || { x: 0, z: 0 };
    const halfB = WORLD_CFG.blockSize * 0.5 - 0.8;
    const edgeChoice = Math.floor(Math.random() * 4);
    let x = block.x;
    let z = block.z;
    let vx = 0;
    let vz = 0;

    const along = randRange(-halfB, halfB);
    const dir = Math.random() < 0.5 ? 1 : -1;

    if (edgeChoice === 0) {
      x = block.x + along;
      z = block.z - halfB;
      vx = dir * ped.speed;
    } else if (edgeChoice === 1) {
      x = block.x + along;
      z = block.z + halfB;
      vx = dir * ped.speed;
    } else if (edgeChoice === 2) {
      x = block.x - halfB;
      z = block.z + along;
      vz = dir * ped.speed;
    } else {
      x = block.x + halfB;
      z = block.z + along;
      vz = dir * ped.speed;
    }

    if (!initial) {
      const angle = randRange(0, Math.PI * 2);
      const dist = randRange(PED_CFG.spawnMinDist, PED_CFG.spawnMaxDist);
      x = clamp(playerPos.x + Math.cos(angle) * dist, -WORLD_CFG.halfSpan + 4, WORLD_CFG.halfSpan - 4);
      z = clamp(playerPos.z + Math.sin(angle) * dist, -WORLD_CFG.halfSpan + 4, WORLD_CFG.halfSpan - 4);
    }

    ped.vx = vx;
    ped.vz = vz;
    ped.dodgeOffsetX = 0;
    ped.dodgeOffsetZ = 0;
    ped.root.position.set(x, WORLD_CFG.sidewalkHeight, z);
    if (Math.abs(vx) > 0.01) {
      ped.root.rotation.y = vx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    } else {
      ped.root.rotation.y = vz > 0 ? 0 : Math.PI;
    }
  }

  _updateTrafficLights(dt) {
    const cycle = WORLD_CFG.lightCycleDurationSec;
    const t = (this.time % cycle) / cycle;
    let nsState = 'green';
    let ewState = 'red';

    if (t < WORLD_CFG.redLightRatio) {
      nsState = 'red';
      ewState = 'green';
    } else if (t < WORLD_CFG.redLightRatio + WORLD_CFG.yellowLightRatio) {
      nsState = 'yellow';
      ewState = 'red';
    } else {
      nsState = 'green';
      ewState = 'yellow';
    }

    const colorFor = (state) =>
      state === 'green'
        ? COLORS.trafficGreen
        : state === 'yellow'
          ? COLORS.trafficYellow
          : COLORS.trafficRed;

    for (const tl of this.trafficLights) {
      tl.nsState = nsState;
      tl.ewState = ewState;
      tl.nsMat.color.setHex(colorFor(nsState));
      tl.ewMat.color.setHex(colorFor(ewState));
    }
  }

  _isStoppedAtRedLight(agent) {
    const pos = agent.group.position;
    const stopDist = WORLD_CFG.roadWidth * 0.5 + TRAFFIC_CFG.stopLineBuffer;

    for (const tl of this.trafficLights) {
      if (agent.axis === 'z') {
        if (tl.nsState !== 'red') continue;
        if (Math.abs(pos.x - tl.x) > WORLD_CFG.roadWidth) continue;
        const delta = (tl.z - pos.z) * agent.dir;
        if (delta > 1.5 && delta < stopDist) {
          return true;
        }
      } else {
        if (tl.ewState !== 'red') continue;
        if (Math.abs(pos.z - tl.z) > WORLD_CFG.roadWidth) continue;
        const delta = (tl.x - pos.x) * agent.dir;
        if (delta > 1.5 && delta < stopDist) {
          return true;
        }
      }
    }
    return false;
  }

  _hasTrafficAhead(agent) {
    const p = agent.group.position;
    const fwdX = -Math.sin(agent.heading);
    const fwdZ = -Math.cos(agent.heading);

    for (const other of this.trafficPool) {
      if (other === agent) continue;
      const dx = other.group.position.x - p.x;
      const dz = other.group.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > TRAFFIC_CFG.minVehicleGap + agent.length * 0.5 + other.length * 0.5) continue;
      if (dist < 0.01) continue;
      const dot = (dx * fwdX + dz * fwdZ) / dist;
      if (dot > 0.75) {
        return true;
      }
    }
    return false;
  }

  _updateTraffic(dt, playerPos) {
    for (const agent of this.trafficPool) {
      const pos = agent.group.position;
      const distToPlayer = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (distToPlayer > TRAFFIC_CFG.recycleDist) {
        this._respawnTrafficAgent(agent, playerPos, false);
        continue;
      }

      const redStop = this._isStoppedAtRedLight(agent);
      const blocked = this._hasTrafficAhead(agent);
      const targetSpeed = redStop || blocked ? 0 : agent.baseSpeed;
      agent.currentSpeed = lerp(agent.currentSpeed, targetSpeed, dt * 6);

      if (!agent.turning && !redStop) {
        for (const ix of this.streetCoords) {
          for (const iz of this.streetCoords) {
            const key = `${ix.toFixed(1)},${iz.toFixed(1)}`;
            if (key === agent.lastIntersectionKey) continue;
            const dInter = Math.hypot(pos.x - ix, pos.z - iz);
            if (dInter < 2.2 && Math.random() < TRAFFIC_CFG.turnProbability * dt * 12) {
              agent.lastIntersectionKey = key;
              const turnDir = Math.random() < 0.5 ? 1 : -1;
              if (agent.axis === 'z') {
                agent.axis = 'x';
                agent.dir = turnDir;
                agent.laneCoord = iz + turnDir * WORLD_CFG.laneOffset;
                agent.turnTargetHeading = turnDir > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
              } else {
                agent.axis = 'z';
                agent.dir = turnDir;
                agent.laneCoord = ix + turnDir * WORLD_CFG.laneOffset;
                agent.turnTargetHeading = turnDir > 0 ? 0 : Math.PI;
              }
              agent.turning = true;
            }
          }
        }
      }

      if (agent.turning) {
        let diff = agent.turnTargetHeading - agent.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        agent.heading += diff * Math.min(1, dt * 8);
        if (Math.abs(diff) < 0.05) {
          agent.heading = agent.turnTargetHeading;
          agent.turning = false;
        }
      }

      const step = agent.currentSpeed * dt;
      if (agent.axis === 'z') {
        pos.z += agent.dir * step;
        pos.x = lerp(pos.x, agent.laneCoord, dt * 5);
      } else {
        pos.x += agent.dir * step;
        pos.z = lerp(pos.z, agent.laneCoord, dt * 5);
      }

      agent.group.rotation.y = agent.heading;
      const wheelRot = (step / 0.42);
      for (const w of agent.wheels) {
        w.rotation.x -= wheelRot;
      }
    }
  }

  _updatePedestrians(dt, playerPos) {
    for (const ped of this.pedPool) {
      const pos = ped.root.position;
      const distToPlayer = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (distToPlayer > PED_CFG.recycleDist) {
        this._respawnPedestrian(ped, playerPos, false);
        continue;
      }

      let targetDodgeX = 0;
      let targetDodgeZ = 0;
      if (distToPlayer < PED_CFG.avoidRadius && distToPlayer > 0.01) {
        const awayX = (pos.x - playerPos.x) / distToPlayer;
        const awayZ = (pos.z - playerPos.z) / distToPlayer;
        const strength = (1 - distToPlayer / PED_CFG.avoidRadius) * PED_CFG.avoidStepDist;
        targetDodgeX = awayX * strength;
        targetDodgeZ = awayZ * strength;
      }

      ped.dodgeOffsetX = lerp(ped.dodgeOffsetX, targetDodgeX, dt * 8);
      ped.dodgeOffsetZ = lerp(ped.dodgeOffsetZ, targetDodgeZ, dt * 8);

      pos.x += ped.vx * dt + ped.dodgeOffsetX * dt * 4;
      pos.z += ped.vz * dt + ped.dodgeOffsetZ * dt * 4;

      const halfSpan = WORLD_CFG.halfSpan - 2;
      if (Math.abs(pos.x) > halfSpan || Math.abs(pos.z) > halfSpan) {
        this._respawnPedestrian(ped, playerPos, false);
        continue;
      }

      ped.phase += dt * ped.speed * 4.2;
      const swing = Math.sin(ped.phase) * 0.65;
      ped.leftLeg.rotation.x = swing;
      ped.rightLeg.rotation.x = -swing;
      ped.leftArm.rotation.x = -swing * 0.75;
      ped.rightArm.rotation.x = swing * 0.75;
      ped.bodyPivot.position.y = WORLD_CFG.sidewalkHeight + 0.56 + Math.abs(Math.cos(ped.phase)) * 0.05;
    }
  }

  _updateDayNight(dt) {
    const cycle = WORLD_CFG.dayCycleDurationSec;
    this.lightPhase = (this.time % cycle) / cycle;
    const daylight = 0.5 + 0.5 * Math.cos(this.lightPhase * Math.PI * 2);

    const topCol = new THREE.Color(COLORS.skyNightTop).lerp(new THREE.Color(COLORS.skyDayTop), daylight);
    const fogCol = new THREE.Color(COLORS.fogNight).lerp(new THREE.Color(COLORS.fogDay), daylight);
    const sunCol = new THREE.Color(COLORS.sunNight).lerp(new THREE.Color(COLORS.sunDay), daylight);

    this.scene.background = topCol;
    if (this.scene.fog) {
      this.scene.fog.color.copy(fogCol);
    }
    if (this.sunLight) {
      this.sunLight.color.copy(sunCol);
      this.sunLight.intensity = lerp(0.55, 1.55, daylight);
    }
  }

  update(dt, playerPos = { x: 0, z: 0 }) {
    const safeDt = Math.min(dt, 0.05);
    this.time += safeDt;

    this._updateTrafficLights(safeDt);
    this._updateTraffic(safeDt, playerPos);
    this._updatePedestrians(safeDt, playerPos);
    this._updateDayNight(safeDt);
  }

  getColliders() {
    return this.colliders;
  }
}

export default World;