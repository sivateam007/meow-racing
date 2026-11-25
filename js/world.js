import * as THREE from 'three';
import {
  WORLD_CFG,
  TRAFFIC_CFG,
  PED_CFG,
  VEHICLE_TYPES,
  SURVIVAL,
  TERRAIN,
  FUEL,
  PIZZA,
  TRAIN,
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
      { wallTop: '#334155', wallBot: '#1e293b', frame: '#0f172a', lit: ['#fef08a', '#fde047', '#bae6fd'], dark: '#0b1120', blind: '#475569' },
      { wallTop: '#475569', wallBot: '#334155', frame: '#1e293b', lit: ['#fde68a', '#fed7aa', '#a5f3fc'], dark: '#111827', blind: '#64748b' },
      { wallTop: '#293548', wallBot: '#172033', frame: '#090d16', lit: ['#fef9c3', '#7dd3fc', '#fbcfe8'], dark: '#070c18', blind: '#334155' },
      { wallTop: '#52525b', wallBot: '#27272a', frame: '#18181b', lit: ['#fde047', '#e0f2fe', '#fed7aa'], dark: '#09090b', blind: '#3f3f46' }
    ];

    this._windowTextureCache = palettes.map((pal, pIdx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, pal.wallTop);
      grad.addColorStop(1, pal.wallBot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);

      // Subtle vertical grime streaks
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      for (let gx = 6 + ((pIdx * 19) % 24); gx < 124; gx += 28) {
        ctx.fillRect(gx, 0, 3, 128);
      }

      const cols = 4;
      const rows = 8;
      const cellW = 128 / cols;
      const cellH = 128 / rows;
      const winW = 18;
      const winH = 9;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = Math.round(c * cellW + (cellW - winW) * 0.5);
          const wy = Math.round(r * cellH + (cellH - winH) * 0.5);
          const hash = (r * 7 + c * 13 + pIdx * 5) % 11;

          // Window frame
          ctx.fillStyle = pal.frame;
          ctx.fillRect(wx - 1, wy - 1, winW + 2, winH + 2);

          if (hash < 4) {
            ctx.fillStyle = pal.lit[(r + c + pIdx) % pal.lit.length];
            ctx.fillRect(wx, wy, winW, winH);
            // Half blind / curtain on select lit panes
            if (hash === 1) {
              ctx.fillStyle = pal.blind;
              ctx.fillRect(wx, wy, winW, Math.round(winH * 0.42));
            }
          } else {
            ctx.fillStyle = pal.dark;
            ctx.fillRect(wx, wy, winW, winH);
          }

          // Center mullion
          ctx.fillStyle = pal.frame;
          ctx.fillRect(wx + Math.floor(winW * 0.5), wy, 1, winH);

          // Small AC ledge under select windows
          if (hash === 3 && c % 2 === 1) {
            ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
            ctx.fillRect(wx + 2, wy + winH + 1, winW - 4, 2);
          }
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });

    return this._windowTextureCache;
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
      color: 0x4b7a3f,
      roughness: 0.94,
      metalness: 0.02
    });
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(20000, 20000),
      groundMat
    );
    groundMesh.rotation.x = -Math.PI * 0.5;
    groundMesh.position.y = -0.5;
    groundMesh.receiveShadow = true;
    this.cityGroup.add(groundMesh);

    const cityPad = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_CFG.gridSpan + 40, WORLD_CFG.gridSpan + 40),
      new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.88, metalness: 0.06 })
    );
    cityPad.rotation.x = -Math.PI * 0.5;
    cityPad.position.y = 0;
    cityPad.receiveShadow = true;
    this.cityGroup.add(cityPad);

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

    const totalBlocks = this.blockCenters.length;
    this.pizzaBlockKeys = new Set([
      Math.floor(totalBlocks * 0.16),
      Math.floor(totalBlocks * 0.46),
      Math.floor(totalBlocks * 0.76)
    ]);

    for (let blockIndex = 0; blockIndex < this.blockCenters.length; blockIndex++) {
      const block = this.blockCenters[blockIndex];
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

      if (this.pizzaBlockKeys.has(blockIndex)) continue;

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
    this._buildOilDistrict();
    this._buildTerrain();
    this._buildGreenDistricts();
    this._buildDesertAirport();
    this._buildFuelStation();
    this._buildRailway();
    this._buildTrain();
    this._buildVehicleShop();
    this._buildNaturalHomes();
    this._decorateBuildings();
    this._addStreetDetails();
    this._buildRoadDetails();
    this._buildSkyDome();
    this._buildOpenWorld();
    this._buildPizzaShops();
    this._clearRoadColliders();
  }

  _buildOpenWorld() {
    if (!this.scene) return;
    if (this.openWorldGroup) this.scene.remove(this.openWorldGroup);

    const group = new THREE.Group();
    this.openWorldGroup = group;
    this.openWorldProps = [];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.85 });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.8 });

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 6);
    const pineGeo = new THREE.ConeGeometry(2.1, 5.4, 7);
    const bushGeo = new THREE.IcosahedronGeometry(1.3, 0);
    const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
    const wallGeo = new THREE.BoxGeometry(6, 3.4, 5.4);
    const roofGeo = new THREE.ConeGeometry(4.6, 2.4, 4);

    const count = 150;
    for (let i = 0; i < count; i++) {
      const prop = new THREE.Group();
      const kind = i % 4;

      if (kind === 0) {
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.6;
        const crown = new THREE.Mesh(pineGeo, pineMat);
        crown.position.y = 5.2;
        prop.add(trunk, crown);
      } else if (kind === 1) {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.y = 1;
        rock.rotation.set(randRange(0, 1), randRange(0, 3), randRange(0, 1));
        prop.add(rock);
      } else if (kind === 2) {
        const bush = new THREE.Mesh(bushGeo, bushMat);
        bush.position.y = 0.9;
        prop.add(bush);
      } else {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.y = 1.7;
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 4.5;
        roof.rotation.y = Math.PI * 0.25;
        prop.add(wall, roof);
      }

      group.add(prop);
      const entry = { group: prop, kind };
      this.openWorldProps.push(entry);
      this._placeOpenProp(entry, 0, 0, 150, 520);
    }
    this.scene.add(group);
  }

  _placeOpenProp(prop, cx, cz, minR, maxR) {
    const clear = (WORLD_CFG.halfSpan || 300) + 70;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = randRange(minR, maxR);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.abs(x) < clear && Math.abs(z) < clear) continue;
      prop.group.position.set(x, -0.5, z);
      prop.group.rotation.y = Math.random() * Math.PI * 2;
      const s = randRange(0.7, 1.7);
      prop.group.scale.setScalar(s);
      return;
    }
    prop.group.position.set(cx + maxR, -0.5, cz + maxR);
  }

  _updateOpenWorld(playerPos = { x: 0, z: 0 }) {
    if (!Array.isArray(this.openWorldProps)) return;
    const px = playerPos.x || 0;
    const pz = playerPos.z || 0;
    for (const prop of this.openWorldProps) {
      const p = prop.group.position;
      if (Math.hypot(p.x - px, p.z - pz) > 520) {
        this._placeOpenProp(prop, px, pz, 150, 480);
      }
    }
    if (this._skyDomeGroup) {
      this._skyDomeGroup.position.set(px, 0, pz);
    }
  }

  _buildPizzaShops() {
    if (!this.cityGroup || !Array.isArray(this.blockCenters) || this.blockCenters.length === 0) return;
    const cfg = typeof PIZZA !== 'undefined' ? PIZZA : { shopCount: 3 };
    const count = Math.min(cfg.shopCount || 3, this.blockCenters.length);
    this.pizzaShops = [];

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.75 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });
    const yardMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.92 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 0.6 });
    const bodyGeo = new THREE.BoxGeometry(16, 5, 13);
    const gableGeo = new THREE.BoxGeometry(9.2, 0.5, 14);
    const porchGeo = new THREE.BoxGeometry(16, 0.4, 3.2);
    const colGeo = new THREE.CylinderGeometry(0.24, 0.24, 3.1, 8);
    const winGeo = new THREE.BoxGeometry(2.2, 1.7, 0.2);
    const yardGeo = new THREE.PlaneGeometry(38, 38);
    yardGeo.rotateX(-Math.PI * 0.5);
    const ringGeo = new THREE.RingGeometry(3.4, 4.4, 24);
    ringGeo.rotateX(-Math.PI * 0.5);

    for (let i = 0; i < count; i++) {
      const keys = Array.from(this.pizzaBlockKeys || []);
      const b = this.blockCenters[keys[i]];
      if (!b) continue;
      const px = b.x;
      const pz = b.z;
      const color = (cfg.shopPalette || [0xef4444])[i % (cfg.shopPalette || [0xef4444]).length];

      const group = new THREE.Group();
      group.position.set(px, 0, pz);

      const yard = new THREE.Mesh(yardGeo, yardMat);
      yard.position.y = 0.26;
      yard.receiveShadow = true;
      group.add(yard);

      const base = new THREE.Mesh(bodyGeo, wallMat);
      base.position.y = 2.75;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      const gableL = new THREE.Mesh(gableGeo, roofMat);
      gableL.position.set(-4.1, 6.3, 0);
      gableL.rotation.z = 0.42;
      gableL.castShadow = true;
      group.add(gableL);
      const gableR = new THREE.Mesh(gableGeo, roofMat);
      gableR.position.set(4.1, 6.3, 0);
      gableR.rotation.z = -0.42;
      gableR.castShadow = true;
      group.add(gableR);

      const porch = new THREE.Mesh(porchGeo, trimMat);
      porch.position.set(0, 0.45, 7.6);
      group.add(porch);
      for (const cx of [-6.5, 6.5]) {
        const col = new THREE.Mesh(colGeo, trimMat);
        col.position.set(cx, 2.1, 8.2);
        group.add(col);
      }
      for (const wx of [-4.5, 0, 4.5]) {
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(wx, 3.1, 6.62);
        group.add(win);
      }

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, 250, 58);
      ctx.fillStyle = '#fde047';
      ctx.font = '900 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PIZZA', 128, 34);
      const signTex = new THREE.CanvasTexture(canvas);
      signTex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 1.75),
        new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
      );
      sign.position.set(0, 4.6, 6.8);
      group.add(sign);

      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false
      }));
      ring.position.set(0, 0.3, 12);
      group.add(ring);

      this.cityGroup.add(group);
      this.pizzaShops.push({ x: px, z: pz + 12 });
      this.colliders.push({
        minX: px - 8.4, maxX: px + 8.4,
        minZ: pz - 6.6, maxZ: pz + 6.6
      });
    }

    const edge = (WORLD_CFG.halfSpan || 300) + 90;
    const outposts = [
      { x: -edge, z: -edge * 0.45 },
      { x: edge, z: edge * 0.4 },
      { x: -edge * 0.5, z: edge },
      { x: edge * 0.55, z: -edge }
    ];
    const outRoofGeo = new THREE.BoxGeometry(17, 0.8, 14);
    for (let i = 0; i < outposts.length; i++) {
      const o = outposts[i];
      const group = new THREE.Group();
      group.position.set(o.x, 0, o.z);
      const base = new THREE.Mesh(bodyGeo, wallMat);
      base.position.y = 2.75;
      base.castShadow = true;
      group.add(base);
      const roof = new THREE.Mesh(outRoofGeo, roofMat);
      roof.position.y = 5.8;
      group.add(roof);

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#fb923c';
      ctx.font = '900 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PIZZA', 128, 34);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 1.6),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
      );
      sign.position.set(0, 2.4, 3.6);
      group.add(sign);

      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xf97316, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false
      }));
      ring.position.set(0, 0.05, 5.5);
      group.add(ring);
      this.cityGroup.add(group);
      this.pizzaShops.push({ x: o.x, z: o.z + 5.5, outside: true });
    }
  }

  _clearRoadColliders() {
    const half = (WORLD_CFG.roadWidth || 14) * 0.5 + 0.5;
    const streets = Array.isArray(this.streetCoords) ? this.streetCoords : [];
    this.colliders = this.colliders.filter((c) => {
      for (const s of streets) {
        if (c.minX < s + half && c.maxX > s - half) return false;
        if (c.minZ < s + half && c.maxZ > s - half) return false;
      }
      return true;
    });
  }

  _buildSkyline() {
    const skylineMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.2
    });

    const innerEdge = (WORLD_CFG.halfSpan || 300) + 60;

    for (let i = 0; i < WORLD_CFG.skylineCount; i++) {
      const w = randRange(14, 28);
      const d = randRange(14, 28);
      const h = randRange(24, 82);
      const along = randRange(-innerEdge, innerEdge);
      const out = innerEdge + randRange(0, 70);
      const side = i % 4;
      const sx = side === 0 ? along : side === 1 ? out : side === 2 ? -along : -out;
      const sz = side === 0 ? -out : side === 1 ? along : side === 2 ? out : -along;

      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skylineMat);
      tower.position.set(sx, h * 0.5 - 2, sz);
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
    const spec = (VEHICLE_TYPES && VEHICLE_TYPES[typeKey]) ||
      TRAFFIC_CFG.types[typeKey] || TRAFFIC_CFG.types.sedan;
    const w = spec.w || spec.width || 2.0;
    const h = spec.h || spec.height || 1.25;
    const l = spec.l || spec.length || 4.1;
    const col = colorHex ?? (spec.colors && spec.colors[0]) ?? 0x3b82f6;

    const group = new THREE.Group();
    const wheels = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.7 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    if (typeKey === 'bike') {
      const wr = 0.38;
      const wg = new THREE.CylinderGeometry(wr, wr, 0.22, 12);
      wg.rotateZ(Math.PI * 0.5);
      for (const zOff of [l * 0.36, -l * 0.36]) {
        const wm = new THREE.Mesh(wg, tireMat);
        wm.position.set(0, wr, zOff);
        group.add(wm);
        wheels.push(wm);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, l * 0.72), bodyMat);
      frame.position.set(0, wr + 0.28, 0);
      group.add(frame);
      const rider = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.58, 0.32), darkMat);
      rider.position.set(0, wr + 0.74, -0.06);
      group.add(rider);
      const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.38), hazardMat);
      helmet.position.set(0, wr + 1.18, 0.02);
      group.add(helmet);
      return { group, wheels };
    }

    const wheelR = 0.42;
    const lowerH = h * 0.52;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, lowerH, l), bodyMat);
    lower.position.y = wheelR + lowerH * 0.5;
    lower.castShadow = true;
    lower.receiveShadow = true;
    group.add(lower);

    const hlGeo = new THREE.BoxGeometry(0.32, 0.18, 0.1);
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(hlGeo, lightMat);
      hl.position.set(side * (w * 0.34), wheelR + lowerH * 0.55, -l * 0.5 - 0.03);
      group.add(hl);
    }

    if (typeKey === 'oil_tanker') {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.44, w * 0.44, l * 0.74, 14), bodyMat);
      tank.rotation.x = Math.PI * 0.5;
      tank.position.set(0, wheelR + lowerH + w * 0.38, 0.15);
      tank.castShadow = true;
      group.add(tank);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.22, l * 0.82), hazardMat);
      stripe.position.set(0, wheelR + lowerH * 0.85, 0);
      group.add(stripe);
    } else if (typeKey === 'bus') {
      const upperH = Math.max(0.7, h - lowerH);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, upperH, l * 0.88), darkMat);
      cabin.position.set(0, wheelR + lowerH + upperH * 0.5, 0);
      cabin.castShadow = true;
      group.add(cabin);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.24, l * 0.9), bodyMat);
      band.position.set(0, wheelR + lowerH + upperH * 0.65, 0);
      group.add(band);
    } else {
      const upperH = Math.max(0.38, h - lowerH);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, upperH, l * 0.56), darkMat);
      cabin.position.set(0, wheelR + lowerH + upperH * 0.5 - 0.03, -0.1);
      cabin.castShadow = true;
      group.add(cabin);
    }

    if (typeKey === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.28), hazardMat);
      sign.position.set(0, wheelR + h + 0.08, -0.1);
      group.add(sign);
    }

    if (typeKey === 'police') {
      const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const blueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.2, 0.32), darkMat);
      bar.position.set(0, wheelR + h + 0.08, -0.05);
      group.add(bar);
      const rLamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, 0.22, 0.34), redMat);
      rLamp.position.set(-w * 0.18, wheelR + h + 0.09, -0.05);
      group.add(rLamp);
      const bLamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, 0.22, 0.34), blueMat);
      bLamp.position.set(w * 0.18, wheelR + h + 0.09, -0.05);
      group.add(bLamp);
    }

    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.32, 10);
    wheelGeo.rotateZ(Math.PI * 0.5);
    const wx = w * 0.5;
    const wz = l * 0.32;
    for (const [cx, cz] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
      const wm = new THREE.Mesh(wheelGeo, tireMat);
      wm.position.set(cx, wheelR, cz);
      wm.castShadow = true;
      group.add(wm);
      wheels.push(wm);
    }

    return { group, wheels };
  }

  buildTraffic() {
    this.trafficGroup.clear();
    this.trafficPool.length = 0;

    const typeKeys = Object.keys(VEHICLE_TYPES || TRAFFIC_CFG.types).filter(
      (k) => (VEHICLE_TYPES[k] ? VEHICLE_TYPES[k].spawnWeight : 1) > 0
    );
    for (let i = 0; i < TRAFFIC_CFG.poolSize; i++) {
      const typeKey = typeKeys[i % typeKeys.length];
      const tCfg = VEHICLE_TYPES[typeKey] || TRAFFIC_CFG.types[typeKey] || TRAFFIC_CFG.types.sedan;
      const colors = tCfg.colors || [0x3b82f6];
      const colorHex = colors[i % colors.length];
      const { group, wheels } = this._createVehicleMesh(typeKey, colorHex);
      this.trafficGroup.add(group);

      const agent = {
        typeKey,
        width: tCfg.w || tCfg.width || 2.0,
        length: tCfg.l || tCfg.length || 4.1,
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
    // Start at midday; keep a long daylight window for the first play session.
    this.lightPhase = (this.time % cycle) / cycle;
    const daylight = 0.5 + 0.5 * Math.cos(this.lightPhase * Math.PI * 2);
    const dayBoost = this.time < cycle * 0.5 ? 0.35 : 0;
    const dayLight = Math.min(1, daylight + dayBoost);

    const topCol = new THREE.Color(COLORS.skyNightTop).lerp(new THREE.Color(COLORS.skyDayTop), dayLight);
    const fogCol = new THREE.Color(COLORS.fogNight).lerp(new THREE.Color(COLORS.fogDay), dayLight);
    const sunCol = new THREE.Color(COLORS.sunNight).lerp(new THREE.Color(COLORS.sunDay), dayLight);

    this.scene.background = topCol;
    if (this.scene.fog) {
      this.scene.fog.color.copy(fogCol);
    }
    if (this.sunLight) {
      this.sunLight.color.copy(sunCol);
      this.sunLight.intensity = lerp(0.7, 2.1, dayLight);
    }
  }

  update(dt, playerPos = { x: 0, z: 0 }, wantedLevel = 0) {
    const safeDt = Math.min(dt, 0.05);
    this.time += safeDt;

    this._updateTrafficLights(safeDt);
    this._updateTraffic(safeDt, playerPos);
    this._updatePedestrians(safeDt, playerPos);
    this._updateDayNight(safeDt);
    this._updatePolice(safeDt, playerPos, wantedLevel || 0);
    this._updateFuelStation(safeDt, playerPos);
    this._updateTrain(safeDt);
    this._updateTaxiMarker(safeDt);
    this._updateOpenWorld(playerPos);
  }

  _buildRoadDetails() {
    if (!this.cityGroup || !Array.isArray(this.streetCoords) || this.streetCoords.length === 0) return;

    const patchMat = new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.95, metalness: 0.05 });
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x090c14 });
    const manholeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.75 });
    const bayMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    const patchGeo = new THREE.PlaneGeometry(3.4, 2.2);
    patchGeo.rotateX(-Math.PI * 0.5);
    const crackGeo = new THREE.PlaneGeometry(0.14, 2.8);
    crackGeo.rotateX(-Math.PI * 0.5);
    const manholeGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.03, 12);
    const bayGeo = new THREE.PlaneGeometry(0.18, 2.6);
    bayGeo.rotateX(-Math.PI * 0.5);
    const arrowGeo = new THREE.ConeGeometry(0.55, 1.4, 3);
    arrowGeo.rotateX(-Math.PI * 0.5);

    const roadW = WORLD_CFG.roadWidth || 14;
    const laneOff = roadW * 0.25;
    let added = 0;
    const cap = 260;

    for (let i = 0; i < this.streetCoords.length && added < cap; i++) {
      const s = this.streetCoords[i];

      for (let j = 0; j < this.streetCoords.length && added < cap; j += 2) {
        const ix = this.streetCoords[j];
        const iz = s;

        const mh = new THREE.Mesh(manholeGeo, manholeMat);
        mh.position.set(ix + laneOff, 0.032, iz + laneOff);
        this.cityGroup.add(mh);
        added++;

        if (added < cap) {
          const patch = new THREE.Mesh(patchGeo, patchMat);
          patch.position.set(ix + 14, 0.031, iz - laneOff);
          patch.rotation.y = (i + j) * 0.35;
          this.cityGroup.add(patch);
          added++;
        }

        if (added < cap && (i + j) % 3 === 0) {
          const crack = new THREE.Mesh(crackGeo, crackMat);
          crack.position.set(ix - 16, 0.033, iz + laneOff);
          crack.rotation.z = 0.25;
          this.cityGroup.add(crack);
          added++;
        }
      }

      if (added < cap) {
        const bay = new THREE.Mesh(bayGeo, bayMat);
        bay.position.set(s + roadW * 0.5 - 1.2, 0.032, 0);
        this.cityGroup.add(bay);
        added++;
      }

      if (added < cap && i % 2 === 1) {
        const arr = new THREE.Mesh(arrowGeo, arrowMat);
        arr.position.set(s - laneOff, 0.034, -18);
        this.cityGroup.add(arr);
        added++;
      }
    }
  }

  _buildSkyDome() {
    if (!this.scene) return;
    if (this._skyDomeGroup) {
      this.scene.remove(this._skyDomeGroup);
    }

    const grp = new THREE.Group();
    grp.renderOrder = -1;

    const topCol = new THREE.Color(COLORS.skyDayTop ?? 0x38bdf8);
    const botCol = new THREE.Color(COLORS.fogDay ?? 0x93c5fd);

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: topCol },
        bottomColor: { value: botCol }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = clamp(normalize(vWorldPos).y * 1.4, 0.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(h, 0.65));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const dome = new THREE.Mesh(new THREE.SphereGeometry(390, 24, 16), skyMat);
    dome.renderOrder = -1;
    grp.add(dome);

    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(14, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfffbeb,
        fog: false,
        depthWrite: false
      })
    );
    sunDisc.position.set(140, 210, 120);
    sunDisc.lookAt(0, 0, 0);
    sunDisc.renderOrder = -1;
    grp.add(sunDisc);

    const cCanvas = document.createElement('canvas');
    cCanvas.width = 128;
    cCanvas.height = 128;
    const cCtx = cCanvas.getContext('2d');
    const grad = cCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.22)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    cCtx.fillStyle = grad;
    cCtx.fillRect(0, 0, 128, 128);
    const cloudTex = new THREE.CanvasTexture(cCanvas);
    cloudTex.colorSpace = THREE.SRGBColorSpace;

    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      fog: false
    });

    const cloudCoords = [
      [-110, 125, -90],
      [95, 138, -120],
      [-140, 118, 85],
      [125, 132, 95]
    ];
    for (const [cx, cy, cz] of cloudCoords) {
      const sp = new THREE.Sprite(cloudMat);
      sp.position.set(cx, cy, cz);
      sp.scale.set(68, 28, 1);
      sp.renderOrder = -1;
      grp.add(sp);
    }

    this._skyDomeGroup = grp;
    this.scene.add(grp);
  }

  _buildOilDistrict() {
    const size = (SURVIVAL && SURVIVAL.oilDistrictSize) || 44;
    const targetBlock = this.blockCenters[this.blockCenters.length - 1] || {
      x: WORLD_CFG.halfSpan * 0.5,
      z: WORLD_CFG.halfSpan * 0.5
    };
    const group = new THREE.Group();
    group.position.set(targetBlock.x, 0, targetBlock.z);

    const padMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.6 });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45, metalness: 0.5 });
    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    const pad = new THREE.Mesh(new THREE.BoxGeometry(size, 0.25, size), padMat);
    pad.position.y = 0.125;
    pad.receiveShadow = true;
    group.add(pad);

    const tankOffsets = [[-10, -8, 4.2, 11], [8, -9, 4.8, 13], [-9, 9, 3.6, 8.5]];
    for (const [tx, tz, rad, h] of tankOffsets) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 14), tankMat);
      tank.position.set(tx, 0.25 + h * 0.5, tz);
      tank.castShadow = true;
      group.add(tank);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rad + 0.08, rad + 0.08, 0.5, 14), hazardMat);
      band.position.set(tx, 0.25 + h * 0.22, tz);
      group.add(band);
      this.colliders.push({
        minX: targetBlock.x + tx - rad,
        maxX: targetBlock.x + tx + rad,
        minZ: targetBlock.z + tz - rad,
        maxZ: targetBlock.z + tz + rad
      });
    }

    const pump = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 4.5), pipeMat);
    pump.position.set(9, 1.85, 9);
    pump.castShadow = true;
    group.add(pump);

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 18, 8), pipeMat);
    pipe.rotation.z = Math.PI * 0.5;
    pipe.position.set(0, 2.2, -8);
    group.add(pipe);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '900 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OIL CO', 128, 34);
    const signTex = new THREE.CanvasTexture(canvas);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
    );
    signMesh.position.set(0, 6.5, size * 0.46);
    group.add(signMesh);

    const flood = new THREE.PointLight(0xffedd5, 1.4, 36);
    flood.position.set(0, 9, 0);
    group.add(flood);

    this.scene.add(group);
  }

  _spawnPolice(wantedLevel = 0, playerPos = { x: 0, z: 0 }) {
    if (!Array.isArray(this.policePool)) this.policePool = [];
    const targetCount = clamp(
      Math.floor(wantedLevel) - 1,
      0,
      3
    );
    while (this.policePool.length < targetCount) {
      const idx = this.policePool.length;
      const built = this._createVehicleMesh('police', 0x0f172a);
      const mesh = built.group || built;
      const angle = (idx / Math.max(1, targetCount)) * Math.PI * 2;
      const dist = 34 + idx * 7;
      mesh.position.set(
        clamp((playerPos.x || 0) + Math.cos(angle) * dist, -WORLD_CFG.halfSpan + 4, WORLD_CFG.halfSpan - 4),
        0,
        clamp((playerPos.z || 0) + Math.sin(angle) * dist, -WORLD_CFG.halfSpan + 4, WORLD_CFG.halfSpan - 4)
      );
      this.scene.add(mesh);
      this.policePool.push({ mesh, heading: 0, speed: 26 });
    }
    while (this.policePool.length > targetCount) {
      const removed = this.policePool.pop();
      if (removed && removed.mesh) this.scene.remove(removed.mesh);
    }
  }

  _updatePolice(dt, playerPos = { x: 0, z: 0 }, wantedLevel = 0) {
    this._spawnPolice(wantedLevel, playerPos);
    if (!Array.isArray(this.policePool) || this.policePool.length === 0) return;
    const safeDt = Math.min(dt, 0.05);
    const px = playerPos.x || 0;
    const pz = playerPos.z || 0;
    const spanLimit = WORLD_CFG.halfSpan - 2;
    for (let i = 0; i < this.policePool.length; i++) {
      const cop = this.policePool[i];
      const pos = cop.mesh.position;
      const dx = px - pos.x;
      const dz = pz - pos.z;
      const dist = Math.hypot(dx, dz);
      const desiredHeading = Math.atan2(-dx, -dz);
      let diff = desiredHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += diff * Math.min(1, safeDt * 2.2);
      const targetSpeed = dist > 60 ? 12 : dist > 12 ? 18 + wantedLevel : 8;
      cop.speed = lerp(cop.speed, targetSpeed, safeDt * 2);
      pos.x = clamp(pos.x - Math.sin(cop.heading) * cop.speed * safeDt, -spanLimit, spanLimit);
      pos.z = clamp(pos.z - Math.cos(cop.heading) * cop.speed * safeDt, -spanLimit, spanLimit);
      cop.mesh.rotation.y = cop.heading;
    }
  }

  _buildTerrain() {
    if (!this.terrainGroup) {
      this.terrainGroup = new THREE.Group();
      this.scene.add(this.terrainGroup);
    }
    this.terrainGroup.clear();
  }




