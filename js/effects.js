// js/effects.js
// Meow Racing — anime.js-driven visual effects.
// Manages: speed ribbons, collision particle bursts, boost sparkles, camera
// shake, score popups, HUD counter tweens, checkpoint gate pulses, menu idle
// bounce, level-complete flashes. All tweens use anime.js so timing is uniform.

import * as THREE from 'three';
import anime from 'animejs';
import {
  EFFECTS,
  BOOST,
  UI,
  clamp,
  randRange
} from './config.js';

const TWO_PI = Math.PI * 2;

export class Effects {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.shake = {
      remaining: 0,
      duration: 0,
      amp: 0,
      offset: new THREE.Vector3()
    };

    this.popupLayer = document.getElementById('popup-layer');
    if (!this.popupLayer) {
      this.popupLayer = document.createElement('div');
      this.popupLayer.id = 'popup-layer';
      this.popupLayer.className = 'popup-layer';
      document.body.appendChild(this.popupLayer);
    }

    this._counterTweens = new WeakMap();
    this._tmpV = new THREE.Vector3();

    this._menuBounceTween = null;
    this._boostPulseTween = null;
    this._boostPulseCar = null;

    this.boostSparkles = [];

    this._initRibbons();
    this._initParticles();
    this._initBoostSparkles();
  }

  // ===========================================================================
  // RIBBONS
  // ===========================================================================
  _initRibbons() {
    this.ribbonGroup = new THREE.Group();
    this.ribbonGroup.name = 'SpeedRibbons';
    this.scene.add(this.ribbonGroup);

    this.ribbons = [];
    const geom = new THREE.BoxGeometry(0.06, 1.8, 0.06);
    this._ribbonGeom = geom;

    for (let i = 0; i < EFFECTS.speedRibbonCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xeaf8ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(0, -1000, 0);
      mesh.userData = { life: 0, maxLife: 0.4 };
      this.ribbonGroup.add(mesh);
      this.ribbons.push(mesh);
    }
  }

  updateRibbons(dt, car, speedFactor, boostActive) {
    if (!car || !car.group) return;
    const sf = clamp(speedFactor || 0, 0, 1);
    const boostMul = boostActive ? BOOST.ribbonBoost : 1;
    const pos = car.group.position;

    const spawnChance = Math.max(0, (sf - 0.25)) * 0.9 * boostMul;

    for (let i = 0; i < this.ribbons.length; i++) {
      const r = this.ribbons[i];
      const u = r.userData;
      u.life -= dt;

      if (u.life <= 0) {
        if (sf > 0.2 && Math.random() < spawnChance) {
          const offX = randRange(-2.8, 2.8);
          const offY = randRange(0.2, 1.4);
          const offZ = randRange(1.6, 5.5);
          r.position.set(pos.x + offX, offY, pos.z + offZ);
          u.maxLife = randRange(0.28, 0.55);
          u.life = u.maxLife;
          const sb = randRange(0.7, 1.35);
          r.scale.set(sb, sb * randRange(0.8, 1.6), sb);
          r.material.color.setHex(boostActive ? 0xffd76a : 0xeaf8ff);
        } else {
          r.material.opacity = Math.max(0, r.material.opacity - dt * 5);
          if (r.material.opacity <= 0.001) r.position.set(0, -1000, 0);
          continue;
        }
      }

      const t = clamp(u.life / u.maxLife, 0, 1);
      r.material.opacity = t * sf * (boostActive ? 1.0 : 0.85);
    }
  }

  // ===========================================================================
  // PARTICLES (collision burst)
  // ===========================================================================
  _initParticles() {
    this.particleGroup = new THREE.Group();
    this.particleGroup.name = 'CollisionParticles';
    this.particleGroup.visible = false;
    this.scene.add(this.particleGroup);

    this.particles = [];
    const geom = new THREE.OctahedronGeometry(1, 0);
    this._particleGeom = geom;

    for (let i = 0; i < EFFECTS.particleBurstCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      mesh.userData = {
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 0,
        size: EFFECTS.particleBurstSize
      };
      this.particleGroup.add(mesh);
      this.particles.push(mesh);
    }
  }

  spawnCollisionBurst(worldPos, colorHex = 0xffcc33) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const u = p.userData;
      p.position.copy(worldPos);
      p.position.x += randRange(-0.4, 0.4);
      p.position.y += randRange(0.0, 0.8);
      p.position.z += randRange(-0.4, 0.4);

      const theta = Math.random() * TWO_PI;
      const phi = Math.acos(randRange(-0.1, 1.0));
      const speed = EFFECTS.particleBurstSpeed * randRange(0.5, 1.15);
      u.vx = Math.sin(phi) * Math.cos(theta) * speed;
      u.vy = Math.abs(Math.cos(phi)) * speed * 0.9 + 2.2;
      u.vz = Math.sin(phi) * Math.sin(theta) * speed;
      u.maxLife = EFFECTS.particleBurstLife * randRange(0.65, 1.0);
      u.life = u.maxLife;
      u.size = EFFECTS.particleBurstSize * randRange(0.7, 1.5);

      p.scale.setScalar(u.size);
      p.material.color.setHex(colorHex);
      p.material.opacity = 1;
      p.visible = true;
      p.rotation.set(Math.random() * TWO_PI, Math.random() * TWO_PI, Math.random() * TWO_PI);
    }
    this.particleGroup.visible = true;
  }

  updateParticles(dt) {
    let any = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const u = p.userData;
      if (u.life <= 0) continue;
      any = true;

      u.life -= dt;
      if (u.life <= 0) {
        p.visible = false;
        p.material.opacity = 0;
        continue;
      }

      u.vy -= 9.8 * 0.55 * dt;
      p.position.x += u.vx * dt;
      p.position.y += u.vy * dt;
      p.position.z += u.vz * dt;

      if (p.position.y < 0.16) {
        p.position.y = 0.16;
        u.vy *= -0.42;
        u.vx *= 0.7;
        u.vz *= 0.7;
      }

      const t = u.life / u.maxLife;
      p.material.opacity = t;
      p.scale.setScalar(u.size * (0.5 + t * 0.6));
      p.rotation.x += dt * 6.0;
      p.rotation.y += dt * 8.0;
    }
    if (!any) this.particleGroup.visible = false;
  }

  // ===========================================================================
  // BOOST SPARKLES
  // ===========================================================================
  _initBoostSparkles() {
    this.boostSparkleGroup = new THREE.Group();
    this.boostSparkleGroup.name = 'BoostSparkles';
    this.scene.add(this.boostSparkleGroup);

    const geom = new THREE.TetrahedronGeometry(0.16, 0);
    this._sparkleGeom = geom;

    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffd76a : 0x7ae8ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const m = new THREE.Mesh(geom, mat);
      m.visible = false;
      m.userData = { life: 0, maxLife: 0.5, vx: 0, vy: 0, vz: 0, spin: randRange(-8, 8) };
      this.boostSparkleGroup.add(m);
      this.boostSparkles.push(m);
    }
  }

  spawnBoostSparkles(worldPos) {
    for (let i = 0; i < this.boostSparkles.length; i++) {
      const s = this.boostSparkles[i];
      if (s.userData.life > 0) continue;
      s.position.copy(worldPos);
      s.position.x += randRange(-0.6, 0.6);
      s.position.y += randRange(0.1, 0.9);
      s.position.z += randRange(-0.3, 0.5);
      s.userData.vx = randRange(-3.5, 3.5);
      s.userData.vy = randRange(2.0, 5.5);
      s.userData.vz = randRange(2.0, 6.0);
      s.userData.maxLife = randRange(0.35, 0.7);
      s.userData.life = s.userData.maxLife;
      s.scale.setScalar(randRange(0.6, 1.3));
      s.material.opacity = 1;
      s.visible = true;
      s.rotation.set(Math.random() * TWO_PI, Math.random() * TWO_PI, Math.random() * TWO_PI);
    }
  }

  updateBoostSparkles(dt) {
    let any = false;
    for (let i = 0; i < this.boostSparkles.length; i++) {
      const s = this.boostSparkles[i];
      const u = s.userData;
      if (u.life <= 0) continue;
      any = true;
      u.life -= dt;
      if (u.life <= 0) {
        s.visible = false;
        s.material.opacity = 0;
        continue;
      }
      u.vy -= 5.5 * dt;
      s.position.x += u.vx * dt;
      s.position.y += u.vy * dt;
      s.position.z += u.vz * dt;
      s.rotation.y += u.spin * dt;
      const t = u.life / u.maxLife;
      s.material.opacity = t;
    }
    if (!any) this.boostSparkleGroup.visible = false;
    else this.boostSparkleGroup.visible = true;
  }

  // ===========================================================================
  // CAMERA SHAKE
  // ===========================================================================
  triggerShake(amp, dur) {
    this.shake.amp = Math.max(this.shake.amp, amp);
    this.shake.remaining = Math.max(this.shake.remaining, dur);
    this.shake.duration = Math.max(this.shake.duration, dur);
  }

  updateShake(dt) {
    if (this.shake.remaining <= 0) {
      this.shake.offset.set(0, 0, 0);
      return;
    }
    this.shake.remaining -= dt;
    if (this.shake.remaining <= 0) {
      this.shake.remaining = 0;
      this.shake.offset.set(0, 0, 0);
      return;
    }
    const t = this.shake.remaining / this.shake.duration;
    const amp = this.shake.amp * t;
    this.shake.offset.set(
      randRange(-amp, amp),
      randRange(-amp, amp),
      randRange(-amp, amp) * 0.4
    );
  }

  getShakeOffset() {
    return this.shake.offset;
  }

  // ===========================================================================
  // POPUPS
  // ===========================================================================
  _worldToScreen(worldPos) {
    const v = this._tmpV.copy(worldPos).project(this.camera);
    const el = this.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z > -1 && v.z < 1
    };
  }

  popupWorld(worldPos, text, className = '') {
    const s = this._worldToScreen(worldPos);
    if (!s.visible) return;
    this.popupScreen(s.x, s.y, text, className);
  }

  popupScreen(x, y, text, className = '') {
    const el = document.createElement('div');
    el.className = 'score-popup' + (className ? ' ' + className : '');
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popupLayer.appendChild(el);

    anime({
      targets: el,
      translateY: [-8, -78],
      translateX: [0, randRange(-12, 12)],
      opacity: [1, 1, 0],
      scale: [0.85, 1.18, 1.0],
      duration: UI.scorePopupLifetime,
      easing: 'easeOutCubic',
      complete: () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });
  }

  coinPop(worldPos) {
    this.popupWorld(worldPos, '+25', 'popup-coin');
  }
  crownPop(worldPos) {
    this.popupWorld(worldPos, '+150', 'popup-crown');
  }
  passPop(worldPos) {
    this.popupWorld(worldPos, '+50', 'popup-pass');
  }
  checkpointPop(worldPos) {
    this.popupWorld(worldPos, 'CHECKPOINT!', 'popup-checkpoint');
  }
  boostPop(worldPos) {
    this.popupWorld(worldPos, 'BOOST!', 'popup-turbo');
  }
  levelCompleteFlash(text = 'LEVEL COMPLETE!') {
    const el = document.createElement('div');
    el.className = 'score-popup popup-level';
    el.textContent = text;
    el.style.left = '50%';
    el.style.top = '40%';
    this.popupLayer.appendChild(el);
    anime({
      targets: el,
      scale: [0.3, 1.4, 1.0],
      opacity: [0, 1, 1, 0],
      translateY: [0, -30, -70],
      duration: 1400,
      easing: 'easeOutCubic',
      complete: () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });
  }

  // ===========================================================================
  // HUD COUNTER TWEEN
  // ===========================================================================
  tweenCounter(element, from, to, durationMs = UI.counterTweenDur) {
    if (!element) return;
    const prev = this._counterTweens.get(element);
    if (prev) prev.pause();

    const state = { v: from };
    const tween = anime({
      targets: state,
      v: to,
      duration: durationMs,
      easing: 'easeOutCubic',
      update: () => {
        element.textContent = Math.round(state.v).toLocaleString();
      }
    });
    this._counterTweens.set(element, tween);
  }

  // ===========================================================================
  // CHECKPOINT PULSE
  // ===========================================================================
  pulseCheckpoint(cpGroup) {
    if (!cpGroup) return;
    const s = cpGroup.scale;
    anime.remove(s);
    anime({
      targets: s,
      x: [1.0, 1.0 + EFFECTS.checkpointPulseAmp, 1.0],
      y: [1.0, 1.0 + EFFECTS.checkpointPulseAmp, 1.0],
      z: [1.0, 1.0 + EFFECTS.checkpointPulseAmp, 1.0],
      duration: 700,
      easing: 'easeOutQuad'
    });
  }

  // ===========================================================================
  // MENU BOUNCE
  // ===========================================================================
  startMenuBounce(carGroup) {
    this.stopMenuBounce();
    if (!carGroup) return;
    const startY = carGroup.position.y;
    this._menuBounceTween = anime({
      targets: carGroup.position,
      y: [
        { value: startY, duration: 0 },
        { value: startY + EFFECTS.menuBounceAmp, duration: 700 },
        { value: startY, duration: 700 }
      ],
      loop: true,
      easing: 'easeInOutSine'
    });
  }

  stopMenuBounce() {
    if (this._menuBounceTween) {
      this._menuBounceTween.pause();
      this._menuBounceTween = null;
    }
  }

  // ===========================================================================
  // BOOST PULSE
  // ===========================================================================
  startBoostPulse(car) {
    if (this._boostPulseCar === car && this._boostPulseTween) return;
    this.stopBoostPulse();
    if (!car || !car.glowPlane) {
      // No glow plane on new car — still track for sparkle timing.
      this._boostPulseCar = car;
      return;
    }
    this._boostPulseCar = car;
    const s = car.glowPlane.scale;
    anime.remove(s);
    this._boostPulseTween = anime({
      targets: s,
      x: [1.0, 1.25, 1.0],
      y: [1.0, 1.25, 1.0],
      duration: 500,
      loop: true,
      easing: 'easeInOutSine'
    });
  }

  stopBoostPulse() {
    const car = this._boostPulseCar;
    if (car) {
      if (this._boostPulseTween) {
        this._boostPulseTween.pause();
        this._boostPulseTween = null;
      }
      if (car.glowPlane) car.glowPlane.scale.set(1, 1, 1);
      this._boostPulseCar = null;
    }
  }

  // Backwards-compatible aliases used by game.js
  startTurboPulse(car) { this.startBoostPulse(car); }
  stopTurboPulse() { this.stopBoostPulse(); }

  // ===========================================================================
  // OVERLAY FADE
  // ===========================================================================
  overlayFade(el, show) {
    if (!el) return;
    anime.remove(el);
    if (show) {
      el.style.display = 'flex';
      el.style.pointerEvents = 'auto';
      anime({
        targets: el,
        opacity: [0, 1],
        duration: UI.overlayFadeDur,
        easing: 'easeOutQuad'
      });
    } else {
      anime({
        targets: el,
        opacity: [1, 0],
        duration: UI.overlayFadeDur,
        easing: 'easeOutQuad',
        complete: () => {
          el.style.display = 'none';
          el.style.pointerEvents = 'none';
        }
      });
    }
  }

  // ===========================================================================
  // MAIN UPDATE
  // ===========================================================================
  update(dt, car, speedFactor) {
    this.updateShake(dt);
    const boostActive = !!(car && car.boostActive);
    this.updateRibbons(dt, car, speedFactor, boostActive);
    this.updateParticles(dt);
    this.updateBoostSparkles(dt);
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================
  dispose() {
    this.stopMenuBounce();
    this.stopBoostPulse();

    for (const r of this.ribbons) {
      if (r.material) r.material.dispose();
    }
    if (this._ribbonGeom) this._ribbonGeom.dispose();
    this.scene.remove(this.ribbonGroup);

    for (const p of this.particles) {
      if (p.material) p.material.dispose();
    }
    if (this._particleGeom) this._particleGeom.dispose();
    this.scene.remove(this.particleGroup);

    for (const s of this.boostSparkles) {
      if (s.material) s.material.dispose();
    }
    if (this._sparkleGeom) this._sparkleGeom.dispose();
    this.scene.remove(this.boostSparkleGroup);

    if (this.popupLayer) {
      while (this.popupLayer.firstChild) {
        this.popupLayer.removeChild(this.popupLayer.firstChild);
      }
    }
  }
}

export default Effects;