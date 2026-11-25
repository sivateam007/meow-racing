import * as THREE from 'three';
import anime from 'animejs';
import { COLORS, clamp, lerp, randRange } from './config.js';

export class Effects {
  constructor(scene, camera = null, sunLight = null) {
    this.scene = scene;
    this.camera = camera;
    this.sunLight = sunLight;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.shakeState = {
      x: 0,
      y: 0,
      intensity: 0
    };
    this._shakeAnim = null;

    this.exhaustTimer = 0;
    this.particles = [];
    this._initParticlePool(80);
  }

  _initParticlePool(count) {
    const geo = new THREE.DodecahedronGeometry(0.24, 0);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.smoke,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.particles.push({
        mesh,
        mat,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 0.5,
        startScale: 0.4,
        endScale: 1.6,
        startOpacity: 0.7
      });
    }
  }

  _spawnParticle(pos, opts = {}) {
    if (!pos) return;
    let p = null;
    for (let i = 0; i < this.particles.length; i++) {
      if (!this.particles[i].active) {
        p = this.particles[i];
        break;
      }
    }
    if (!p) {
      p = this.particles[0];
    }

    p.active = true;
    p.age = 0;
    p.maxAge = opts.maxAge ?? randRange(0.28, 0.55);
    p.startScale = opts.startScale ?? randRange(0.35, 0.7);
    p.endScale = opts.endScale ?? randRange(1.2, 2.2);
    p.startOpacity = opts.startOpacity ?? 0.75;

    p.mat.color.setHex(opts.color ?? COLORS.smoke);
    p.mat.opacity = p.startOpacity;

    p.mesh.position.set(
      (pos.x || 0) + randRange(-0.22, 0.22),
      (pos.y || 0.25) + randRange(-0.08, 0.16),
      (pos.z || 0) + randRange(-0.22, 0.22)
    );
    p.mesh.scale.setScalar(p.startScale);
    p.mesh.visible = true;

    p.vx = opts.vx ?? randRange(-0.8, 0.8);
    p.vy = opts.vy ?? randRange(0.6, 1.8);
    p.vz = opts.vz ?? randRange(-0.8, 0.8);
  }

  shake(intensity = 0.45, duration = 260) {
    const clampedIntensity = clamp(intensity, 0.05, 2.5);
    this.shakeState.intensity = Math.max(this.shakeState.intensity, clampedIntensity);

    if (this._shakeAnim && typeof this._shakeAnim.pause === 'function') {
      this._shakeAnim.pause();
    }

    this._shakeAnim = anime({
      targets: this.shakeState,
      x: [
        { value: randRange(-1, 1) * clampedIntensity, duration: duration * 0.25 },
        { value: randRange(-1, 1) * clampedIntensity * 0.65, duration: duration * 0.25 },
        { value: randRange(-1, 1) * clampedIntensity * 0.3, duration: duration * 0.25 },
        { value: 0, duration: duration * 0.25 }
      ],
      y: [
        { value: randRange(-0.8, 0.8) * clampedIntensity, duration: duration * 0.25 },
        { value: randRange(-0.8, 0.8) * clampedIntensity * 0.65, duration: duration * 0.25 },
        { value: randRange(-0.8, 0.8) * clampedIntensity * 0.3, duration: duration * 0.25 },
        { value: 0, duration: duration * 0.25 }
      ],
      easing: 'easeOutQuad',
      complete: () => {
        this.shakeState.x = 0;
        this.shakeState.y = 0;
        this.shakeState.intensity = 0;
      }
    });
  }

  exhaust(pos) {
    if (!pos) return;
    this._spawnParticle(pos, {
      color: COLORS.smoke,
      maxAge: randRange(0.28, 0.46),
      startScale: 0.35,
      endScale: 1.45,
      startOpacity: 0.55,
      vx: randRange(-0.6, 0.6),
      vy: randRange(0.5, 1.3),
      vz: randRange(-0.4, 0.6)
    });
  }

  impact(pos) {
    if (!pos) return;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + randRange(-0.2, 0.2);
      const speed = randRange(2.2, 6.5);
      this._spawnParticle(pos, {
        color: i % 2 === 0 ? COLORS.spark : COLORS.smoke,
        maxAge: randRange(0.25, 0.5),
        startScale: 0.45,
        endScale: 1.8,
        startOpacity: 0.9,
        vx: Math.cos(angle) * speed,
        vy: randRange(1.5, 4.5),
        vz: Math.sin(angle) * speed
      });
    }
  }

  tweenCounter(el, from, to, ms = 350) {
    if (!el) return;
    const startVal = Number.isFinite(from) ? from : 0;
    const endVal = Number.isFinite(to) ? to : startVal;
    const holder = { val: startVal };
    el.textContent = String(Math.round(startVal));

    anime({
      targets: holder,
      val: endVal,
      duration: Math.max(60, ms),
      round: 1,
      easing: 'easeOutCubic',
      update: () => {
        el.textContent = String(Math.round(holder.val));
      }
    });
  }