_buildGreenDistricts() {
    if (!this.cityGroup || !Array.isArray(this.blockCenters)) return;

    const grassMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9 });
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.92 });
    const flowerMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    const yardGeo = new THREE.PlaneGeometry(WORLD_CFG.blockSize - 3, WORLD_CFG.blockSize - 3);
    yardGeo.rotateX(-Math.PI * 0.5);
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 6);
    const leafGeo = new THREE.ConeGeometry(1.7, 3.6, 6);
    const palmTrunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5.2, 6);
    const frondGeo = new THREE.ConeGeometry(2.1, 0.85, 5);
    const benchGeo = new THREE.BoxGeometry(1.8, 0.45, 0.65);
    const flowerGeo = new THREE.BoxGeometry(0.45, 0.25, 0.45);
    const houseBodyGeo = new THREE.BoxGeometry(5.6, 3.4, 5.2);
    const houseRoofGeo = new THREE.ConeGeometry(4.4, 2.2, 4);
    const houseWinGeo = new THREE.BoxGeometry(0.9, 0.8, 0.14);

    const maxIdx = Math.max(1, WORLD_CFG.blocksPerSide - 1);
    let placed = 0;

    for (let i = 0; i < this.blockCenters.length && placed < 260; i++) {
      if (this.pizzaBlockKeys && this.pizzaBlockKeys.has(i)) continue;
      const b = this.blockCenters[i];
      const nx = b.bx / maxIdx;
      const nz = b.bz / maxIdx;

      const isBeach = nz > 0.72 && nx > 0.15 && nx < 0.85;
      const isSuburbs = !isBeach && nx < 0.45 && nz < 0.65 && (b.bx + b.bz) % 2 === 0;
      if (!isBeach && !isSuburbs) continue;

      const yard = new THREE.Mesh(yardGeo, isBeach ? sandMat : grassMat);
      yard.position.set(b.x, WORLD_CFG.sidewalkHeight + 0.03, b.z);
      yard.receiveShadow = true;
      this.cityGroup.add(yard);
      placed++;

      if (isBeach) {
        for (let p = 0; p < 3 && placed < 260; p++) {
          const px = b.x + randRange(-12, 12);
          const pz = b.z + randRange(-12, 12);
          const trunk = new THREE.Mesh(palmTrunkGeo, trunkMat);
          trunk.position.set(px, WORLD_CFG.sidewalkHeight + 2.6, pz);
          trunk.castShadow = true;
          this.cityGroup.add(trunk);

          const fronds = new THREE.Mesh(frondGeo, frondMat);
          fronds.position.set(px, WORLD_CFG.sidewalkHeight + 5.3, pz);
          fronds.castShadow = true;
          this.cityGroup.add(fronds);
          placed += 2;
        }
      } else {
        for (const [hx, hz] of [
          [-9.5, -8.5],
          [9.5, 8.5]
        ]) {
          if (placed >= 256) break;
          const house = new THREE.Group();
          house.position.set(b.x + hx, WORLD_CFG.sidewalkHeight, b.z + hz);

          const body = new THREE.Mesh(houseBodyGeo, wallMat);
          body.position.y = 1.7;
          body.castShadow = true;
          body.receiveShadow = true;
          house.add(body);

          const roof = new THREE.Mesh(houseRoofGeo, roofMat);
          roof.position.y = 4.5;
          roof.rotation.y = Math.PI * 0.25;
          roof.castShadow = true;
          house.add(roof);

          const win = new THREE.Mesh(houseWinGeo, winMat);
          win.position.set(0, 1.9, 2.64);
          house.add(win);

          this.cityGroup.add(house);
          this.colliders.push({
            minX: b.x + hx - 2.9,
            maxX: b.x + hx + 2.9,
            minZ: b.z + hz - 2.7,
            maxZ: b.z + hz + 2.7
          });
          placed += 3;
        }

        const tree = new THREE.Mesh(leafGeo, leafMat);
        tree.position.set(b.x + 8.5, WORLD_CFG.sidewalkHeight + 4.2, b.z - 8.5);
        tree.castShadow = true;
        this.cityGroup.add(tree);

        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(b.x + 8.5, WORLD_CFG.sidewalkHeight + 1.6, b.z - 8.5);
        this.cityGroup.add(trunk);

        const bench = new THREE.Mesh(benchGeo, benchMat);
        bench.position.set(b.x - 8.5, WORLD_CFG.sidewalkHeight + 0.25, b.z + 9.5);
        this.cityGroup.add(bench);

        const flower = new THREE.Mesh(flowerGeo, flowerMat);
        flower.position.set(b.x - 6.5, WORLD_CFG.sidewalkHeight + 0.14, b.z + 9.5);
        this.cityGroup.add(flower);
        placed += 4;
      }
    }
  }

  _buildDesertAirport() {
    if (!this.cityGroup) return;

    const span = WORLD_CFG.gridSpan || 560;
    const half = WORLD_CFG.halfSpan || span * 0.5;
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.94 });
    const cactusMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.75 });
    const tarmacMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.3 });
    const planeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.4 });

    const desertPad = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), sandMat);
    desertPad.rotation.x = -Math.PI * 0.5;
    desertPad.position.set(-half + 48, 0.03, half - 48);
    desertPad.receiveShadow = true;
    this.cityGroup.add(desertPad);

    const cactusGeo = new THREE.CylinderGeometry(0.45, 0.55, 3.8, 7);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Mesh(cactusGeo, cactusMat);
      c.position.set(
        -half + 14 + (i % 4) * 20,
        1.9,
        half - 14 - Math.floor(i / 4) * 20
      );
      c.castShadow = true;
      this.cityGroup.add(c);
    }

    const ax = half - 54;
    const az = -half + 54;
    const runway = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 110), tarmacMat);
    runway.position.set(ax, 0.04, az);
    runway.receiveShadow = true;
    this.cityGroup.add(runway);

    for (let z = -42; z <= 42; z += 14) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 5.5), stripeMat);
      dash.rotation.x = -Math.PI * 0.5;
      dash.position.set(ax, 0.09, az + z);
      this.cityGroup.add(dash);
    }

    for (const hOff of [-30, 30]) {
      const hangar = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 18), hangarMat);
      hangar.position.set(ax + 20, 3.5, az + hOff);
      hangar.castShadow = true;
      this.cityGroup.add(hangar);

      this.colliders.push({
        minX: ax + 13,
        maxX: ax + 27,
        minZ: az + hOff - 9,
        maxZ: az + hOff + 9
      });
    }

    for (let p = 0; p < 2; p++) {
      const plane = new THREE.Group();
      const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 9.5, 10), planeMat);
      fuselage.rotation.x = Math.PI * 0.5;
      plane.add(fuselage);

      const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 2.2), planeMat);
      wing.position.set(0, 0.1, 0.5);
      plane.add(wing);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 1.4), planeMat);
      tail.position.set(0, 0.3, 4.1);
      plane.add(tail);

      plane.position.set(ax - 2 + p * 4, 1.15, az - 18 + p * 36);
      this.cityGroup.add(plane);
    }
  }

  _buildFuelStation() {
    if (!this.cityGroup) return;

    const streets = Array.isArray(this.streetCoords) && this.streetCoords.length > 0 ? this.streetCoords : [0];
    const len = streets.length;
    const at = (f) => streets[Math.min(len - 1, Math.max(0, Math.floor(len * f)))] || 0;
    const off = (WORLD_CFG.roadWidth || 14) * 0.5 + 8;

    const spots = [
      { x: at(0.22) + off, z: at(0.22) + 12 },
      { x: at(0.78) + off, z: at(0.22) + 12 },
      { x: at(0.22) + off, z: at(0.78) + 12 },
      { x: at(0.78) + off, z: at(0.78) + 12 }
    ];
    this.fuelStations = spots.map((s) => ({ x: s.x, z: s.z }));
    this.fuelStation = this.fuelStations[0];

    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.4 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.4 });
    const shopMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
    const signMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

    const radius = (typeof FUEL !== 'undefined' && FUEL.stationRadius) || 11;
    const ringGeo = new THREE.RingGeometry(radius - 0.7, radius, 32);
    ringGeo.rotateX(-Math.PI * 0.5);
    this.fuelMarkerMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee, transparent: true, opacity: 0.65, side: THREE.DoubleSide
    });

    for (const st of this.fuelStations) {
      const group = new THREE.Group();
      group.position.set(st.x, 0, st.z);

      const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 9), canopyMat);
      canopy.position.set(0, 4.4, 0);
      canopy.castShadow = true;
      group.add(canopy);

      for (const [px, pz] of [[-4.8, -3.4], [4.8, -3.4], [-4.8, 3.4], [4.8, 3.4]]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.5), pillarMat);
        pillar.position.set(px, 2.2, pz);
        group.add(pillar);
      }

      for (const pmx of [-2.4, 2.4]) {
        const pump = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 1.1), pumpMat);
        pump.position.set(pmx, 0.9, 0);
        pump.castShadow = true;
        group.add(pump);
        this.colliders.push({
          minX: st.x + pmx - 0.65, maxX: st.x + pmx + 0.65,
          minZ: st.z - 0.65, maxZ: st.z + 0.65
        });
      }

      const shop = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 6), shopMat);
      shop.position.set(0, 1.8, 13);
      shop.castShadow = true;
      group.add(shop);
      this.colliders.push({
        minX: st.x - 4.1, maxX: st.x + 4.1,
        minZ: st.z + 9.4, maxZ: st.z + 16.6
      });

      const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 0.3), signMat);
      sign.position.set(0, 4.9, 0);
      group.add(sign);

      const marker = new THREE.Mesh(ringGeo, this.fuelMarkerMat);
      marker.position.set(0, 0.06, 0);
      group.add(marker);

      this.cityGroup.add(group);
    }
  }

  _updateFuelStation(dt, playerPos = { x: 0, z: 0 }) {
    const list = (Array.isArray(this.fuelStations) && this.fuelStations.length)
      ? this.fuelStations
      : (this.fuelStation ? [this.fuelStation] : []);
    if (!list.length) return false;

    const radius = (typeof FUEL !== 'undefined' && FUEL.stationRadius) || 11;
    let nearest = null;
    let bestD = Infinity;
    for (const st of list) {
      const d = Math.hypot((playerPos.x || 0) - st.x, (playerPos.z || 0) - st.z);
      if (d < bestD) { bestD = d; nearest = st; }
    }
    const inside = bestD <= radius;

    if (this.fuelMarkerMat) {
      const pulse = 0.45 + 0.25 * Math.sin((this.time || 0) * (inside ? 9 : 3));
      this.fuelMarkerMat.color.setHex(inside ? 0x4ade80 : 0x22d3ee);
      this.fuelMarkerMat.opacity = pulse;
    }
    return inside;
  }

  

