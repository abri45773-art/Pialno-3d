import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { GEO, buildKeyboard, noteName, pitchColor, MIDI_TO_CODE, CODE_LABEL } from './music.js';

const HIT_Y = 0.62; // ketinggian garis tangkap di atas permukaan tuts
const FALL_HEIGHT = 18; // jarak jatuh (satuan dunia)
const V3 = new THREE.Vector3();
const MAT4 = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3(1, 1, 1);
const COLOR = new THREE.Color();
const QUAT_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/* ================================================================== */
/* Partikel (ledakan saat nada kena + debu ambien)                     */
/* ================================================================== */
class Particles {
  constructor(scene, max = 1400) {
    this.max = max;
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));

    const tex = Particles.sprite();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float a = texture2D(uTex, gl_PointCoord).a;
          if (a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor * a, a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    scene.add(this.points);
  }

  static sprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  burst(x, y, z, hex, count = 22, power = 1) {
    COLOR.setHex(hex);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 1.1;
      const sp = (1.4 + Math.random() * 3.4) * power;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.5;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.2;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.5;
      this.vel[i * 3] = Math.cos(a) * sp * 0.55;
      this.vel[i * 3 + 1] = up * sp * 0.7;
      this.vel[i * 3 + 2] = Math.sin(a) * sp * 0.55;
      const tint = 0.75 + Math.random() * 0.45;
      this.col[i * 3] = Math.min(1.6, COLOR.r * tint + 0.12);
      this.col[i * 3 + 1] = Math.min(1.6, COLOR.g * tint + 0.12);
      this.col[i * 3 + 2] = Math.min(1.6, COLOR.b * tint + 0.12);
      this.size[i] = 0.1 + Math.random() * 0.26;
      this.maxLife[i] = 0.45 + Math.random() * 0.75;
      this.life[i] = this.maxLife[i];
      this.alpha[i] = 1;
    }
    this.dirty = true;
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha } = this;
    let alive = false;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) {
          alpha[i] = 0;
          this.dirty = true;
        }
        continue;
      }
      alive = true;
      life[i] -= dt;
      const k = Math.max(0, life[i] / maxLife[i]);
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      vel[i * 3 + 1] -= 7.5 * dt;
      vel[i * 3] *= 1 - 1.6 * dt;
      vel[i * 3 + 2] *= 1 - 1.6 * dt;
      alpha[i] = k * k;
    }
    if (alive || this.dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.dirty = false;
    }
  }
}

/* ================================================================== */
/* Piano 3D: badan, tuts, label, animasi tekan                         */
/* ================================================================== */
class Piano {
  constructor(scene, showNames = true) {
    this.scene = scene;
    this.kb = buildKeyboard();
    this.group = new THREE.Group();
    this.keys = new Map(); // midi -> key object
    scene.add(this.group);
    this.buildBody();
    this.buildKeys();
    this.buildLabels();
    this.setNames(showNames);
    this.energy = 0;
  }

