// js/effects.js
// Meow Racing — anime.js-driven visual effects.
// Manages: speed ribbons, collision particle bursts, camera shake, coin/crown
// score popups, HUD counter tweens, checkpoint gate pulse, menu idle bounce,
// turbo glow pulse, overlay fades.

import * as THREE from 'three';
import anime from 'animejs';
import { EFFECTS, UI, clamp, randRange } from './config.js';

const TWO_PI = Math.PI * 2;

export class Effects {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Camera shake state.
    this.shake = {
      remaining: 0,
      duration: 0,
      amp: 0,
      offset: new THREE.Vector3()
    };

    // Popup layer (DOM).
    this.popupLayer = document.getElementById('popup-layer');
    if (!this.popupLayer) {
      this.popupLayer = document.createElement('div');
      this.popupLayer.id = 'popup-layer';
      this.popupLayer.className = 'popup-layer';
      document.body.appendChild(this.popupLayer);
    }

    // Counter tween tracking so rapid updates cancel cleanly.
    this._counterTweens = new WeakMap();

    // Reusable vectors to avoid allocations.
    this._tmpV = new THREE.Vector3();

    // Track active looping tweens.
    this._menuBounceTween = null;
    this._turboPulseCar = null;

    this._initRibbons();
    this._initParticles();
  }

  // ===========================================================================
  // SPEED RIBBONS
  // ===========================================================================
  _initRibbons() {
    this.ribbonGroup = new THREE.Group();
    this.ribbonGroup.name = 'SpeedRibbons';
    this.scene.add(this.ribbonGroup);

    this.ribbons = [];
    const geom = new THREE.BoxGeometry(0.06, 1.8, 0.06);
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
      mesh.userData = { life: 0, maxLife: 0.4, vx: 0, vy: 0, vz: 0 };
      this.ribbonGroup.add(mesh);
      this.ribbons.push(mesh);
    }
    this._ribbonGeom = geom;
    this._ribbonGeomShared = true;
  }

  updateRibbons(dt, car, speedFactor) {
    if (!car || !car.group) return;
    const sf = clamp(speedFactor || 0, 0, 1);
    const pos = car.group.position;

    // Spawn probability per frame scales with speed.
    const spawnChance = Math.max(0, (sf - 0.25)) * 0.9;

    for (let i = 0; i < this.ribbons.length; i++) {
      const r = this.ribbons[i];
      const u = r.userData;

      u.life -= dt;

      if (u.life <= 0) {
        if (sf > 0.2 && Math.random() < spawnChance) {
          // Spawn a fresh streak behind the car at a random offset.
          const offX = randRange(-2.8, 2.8);
          const offY = randRange(0.2, 1.4);
          const offZ = randRange(1.6, 5.5);
          r.position.set(pos.x + offX, offY, pos.z + offZ);
          u.maxLife = randRange(0.28, 0.55);
          u.life = u.maxLife;
          const scaleBase = randRange(0.7, 1.35);
          r.scale.set(scaleBase, scaleBase * randRange(0.8, 1.6), scaleBase);
        } else {
          r.material.opacity = Math.max(0, r.material.opacity - dt * 5);
          if (r.material.opacity <= 0.001) {
            r.position.set(0, -1000, 0);
          }
          continue;
        }
      }

      const t = clamp(u.life / u.maxLife, 0, 1);
      r.material.opacity = t * sf * 0.85;
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
    this._particleGeom = geom;
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

      // Ground bounce.
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

  turboPop(worldPos) {
    this.popupWorld(worldPos, 'TURBO!', 'popup-turbo');
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
  // CHECKPOINT GATE PULSE
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
  // MENU IDLE BOUNCE
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
  // TURBO GLOW PULSE (scale pulse; opacity driven by car.js)
  // ===========================================================================
  startTurboPulse(car) {
    this.stopTurboPulse();
    if (!car || !car.glowPlane) return;
    this._turboPulseCar = car;
    const s = car.glowPlane.scale;
    anime.remove(s);
    car._turboTween = anime({
      targets: s,
      x: [1.0, 1.25, 1.0],
      y: [1.0, 1.25, 1.0],
      duration: Math.max(120, 1000 / EFFECTS.turboGlowPulseFreq) * 2,
      loop: true,
      easing: 'easeInOutSine'
    });
  }

  stopTurboPulse() {
    const car = this._turboPulseCar;
    if (car) {
      if (car._turboTween) {
        car._turboTween.pause();
        car._turboTween = null;
      }
      if (car.glowPlane) {
        car.glowPlane.scale.set(1, 1, 1);
      }
      this._turboPulseCar = null;
    }
  }

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
    this.updateRibbons(dt, car, speedFactor);
    this.updateParticles(dt);
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================
  dispose() {
    this.stopMenuBounce();
    this.stopTurboPulse();

    // Ribbons.
    for (const r of this.ribbons) {
      if (r.material) r.material.dispose();
    }
    if (this._ribbonGeom) this._ribbonGeom.dispose();
    this.scene.remove(this.ribbonGroup);

    // Particles.
    for (const p of this.particles) {
      if (p.material) p.material.dispose();
    }
    if (this._particleGeom) this._particleGeom.dispose();
    this.scene.remove(this.particleGroup);

    // Popups.
    if (this.popupLayer) {
      while (this.popupLayer.firstChild) {
        this.popupLayer.removeChild(this.popupLayer.firstChild);
      }
    }
  }
}

export default Effects;