_buildRailway() {
    if (!this.scene) return;
    if (!this.railwayGroup) {
      this.railwayGroup = new THREE.Group();
      this.scene.add(this.railwayGroup);
    }
    this.railwayGroup.clear();

    const halfSpan = WORLD_CFG.halfSpan || 260;
    const trackLen = halfSpan * 2.1;
    this.railZ = halfSpan * 0.55;

    const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.85 });
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
    const platMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
    const benchMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65 });

    for (const rOff of [-0.75, 0.75]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(trackLen, 0.18, 0.14), railMat);
      rail.position.set(0, 0.16, this.railZ + rOff);
      this.railwayGroup.add(rail);
    }

    const sleeperGeo = new THREE.BoxGeometry(0.32, 0.1, 2.2);
    for (let x = -halfSpan; x <= halfSpan; x += 2.2) {
      const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
      sleeper.position.set(x, 0.06, this.railZ);
      this.railwayGroup.add(sleeper);
    }

    const platX = 0;
    const platZ = this.railZ + 4.2;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(28, 0.9, 5.2), platMat);
    platform.position.set(platX, 0.45, platZ);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.railwayGroup.add(platform);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 4.2), roofMat);
    canopy.position.set(platX, 4.4, platZ);
    canopy.castShadow = true;
    this.railwayGroup.add(canopy);

    for (const px of [-8, 0, 8]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.5, 0.35), roofMat);
      pillar.position.set(platX + px, 2.65, platZ);
      this.railwayGroup.add(pillar);
    }

    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 0.8), benchMat);
    bench.position.set(platX - 4, 1.18, platZ + 0.8);
    this.railwayGroup.add(bench);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 88);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CENTRAL STATION', 256, 50);

    const signTex = new THREE.CanvasTexture(canvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 2.2),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
    );
    sign.position.set(platX, 5.8, platZ);
    this.railwayGroup.add(sign);
  }

  _buildTrain() {
    if (!this.scene) return;
    if (!this.trainGroup) {
      this.trainGroup = new THREE.Group();
      this.scene.add(this.trainGroup);
    }
    this.trainGroup.clear();
    this.trainCars = [];

    const count = (typeof TRAIN !== 'undefined' && TRAIN.carCount) || 4;
    const carLen = (typeof TRAIN !== 'undefined' && TRAIN.carLength) || 9;
    const halfSpan = WORLD_CFG.halfSpan || 260;
    this.trainX = -halfSpan + 20;

    const locoMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.5 });
    const coachMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.4 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4, metalness: 0.5 });

    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12);
    wheelGeo.rotateZ(Math.PI * 0.5);

    for (let i = 0; i < count; i++) {
      const isEngine = i === 0;
      const carGrp = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 2.5, carLen),
        isEngine ? locoMat : coachMat
      );
      body.position.y = 1.45;
      body.castShadow = true;
      carGrp.add(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.25, carLen * 0.96), noseMat);
      roof.position.y = 2.8;
      carGrp.add(roof);

      const winGeo = new THREE.BoxGeometry(2.66, 0.65, 1.3);
      for (const wz of [-2.4, 0, 2.4]) {
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(0, 1.85, wz);
        carGrp.add(win);
      }

      if (isEngine) {
        const nose = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.4, 4), noseMat);
        nose.rotation.x = Math.PI * 0.5;
        nose.rotation.z = Math.PI * 0.25;
        nose.position.set(0, 1.35, carLen * 0.5 + 1.0);
        carGrp.add(nose);

        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        light.position.set(0, 1.75, carLen * 0.5 + 1.8);
        carGrp.add(light);
      }

      const wheels = [];
      for (const wx of [-1.2, 1.2]) {
        for (const wz of [-carLen * 0.32, carLen * 0.32]) {
          const wm = new THREE.Mesh(wheelGeo, wheelMat);
          wm.position.set(wx, 0.45, wz);
          carGrp.add(wm);
          wheels.push(wm);
        }
      }

      this.trainGroup.add(carGrp);
      this.trainCars.push({ group: carGrp, wheels, index: i });
    }
  }

  _updateTrain(dt) {
    if (!Array.isArray(this.trainCars) || this.trainCars.length === 0) return;
    const safeDt = Math.min(dt, 0.05);
    const speed = (typeof TRAIN !== 'undefined' && TRAIN.speed) || 18;
    const carLen = (typeof TRAIN !== 'undefined' && TRAIN.carLength) || 9;
    const halfSpan = WORLD_CFG.halfSpan || 260;
    const railZ = typeof this.railZ === 'number' ? this.railZ : halfSpan * 0.55;

    this.trainX = (typeof this.trainX === 'number' ? this.trainX : -halfSpan) + speed * safeDt;
    if (this.trainX > halfSpan + carLen * 2) {
      this.trainX = -halfSpan - carLen * 2;
    }

    const wheelDelta = (speed * safeDt) / 0.45;
    for (let i = 0; i < this.trainCars.length; i++) {
      const tc = this.trainCars[i];
      tc.group.position.set(this.trainX - i * (carLen + 0.6), 0.2, railZ);
      for (let w = 0; w < tc.wheels.length; w++) {
        tc.wheels[w].rotation.x -= wheelDelta;
      }
    }
  }

  _buildVehicleShop() {
    if (!this.scene) return;
    if (!this.shopGroup) {
      this.shopGroup = new THREE.Group();
      this.scene.add(this.shopGroup);
    }
    this.shopGroup.clear();

    const streets = Array.isArray(this.streetCoords) && this.streetCoords.length > 0 ? this.streetCoords : [0];
    const idx = Math.min(streets.length - 1, Math.max(0, Math.floor(streets.length * 0.35)));
    const sx = (streets[idx] || 0) + (WORLD_CFG.roadWidth || 14) * 0.5 + 11;
    const sz = (streets[idx] || 0) + (WORLD_CFG.roadWidth || 14) * 0.5 + 12;
    this.shopPosition = { x: sx, z: sz };

    const grp = new THREE.Group();
    grp.position.set(sx, 0, sz);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.3 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.32,
      roughness: 0.1,
      metalness: 0.8
    });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.6 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 14), floorMat);
    floor.position.y = 0.1;
    floor.receiveShadow = true;
    grp.add(floor);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, 4.5, 0.5), wallMat);
    backWall.position.set(0, 2.25, -6.75);
    backWall.castShadow = true;
    grp.add(backWall);

    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(19, 3.8, 0.2), glassMat);
    frontGlass.position.set(0, 1.9, 6.75);
    grp.add(frontGlass);

    this.colliders.push({
      minX: sx - 10.2,
      maxX: sx + 10.2,
      minZ: sz - 7.1,
      maxZ: sz - 6.4
    });

    const displayTypes = ['sports', 'muscle', 'bike'];
    displayTypes.forEach((tKey, i) => {
      const px = -5.5 + i * 5.5;
      const pz = 0.5;
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.25, 16), padMat);
      pedestal.position.set(px, 0.32, pz);
      grp.add(pedestal);

      if (typeof this._createVehicleMesh === 'function') {
        const built = this._createVehicleMesh(tKey, 0xfacc15);
        const disp = built && built.group ? built.group : built;
        if (disp && disp.position) {
          disp.position.set(px, 0.45, pz);
          disp.rotation.y = 0.55;
          grp.add(disp);
        }
      }
    });

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#090d1a';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 88);
    ctx.fillStyle = '#00f5d4';
    ctx.font = '900 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CITY MOTORS', 256, 50);

    const signTex = new THREE.CanvasTexture(canvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 2.1),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
    );
    sign.position.set(0, 5.4, 6.85);
    grp.add(sign);

    this.scene.add(grp);
  }

  _updateTaxiMarker(dt) {
    if (!this.scene) return;
    const safeDt = Math.min(dt, 0.05);

    if (!this.taxiTarget) {
      if (this.taxiMarker) {
        this.taxiMarker.visible = false;
      }
      return;
    }

    if (!this.taxiMarker) {
      const geo = new THREE.CylinderGeometry(3.2, 3.2, 2.6, 20, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.taxiMarker = new THREE.Mesh(geo, mat);
      this.scene.add(this.taxiMarker);
    }

    this.taxiMarker.visible = true;
    this.taxiMarker.position.set(this.taxiTarget.x || 0, 1.35, this.taxiTarget.z || 0);
    this.taxiMarker.rotation.y += safeDt * 2.2;
    if (this.taxiMarker.material) {
      this.taxiMarker.material.opacity = 0.35 + 0.2 * Math.sin((this.time || 0) * 6);
    }
  }
// Note: Call this._buildRailway(), this._buildTrain(), and this._buildVehicleShop() at the end of buildCity(); call this._updateTrain(dt) and this._updateTaxiMarker(dt) inside update().

  _addStreetDetails() {
    if (!this.cityGroup || !Array.isArray(this.streetCoords) || this.streetCoords.length === 0) return;

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.7 });
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfbbf24,
      emissiveIntensity: 1.1,
      roughness: 0.2
    });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.78 });
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const shelterMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.8
    });
    const binMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.65 });
    const cwMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.6, 8);
    const bulbGeo = new THREE.SphereGeometry(0.24, 8, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6);
    const crownGeo = new THREE.ConeGeometry(1.35, 2.8, 6);
    const benchGeo = new THREE.BoxGeometry(1.7, 0.42, 0.6);
    const roofGeo = new THREE.BoxGeometry(3.4, 0.2, 1.8);
    const postGeo = new THREE.BoxGeometry(0.14, 2.6, 0.14);
    const paneGeo = new THREE.BoxGeometry(3.0, 1.8, 0.08);
    const binGeo = new THREE.BoxGeometry(0.62, 0.9, 0.62);
    const cwGeo = new THREE.PlaneGeometry(0.55, 2.4);
    cwGeo.rotateX(-Math.PI * 0.5);

    const roadW = WORLD_CFG.roadWidth || 14;
    const edgeOffset = roadW * 0.5 + 1.1;
    let count = 0;

    for (let i = 0; i < this.streetCoords.length && count < 180; i++) {
      const s = this.streetCoords[i];

      for (let j = 0; j < this.streetCoords.length && count < 180; j += 2) {
        const ix = this.streetCoords[j];
        const iz = s;

        for (const [dx, dz] of [
          [-1, -1],
          [1, 1]
        ]) {
          const cw = new THREE.Mesh(cwGeo, cwMat);
          cw.position.set(ix + dx * 1.4, 0.035, iz + dz * (roadW * 0.5 + 1.4));
          this.cityGroup.add(cw);
          count++;
        }

        const lx = ix + edgeOffset;
        const lz = iz + 12;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx, 2.8, lz);
        pole.castShadow = true;
        this.cityGroup.add(pole);

        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(lx - 0.35, 5.6, lz);
        this.cityGroup.add(bulb);
        count += 2;
      }

      if (i % 2 === 0) {
        const tx = s + edgeOffset;
        const tz = 0;
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(tx, 1.2, tz);
        trunk.castShadow = true;
        this.cityGroup.add(trunk);

        const crown = new THREE.Mesh(crownGeo, foliageMat);
        crown.position.set(tx, 3.4, tz);
        crown.castShadow = true;
        this.cityGroup.add(crown);

        const bench = new THREE.Mesh(benchGeo, benchMat);
        bench.position.set(tx + 0.3, 0.21, tz + 5.5);
        this.cityGroup.add(bench);

        const bin = new THREE.Mesh(binGeo, binMat);
        bin.position.set(tx + 0.35, 0.45, tz + 7.2);
        this.cityGroup.add(bin);
        count += 4;
      }

      if (i === Math.floor(this.streetCoords.length * 0.5)) {
        const bx = s + edgeOffset + 0.4;
        const bz = -16;
        const shelter = new THREE.Group();
        shelter.position.set(bx, 0, bz);

        const bRoof = new THREE.Mesh(roofGeo, shelterMat);
        bRoof.position.y = 2.65;
        bRoof.castShadow = true;
        shelter.add(bRoof);

        for (const px of [-1.4, 1.4]) {
          const p = new THREE.Mesh(postGeo, shelterMat);
          p.position.set(px, 1.3, 0);
          shelter.add(p);
        }

        const pane = new THREE.Mesh(paneGeo, glassMat);
        pane.position.set(0, 1.25, -0.75);
        shelter.add(pane);

        this.cityGroup.add(shelter);
        count += 4;
      }
    }
  }