setDayNight(t = 0) {
    const phase = ((t % 1) + 1) % 1;
    const daylight = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);

    const skyCol = new THREE.Color(COLORS.skyNightTop).lerp(new THREE.Color(COLORS.skyDayTop), daylight);
    const fogCol = new THREE.Color(COLORS.fogNight).lerp(new THREE.Color(COLORS.fogDay), daylight);
    const sunCol = new THREE.Color(COLORS.sunNight).lerp(new THREE.Color(COLORS.sunDay), daylight);

    if (this.scene) {
      this.scene.background = skyCol;
      if (this.scene.fog) {
        this.scene.fog.color.copy(fogCol);
        if (typeof this.scene.fog.density === 'number') {
          this.scene.fog.density = lerp(0.0044, 0.0032, daylight);
        }
      }
      this.scene.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i];
          if (m && 'emissiveIntensity' in m && m.emissive && m.emissive.getHex() !== 0x000000) {
            m.emissiveIntensity = lerp(1.75, 0.22, daylight);
          }
        }
      });
    }

    if (this.sunLight) {
      this.sunLight.color.copy(sunCol);
      this.sunLight.intensity = lerp(0.55, 1.75, daylight);
    }

    if (this.scene && Array.isArray(this.scene.children)) {
      for (let i = 0; i < this.scene.children.length; i++) {
        const child = this.scene.children[i];
        if (child && child.isHemisphereLight) {
          child.intensity = lerp(0.55, 1.35, daylight);
        }
      }
    }
  }

  update(dt, car = null, speedFactor = 0) {
    const safeDt = Math.min(dt, 0.05);
    const sf = clamp(speedFactor || 0, 0, 1);

    if (car && typeof car.getPosition === 'function') {
      const pos = car.getPosition();
      const heading = typeof car.getHeading === 'function' ? car.getHeading() : 0;
      const interval = lerp(0.14, 0.035, sf);
      this.exhaustTimer += safeDt;

      if (this.exhaustTimer >= interval) {
        this.exhaustTimer = 0;
        const backX = pos.x + Math.sin(heading) * 2.15;
        const backZ = pos.z + Math.cos(heading) * 2.15;
        this.exhaust({ x: backX, y: 0.35, z: backZ });
      }
    }

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.age += safeDt;
      if (p.age >= p.maxAge) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      const ratio = p.age / p.maxAge;
      p.mesh.position.x += p.vx * safeDt;
      p.mesh.position.y += p.vy * safeDt;
      p.mesh.position.z += p.vz * safeDt;
      p.vy *= 1 - 1.8 * safeDt;

      const scale = lerp(p.startScale, p.endScale, ratio);
      p.mesh.scale.setScalar(scale);
      p.mat.opacity = p.startOpacity * (1 - ratio);
    }

    if (this.camera && (Math.abs(this.shakeState.x) > 0.0005 || Math.abs(this.shakeState.y) > 0.0005)) {
      this.camera.position.x += this.shakeState.x;
      this.camera.position.y += this.shakeState.y;
    }
  }
}

export default Effects;