  buildBody() {
    const { width } = this.kb;
    const halfW = width / 2;
    const shell = new THREE.MeshStandardMaterial({
      color: 0x0d0d16,
      roughness: 0.32,
      metalness: 0.62,
    });
    const shellDark = new THREE.MeshStandardMaterial({
      color: 0x07070d,
      roughness: 0.5,
      metalness: 0.4,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0xbfc6e6,
      roughness: 0.18,
      metalness: 1,
    });

    // rangka bawah keyboard
    const bed = new THREE.Mesh(new RoundedBoxGeometry(width + 1.7, 1.15, GEO.whiteD + 2.1, 5, 0.14), shell);
    bed.position.set(0, -0.62 - 0.575, -0.45);
    bed.castShadow = bed.receiveShadow = true;
    this.group.add(bed);

    // pipi kiri & kanan
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.42, 1.05, GEO.whiteD + 0.5, 4, 0.1), shell);
      cheek.position.set(s * (halfW + 0.62), -0.05, -0.25);
      cheek.castShadow = cheek.receiveShadow = true;
      this.group.add(cheek);
    }

    // papan nama / fallboard di belakang tuts
    const back = new THREE.Mesh(new RoundedBoxGeometry(width + 1.7, 1.35, 0.42, 4, 0.09), shellDark);
    back.position.set(0, 0.16, -GEO.whiteD / 2 - 0.72);
    back.castShadow = back.receiveShadow = true;
    this.group.add(back);

    // papan partitur miring
    const stand = new THREE.Mesh(new RoundedBoxGeometry(width * 0.72, 1.5, 0.12, 4, 0.05), shellDark);
    stand.position.set(0, 1.32, -GEO.whiteD / 2 - 1.35);
    stand.rotation.x = -0.34;
    stand.castShadow = true;
    this.group.add(stand);
    const standLip = new THREE.Mesh(new RoundedBoxGeometry(width * 0.72, 0.16, 0.34, 3, 0.06), chrome);
    standLip.position.set(0, 0.66, -GEO.whiteD / 2 - 1.16);
    standLip.rotation.x = -0.34;
    this.group.add(standLip);

    // bibir depan + strip LED
    const lip = new THREE.Mesh(new RoundedBoxGeometry(width + 1.7, 0.5, 0.6, 4, 0.12), shell);
    lip.position.set(0, -0.86, GEO.whiteD / 2 + 0.02);
    lip.castShadow = lip.receiveShadow = true;
    this.group.add(lip);

    this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x22d3ee), toneMapped: false });
    const led = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.07, 0.07), this.ledMat);
    led.position.set(0, -0.62, GEO.whiteD / 2 + 0.3);
    this.group.add(led);

    const ledBack = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.05, 0.05), this.ledMat);
    ledBack.position.set(0, 0.82, -GEO.whiteD / 2 - 0.52);
    this.group.add(ledBack);

    // kaki
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.5, 12), shellDark);
        leg.position.set(sx * (halfW + 0.4), -2.5, sz * (GEO.whiteD / 2 + 0.2) - 0.45);
        leg.castShadow = true;
        this.group.add(leg);
      }
    }
    this.floorY = -3.25;
  }

  buildKeys() {
    const whiteMatBase = {
      color: 0xf6f7fb,
      roughness: 0.3,
      metalness: 0.02,
      clearcoat: 0.75,
      clearcoatRoughness: 0.22,
    };
    const blackMatBase = {
      color: 0x15151f,
      roughness: 0.24,
      metalness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    };

    const whiteGeo = new RoundedBoxGeometry(GEO.whiteW - 0.045, GEO.whiteH, GEO.whiteD, 3, 0.055);
    const blackGeo = new RoundedBoxGeometry(GEO.blackW, GEO.blackH, GEO.blackD, 3, 0.05);

    for (const k of this.kb.keys) {
      const pivot = new THREE.Group();
      pivot.position.set(k.x, k.black ? GEO.blackLift : 0, -GEO.whiteD / 2);
      const mat = new THREE.MeshPhysicalMaterial({
        ...(k.black ? blackMatBase : whiteMatBase),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
      });
      const mesh = new THREE.Mesh(k.black ? blackGeo : whiteGeo, mat);
      if (k.black) {
        mesh.position.set(0, -GEO.blackH / 2, GEO.blackD / 2);
      } else {
        mesh.position.set(0, -GEO.whiteH / 2, GEO.whiteD / 2);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.midi = k.midi;
      pivot.add(mesh);
      this.group.add(pivot);

      // bantalan cahaya di bawah tuts (kilau saat ditekan)
      const padMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(pitchColor(k.midi)),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(k.black ? GEO.blackW * 1.5 : GEO.whiteW * 1.05, k.black ? 1.2 : 1.7),
        padMat,
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(k.x, (k.black ? GEO.blackLift : 0) + 0.035, k.black ? -1.1 : 1.2);
      this.group.add(pad);

      this.keys.set(k.midi, {
        midi: k.midi,
        black: k.black,
        x: k.x,
        pivot,
        mesh,
        mat,
        pad,
        padMat,
        press: 0,
        target: 0,
        glow: 0,
        held: false,
      });
    }
  }

  buildLabels() {
    this.labels = [];
    for (const k of this.kb.keys) {
      const tex = Piano.labelTexture(noteName(k.midi), CODE_LABEL[MIDI_TO_CODE[k.midi]] || '');
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.9,
      });
      const sp = new THREE.Sprite(mat);
      const s = k.black ? 0.62 : 0.78;
      sp.scale.set(s, s * 0.78, 1);
      sp.position.set(k.x, (k.black ? GEO.blackLift : 0) + 0.1, k.black ? -0.6 : 1.75);
      sp.renderOrder = 6;
      this.group.add(sp);
      this.labels.push(sp);
    }
  }

  static labelTexture(name, binding) {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 124;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(232,236,255,0.95)';
    g.font = '700 52px Sora, system-ui, sans-serif';
    g.fillText(name, 80, 60);
    if (binding) {
      const w = 54;
      const x = 80 - w / 2;
      g.fillStyle = 'rgba(34,211,238,0.22)';
      g.strokeStyle = 'rgba(34,211,238,0.85)';
      g.lineWidth = 3;
      const r = 12;
      g.beginPath();
      g.moveTo(x + r, 74);
      g.arcTo(x + w, 74, x + w, 74 + 40, r);
      g.arcTo(x + w, 114, x, 114, r);
      g.arcTo(x, 114, x, 74, r);
      g.arcTo(x, 74, x + w, 74, r);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(200,245,255,1)';
      g.font = '700 30px "JetBrains Mono", monospace';
      g.fillText(binding, 80, 105);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  setNames(on) {
    for (const s of this.labels) s.visible = !!on;
  }

  /** Tingkat keterbacaan label (diremehkan saat mode permainan). */
  setLabelOpacity(v) {
    for (const s of this.labels) s.material.opacity = v;
  }

  /** Tekan tuts (visual). */
  press(midi, velocity = 0.9) {
    const k = this.keys.get(midi);
    if (!k) return;
    k.target = 1;
    k.held = true;
    k.glow = Math.max(k.glow, 0.55 + 0.45 * Math.min(1, velocity));
  }

  release(midi) {
    const k = this.keys.get(midi);
    if (!k) return;
    k.held = false;
    k.target = 0;
  }

  flash(midi, power = 1) {
    const k = this.keys.get(midi);
    if (!k) return;
    k.glow = Math.min(1.6, k.glow + power);
  }

  /** Posisi dunia permukaan tuts untuk nada tertentu. */
  keySurface(midi) {
    const k = this.keys.get(midi);
    const x = k ? k.x : 0;
    const y = k && k.black ? GEO.blackLift : 0;
    const z = k && k.black ? -1.1 : 0.6;
    return { x, y, z };
  }

  keyWidth(midi) {
    const k = this.keys.get(midi);
    return k && k.black ? GEO.blackW : GEO.whiteW;
  }

  update(dt, energy = 0) {
    this.energy += (energy - this.energy) * Math.min(1, dt * 8);
    for (const k of this.keys.values()) {
      const rate = k.target > k.press ? 26 : 14;
      k.press += (k.target - k.press) * Math.min(1, dt * rate);
      k.pivot.rotation.x = k.press * (k.black ? 0.062 : 0.05);
      k.glow *= Math.exp(-dt * 3.6);
      const g = k.glow;
      if (g > 0.002) {
        k.mat.emissive.setHex(pitchColor(k.midi));
        k.mat.emissiveIntensity = g * 0.95;
        k.padMat.opacity = Math.min(0.85, g * 0.7);
      } else if (k.mat.emissiveIntensity !== 0) {
        k.mat.emissiveIntensity = 0;
        k.padMat.opacity = 0;
      }
      // tuts yang ditahan tetap menyala redup
      if (k.held && k.glow < 0.22) {
        k.mat.emissive.setHex(pitchColor(k.midi));
        k.mat.emissiveIntensity = 0.18;
        k.padMat.opacity = 0.14;
      }
    }
    if (this.ledMat) {
      const e = this.energy;
      this.ledMat.color.setRGB(0.13 + e * 0.35, 0.83 - e * 0.25, 0.93);
      this.ledMat.color.multiplyScalar(0.55 + e * 1.5);
    }
  }
}

/* ================================================================== */
/* Lintasan nada jatuh (Synthesia-style)                               */
/* ================================================================== */
class NoteField {
  constructor(scene, piano, capacity = 640) {
    this.piano = piano;
    this.capacity = capacity;
    this.visibleCount = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: false,
      transparent: true,
      opacity: 0.96,
      toneMapped: false,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.add(this.mesh);

    // bantalan garis tangkap per tuts
    const padGeo = new THREE.PlaneGeometry(1, 1);
    const padMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.pads = new THREE.InstancedMesh(padGeo, padMat, capacity);
    this.pads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pads.frustumCulled = false;
    this.pads.count = 0;
    this.group.add(this.pads);

    this.buildLanes();
    this.flash = new Map(); // midi -> {t, power}
  }

  buildLanes() {
    const kb = this.piano.kb;
    const positions = [];
    const colors = [];
    for (const k of kb.keys) {
      const y0 = HIT_Y + (k.black ? GEO.blackLift : 0);
      positions.push(k.x, y0, k.black ? -1.1 : 0.6, k.x, y0 + FALL_HEIGHT, k.black ? -1.1 : 0.6);
      COLOR.setHex(pitchColor(k.midi));
      colors.push(COLOR.r, COLOR.g, COLOR.b, COLOR.r * 0.2, COLOR.g * 0.2, COLOR.b * 0.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.lanes = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.group.add(this.lanes);

    // garis tangkap
    const lineMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x9ff5ff),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const line = new THREE.Mesh(new THREE.BoxGeometry(kb.width + 0.4, 0.05, 0.05), lineMat);
    line.position.set(0, HIT_Y + 0.02, GEO.whiteD / 2 + 0.05);
    this.group.add(line);
    this.hitLine = line;

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(kb.width + 1.4, 5.8),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x2ad4ff),
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, HIT_Y - 0.02, -0.2);
    this.group.add(glow);
    this.hitGlow = glow;
  }

  setVisible(on) {
    this.group.visible = !!on;
  }

  pulse(midi, power = 1) {
    this.flash.set(midi, { t: 0, power });
  }

  /**
   * Gambar nada yang sedang aktif.
   * @param {Array} notes daftar nada (punya .midi .time .dur .state .hold)
   * @param {number} songTime waktu lagu (detik)
   * @param {number} approach waktu tempuh nada dari atas ke garis (detik)
   * @param {number} dt delta waktu frame (detik)
   */
  render(notes, songTime, approach, dt = 0.016) {
    const speed = FALL_HEIGHT / Math.max(0.3, approach); // satuan dunia per detik
    let n = 0;
    let p = 0;
    for (const note of notes) {
      const dtNote = note.time - songTime;
      if (dtNote > approach + 0.6) continue;
      const surface = this.piano.keySurface(note.midi);
      const w = this.piano.keyWidth(note.midi);
      const len = Math.max(0.34, note.dur * speed);
      let bottom = HIT_Y + surface.y * 0.2 + dtNote * speed;
      if (bottom < -6) continue;
      if (n >= this.capacity) break;

      let scaleW = w * (note.harmony ? 0.78 : 0.9);
      let scaleY = len;
      let bright = 1;

      if (note.state === 'hit' || note.state === 'done') {
        note.pop = (note.pop || 0) + dt;
        const k = Math.min(1, note.pop * 5.5);
        scaleW *= 1 + k * 0.55;
        scaleY *= Math.max(0.02, 1 - k * 0.92);
        bright = 1 - k;
        if (bright <= 0.02) continue;
      } else if (note.state === 'missed') {
        bright = 0.32;
        scaleW *= 0.78;
      } else if (note.state === 'holding') {
        // nada tahan: ekor menyusut dari garis tangkap ke atas
        bright = 1.3;
        scaleY = Math.max(0.18, (note.end - songTime) * speed);
        scaleW *= 1.06;
        bottom = HIT_Y + surface.y * 0.2;
      }

      const cy = bottom + scaleY / 2;
      V3.set(surface.x, cy, surface.z);
      SCALE.set(scaleW, scaleY, note.harmony ? GEO.whiteD * 0.42 : GEO.whiteD * 0.55);
      MAT4.compose(V3, QUAT, SCALE);
      this.mesh.setMatrixAt(n, MAT4);
      COLOR.setHex(note.state === 'missed' ? 0x5a4048 : pitchColor(note.midi));
      COLOR.multiplyScalar(bright * (note.harmony ? 0.78 : 1));
      this.mesh.setColorAt(n, COLOR);
      n++;

      // jejak cahaya di garis tangkap saat nada mendekat
      if (p < this.capacity && dtNote < 1.1 && dtNote > -0.25 && note.state !== 'missed') {
        const near = 1 - Math.min(1, Math.abs(dtNote) / 1.1);
        V3.set(surface.x, HIT_Y + surface.y * 0.2 + 0.02, surface.z);
        SCALE.set(w * (0.9 + near * 0.3), GEO.whiteD * (note.harmony ? 0.4 : 0.52) * (0.6 + near * 0.5), 1);
        MAT4.compose(V3, QUAT_FLAT, SCALE);
        this.pads.setMatrixAt(p, MAT4);
        COLOR.setHex(pitchColor(note.midi)).multiplyScalar(0.22 + near * 0.8);
        this.pads.setColorAt(p, COLOR);
        p++;
      }
    }

    // kilau tuts yang baru ditekan
    for (const [midi, f] of this.flash) {
      f.t += dt;
      const k = 1 - f.t / 0.42;
      if (k <= 0) {
        this.flash.delete(midi);
        continue;
      }
      if (p >= this.capacity) break;
      const surface = this.piano.keySurface(midi);
      const w = this.piano.keyWidth(midi);
      V3.set(surface.x, HIT_Y + surface.y * 0.2 + 0.03, surface.z);
      SCALE.set(w * (1.7 - k * 0.6), GEO.whiteD * (1.35 - k * 0.45), 1);
      MAT4.compose(V3, QUAT_FLAT, SCALE);
      this.pads.setMatrixAt(p, MAT4);
      COLOR.setHex(pitchColor(midi)).multiplyScalar(k * f.power * 1.5);
      this.pads.setColorAt(p, COLOR);
      p++;
    }

    this.mesh.count = n;
    this.pads.count = p;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    if (p) {
      this.pads.instanceMatrix.needsUpdate = true;
      if (this.pads.instanceColor) this.pads.instanceColor.needsUpdate = true;
    }
  }
}

