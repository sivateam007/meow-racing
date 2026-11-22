// js/world.js
// Meow Racing — procedural world: sky, ocean, beach, palms, buildings, clouds,
// road with lanes, guardrails, traffic AI, checkpoints, pickups, menu platform.
// Everything is built from Three.js primitives + CanvasTextures (no external assets).

import * as THREE from 'three';
import {
  ROAD,
  WORLD,
  TRAFFIC,
  SPAWN,
  PICKUPS,
  LANE_POSITIONS,
  LANES,
  clamp,
  randRange,
  randInt,
  pick
} from './config.js';

const TWO_PI = Math.PI * 2;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // Grouped containers so we can toggle/cleanup by category.
    this.envGroup = new THREE.Group();
    this.roadGroup = new THREE.Group();
    this.trafficGroup = new THREE.Group();
    this.pickupGroup = new THREE.Group();
    this.checkpointGroup = new THREE.Group();
    this.menuGroup = new THREE.Group();

    this.envGroup.name = 'Env';
    this.roadGroup.name = 'Road';
    this.trafficGroup.name = 'Traffic';
    this.pickupGroup.name = 'Pickups';
    this.checkpointGroup.name = 'Checkpoints';
    this.menuGroup.name = 'MenuPlatform';

    scene.add(
      this.envGroup,
      this.roadGroup,
      this.trafficGroup,
      this.pickupGroup,
      this.checkpointGroup,
      this.menuGroup
    );

    // Road segments (pooled, recycled ahead/behind camera).
    this.segments = [];
    this.nextSegmentZ = 0;

    // Traffic pool.
    this.traffic = [];

    // Pickups.
    this.pickups = [];
    this.nextCoinZ = 0;
    this.coinCounter = 0;
    this.nextTurboZ = SPAWN.turboPickupEveryDistance;

    // Checkpoints.
    this.checkpoints = [];
    this.nextCheckpointZ = SPAWN.checkpointFirstAt;

    // Build order matters: distant scenery first, then road/traffic.
    this._buildSky();
    this._buildLights();
    this._buildOcean();
    this._buildBeach();
    this._buildPalms();
    this._buildBuildings();
    this._buildClouds();
    this._buildMenuPlatform();
    this._buildRoadTextures();
    this._initRoadSegments();
    this._initTraffic();
    this._initPickups();
    this._initCheckpoints();
  }

  // ===========================================================================
  // SKY
  // ===========================================================================
  _buildSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#2a95d8');
    grad.addColorStop(0.45, '#6fc0ec');
    grad.addColorStop(0.78, '#b9e0f5');
    grad.addColorStop(1.0, '#e6f3fb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Faint horizon haze band.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 360, 512, 60);

    // Soft cloud wisps in the sky gradient.
    for (let i = 0; i < 22; i++) {
      const cx = Math.random() * 512;
      const cy = 40 + Math.random() * 300;
      const rw = 40 + Math.random() * 90;
      const rh = 8 + Math.random() * 18;
      ctx.fillStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, TWO_PI);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.name = 'Sky';
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.scene.background = new THREE.Color(WORLD.fogColor);
    this.scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);
  }

  // ===========================================================================
  // LIGHTS
  // ===========================================================================
  _buildLights() {
    const hemi = new THREE.HemisphereLight(0x9fd8ff, 0xf5e2b8, WORLD.hemiIntensity);
    hemi.name = 'HemiLight';
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, WORLD.ambientIntensity * 0.4);
    ambient.name = 'AmbientLight';
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff2d8, WORLD.sunIntensity);
    sun.name = 'SunLight';
    sun.position.set(
      WORLD.sunDirection.x * 140,
      WORLD.sunDirection.y * 140,
      WORLD.sunDirection.z * 140
    );
    sun.castShadow = true;
    sun.shadow.mapSize.width = WORLD.shadowMapSize;
    sun.shadow.mapSize.height = WORLD.shadowMapSize;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  // ===========================================================================
  // OCEAN (animated water via CanvasTexture + scrolling UV offset)
  // ===========================================================================
  _buildOcean() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base blue gradient.
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1f8fd4');
    grad.addColorStop(0.5, '#2aa7e8');
    grad.addColorStop(1, '#4cc0f2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Wave streaks.
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * 256;
      const x = Math.random() * 256;
      const w = 12 + Math.random() * 40;
      const h = 1 + Math.random() * 2.2;
      const a = 0.08 + Math.random() * 0.20;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, 0, TWO_PI);
      ctx.fill();
    }

    // Darker foam accents.
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const w = 8 + Math.random() * 22;
      const h = 1 + Math.random() * 2;
      ctx.fillStyle = `rgba(10,80,130,${(0.05 + Math.random() * 0.10).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, 0, TWO_PI);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(30, 30);
    this.oceanTex = tex;

    const oceanGeo = new THREE.PlaneGeometry(1200, 1200, 1, 1);
    const oceanMat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      flatShading: true,
      metalness: 0.15,
      roughness: 0.55
    });
    this.ocean = new THREE.Mesh(oceanGeo, oceanMat);
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.set(0, WORLD.oceanLevel, -200);
    this.ocean.receiveShadow = false;
    this.ocean.name = 'Ocean';
    this.envGroup.add(this.ocean);

    // Ocean floor filler to hide the void from odd camera angles.
    const floorGeo = new THREE.PlaneGeometry(2000, 2000, 1, 1);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x0f6ba8, fog: true });
    this.oceanFloor = new THREE.Mesh(floorGeo, floorMat);
    this.oceanFloor.rotation.x = -Math.PI / 2;
    this.oceanFloor.position.set(0, WORLD.oceanLevel - 4, -200);
    this.envGroup.add(this.oceanFloor);
  }

  // ===========================================================================
  // BEACH (sand strip + foam line between ocean and road)
  // ===========================================================================
  _buildBeach() {
    const sandCanvas = document.createElement('canvas');
    sandCanvas.width = 256;
    sandCanvas.height = 256;
    const sctx = sandCanvas.getContext('2d');
    sctx.fillStyle = '#f0dbaf';
    sctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 0.6 + Math.random() * 1.6;
      const a = 0.04 + Math.random() * 0.10;
      sctx.fillStyle = Math.random() < 0.5
        ? `rgba(200,170,120,${a.toFixed(3)})`
        : `rgba(255,245,220,${a.toFixed(3)})`;
      sctx.beginPath();
      sctx.arc(x, y, r, 0, TWO_PI);
      sctx.fill();
    }

    const sandTex = new THREE.CanvasTexture(sandCanvas);
    sandTex.colorSpace = THREE.SRGBColorSpace;
    sandTex.wrapS = THREE.RepeatWrapping;
    sandTex.wrapT = THREE.RepeatWrapping;
    sandTex.repeat.set(40, 8);

    const beachGeo = new THREE.PlaneGeometry(800, 90, 1, 1);
    const beachMat = new THREE.MeshStandardMaterial({
      map: sandTex,
      color: 0xffffff,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0
    });
    this.beach = new THREE.Mesh(beachGeo, beachMat);
    this.beach.rotation.x = -Math.PI / 2;
    this.beach.position.set(0, WORLD.beachLevel, -20);
    this.beach.receiveShadow = true;
    this.beach.name = 'Beach';
    this.envGroup.add(this.beach);

    // Ground under the road (grass-green low-poly strip so gaps are filled).
    const groundGeo = new THREE.PlaneGeometry(800, 1200, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x6fc46a,
      flatShading: true,
      roughness: 1.0
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, WORLD.groundY - 0.2, -400);
    this.ground.receiveShadow = true;
    this.envGroup.add(this.ground);

    // Foam line (thin white strip where ocean meets sand).
    const foamGeo = new THREE.PlaneGeometry(800, 3.5, 1, 1);
    const foamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    this.foam = new THREE.Mesh(foamGeo, foamMat);
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.set(0, WORLD.oceanLevel + 0.05, -22);
    this.envGroup.add(this.foam);

    // Second quieter foam band.
    const foam2 = this.foam.clone();
    foam2.material = foamMat.clone();
    foam2.material.opacity = 0.4;
    foam2.scale.set(1, 0.6, 1);
    foam2.position.z = -14;
    this.foam2 = foam2;
    this.envGroup.add(foam2);
  }

  // ===========================================================================
  // PALM TREES (procedural, pooled, recycled along the beach)
  // ===========================================================================
  _buildPalms() {
    this.palms = [];
    const palmCount = 26;
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x8a5a2e,
      flatShading: true,
      roughness: 0.95
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x2fbf5a,
      flatShading: true,
      roughness: 0.85
    });
    const leafMatDark = new THREE.MeshStandardMaterial({
      color: 0x229948,
      flatShading: true,
      roughness: 0.85
    });
    const coconutMat = new THREE.MeshStandardMaterial({
      color: 0x4a2f18,
      flatShading: true,
      roughness: 0.9
    });

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 6.5, 6);
    trunkGeo.translate(0, 3.25, 0);

    const leafGeo = new THREE.ConeGeometry(1.3, 0.35, 5);
    const coconutGeo = new THREE.SphereGeometry(0.22, 6, 5);

    for (let i = 0; i < palmCount; i++) {
      const palm = new THREE.Group();

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.rotation.z = randRange(-0.10, 0.10);
      trunk.castShadow = true;
      palm.add(trunk);

      // Palm crown.
      const crown = new THREE.Group();
      crown.position.y = 6.5;
      palm.add(crown);

      const leafCount = 6 + randInt(0, 2);
      for (let l = 0; l < leafCount; l++) {
        const leaf = new THREE.Mesh(leafGeo, l % 2 ? leafMatDark : leafMat);
        const ang = (l / leafCount) * TWO_PI + randRange(-0.1, 0.1);
        const droop = randRange(0.55, 0.95);
        leaf.position.set(Math.cos(ang) * 1.0, randRange(-0.05, 0.15), Math.sin(ang) * 1.0);
        leaf.rotation.z = Math.PI / 2 - droop;
        leaf.rotation.y = -ang;
        leaf.scale.setScalar(randRange(0.85, 1.15));
        leaf.castShadow = true;
        crown.add(leaf);
      }

      // Coconuts.
      for (let c = 0; c < 3; c++) {
        const coco = new THREE.Mesh(coconutGeo, coconutMat);
        const a = Math.random() * TWO_PI;
        coco.position.set(Math.cos(a) * 0.35, -0.15, Math.sin(a) * 0.35);
        coco.castShadow = true;
        crown.add(coco);
      }

      // Side of the road (left or right, biased to the ocean side = -X).
      const side = i % 2 === 0 ? -1 : 1;
      const baseX = side * randRange(ROAD.width * 0.5 + 6, ROAD.width * 0.5 + 26);
      const baseZ = -i * 22 + randRange(-6, 6);
      palm.position.set(baseX, WORLD.beachLevel + 0.1, baseZ);
      palm.rotation.y = Math.random() * TWO_PI;
      const s = randRange(0.85, 1.25);
      palm.scale.setScalar(s);

      palm.userData = { baseX, baseZ, swayPhase: Math.random() * TWO_PI };
      this.envGroup.add(palm);
      this.palms.push(palm);
    }
  }

  // ===========================================================================
  // BUILDINGS (low-poly city blocks beyond the palms)
  // ===========================================================================
  _buildBuildings() {
    this.buildings = [];
    const palette = [0xf5e5c8, 0xe8c9a0, 0xd6e8f5, 0xf7b8a0, 0xc8e0d0, 0xf0d0e0];
    const roofPalette = [0xb85c5c, 0x8a6a4a, 0x5a7a9a, 0x7a9a6a];

    const buildingCount = 34;
    for (let i = 0; i < buildingCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const baseX = side * randRange(ROAD.width * 0.5 + 38, ROAD.width * 0.5 + 110);
      const baseZ = -i * 18 + randRange(-10, 10);

      const w = randRange(4, 9);
      const d = randRange(4, 9);
      const h = randRange(6, 26);

      const bodyMat = new THREE.MeshStandardMaterial({
        color: pick(palette),
        flatShading: true,
        roughness: 0.9
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      body.position.set(baseX, h / 2 + WORLD.beachLevel, baseZ);
      body.castShadow = true;
      body.receiveShadow = true;

      const roofMat = new THREE.MeshStandardMaterial({
        color: pick(roofPalette),
        flatShading: true,
        roughness: 0.85
      });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, h * 0.22, 4), roofMat);
      roof.position.set(baseX, h + WORLD.beachLevel + h * 0.11, baseZ);
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;

      // Windows (emissive strips).
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x6fa8d0,
        emissive: 0x224466,
        emissiveIntensity: 0.5,
        flatShading: true,
        roughness: 0.4,
        metalness: 0.2
      });
      const rows = Math.max(1, Math.floor(h / 3.5));
      const cols = Math.max(1, Math.floor(w / 2.2));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), winMat);
          const wx = baseX - w / 2 + (c + 0.5) * (w / cols);
          const wy = WORLD.beachLevel + 2.0 + r * (h / (rows + 1));
          win.position.set(wx, wy, baseZ + d / 2 + 0.03);
          body.add; // no-op (kept for clarity)
          this.envGroup.add(win);
        }
      }

      this.envGroup.add(body);
      this.envGroup.add(roof);
      this.buildings.push(body);
    }
  }

  // ===========================================================================
  // CLOUDS (billboarded puffy groups)
  // ===========================================================================
  _buildClouds() {
    this.clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.95
    });

    const puffGeo = new THREE.IcosahedronGeometry(1, 0);

    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const puffCount = 4 + randInt(0, 3);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        const s = randRange(2.0, 4.5);
        puff.scale.set(s * randRange(0.9, 1.3), s * randRange(0.65, 0.9), s * randRange(0.9, 1.3));
        puff.position.set(
          randRange(-7, 7),
          randRange(-1.2, 1.2),
          randRange(-3, 3)
        );
        puff.castShadow = false;
        puff.receiveShadow = false;
        cloud.add(puff);
      }
      cloud.position.set(
        randRange(-260, 260),
        randRange(38, 70),
        randRange(-460, -120)
      );
      cloud.userData = { driftX: randRange(-1.5, -0.4) };
      this.envGroup.add(cloud);
      this.clouds.push(cloud);
    }
  }

  // ===========================================================================
  // MENU PLATFORM (round grey pad under the car on the title screen)
  // ===========================================================================
  _buildMenuPlatform() {
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x9a9a9a,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.2
    });
    const platTopMat = new THREE.MeshStandardMaterial({
      color: 0xbdbdbd,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.3
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x6a6a6a,
      flatShading: true,
      roughness: 0.9
    });

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(7.0, 7.2, 0.6, 32), platMat);
    disc.position.y = 0.3;
    disc.receiveShadow = true;
    disc.castShadow = true;
    this.menuGroup.add(disc);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.8, 0.12, 32), platTopMat);
    top.position.y = 0.66;
    top.receiveShadow = true;
    this.menuGroup.add(top);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.0, 0.18, 8, 40), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.6;
    this.menuGroup.add(rim);

    // Decorative ring markings.
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2aa7e8,
      transparent: true,
      opacity: 0.65
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 6, 40), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.74;
    this.menuGroup.add(ring);

    this.menuPlatform = this.menuGroup;
  }

  // ===========================================================================
  // ROAD TEXTURES (asphalt, lane stripes, guardrails via CanvasTexture)
  // ===========================================================================
  _buildRoadTextures() {
    // Asphalt texture.
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4a4a52';
    ctx.fillRect(0, 0, 256, 512);

    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 512;
      const r = 0.5 + Math.random() * 1.5;
      const v = Math.floor(50 + Math.random() * 40);
      ctx.fillStyle = `rgba(${v},${v},${v + 4},${(0.2 + Math.random() * 0.3).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TWO_PI);
      ctx.fill();
    }

    // Center dashed white line at U=0.5.
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const dashLen = 46;
    for (let y = 0; y < 512; y += dashLen * 2) {
      ctx.fillRect(126, y, 4, dashLen);
    }

    const asphaltTex = new THREE.CanvasTexture(c);
    asphaltTex.colorSpace = THREE.SRGBColorSpace;
    asphaltTex.wrapS = THREE.RepeatWrapping;
    asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(1, 1);
    this.asphaltTex = asphaltTex;

    // Lane-stripe overlay texture (transparent except for the white dashes).
    const s = document.createElement('canvas');
    s.width = 512;
    s.height = 512;
    const sctx = s.getContext('2d');
    sctx.clearRect(0, 0, 512, 512);

    // 4 interior lane separators (at X = 1/5, 2/5, 3/5, 4/5).
    sctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 1; i < 5; i++) {
      const x = (512 * i) / 5;
      const dashLen = 40;
      for (let y = 0; y < 512; y += dashLen * 2) {
        sctx.fillRect(x - 2, y, 4, dashLen);
      }
    }
    // Solid yellow-ish edges.
    sctx.fillStyle = 'rgba(255,230,120,0.95)';
    sctx.fillRect(2, 0, 4, 512);
    sctx.fillRect(506, 0, 4, 512);

    const stripeTex = new THREE.CanvasTexture(s);
    stripeTex.colorSpace = THREE.SRGBColorSpace;
    stripeTex.wrapS = THREE.ClampToEdgeWrapping;
    stripeTex.wrapT = THREE.RepeatWrapping;
    stripeTex.repeat.set(1, 1);
    this.stripeTex = stripeTex;

    this.roadMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.05
    });
    this.roadStripeMat = new THREE.MeshStandardMaterial({
      map: stripeTex,
      transparent: true,
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
      depthWrite: false
    });
  }

  // ===========================================================================
  // ROAD SEGMENTS (pooled, recycled)
  // ===========================================================================
  _initRoadSegments() {
    const total = ROAD.segmentsAhead + ROAD.segmentsBehind;
    for (let i = 0; i < total; i++) {
      const seg = this._createRoadSegment();
      seg.position.z = -ROAD.segmentLength * (i - ROAD.segmentsBehind);
      seg.userData.index = i;
      this.roadGroup.add(seg);
      this.segments.push(seg);
    }
    this.nextSegmentZ = -ROAD.segmentLength * ROAD.segmentsAhead;
  }

  _createRoadSegment() {
    const seg = new THREE.Group();

    const L = ROAD.segmentLength;
    const W = ROAD.width;

    // Road surface.
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W, L, 1, 1), this.roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.001;
    road.receiveShadow = true;
    road.name = 'RoadSurface';
    seg.add(road);

    // Lane stripe overlay (slightly above road surface).
    const stripes = new THREE.Mesh(new THREE.PlaneGeometry(W, L, 1, 1), this.roadStripeMat);
    stripes.rotation.x = -Math.PI / 2;
    stripes.position.y = 0.006;
    stripes.renderOrder = 1;
    stripes.name = 'LaneStripes';
    seg.add(stripes);

    // Shoulders (small dirt edges).
    const shoulderMat = new THREE.MeshStandardMaterial({
      color: 0xc8b088,
      flatShading: true,
      roughness: 1.0
    });
    const shoulderL = new THREE.Mesh(new THREE.PlaneGeometry(ROAD.shoulderWidth, L, 1, 1), shoulderMat);
    shoulderL.rotation.x = -Math.PI / 2;
    shoulderL.position.set(-W / 2 - ROAD.shoulderWidth / 2, 0.0, 0);
    shoulderL.receiveShadow = true;
    seg.add(shoulderL);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = W / 2 + ROAD.shoulderWidth / 2;
    seg.add(shoulderR);

    // Guardrails.
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xbfc7cf,
      flatShading: true,
      metalness: 0.6,
      roughness: 0.45
    });
    const railGeo = new THREE.BoxGeometry(ROAD.guardrailThickness, ROAD.guardrailHeight, L);

    const railL = new THREE.Mesh(railGeo, railMat);
    railL.position.set(-W / 2 - 0.4, ROAD.guardrailHeight / 2 + 0.2, 0);
    railL.castShadow = true;
    railL.receiveShadow = true;
    seg.add(railL);

    const railR = new THREE.Mesh(railGeo, railMat);
    railR.position.set(W / 2 + 0.4, ROAD.guardrailHeight / 2 + 0.2, 0);
    railR.castShadow = true;
    railR.receiveShadow = true;
    seg.add(railR);

    // Rail posts (decorative).
    const postGeo = new THREE.BoxGeometry(0.12, 0.35, 0.12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7a828a, flatShading: true });
    const postEvery = 6;
    for (let z = -L / 2 + 2; z <= L / 2 - 2; z += postEvery) {
      const postL = new THREE.Mesh(postGeo, postMat);
      postL.position.set(-W / 2 - 0.4, 0.2, z);
      seg.add(postL);
      const postR = new THREE.Mesh(postGeo, postMat);
      postR.position.set(W / 2 + 0.4, 0.2, z);
      seg.add(postR);
    }

    return seg;
  }
  // ===========================================================================
  // TRAFFIC (AI cars — pooled, 4 colors, 5 lanes)
  // ===========================================================================
  _initTraffic() {
    const bodyColors = TRAFFIC.colors;

    for (let i = 0; i < TRAFFIC.count; i++) {
      const colorHex = bodyColors[i % bodyColors.length];
      const car = this._createTrafficCar(colorHex);
      const laneIdx = randInt(0, LANES.count - 1);
      const x = LANE_POSITIONS[laneIdx];
      const z = -randRange(30, TRAFFIC.spawnAheadDistance);
      car.position.set(x, 0, z);
      car.userData = {
        speed: randRange(TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
        laneIdx,
        laneTarget: x,
        passed: false,
        passedByPlayer: false
      };
      this.trafficGroup.add(car);
      this.traffic.push(car);
    }
  }

  _createTrafficCar(colorHex) {
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      flatShading: true,
      roughness: 0.6,
      metalness: 0.25
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
      roughness: 0.2
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x440808,
      emissive: 0xff3b30,
      emissiveIntensity: 1.2,
      flatShading: true
    });

    // Body.
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.6), bodyMat);
    lower.position.y = 0.55;
    lower.castShadow = true;
    lower.receiveShadow = true;
    g.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.6), bodyMat);
    cabin.position.set(0, 1.05, -0.05);
    cabin.castShadow = true;
    g.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.4, 0.08), glassMat);
    windshield.position.set(0, 1.1, 0.78);
    windshield.rotation.x = -0.55;
    g.add(windshield);

    const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.35, 0.08), glassMat);
    rearWin.position.set(0, 1.1, -0.88);
    rearWin.rotation.x = 0.55;
    g.add(rearWin);

    // Tail lights.
    const tailGeo = new THREE.BoxGeometry(0.35, 0.12, 0.06);
    const tailL = new THREE.Mesh(tailGeo, tailMat);
    tailL.position.set(-0.55, 0.65, 1.82);
    g.add(tailL);
    const tailR = new THREE.Mesh(tailGeo, tailMat);
    tailR.position.set(0.55, 0.65, 1.82);
    g.add(tailR);

    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelPositions = [
      [-0.85, 0.32, -1.15],
      [0.85, 0.32, -1.15],
      [-0.85, 0.32, 1.15],
      [0.85, 0.32, 1.15]
    ];
    for (const [wx, wy, wz] of wheelPositions) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, wy, wz);
      w.castShadow = true;
      g.add(w);
    }

    // Shadow blob.
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.scale.set(1, 1.5, 1);
    g.add(shadow);

    return g;
  }

  _recycleTrafficCar(car, playerZ) {
    const laneIdx = randInt(0, LANES.count - 1);
    const x = LANE_POSITIONS[laneIdx];
    const z = playerZ - TRAFFIC.spawnAheadDistance - randRange(0, 60);
    car.position.set(x, 0, z);
    car.userData.speed = randRange(TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
    car.userData.laneIdx = laneIdx;
    car.userData.laneTarget = x;
    car.userData.passed = false;
    car.userData.passedByPlayer = false;
    // Reset tail light glow in case it was hit (traffic doesn't change it, safe).
  }

  // ===========================================================================
  // PICKUPS (coins, crowns, turbos — pooled and recycled)
  // ===========================================================================
  _initPickups() {
    // Nothing pre-spawned; they spawn just ahead as the player advances.
    this.nextCoinZ = -20;
    this.coinCounter = 0;
    this.nextTurboZ = -SPAWN.turboPickupEveryDistance;
  }

  _makeCoin() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffcf33,
      emissive: 0xffaa00,
      emissiveIntensity: 0.35,
      metalness: 0.85,
      roughness: 0.25,
      flatShading: true
    });
    const coinGeo = new THREE.CylinderGeometry(PICKUPS.coinRadius, PICKUPS.coinRadius, 0.10, 16);
    coinGeo.rotateX(Math.PI / 2);
    const coin = new THREE.Mesh(coinGeo, mat);
    coin.castShadow = true;
    g.add(coin);

    // Inner detail.
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xffe066,
      metalness: 0.9,
      roughness: 0.2,
      flatShading: true
    });
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(PICKUPS.coinRadius * 0.65, 0.05, 6, 20),
      innerMat
    );
    inner.position.z = 0.06;
    g.add(inner);

    g.userData.type = 'coin';
    g.userData.value = PICKUPS.valueCoin;
    return g;
  }

  _makeCrown() {
    const g = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd21a,
      emissive: 0xff8800,
      emissiveIntensity: 0.4,
      metalness: 0.95,
      roughness: 0.2,
      flatShading: true
    });
    const jewelMat = new THREE.MeshStandardMaterial({
      color: 0xff3355,
      emissive: 0xff2255,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.2,
      flatShading: true
    });

    // Ring band.
    const bandGeo = new THREE.CylinderGeometry(PICKUPS.crownRadius * 0.85, PICKUPS.crownRadius, 0.28, 10, 1, true);
    const band = new THREE.Mesh(bandGeo, goldMat);
    band.castShadow = true;
    g.add(band);

    // Spikes.
    const spikeGeo = new THREE.ConeGeometry(0.13, 0.32, 4);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TWO_PI;
      const spike = new THREE.Mesh(spikeGeo, goldMat);
      spike.position.set(Math.cos(a) * PICKUPS.crownRadius * 0.85, 0.30, Math.sin(a) * PICKUPS.crownRadius * 0.85);
      spike.castShadow = true;
      g.add(spike);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), jewelMat);
      jewel.position.set(Math.cos(a) * PICKUPS.crownRadius * 0.85, 0.2, Math.sin(a) * PICKUPS.crownRadius * 0.85);
      g.add(jewel);
    }

    // Base.
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(PICKUPS.crownRadius * 0.9, PICKUPS.crownRadius * 0.9, 0.12, 12),
      goldMat
    );
    base.position.y = -0.12;
    g.add(base);

    g.userData.type = 'crown';
    g.userData.value = PICKUPS.valueCrown;
    return g;
  }

  _makeTurbo() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2ad0ff,
      emissive: 0x00aaff,
      emissiveIntensity: 1.0,
      metalness: 0.4,
      roughness: 0.2,
      flatShading: true,
      transparent: true,
      opacity: 0.92
    });
    const geo = new THREE.ConeGeometry(PICKUPS.turboRadius * 0.85, PICKUPS.turboRadius * 2.2, 8, 1);
    const cone = new THREE.Mesh(geo, mat);
    cone.castShadow = true;
    g.add(cone);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PICKUPS.turboRadius, 0.06, 6, 20), ringMat);
    g.add(ring);

    g.userData.type = 'turbo';
    g.userData.value = PICKUPS.valueTurbo;
    return g;
  }

  _spawnPickup(type, laneIdx, z) {
    let obj;
    if (type === 'coin') obj = this._makeCoin();
    else if (type === 'crown') obj = this._makeCrown();
    else obj = this._makeTurbo();

    const x = LANE_POSITIONS[laneIdx];
    obj.position.set(x, 1.3, z);
    obj.userData.baseY = 1.3;
    obj.userData.phase = Math.random() * TWO_PI;
    obj.userData.spinSpeed = type === 'coin'
      ? PICKUPS.coinSpinSpeed
      : type === 'crown'
      ? PICKUPS.crownSpinSpeed
      : PICKUPS.turboSpinSpeed;
    obj.userData.bobAmp = type === 'coin'
      ? PICKUPS.coinBobAmp
      : type === 'crown'
      ? PICKUPS.crownBobAmp
      : 0.25;
    obj.userData.bobFreq = type === 'coin'
      ? PICKUPS.coinBobFreq
      : type === 'crown'
      ? PICKUPS.crownBobFreq
      : 2.5;
    obj.userData.collected = false;
    this.pickupGroup.add(obj);
    this.pickups.push(obj);
    return obj;
  }

  // ===========================================================================
  // CHECKPOINTS (gates spanning the road with a pulsing arch)
  // ===========================================================================
  _initCheckpoints() {
    this.nextCheckpointZ = -SPAWN.checkpointFirstAt;
  }

  _createCheckpoint(z) {
    const g = new THREE.Group();

    const W = ROAD.width;
    const H = 6.5;

    const postMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.25
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x2ad0ff,
      transparent: true,
      opacity: 0.85
    });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x7ae8ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const postGeo = new THREE.BoxGeometry(0.5, H, 0.5);
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-W / 2 - 1.2, H / 2, 0);
    postL.castShadow = true;
    g.add(postL);
    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(W / 2 + 1.2, H / 2, 0);
    postR.castShadow = true;
    g.add(postR);

    const beamGeo = new THREE.BoxGeometry(W + 2.4, 0.6, 0.6);
    const beam = new THREE.Mesh(beamGeo, postMat);
    beam.position.set(0, H, 0);
    beam.castShadow = true;
    g.add(beam);

    // Glow stripes on the beam.
    const stripeGeo = new THREE.BoxGeometry(W + 2.4, 0.14, 0.66);
    const stripe = new THREE.Mesh(stripeGeo, glowMat);
    stripe.position.set(0, H - 0.22, 0.03);
    g.add(stripe);

    // Transparent gate plane.
    const gatePlaneGeo = new THREE.PlaneGeometry(W + 2.4, H - 0.6);
    const gatePlane = new THREE.Mesh(gatePlaneGeo, beamMat);
    gatePlane.position.set(0, (H - 0.6) / 2, 0);
    g.add(gatePlane);

    g.userData = {
      triggered: false,
      pulsePhase: 0,
      beam,
      stripe,
      gatePlane
    };

    g.position.z = z;
    this.checkpointGroup.add(g);
    this.checkpoints.push(g);
    return g;
  }

  _recycleCheckpoint(cp, z) {
    cp.position.z = z;
    cp.userData.triggered = false;
    cp.userData.pulsePhase = 0;
  }
  // ===========================================================================
  // PER-FRAME UPDATE
  // ===========================================================================
  update(dt, playerZ, playerX) {
    this.time += dt;

    // --- Sky follows the player so the horizon never runs out ---
    if (this.sky) {
      this.sky.position.x = playerX * 0.4;
      this.sky.position.z = playerZ;
    }

    // --- Ocean UV scroll (wave motion) ---
    if (this.oceanTex) {
      this.oceanTex.offset.x = (this.oceanTex.offset.x + dt * 0.012) % 1;
      this.oceanTex.offset.y = (this.oceanTex.offset.y + dt * 0.020) % 1;
    }

    // --- Foam breathing ---
    if (this.foam) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 1.3);
      this.foam.position.z = -22 + p * 1.8;
      this.foam.material.opacity = 0.65 + p * 0.25;
    }
    if (this.foam2) {
      const p2 = 0.5 + 0.5 * Math.sin(this.time * 0.9 + 1.7);
      this.foam2.position.z = -14 + p2 * 2.2;
      this.foam2.material.opacity = 0.25 + p2 * 0.25;
    }

    // --- Palm sway ---
    for (let i = 0; i < this.palms.length; i++) {
      const p = this.palms[i];
      const ph = p.userData.swayPhase;
      p.rotation.z = Math.sin(this.time * 0.8 + ph) * 0.02;
    }

    // --- Cloud drift ---
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += c.userData.driftX * dt;
      if (c.position.x < -320) c.position.x = 320;
    }

    // --- Road segment recycling ---
    this._recycleRoadSegments(playerZ);

    // --- Traffic update / recycling ---
    this._updateTraffic(dt, playerZ);

    // --- Pickups update / recycling ---
    this._updatePickups(dt, playerZ);

    // --- Checkpoints update / recycling ---
    this._updateCheckpoints(dt, playerZ);
  }

  _recycleRoadSegments(playerZ) {
    const segLen = ROAD.segmentLength;
    const behind = ROAD.segmentsBehind;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.position.z > playerZ + segLen * (behind + 1)) {
        // Find the currently furthest-ahead segment and place this one beyond it.
        let maxZ = -Infinity;
        for (let j = 0; j < this.segments.length; j++) {
          if (this.segments[j] === seg) continue;
          if (this.segments[j].position.z > maxZ) maxZ = this.segments[j].position.z;
        }
        seg.position.z = maxZ - segLen;

        // Keep dash phase consistent by NOT touching UVs (asphalt tile is seamless).
        // Guardrail posts are static within the segment, so recycle is safe.
      }
    }
  }

  _updateTraffic(dt, playerZ) {
    for (let i = 0; i < this.traffic.length; i++) {
      const car = this.traffic[i];
      const d = car.userData;

      // Move forward (traffic moves along -Z, same as player).
      car.position.z -= d.speed * dt;

      // Slide toward target lane X.
      if (car.position.x !== d.laneTarget) {
        const dx = d.laneTarget - car.position.x;
        const step = TRAFFIC.lateralSnapSpeed * dt;
        car.position.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
      }

      // Recycle when behind the camera.
      if (car.position.z > playerZ + TRAFFIC.recycleBehindDistance) {
        this._recycleTrafficCar(car, playerZ);
      }

      // Keep far cars within the lane they belong to; occasionally re-pick a lane.
      if (car.position.z < playerZ - TRAFFIC.spawnAheadDistance - 40) {
        const newLane = randInt(0, LANES.count - 1);
        d.laneIdx = newLane;
        d.laneTarget = LANE_POSITIONS[newLane];
      }
    }
  }

  _updatePickups(dt, playerZ) {
    // Spawn new coin/crown/turbo pickups ahead as the player advances.
    const spawnAheadZ = playerZ - 220;

    while (this.nextCoinZ > spawnAheadZ) {
      const laneIdx = randInt(0, LANES.count - 1);
      this.coinCounter++;
      const isCrown = this.coinCounter % SPAWN.crownEveryCoins === 0;
      this._spawnPickup(isCrown ? 'crown' : 'coin', laneIdx, this.nextCoinZ);
      this.nextCoinZ -= SPAWN.coinEveryDistance;
    }

    if (this.nextTurboZ > spawnAheadZ) {
      const laneIdx = randInt(0, LANES.count - 1);
      this._spawnPickup('turbo', laneIdx, this.nextTurboZ);
      this.nextTurboZ -= SPAWN.turboPickupEveryDistance;
    }

    // Animate pickups and remove those far behind.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const u = p.userData;

      p.rotation.y += u.spinSpeed * dt;
      p.position.y = u.baseY + Math.sin(this.time * u.bobFreq + u.phase) * u.bobAmp;

      if (p.position.z > playerZ + 30 || u.collected) {
        // Remove and recycle: hide from scene, splice.
        if (!u.collected) {
          // No points for missing.
        }
        this.pickupGroup.remove(p);
        this.pickups.splice(i, 1);
      }
    }
  }

  _updateCheckpoints(dt, playerZ) {
    // Spawn checkpoints ahead based on distance.
    const spawnAheadZ = playerZ - 260;

    while (this.nextCheckpointZ > spawnAheadZ) {
      this._createCheckpoint(this.nextCheckpointZ);
      this.nextCheckpointZ -= SPAWN.checkpointEveryDistance;
    }

    // Update existing checkpoints (pulse, recycling).
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const cp = this.checkpoints[i];
      const u = cp.userData;

      u.pulsePhase += dt * 2.4;
      const pulse = 0.5 + 0.5 * Math.sin(u.pulsePhase);
      if (u.stripe) u.stripe.material.opacity = 0.55 + pulse * 0.4;
      if (u.gatePlane) u.gatePlane.material.opacity = 0.18 + pulse * 0.22;

      if (cp.position.z > playerZ + 40) {
        this.checkpointGroup.remove(cp);
        this.checkpoints.splice(i, 1);
      }
    }
  }

  // ===========================================================================
  // PICKUP / CHECKPOINT COLLECTION (called from game.js)
  // ===========================================================================
  /**
   * Collect pickups within a radius of the player.
   * Returns an array of {type, value, position} for collected items.
   */
  collectNearby(playerPos, radius) {
    const collected = [];
    const r2 = radius * radius;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.userData.collected) continue;
      const dx = p.position.x - playerPos.x;
      const dz = p.position.z - playerPos.z;
      const dy = p.position.y - playerPos.y;
      if (dx * dx + dz * dz + dy * dy <= r2) {
        p.userData.collected = true;
        collected.push({
          type: p.userData.type,
          value: p.userData.value,
          position: p.position.clone()
        });
        this.pickupGroup.remove(p);
        this.pickups.splice(i, 1);
      }
    }
    return collected;
  }

  /**
   * Detect checkpoints crossed by the player since the last frame.
   * Returns array of crossed checkpoint objects (which will be triggered once).
   */
  checkCheckpointCrossing(prevZ, currZ) {
    const crossed = [];
    // Moving in -Z: crossing means prevZ > cpZ >= currZ.
    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      if (cp.userData.triggered) continue;
      if (prevZ > cp.position.z && currZ <= cp.position.z) {
        cp.userData.triggered = true;
        crossed.push(cp);
      }
    }
    return crossed;
  }

  // ===========================================================================
  // TRAFFIC COLLISION (AABB-ish on X/Z, radius based)
  // ===========================================================================
  /**
   * Returns true if the player is colliding with any traffic car this frame.
   * Also sets car.userData.justPassed when a car is passed (behind player).
   */
  detectTrafficCollision(playerPos, playerRadius) {
    let hit = false;
    const rSum = playerRadius + 1.2;

    for (let i = 0; i < this.traffic.length; i++) {
      const car = this.traffic[i];
      const dx = car.position.x - playerPos.x;
      const dz = car.position.z - playerPos.z;

      // Hit test: small axis-aligned test.
      const halfW = 1.1;
      const halfL = 2.1;
      if (
        Math.abs(dx) < halfW + playerRadius * 0.7 &&
        Math.abs(dz) < halfL + playerRadius * 0.7
      ) {
        hit = true;
      }

      // Pass detection: car is behind player (positive Z relative to car) & wasn't marked.
      if (!car.userData.passedByPlayer) {
        if (dz > 0 && dz < rSum * 2.5) {
          car.userData.passedByPlayer = true;
        }
      }
    }
    return hit;
  }

  // ===========================================================================
  // MENU MODE
  // ===========================================================================
  showMenuPlatform(visible) {
    this.menuGroup.visible = !!visible;
    // Hide traffic/pickups/checkpoints in menu for a clean orbit.
    this.trafficGroup.visible = !visible;
    this.pickupGroup.visible = !visible;
    this.checkpointGroup.visible = !visible;
    this.roadGroup.visible = !visible;
  }

  resetForPlay(playerZ) {
    // Place road ahead of player.
    const segLen = ROAD.segmentLength;
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].position.z = playerZ + segLen - i * segLen;
    }

    // Reposition traffic ahead of player.
    for (let i = 0; i < this.traffic.length; i++) {
      this._recycleTrafficCar(this.traffic[i], playerZ);
    }

    // Clear pickups.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      this.pickupGroup.remove(this.pickups[i]);
    }
    this.pickups.length = 0;
    this.nextCoinZ = playerZ - 20;
    this.coinCounter = 0;
    this.nextTurboZ = playerZ - SPAWN.turboPickupEveryDistance;

    // Clear checkpoints.
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      this.checkpointGroup.remove(this.checkpoints[i]);
    }
    this.checkpoints.length = 0;
    this.nextCheckpointZ = playerZ - SPAWN.checkpointFirstAt;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================
  dispose() {
    const disposeGroup = (g) => {
      g.traverse((obj) => {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        }
      });
    };
    disposeGroup(this.envGroup);
    disposeGroup(this.roadGroup);
    disposeGroup(this.trafficGroup);
    disposeGroup(this.pickupGroup);
    disposeGroup(this.checkpointGroup);
    disposeGroup(this.menuGroup);

    if (this.sky) {
      this.scene.remove(this.sky);
      this.sky.geometry.dispose();
      this.sky.material.dispose();
    }

    this.scene.remove(
      this.envGroup,
      this.roadGroup,
      this.trafficGroup,
      this.pickupGroup,
      this.checkpointGroup,
      this.menuGroup
    );
  }
}

export default World;