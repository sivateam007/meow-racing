// js/world.js
// Meow Racing — procedural world: sky, ocean, beach, palms, buildings, clouds,
// road with rumble strips/lane dashes/guardrails, typed traffic AI with lane
// changes, boost pickups, coins/crowns, checkpoints, menu platform, per-level
// themes (sky, water, lighting, fog, buildings), soft shadows + haze.

import * as THREE from 'three';
import {
  ROAD,
  WORLD,
  TRAFFIC,
  TRAFFIC_TYPES,
  SPAWN,
  PICKUPS,
  LANE_POSITIONS,
  LANES,
  THEMES,
  getThemeById,
  clamp,
  randRange,
  randInt,
  pick,
  pickWeighted
} from './config.js';

const TWO_PI = Math.PI * 2;

function hexToCss(hex) {
  return '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
}

export class World {
  constructor(scene, themeId = 'beach') {
    this.scene = scene;
    this.time = 0;
    this.themeId = themeId;
    this.theme = getThemeById(themeId);

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

    this.segments = [];
    this.traffic = [];
    this.pickups = [];
    this.checkpoints = [];

    this.nextCoinZ = 0;
    this.coinCounter = 0;
    this.nextBoostZ = -SPAWN.boostPickupEveryDistance;
    this.nextCheckpointZ = -SPAWN.checkpointFirstAt;

    this._palms = [];
    this._buildings = [];
    this._clouds = [];

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

    this.applyTheme(themeId);
  }

  // ===========================================================================
  // THEME
  // ===========================================================================
  applyTheme(themeId) {
    this.themeId = themeId;
    this.theme = getThemeById(themeId);
    const t = this.theme;

    // Sky
    this._rebuildSkyTexture(t);

    // Ocean color
    if (this.ocean && this.ocean.material) {
      this.ocean.material.color.setHex(t.oceanTint);
    }
    if (this.oceanFloor && this.oceanFloor.material) {
      this.oceanFloor.material.color.setHex(t.oceanTint).multiplyScalar(0.55);
    }

    // Lights
    if (this.sun) {
      this.sun.color.setHex(t.sunColor);
      this.sun.intensity = t.sunIntensity;
      this.sun.position.set(
        t.sunDir.x * 140,
        t.sunDir.y * 140,
        t.sunDir.z * 140
      );
    }
    if (this.hemi) {
      this.hemi.color.setHex(t.hemiSky);
      this.hemi.groundColor.setHex(t.hemiGround);
      this.hemi.intensity = t.hemiIntensity;
    }
    if (this.ambient) {
      this.ambient.color.setHex(t.ambientColor);
      this.ambient.intensity = t.ambientIntensity;
    }

    // Fog
    this.scene.fog = new THREE.Fog(t.fogColor, t.fogNear, t.fogFar);
    this.scene.background = new THREE.Color(t.fogColor);

    // Buildings — recolor their body materials
    for (let i = 0; i < this._buildings.length; i++) {
      const b = this._buildings[i];
      if (b.material && b.userData.bodyPalette) {
        const pal = t.buildingPalette;
        b.material.color.setHex(pal[i % pal.length]);
      }
    }

    // Palm leaves
    for (let i = 0; i < this._palms.length; i++) {
      const p = this._palms[i];
      p.traverse((o) => {
        if (o.isMesh && o.userData.leaf) {
          o.material.color.setHex(t.palmLeaf);
        }
      });
    }
  }

  // ===========================================================================
  // SKY
  // ===========================================================================
  _buildSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    this._skyCanvas = canvas;
    this._skyCtx = canvas.getContext('2d');

    this._skyTex = new THREE.CanvasTexture(canvas);
    this._skyTex.colorSpace = THREE.SRGBColorSpace;
    this._skyTex.wrapS = THREE.ClampToEdgeWrapping;
    this._skyTex.wrapT = THREE.ClampToEdgeWrapping;

    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      map: this._skyTex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.name = 'Sky';
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _rebuildSkyTexture(theme) {
    const ctx = this._skyCtx;
    const W = this._skyCanvas.width;
    const H = this._skyCanvas.height;

    const top = hexToCss(theme.skyTop);
    const mid = hexToCss(theme.skyMid);
    const low = hexToCss(theme.skyLow);
    const horiz = hexToCss(theme.skyHorizon);

    ctx.clearRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, top);
    grad.addColorStop(0.45, mid);
    grad.addColorStop(0.78, low);
    grad.addColorStop(1.0, horiz);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(0, 360, W, 60);