/* ================================================================== */
/* Panggung utama                                                      */
/* ================================================================== */
export class Stage3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = 'high';
    this.showNames = true;
    this.shake = 0;
    this.pointer = new THREE.Vector2(-2, -2);
    this.hoverMidi = null;
    this.onSelect = null; // callback(midi, {x,y})
    this.raycaster = new THREE.Raycaster();
    this.clockT = 0;

    // kamera: koordinat bola
    this.camTarget = new THREE.Vector3(0, 2.1, -0.5);
    this.camGoal = { radius: 26, theta: 0, phi: 1.06 };
    this.cam = { radius: 34, theta: -0.25, phi: 0.92 };
    this.mode = 'menu';

    this.initRenderer();
    this.initScene();
    this.initLights();
    this.initBackground();
    this.initPost();
    this.initInput();

    this.piano = new Piano(this.scene, this.showNames);
    this.notes = new NoteField(this.scene, this.piano);
    this.particles = new Particles(this.scene);
    this.notes.setVisible(false);

    this.setQuality(this.quality);
    this.setMode('menu', true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 900);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05050d, 0.0105);
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      const rt = pmrem.fromScene(envScene, 0.05);
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.5;
      envScene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      pmrem.dispose();
    } catch (e) {
      console.warn('Environment map gagal dibuat:', e);
    }
  }

  initLights() {
    this.scene.add(new THREE.HemisphereLight(0x7f8cff, 0x0b0b16, 0.55));

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(7, 16, 11);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0x8fd8ff, 0.8);
    fill.position.set(-9, 7, 6);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xff7ad9, 0.9);
    rim.position.set(0, 5, -14);
    this.scene.add(rim);

    // lampu panggung berwarna
    const p1 = new THREE.PointLight(0x22d3ee, 90, 46, 2);
    p1.position.set(-13, 3.5, 7);
    this.scene.add(p1);
    const p2 = new THREE.PointLight(0xa78bfa, 90, 46, 2);
    p2.position.set(13, 3.5, 7);
    this.scene.add(p2);
    this.stageLights = [p1, p2];

    const top = new THREE.SpotLight(0xfff4e0, 260, 60, 0.72, 0.45, 1.6);
    top.position.set(0, 20, 6);
    top.target.position.set(0, 0, 0);
    this.scene.add(top);
    this.scene.add(top.target);
    this.topLight = top;
  }

  initBackground() {
    // kubah gradasi
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x05050c) },
        uMid: { value: new THREE.Color(0x171a3d) },
        uBot: { value: new THREE.Color(0x2a1040) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main(){
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform float uTime;
        varying vec3 vPos;
        void main(){
          float h = normalize(vPos).y * 0.5 + 0.5;
          vec3 c = mix(uBot, uMid, smoothstep(0.0, 0.52, h));
          c = mix(c, uTop, smoothstep(0.45, 1.0, h));
          float band = sin((vPos.x + vPos.z) * 0.02 + uTime * 0.12) * 0.5 + 0.5;
          c += vec3(0.02, 0.035, 0.06) * band;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 20), skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);
    this.skyMat = skyMat;

    // lantai mengilap
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x080810,
      roughness: 0.28,
      metalness: 0.82,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(180, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.25;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;

    // grid neon di lantai
    const ringPos = [];
    const ringCol = [];
    for (let r = 8; r <= 90; r += 8) {
      const seg = 96;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        ringPos.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
        const f = 1 - r / 100;
        ringCol.push(0.1 * f, 0.6 * f, 0.85 * f, 0.1 * f, 0.6 * f, 0.85 * f);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(ringCol, 3));
    const rings = new THREE.LineSegments(
      rg,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    rings.position.y = -3.23;
    this.scene.add(rings);
    this.rings = rings;

    // bintang
    const starCount = 900;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 120 + Math.random() * 150;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.85 + 0.05);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.cos(ph) * 0.8 + 10;
      sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0xbcd4ff,
        size: 0.85,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.stars);

    // sorot cahaya panggung (kerucut aditif)
    this.beams = [];
    const beamColors = [0x22d3ee, 0xa78bfa, 0xf472b6];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(beamColors[i]),
        transparent: true,
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(5.4, 26, 24, 1, true), mat);
      cone.position.set((i - 1) * 11, 9, -13);
      cone.rotation.x = 0.2;
      this.scene.add(cone);
      this.beams.push(cone);
    }
  }

  initPost() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.62, 0.62, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /* --------------------------- kualitas --------------------------- */
  setQuality(q) {
    this.quality = q;
    const low = q === 'low';
    const high = q === 'high';
    this.renderer.shadowMap.enabled = !low;
    this.keyLight.castShadow = !low;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : low ? 1 : 1.4));
    this.useBloom = high;
    if (this.bloom) this.bloom.strength = high ? 0.62 : 0.4;
    for (const b of this.beams) b.visible = !low;
    if (this.stars) this.stars.visible = !low;
    this.resize();
  }

  /* --------------------------- kamera --------------------------- */
  setMode(mode, instant = false) {
    this.mode = mode;
    const presets = {
      menu: { radius: 30, theta: -0.34, phi: 0.94, target: new THREE.Vector3(0, 1.6, -1) },
      free: { radius: 21, theta: 0, phi: 1.06, target: new THREE.Vector3(0, 0.6, -0.6) },
      game: { radius: 27.5, theta: 0, phi: 0.93, target: new THREE.Vector3(0, 4.4, -0.4) },
    };
    const p = presets[mode] || presets.game;
    this.camGoal.radius = p.radius;
    this.camGoal.theta = p.theta;
    this.camGoal.phi = p.phi;
    this.camTargetGoal = p.target.clone();
    if (instant) {
      this.cam.radius = p.radius;
      this.cam.theta = p.theta;
      this.cam.phi = p.phi;
      this.camTarget.copy(p.target);
    }
  }

  orbit(dTheta, dPhi) {
    this.camGoal.theta = THREE.MathUtils.clamp(this.camGoal.theta + dTheta, -0.85, 0.85);
    this.camGoal.phi = THREE.MathUtils.clamp(this.camGoal.phi + dPhi, 0.42, 1.28);
  }

  zoom(delta) {
    this.camGoal.radius = THREE.MathUtils.clamp(this.camGoal.radius * delta, 13, 46);
  }

  kick(amount = 0.5) {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 5.2);
    this.cam.radius += (this.camGoal.radius - this.cam.radius) * k;
    this.cam.theta += (this.camGoal.theta - this.cam.theta) * k;
    this.cam.phi += (this.camGoal.phi - this.cam.phi) * k;
    if (this.camTargetGoal) this.camTarget.lerp(this.camTargetGoal, k);

    const drift = Math.sin(this.clockT * 0.22) * 0.014;
    const theta = this.cam.theta + drift;
    const phi = this.cam.phi + Math.sin(this.clockT * 0.17) * 0.008;
    const r = this.cam.radius;
    this.camera.position.set(
      this.camTarget.x + r * Math.sin(phi) * Math.sin(theta),
      this.camTarget.y + r * Math.cos(phi),
      this.camTarget.z + r * Math.sin(phi) * Math.cos(theta),
    );
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-dt * 6.5);
      const s = this.shake * 0.22;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    } else {
      this.shake = 0;
    }
    this.camera.lookAt(this.camTarget);
  }

  /* --------------------------- input --------------------------- */
  initInput() {
    const el = this.canvas;
    let dragging = false;
    let moved = 0;
    let last = { x: 0, y: 0 };
    const activePointers = new Map();
    const downMap = new Map(); // pointerId -> midi yang sedang ditekan

    const toNdc = (cx, cy) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    };

    el.addEventListener('pointerdown', (e) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const midi = this.pickKey(toNdc(e.clientX, e.clientY));
      if (midi != null) {
        moved = 0;
        dragging = false;
        downMap.set(e.pointerId, midi);
        if (this.onSelect) this.onSelect(midi, { down: true, x: e.clientX, y: e.clientY, id: e.pointerId });
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* diabaikan */
        }
      } else {
        dragging = true;
        moved = 0;
        last = { x: e.clientX, y: e.clientY };
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dragging) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) {
          this.orbit(dx * 0.005, -dy * 0.004);
        }
      }
    });

    const endPointer = (e) => {
      activePointers.delete(e.pointerId);
      const midi = downMap.get(e.pointerId);
      if (midi != null) {
        downMap.delete(e.pointerId);
        if (this.onSelect) this.onSelect(midi, { down: false, id: e.pointerId });
      }
      dragging = false;
    };
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('pointerleave', endPointer);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 1.08 : 0.93);
      },
      { passive: false },
    );
  }

  pickKey(ndc) {
    if (!this.piano) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [];
    for (const k of this.piano.keys.values()) meshes.push(k.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    return hits[0].object.userData.midi ?? null;
  }

  /** Arahkan kursor (untuk efek hover di desktop). */
  setPointerFromEvent(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // layar sempit/vertikal: lebarkan FOV agar seluruh keyboard tetap terlihat
    this.camera.fov = aspect < 1.15 ? THREE.MathUtils.clamp(46 * (1.15 / Math.max(0.38, aspect)), 46, 74) : 46;
    this.camera.updateProjectionMatrix();
  }

  /* --------------------------- frame --------------------------- */
  update(dt, opts = {}) {
    this.clockT += dt;
    const energy = opts.energy || 0;
    this.piano.update(dt, energy);
    this.particles.update(dt);
    if (this.notes.group.visible && opts.chart) {
      this.notes.render(opts.chart, opts.songTime || 0, opts.approach || 2.2, dt);
    }
    this.updateCamera(dt);

    // reaksi visual terhadap audio
    const e = energy;
    if (this.skyMat) this.skyMat.uniforms.uTime.value = this.clockT;
    if (this.stars) this.stars.rotation.y = this.clockT * 0.006;
    if (this.rings) {
      this.rings.material.opacity = 0.16 + e * 0.35;
      this.rings.rotation.y = this.clockT * 0.01;
    }
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      b.rotation.z = Math.sin(this.clockT * 0.3 + i * 2.1) * 0.16;
      b.material.opacity = 0.05 + e * 0.11;
    }
    for (const l of this.stageLights) l.intensity = 70 + e * 190;
    if (this.topLight) this.topLight.intensity = 230 + e * 220;
    if (this.bloom && this.useBloom) this.bloom.strength = 0.55 + e * 0.5;
    if (this.notes.hitGlow) this.notes.hitGlow.material.opacity = 0.07 + e * 0.12;
  }

  render() {
    if (this.useBloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Ledakan partikel di atas tuts. */
  burstAtKey(midi, power = 1) {
    const s = this.piano.keySurface(midi);
    this.particles.burst(s.x, HIT_Y + s.y + 0.2, s.z, pitchColor(midi), Math.round(16 * power), power);
  }

  dispose() {
    this.renderer?.dispose();
    this.composer?.dispose?.();
  }
}

export { HIT_Y, FALL_HEIGHT, Piano, NoteField, Particles };