_buildNaturalHomes() {
    if (!this.cityGroup || !Array.isArray(this.blockCenters)) return;

    const pastelColors = [0xfde68a, 0xfbcfe8, 0xbfdbfe, 0xdbf4ff, 0xfef3c7, 0xd8b4fe];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.72 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.48 });
    const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85 });
    const yardMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9 });
    const driveMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
    const flowerMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const winGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.25
    });

    const yardGeo = new THREE.PlaneGeometry(12.5, 12.5);
    yardGeo.rotateX(-Math.PI * 0.5);
    const driveGeo = new THREE.PlaneGeometry(3.2, 6.2);
    driveGeo.rotateX(-Math.PI * 0.5);
    const wallGeo = new THREE.BoxGeometry(5.8, 3.5, 5.2);
    const gableSlopeGeo = new THREE.BoxGeometry(4.2, 0.24, 5.5);
    const chimneyGeo = new THREE.BoxGeometry(0.65, 1.9, 0.65);
    const porchGeo = new THREE.BoxGeometry(5.8, 0.3, 1.6);
    const colGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 6);
    const flowerGeo = new THREE.BoxGeometry(1.2, 0.26, 0.26);
    const winGeo = new THREE.BoxGeometry(0.95, 0.85, 0.14);
    const fenceRailGeo = new THREE.BoxGeometry(12.2, 0.14, 0.12);

    const maxIdx = Math.max(1, WORLD_CFG.blocksPerSide - 1);
    let built = 0;

    for (let i = 0; i < this.blockCenters.length && built < 130; i++) {
      if (this.pizzaBlockKeys && this.pizzaBlockKeys.has(i)) continue;
      const b = this.blockCenters[i];
      const nx = b.bx / maxIdx;
      const nz = b.bz / maxIdx;
      if (nx > 0.58 || nz > 0.72) continue;

      const facadeMat = new THREE.MeshStandardMaterial({
        color: pastelColors[i % pastelColors.length],
        roughness: 0.62
      });

      const plots = [
        [-10.2, -9.5],
        [10.2, -9.5],
        [-10.2, 9.5],
        [10.2, 9.5]
      ];

      for (const [hx, hz] of plots) {
        if (built >= 130) break;
        const home = new THREE.Group();
        home.position.set(b.x + hx, WORLD_CFG.sidewalkHeight, b.z + hz);

        const yard = new THREE.Mesh(yardGeo, yardMat);
        yard.position.y = 0.03;
        yard.receiveShadow = true;
        home.add(yard);

        const drive = new THREE.Mesh(driveGeo, driveMat);
        drive.position.set(1.6, 0.04, 3.2);
        drive.receiveShadow = true;
        home.add(drive);

        const wall = new THREE.Mesh(wallGeo, facadeMat);
        wall.position.y = 1.78;
        wall.castShadow = true;
        wall.receiveShadow = true;
        home.add(wall);

        const slopeL = new THREE.Mesh(gableSlopeGeo, roofMat);
        slopeL.position.set(-1.35, 4.35, 0);
        slopeL.rotation.z = 0.52;
        slopeL.castShadow = true;
        home.add(slopeL);

        const slopeR = new THREE.Mesh(gableSlopeGeo, roofMat);
        slopeR.position.set(1.35, 4.35, 0);
        slopeR.rotation.z = -0.52;
        slopeR.castShadow = true;
        home.add(slopeR);

        const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
        chimney.position.set(1.6, 4.85, -1.2);
        home.add(chimney);

        const porch = new THREE.Mesh(porchGeo, trimMat);
        porch.position.set(0, 0.18, 3.1);
        home.add(porch);

        for (const cx of [-2.2, 2.2]) {
          const col = new THREE.Mesh(colGeo, trimMat);
          col.position.set(cx, 1.42, 3.65);
          home.add(col);
        }

        for (const wx of [-1.5, 1.5]) {
          const win = new THREE.Mesh(winGeo, winGlowMat);
          win.position.set(wx, 2.0, 2.64);
          home.add(win);
        }

        const flowers = new THREE.Mesh(flowerGeo, flowerMat);
        flowers.position.set(-1.5, 1.42, 2.68);
        home.add(flowers);

        const fence = new THREE.Mesh(fenceRailGeo, trimMat);
        fence.position.set(0, 0.75, 6.0);
        home.add(fence);

        this.cityGroup.add(home);
        built++;
      }
    }
  }