    for (let i = 0; i < 22; i++) {
      const cx = Math.random() * W;
      const cy = 40 + Math.random() * 300;
      const rw = 40 + Math.random() * 90;
      const rh = 8 + Math.random() * 18;
      ctx.fillStyle = `rgba(255,255,255,${(0.10 + Math.random() * 0.12).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, TWO_PI);
      ctx.fill();
    }

    if (this._skyTex) this._skyTex.needsUpdate = true;
  }

  // ===========================================================================
  // LIGHTS
  // ===========================================================================
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(WORLD.fogColor, 0xf5e2b8, WORLD.hemiIntensity);
    this.hemi.name = 'HemiLight';
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, WORLD.ambientIntensity * 0.4);
    this.ambient.name = 'AmbientLight';
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff2d8, WORLD.sunIntensity);
    this.sun.name = 'SunLight';
    this.sun.position.set(
      WORLD.sunDirection.x * 140,
      WORLD.sunDirection.y * 140,
      WORLD.sunDirection.z * 140
    );
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = WORLD.shadowMapSize;
    this.sun.shadow.mapSize.height = WORLD.shadowMapSize;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  // ===========================================================================
  // OCEAN
  // ===========================================================================
  _buildOcean() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1f8fd4');
    grad.addColorStop(0.5, '#2aa7e8');
    grad.addColorStop(1, '#4cc0f2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

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
    this.ocean.name = 'Ocean';
    this.envGroup.add(this.ocean);

    const floorGeo = new THREE.PlaneGeometry(2000, 2000, 1, 1);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x0f6ba8, fog: true });
    this.oceanFloor = new THREE.Mesh(floorGeo, floorMat);
    this.oceanFloor.rotation.x = -Math.PI / 2;
    this.oceanFloor.position.set(0, WORLD.oceanLevel - 4, -200);
    this.envGroup.add(this.oceanFloor);
  }

  // ===========================================================================
  // BEACH
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

    const foam2Mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });
    this.foam2 = new THREE.Mesh(foamGeo.clone(), foam2Mat);
    this.foam2.rotation.x = -Math.PI / 2;
    this.foam2.position.set(0, WORLD.oceanLevel + 0.03, -14);
    this.foam2.scale.set(1, 0.6, 1);
    this.envGroup.add(this.foam2);
  }

  // ===========================================================================
  // PALM TREES
  // ===========================================================================
  _buildPalms() {
    this._palms = [];
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

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 6.5, 7);
    trunkGeo.translate(0, 3.25, 0);
    const leafGeo = new THREE.ConeGeometry(1.3, 0.35, 5);
    const coconutGeo = new THREE.SphereGeometry(0.22, 6, 5);

    for (let i = 0; i < palmCount; i++) {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.rotation.z = randRange(-0.10, 0.10);
      trunk.castShadow = true;
      palm.add(trunk);

      const crown = new THREE.Group();
      crown.position.y = 6.5;
      palm.add(crown);

      const leafCount = 6 + randInt(0, 2);
      for (let l = 0; l < leafCount; l++) {
        const mat = l % 2 ? leafMatDark : leafMat;
        const leaf = new THREE.Mesh(leafGeo, mat);
        const ang = (l / leafCount) * TWO_PI + randRange(-0.1, 0.1);
        const droop = randRange(0.55, 0.95);
        leaf.position.set(Math.cos(ang) * 1.0, randRange(-0.05, 0.15), Math.sin(ang) * 1.0);
        leaf.rotation.z = Math.PI / 2 - droop;
        leaf.rotation.y = -ang;
        leaf.scale.setScalar(randRange(0.85, 1.15));
        leaf.userData.leaf = true;
        leaf.userData.dark = l % 2 === 1;
        leaf.castShadow = true;
        crown.add(leaf);
      }

      for (let c = 0; c < 3; c++) {
        const coco = new THREE.Mesh(coconutGeo, coconutMat);
        const a = Math.random() * TWO_PI;
        coco.position.set(Math.cos(a) * 0.35, -0.15, Math.sin(a) * 0.35);
        coco.castShadow = true;
        crown.add(coco);
      }

      const side = i % 2 === 0 ? -1 : 1;
      const baseX = side * randRange(ROAD.width * 0.5 + 6, ROAD.width * 0.5 + 26);
      const baseZ = -i * 22 + randRange(-6, 6);
      palm.position.set(baseX, WORLD.beachLevel + 0.1, baseZ);
      palm.rotation.y = Math.random() * TWO_PI;
      palm.scale.setScalar(randRange(0.85, 1.25));
      palm.userData = { baseX, baseZ, swayPhase: Math.random() * TWO_PI };

      this.envGroup.add(palm);
      this._palms.push(palm);
    }
  }

  // ===========================================================================
  // BUILDINGS
  // ===========================================================================
  _buildBuildings() {
    this._buildings = [];
    const palette = this.theme.buildingPalette;
    const roofPalette = [0xb85c5c, 0x8a6a4a, 0x5a7a9a, 0x7a9a6a];

    const buildingCount = 34;
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x6fa8d0,
      emissive: 0x224466,
      emissiveIntensity: 0.5,
      flatShading: true,
      roughness: 0.4,
      metalness: 0.2
    });

    for (let i = 0; i < buildingCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const baseX = side * randRange(ROAD.width * 0.5 + 38, ROAD.width * 0.5 + 110);
      const baseZ = -i * 18 + randRange(-10, 10);

      const w = randRange(4, 9);
      const d = randRange(4, 9);
      const h = randRange(6, 26);

      const bodyMat = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        flatShading: true,
        roughness: 0.9
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      body.position.set(baseX, h / 2 + WORLD.beachLevel, baseZ);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.bodyPalette = true;

      const roofMat = new THREE.MeshStandardMaterial({
        color: pick(roofPalette),
        flatShading: true,
        roughness: 0.85
      });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, h * 0.22, 4), roofMat);
      roof.position.set(baseX, h + WORLD.beachLevel + h * 0.11, baseZ);
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;

      this.envGroup.add(body);
      this.envGroup.add(roof);
      this._buildings.push(body);

      const rows = Math.max(1, Math.floor(h / 3.5));
      const cols = Math.max(1, Math.floor(w / 2.2));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), winMat);
          const wx = baseX - w / 2 + (c + 0.5) * (w / cols);
          const wy = WORLD.beachLevel + 2.0 + r * (h / (rows + 1));
          win.position.set(wx, wy, baseZ + d / 2 + 0.03);
          this.envGroup.add(win);
        }
      }
    }
  }

  // ===========================================================================
  // CLOUDS
  // ===========================================================================
  _buildClouds() {
    this._clouds = [];
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
        puff.position.set(randRange(-7, 7), randRange(-1.2, 1.2), randRange(-3, 3));
        cloud.add(puff);
      }
      cloud.position.set(
        randRange(-260, 260),
        randRange(38, 70),
        randRange(-460, -120)
      );
      cloud.userData = { driftX: randRange(-1.5, -0.4) };
      this.envGroup.add(cloud);
      this._clouds.push(cloud);
    }
  }

  // ===========================================================================
  // MENU PLATFORM
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

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2aa7e8,
      transparent: true,
      opacity: 0.65
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 6, 40), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.74;
    this.menuGroup.add(ring);
  }

  // ===========================================================================
  // ROAD TEXTURES
  // ===========================================================================
  _buildRoadTextures() {
    // ---- Asphalt base: multiple noise layers ----
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#474750';
    ctx.fillRect(0, 0, 512, 512);

    // Coarse noise (aggregate)
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 0.4 + Math.random() * 1.5;
      const v = Math.floor(52 + Math.random() * 38);
      ctx.fillStyle = `rgba(${v},${v},${v + 6},${(0.15 + Math.random() * 0.25).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TWO_PI);
      ctx.fill();
    }
    // Fine noise (grain)
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = Math.floor(40 + Math.random() * 60);
      ctx.fillStyle = `rgba(${v},${v},${v},${(0.06 + Math.random() * 0.08).toFixed(2)})`;
      ctx.fillRect(x, y, 1, 1);
    }
    // Subtle tire streaks down the centre of each lane
    ctx.strokeStyle = 'rgba(20,20,25,0.16)';
    ctx.lineWidth = 8;
    for (let lane = 0; lane < 5; lane++) {
      const lx = ((lane + 0.5) / 5) * 512;
      ctx.beginPath();
      ctx.moveTo(lx - 25, 0);
      ctx.lineTo(lx - 25, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx + 25, 0);
      ctx.lineTo(lx + 25, 512);
      ctx.stroke();
    }
    // A few faint cracks
    ctx.strokeStyle = 'rgba(20,20,22,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += randRange(-14, 14);
        y += randRange(-20, 20);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const asphaltTex = new THREE.CanvasTexture(c);
    asphaltTex.colorSpace = THREE.SRGBColorSpace;
    asphaltTex.wrapS = THREE.RepeatWrapping;
    asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.anisotropy = 4;
    asphaltTex.repeat.set(1, 1);
    this.asphaltTex = asphaltTex;

    // ---- Lane dashes overlay: transparent except stripes ----
    const s = document.createElement('canvas');
    s.width = 512;
    s.height = 512;
    const sctx = s.getContext('2d');
    sctx.clearRect(0, 0, 512, 512);

    // 4 interior lane separators
    sctx.fillStyle = 'rgba(255,255,255,0.95)';
    const dashLen = 44;
    const gap = 44;
    for (let i = 1; i < 5; i++) {
      const x = (512 * i) / 5;
      for (let y = 0; y < 512; y += dashLen + gap) {
        sctx.fillRect(x - 3, y, 6, dashLen);
      }
    }

    // Solid yellow-ish edges (inside rumble strip boundary)
    sctx.fillStyle = 'rgba(255,220,90,0.95)';
    sctx.fillRect(3, 0, 5, 512);
    sctx.fillRect(504, 0, 5, 512);

    const stripeTex = new THREE.CanvasTexture(s);
    stripeTex.colorSpace = THREE.SRGBColorSpace;
    stripeTex.wrapS = THREE.ClampToEdgeWrapping;
    stripeTex.wrapT = THREE.RepeatWrapping;
    stripeTex.anisotropy = 4;
    this.stripeTex = stripeTex;

    // ---- Rumble strip texture (red/white blocks) ----
    const r = document.createElement('canvas');
    r.width = 32;
    r.height = 64;
    const rctx = r.getContext('2d');
    rctx.fillStyle = '#e23b2e';
    rctx.fillRect(0, 0, 32, 32);
    rctx.fillStyle = '#f5f5f5';
    rctx.fillRect(0, 32, 32, 32);
    const rumbleTex = new THREE.CanvasTexture(r);
    rumbleTex.colorSpace = THREE.SRGBColorSpace;
    rumbleTex.wrapS = THREE.ClampToEdgeWrapping;
    rumbleTex.wrapT = THREE.RepeatWrapping;
    rumbleTex.repeat.set(1, 1);
    this.rumbleTex = rumbleTex;

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
    this.rumbleMat = new THREE.MeshStandardMaterial({
      map: rumbleTex,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05
    });
  }

  // ===========================================================================
  // ROAD SEGMENTS
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
  }

  _createRoadSegment() {
    const seg = new THREE.Group();
    const L = ROAD.segmentLength;
    const W = ROAD.width;

    const road = new THREE.Mesh(new THREE.PlaneGeometry(W, L, 1, 1), this.roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.001;
    road.receiveShadow = true;
    seg.add(road);

    const stripes = new THREE.Mesh(new THREE.PlaneGeometry(W, L, 1, 1), this.roadStripeMat);
    stripes.rotation.x = -Math.PI / 2;
    stripes.position.y = 0.006;
    stripes.renderOrder = 1;
    seg.add(stripes);

    // Rumble strips: two thin boxes at the edges with the red/white texture.
    const rumbleGeo = new THREE.BoxGeometry(ROAD.rumbleWidth, 0.09, L);
    const rumbleUVs = rumbleGeo.attributes.uv;
    for (let i = 0; i < rumbleUVs.count; i++) {
      rumbleUVs.setY(i, rumbleUVs.getY(i) * (L / (ROAD.rumbleStripeLength * 2)));
    }
    const rumbleL = new THREE.Mesh(rumbleGeo, this.rumbleMat);
    rumbleL.position.set(-W / 2 + ROAD.rumbleWidth / 2, 0.055, 0);
    rumbleL.receiveShadow = true;
    seg.add(rumbleL);
    const rumbleR = new THREE.Mesh(rumbleGeo, this.rumbleMat);
    rumbleR.position.set(W / 2 - ROAD.rumbleWidth / 2, 0.055, 0);
    rumbleR.receiveShadow = true;
    seg.add(rumbleR);

    // Shoulders
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
    const shoulderR = new THREE.Mesh(new THREE.PlaneGeometry(ROAD.shoulderWidth, L, 1, 1), shoulderMat);
    shoulderR.rotation.x = -Math.PI / 2;
    shoulderR.position.set(W / 2 + ROAD.shoulderWidth / 2, 0.0, 0);
    shoulderR.receiveShadow = true;
    seg.add(shoulderR);

    // Guardrail beams
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xbfc7cf,
      flatShading: true,
      metalness: 0.6,
      roughness: 0.45
    });
    const railGeo = new THREE.BoxGeometry(ROAD.guardrailThickness, ROAD.guardrailHeight, L);
    const railL = new THREE.Mesh(railGeo, railMat);
    railL.position.set(-W / 2 - 0.5, ROAD.guardrailHeight / 2 + 0.2, 0);
    railL.castShadow = true;
    railL.receiveShadow = true;
    seg.add(railL);
    const railR = new THREE.Mesh(railGeo, railMat);
    railR.position.set(W / 2 + 0.5, ROAD.guardrailHeight / 2 + 0.2, 0);
    railR.castShadow = true;
    railR.receiveShadow = true;
    seg.add(railR);

    // Guardrail posts
    const postGeo = new THREE.BoxGeometry(0.14, 0.4, 0.14);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7a828a, flatShading: true });
    for (let z = -L / 2 + 2; z <= L / 2 - 2; z += 6) {
      const postL = new THREE.Mesh(postGeo, postMat);
      postL.position.set(-W / 2 - 0.5, 0.2, z);
      seg.add(postL);
      const postR = new THREE.Mesh(postGeo, postMat);
      postR.position.set(W / 2 + 0.5, 0.2, z);
      seg.add(postR);
    }

    return seg;
  }

  _recycleRoadSegments(playerZ) {
    const segLen = ROAD.segmentLength;
    const behind = ROAD.segmentsBehind;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.position.z > playerZ + segLen * (behind + 1)) {
        let maxZ = -Infinity;
        for (let j = 0; j < this.segments.length; j++) {
          if (this.segments[j] === seg) continue;
          if (this.segments[j].position.z > maxZ) maxZ = this.segments[j].position.z;
        }
        seg.position.z = maxZ - segLen;
      }
    }
  }

  // ===========================================================================
  // TRAFFIC
  // ===========================================================================
  _initTraffic() {
    const types = Object.keys(TRAFFIC_TYPES);
    for (let i = 0; i < TRAFFIC.count; i++) {
      const typeKey = pickWeighted(types.map((k) => ({ k, weight: TRAFFIC_TYPES[k].weight }))).k;
      const colorHex = pick(TRAFFIC_TYPES[typeKey].palette);
      const car = this._createTrafficCar(typeKey, colorHex);
      this._placeTrafficCar(car, -randRange(30, TRAFFIC.spawnAheadDistance));
      this.trafficGroup.add(car);
      this.traffic.push(car);
    }
  }

  _createTrafficCar(typeKey, colorHex) {
    const type = TRAFFIC_TYPES[typeKey];
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      flatShading: true,
      roughness: 0.55,
      metalness: 0.3,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3
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
      roughness: 0.2,
      transparent: true,
      opacity: 0.85
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x440808,
      emissive: 0xff3b30,
      emissiveIntensity: 1.2,
      flatShading: true
    });

    const w = type.w;
    const h = type.h;
    const l = type.l;

    if (typeKey === 'truck') {
      // Truck: tall cab + long box trailer
      const cabLen = l * 0.32;
      const trailerLen = l - cabLen - 0.1;
      const cabH = h * 0.9;

      const cab = new THREE.Mesh(new THREE.BoxGeometry(w, cabH, cabLen), bodyMat);
      cab.position.set(0, cabH / 2 + 0.2, -l / 2 + cabLen / 2);
      cab.castShadow = true;
      cab.receiveShadow = true;
      g.add(cab);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, cabH * 0.4, 0.08), glassMat);
      windshield.position.set(0, cabH * 0.72, -l / 2 - 0.02);
      windshield.rotation.x = -0.18;
      g.add(windshield);

      const trailer = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.95, trailerLen), bodyMat);
      trailer.position.set(0, h * 0.5 + 0.35, -l / 2 + cabLen + trailerLen / 2);
      trailer.castShadow = true;
      trailer.receiveShadow = true;
      g.add(trailer);

      // Trailer side ribs
      const ribMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, flatShading: true });
      for (let i = 0; i < 5; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, h * 0.85, 0.08), ribMat);
        const rx = w / 2 + 0.01;
        const rz = -l / 2 + cabLen + (i + 0.5) * (trailerLen / 5);
        const ribL = rib.clone();
        ribL.position.set(-rx, h * 0.5 + 0.35, rz);
        g.add(ribL);
        const ribR = rib.clone();
        ribR.position.set(rx, h * 0.5 + 0.35, rz);
        g.add(ribR);
      }
    } else if (typeKey === 'van') {
      // Van: tall boxy body
      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, l), bodyMat);
      lower.position.y = h * 0.28 + 0.2;
      lower.castShadow = true;
      lower.receiveShadow = true;
      g.add(lower);

      const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, h * 0.45, l * 0.82), bodyMat);
      upper.position.set(0, h * 0.28 + h * 0.45 / 2 + 0.2 + h * 0.02, -l * 0.05);
      upper.castShadow = true;
      g.add(upper);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, h * 0.28, 0.08), glassMat);
      windshield.position.set(0, h * 0.55, -l / 2 + 0.05);
      windshield.rotation.x = -0.2;
      g.add(windshield);

      const sideWinL = new THREE.Mesh(new THREE.BoxGeometry(0.06, h * 0.24, l * 0.5), glassMat);
      sideWinL.position.set(-w / 2 + 0.02, h * 0.6, -l * 0.1);
      g.add(sideWinL);
      const sideWinR = sideWinL.clone();
      sideWinR.position.x = w / 2 - 0.02;
      g.add(sideWinR);
    } else if (typeKey === 'sports') {
      // Sports: low, wide, tapered
      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.5, l), bodyMat);
      lower.position.y = h * 0.3 + 0.2;
      lower.castShadow = true;
      lower.receiveShadow = true;
      g.add(lower);

      const hood = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, h * 0.25, l * 0.35), bodyMat);
      hood.position.set(0, h * 0.6, -l * 0.28);
      hood.castShadow = true;
      g.add(hood);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.35, l * 0.28), bodyMat);
      cabin.position.set(0, h * 0.65, 0.1);
      cabin.castShadow = true;
      g.add(cabin);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, h * 0.3, 0.06), glassMat);
      windshield.position.set(0, h * 0.72, -l * 0.05);
      windshield.rotation.x = -0.55;
      g.add(windshield);

      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.06, 0.2), bodyMat);
      spoiler.position.set(0, h * 0.85, l * 0.42);
      g.add(spoiler);
    } else {
      // Sedan (default)
      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, l), bodyMat);
      lower.position.y = h * 0.3 + 0.2;
      lower.castShadow = true;
      lower.receiveShadow = true;
      g.add(lower);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.42, l * 0.42), bodyMat);
      cabin.position.set(0, h * 0.55 + 0.2, -0.1);
      cabin.castShadow = true;
      g.add(cabin);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, h * 0.32, 0.06), glassMat);
      windshield.position.set(0, h * 0.65, l * 0.16);
      windshield.rotation.x = -0.5;
      g.add(windshield);

      const rearWin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h * 0.28, 0.06), glassMat);
      rearWin.position.set(0, h * 0.65, -l * 0.36);
      rearWin.rotation.x = 0.5;
      g.add(rearWin);
    }

    // Tail lights (all types)
    const tailGeo = new THREE.BoxGeometry(0.32, 0.12, 0.06);
    const tailL = new THREE.Mesh(tailGeo, tailMat);
    tailL.position.set(-w * 0.32, 0.6, l / 2 + 0.01);
    g.add(tailL);
    const tailR = new THREE.Mesh(tailGeo, tailMat);
    tailR.position.set(w * 0.32, 0.6, l / 2 + 0.01);
    g.add(tailR);

    // Wheels
    const wheelRadius = typeKey === 'truck' ? 0.42 : typeKey === 'van' ? 0.38 : 0.33;
    const wheelWidth = typeKey === 'truck' ? 0.32 : 0.26;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, wheelWidth + 0.02, 10);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd8d8dc,
      flatShading: true,
      metalness: 0.8,
      roughness: 0.3
    });

    const axleZ = l * 0.3;
    const wx = w / 2 - wheelWidth / 2 - 0.05;
    const wheelPositions = [
      [-wx, wheelRadius, -axleZ],
      [wx, wheelRadius, -axleZ],
      [-wx, wheelRadius, axleZ],
      [wx, wheelRadius, axleZ]
    ];
    for (const [x, y, z] of wheelPositions) {
      const wg = new THREE.Group();
      wg.position.set(x, y, z);
      const tire = new THREE.Mesh(wheelGeo, darkMat);
      tire.castShadow = true;
      wg.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wg.add(rim);
      g.add(wg);
    }

    // Shadow blob
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.2, l * 1.05), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.renderOrder = 2;
    g.add(shadow);

    // Bounding data on the group
    g.userData.bounds = { halfW: w * 0.5, halfL: l * 0.5, typeKey };
    return g;
  }

  _placeTrafficCar(car, z, laneIdx = -1) {
    const idx = laneIdx < 0 ? randInt(0, LANES.count - 1) : laneIdx;
    const x = LANE_POSITIONS[idx];
    car.position.set(x, 0, z);

    const type = TRAFFIC_TYPES[car.userData.bounds.typeKey];
    const speed = randRange(type.speedRange[0], type.speedRange[1]);

    car.userData.speed = speed;
    car.userData.laneIdx = idx;
    car.userData.laneTarget = x;
    car.userData.passed = false;
    car.userData.passedByPlayer = false;
    car.userData.scored = false;
    car.userData.nextLaneChange = randRange(
      TRAFFIC.laneChangeMinInterval,
      TRAFFIC.laneChangeMaxInterval
    );
    car.userData.laneChangeCooldown = 0;
  }

  _recycleTrafficCar(car, playerZ) {
    const z = playerZ - TRAFFIC.spawnAheadDistance - randRange(0, 80);
    this._placeTrafficCar(car, z);
  }

  _updateTraffic(dt, playerZ) {
    for (let i = 0; i < this.traffic.length; i++) {
      const car = this.traffic[i];
      const d = car.userData;

      // Forward motion
      car.position.z -= d.speed * dt;

      // Lane change scheduling
      d.nextLaneChange -= dt;
      if (d.nextLaneChange <= 0 && Math.random() < TRAFFIC.laneChangeChance) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const newLane = clamp(d.laneIdx + dir, 0, LANES.count - 1);
        if (newLane !== d.laneIdx) {
          d.laneIdx = newLane;
          d.laneTarget = LANE_POSITIONS[newLane];
        }
        d.nextLaneChange = randRange(TRAFFIC.laneChangeMinInterval, TRAFFIC.laneChangeMaxInterval);
      }

      // Slide laterally
      if (Math.abs(car.position.x - d.laneTarget) > 0.001) {
        const dx = d.laneTarget - car.position.x;
        const step = TRAFFIC.lateralSnapSpeed * dt;
        car.position.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
        // Slight lean while changing lanes
        car.rotation.z = clamp(-dx * 0.05, -0.08, 0.08);
      } else {
        car.rotation.z *= 0.85;
      }

      // Recycle behind camera
      if (car.position.z > playerZ + TRAFFIC.recycleBehindDistance) {
        this._recycleTrafficCar(car, playerZ);
      }

      // If a car is far ahead of player's forward view, they might be "stuck" behind
      // Keep them within a maximum ahead distance too.
      if (car.position.z < playerZ - TRAFFIC.spawnAheadDistance - 60) {
        this._recycleTrafficCar(car, playerZ);
      }
    }
  }

  // ===========================================================================
  // PICKUPS
  // ===========================================================================
  _initPickups() {
    this.nextCoinZ = -20;
    this.coinCounter = 0;
    this.nextBoostZ = -SPAWN.boostPickupEveryDistance;
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

    const bandGeo = new THREE.CylinderGeometry(PICKUPS.crownRadius * 0.85, PICKUPS.crownRadius, 0.28, 10, 1, true);
    const band = new THREE.Mesh(bandGeo, goldMat);
    band.castShadow = true;
    g.add(band);

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

  _makeBoost() {
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
    const geo = new THREE.ConeGeometry(PICKUPS.boostRadius * 0.85, PICKUPS.boostRadius * 2.4, 8, 1);
    const cone = new THREE.Mesh(geo, mat);
    cone.castShadow = true;
    g.add(cone);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PICKUPS.boostRadius, 0.07, 6, 20), ringMat);
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(PICKUPS.boostRadius * 1.15, 0.05, 6, 20), ringMat);
    ring2.rotation.x = Math.PI / 2;
    g.add(ring2);

    g.userData.type = 'boost';
    g.userData.value = 0;
    return g;
  }

  _spawnPickup(type, laneIdx, z) {
    let obj;
    if (type === 'coin') obj = this._makeCoin();
    else if (type === 'crown') obj = this._makeCrown();
    else obj = this._makeBoost();

    const x = LANE_POSITIONS[laneIdx];
    obj.position.set(x, 1.3, z);
    obj.userData.baseY = 1.3;
    obj.userData.phase = Math.random() * TWO_PI;
    obj.userData.spinSpeed = type === 'coin'
      ? PICKUPS.coinSpinSpeed
      : type === 'crown'
      ? PICKUPS.crownSpinSpeed
      : PICKUPS.boostSpinSpeed;
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

  _updatePickups(dt, playerZ) {
    const spawnAheadZ = playerZ - 220;

    while (this.nextCoinZ > spawnAheadZ) {
      const laneIdx = randInt(0, LANES.count - 1);
      this.coinCounter++;
      const isCrown = this.coinCounter % SPAWN.crownEveryCoins === 0;
      this._spawnPickup(isCrown ? 'crown' : 'coin', laneIdx, this.nextCoinZ);
      this.nextCoinZ -= SPAWN.coinEveryDistance;
    }

    if (this.nextBoostZ > spawnAheadZ) {
      const laneIdx = randInt(0, LANES.count - 1);
      this._spawnPickup('boost', laneIdx, this.nextBoostZ);
      this.nextBoostZ -= SPAWN.boostPickupEveryDistance;
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const u = p.userData;

      p.rotation.y += u.spinSpeed * dt;
      p.position.y = u.baseY + Math.sin(this.time * u.bobFreq + u.phase) * u.bobAmp;

      if (p.position.z > playerZ + 30 || u.collected) {
        this.pickupGroup.remove(p);
        this.pickups.splice(i, 1);
      }
    }
  }

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

  // ===========================================================================
  // CHECKPOINTS
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

    const stripeGeo = new THREE.BoxGeometry(W + 2.4, 0.14, 0.66);
    const stripe = new THREE.Mesh(stripeGeo, glowMat);
    stripe.position.set(0, H - 0.22, 0.03);
    g.add(stripe);

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

  _updateCheckpoints(dt, playerZ) {
    const spawnAheadZ = playerZ - 260;

    while (this.nextCheckpointZ > spawnAheadZ) {
      this._createCheckpoint(this.nextCheckpointZ);
      this.nextCheckpointZ -= SPAWN.checkpointEveryDistance;
    }

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

  checkCheckpointCrossing(prevZ, currZ) {
    const crossed = [];
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
  // TRAFFIC COLLISION
  // ===========================================================================
  detectTrafficCollision(playerPos, playerRadius) {
    let hit = false;
    const rSum = playerRadius + 1.2;

    for (let i = 0; i < this.traffic.length; i++) {
      const car = this.traffic[i];
      const dx = car.position.x - playerPos.x;
      const dz = car.position.z - playerPos.z;

      const b = car.userData.bounds || { halfW: 1.0, halfL: 2.0 };
      if (
        Math.abs(dx) < b.halfW + playerRadius * 0.7 &&
        Math.abs(dz) < b.halfL + playerRadius * 0.7
      ) {
        hit = true;
      }

      if (!car.userData.passedByPlayer) {
        if (dz > 0 && dz < rSum * 2.5) {
          car.userData.passedByPlayer = true;
        }
      }
    }
    return hit;
  }

  // ===========================================================================
  // PER-FRAME UPDATE
  // ===========================================================================
  update(dt, playerZ, playerX) {
    this.time += dt;

    if (this.sky) {
      this.sky.position.x = playerX * 0.4;
      this.sky.position.z = playerZ;
    }

    if (this.oceanTex) {
      this.oceanTex.offset.x = (this.oceanTex.offset.x + dt * 0.012) % 1;
      this.oceanTex.offset.y = (this.oceanTex.offset.y + dt * 0.020) % 1;
    }

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

    for (let i = 0; i < this._palms.length; i++) {
      const p = this._palms[i];
      p.rotation.z = Math.sin(this.time * 0.8 + p.userData.swayPhase) * 0.02;
    }

    for (let i = 0; i < this._clouds.length; i++) {
      const c = this._clouds[i];
      c.position.x += c.userData.driftX * dt;
      if (c.position.x < -320) c.position.x = 320;
    }

    // Sun target follows the player for consistent shadow coverage.
    if (this.sun && this.sun.target) {
      this.sun.target.position.set(playerX, 0, playerZ);
      this.sun.position.set(
        playerX + this.theme.sunDir.x * 140,
        this.theme.sunDir.y * 140,
        playerZ + this.theme.sunDir.z * 140
      );
    }

    this._recycleRoadSegments(playerZ);
    this._updateTraffic(dt, playerZ);
    this._updatePickups(dt, playerZ);
    this._updateCheckpoints(dt, playerZ);
  }

  // ===========================================================================
  // MENU / PLAY MODE
  // ===========================================================================
  showMenuPlatform(visible) {
    this.menuGroup.visible = !!visible;
    this.trafficGroup.visible = !visible;
    this.pickupGroup.visible = !visible;
    this.checkpointGroup.visible = !visible;
    this.roadGroup.visible = !visible;
  }

  resetForPlay(playerZ) {
    const segLen = ROAD.segmentLength;
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].position.z = playerZ + segLen - i * segLen;
    }

    for (let i = 0; i < this.traffic.length; i++) {
      this._recycleTrafficCar(this.traffic[i], playerZ);
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      this.pickupGroup.remove(this.pickups[i]);
    }
    this.pickups.length = 0;
    this.nextCoinZ = playerZ - 20;
    this.coinCounter = 0;
    this.nextBoostZ = playerZ - SPAWN.boostPickupEveryDistance;

    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      this.checkpointGroup.remove(this.checkpoints[i]);
    }
    this.checkpoints.length = 0;
    this.nextCheckpointZ = playerZ - SPAWN.checkpointFirstAt;
  }

  setTrafficDensity(multiplier) {
    const target = Math.min(
      TRAFFIC.count,
      Math.max(4, Math.round(TRAFFIC.count * multiplier))
    );
    for (let i = 0; i < this.traffic.length; i++) {
      this.traffic[i].visible = i < target;
    }
  }

  // ===========================================================================
  // CLEANUP
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
    if (this._skyTex) this._skyTex.dispose();

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