_decorateBuildings() {
    if (!this.cityGroup || !Array.isArray(this.blockCenters)) return;

    const acMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.45, metalness: 0.5 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.7 });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.8 });
    const antMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 });
    const neonMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.15,
      roughness: 0.2
    });
    const warmWinMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.85,
      roughness: 0.25
    });

    const acGeo = new THREE.BoxGeometry(1.15, 0.85, 0.75);
    const balconyGeo = new THREE.BoxGeometry(3.6, 0.22, 1.2);
    const railGeo = new THREE.BoxGeometry(3.6, 0.75, 0.12);
    const tankGeo = new THREE.CylinderGeometry(1.3, 1.3, 2.2, 10);
    const antGeo = new THREE.CylinderGeometry(0.05, 0.09, 5.2, 6);
    const neonGeo = new THREE.BoxGeometry(4.6, 0.65, 0.25);
    const stripGeo = new THREE.BoxGeometry(5.2, 0.45, 0.16);

    const maxIdx = Math.max(1, WORLD_CFG.blocksPerSide - 1);
    let added = 0;

    for (let i = 0; i < this.blockCenters.length && added < 140; i++) {
      if (this.pizzaBlockKeys && this.pizzaBlockKeys.has(i)) continue;
      const b = this.blockCenters[i];
      const nx = b.bx / maxIdx;
      const nz = b.bz / maxIdx;
      if (nx < 0.2 || nx > 0.85 || nz < 0.2 || nz > 0.85) continue;

      const frontZ = b.z + WORLD_CFG.blockSize * 0.25;

      const balcony = new THREE.Mesh(balconyGeo, railMat);
      balcony.position.set(b.x - 2.5, 6.2, frontZ);
      this.cityGroup.add(balcony);

      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(b.x - 2.5, 6.65, frontZ + 0.52);
      this.cityGroup.add(rail);

      const ac = new THREE.Mesh(acGeo, acMat);
      ac.position.set(b.x + 2.8, 7.1, frontZ);
      this.cityGroup.add(ac);

      const winStrip = new THREE.Mesh(stripGeo, warmWinMat);
      winStrip.position.set(b.x, 9.4, frontZ + 0.06);
      this.cityGroup.add(winStrip);

      added += 4;

      if (i % 2 === 0 && added < 138) {
        const sign = new THREE.Mesh(neonGeo, neonMat);
        sign.position.set(b.x, 3.8, frontZ + 0.35);
        this.cityGroup.add(sign);

        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(b.x + 3.2, 19.5, b.z - 2.0);
        this.cityGroup.add(tank);
        added += 2;
      }

      if (i % 3 === 0 && added < 139) {
        const ant = new THREE.Mesh(antGeo, antMat);
        ant.position.set(b.x - 3.5, 21.0, b.z);
        this.cityGroup.add(ant);
        added += 1;
      }
    }
  }

  getColliders() {
    return this.colliders;
  }
}

export default World;