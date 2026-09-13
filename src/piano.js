/**
 * Pembangun geometri grand piano 3D (Three.js).
 *
 * Konvensi sumbu (lokal terhadap `body`):
 *   +x = kanan pemain (treble)   +y = atas   +z = ke arah pemain
 *   Ujung depan tuts putih di z = 0, pangkal (pivot) di z = -whiteLen.
 *   Bodi piano memanjang ke belakang (z negatif) sampai z = -caseL.
 *   y = 0 adalah bidang pivot tuts; permukaan tuts putih di y = whiteH.
 */
import * as THREE from 'three';
import { isBlackKey, midiToName } from './audio.js';

// ---------- konstanta dimensi (meter) ----------
export const KEY = {
  whiteW: 0.0232,      // lebar tuts putih (jarak antar sumbu)
  whiteGap: 0.0015,    // celah antar tuts
  whiteLen: 0.148,     // panjang tuts putih
  whiteH: 0.021,       // tebal tuts putih
  blackLenRatio: 0.63, // panjang tuts hitam relatif putih
  blackWRatio: 0.55,   // lebar tuts hitam relatif putih
  blackRise: 0.0125,   // tinggi tuts hitam di atas permukaan putih
  dip: 0.055,          // sudut tekan (radian)
};

// Posisi tengah tuts hitam (satuan lebar tuts putih, dari awal oktaf)
const BLACK_CENTERS = { 1: 0.95, 3: 2.05, 6: 3.9, 8: 5.0, 10: 6.1 };
const WHITE_ORDER = [0, 2, 4, 5, 7, 9, 11];
const PREV_BLACK = { 0: null, 2: 1, 4: 3, 5: null, 7: 6, 9: 8, 11: 10 };
const NEXT_BLACK = { 0: 1, 2: 3, 4: null, 5: 6, 7: 8, 9: 10, 11: null };

const whiteIndexInOctave = (semi) => WHITE_ORDER.indexOf(semi);

function whiteCountBefore(startMidi, midi) {
  let c = 0;
  for (let m = startMidi; m < midi; m++) if (!isBlackKey(m)) c++;
  return c;
}

// ---------- tekstur prosedural ----------
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#9c6a38';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * 512;
    g.strokeStyle = `rgba(${80 + Math.random() * 70},${46 + Math.random() * 42},${16 + Math.random() * 28},${0.05 + Math.random() * 0.16})`;
    g.lineWidth = 0.4 + Math.random() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(170, y + (Math.random() - 0.5) * 9, 340, y + (Math.random() - 0.5) * 9, 512, y + (Math.random() - 0.5) * 5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const labelCache = new Map();
function labelTexture(text, dark) {
  const key = `${text}|${dark ? 'd' : 'l'}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = `bold ${text.length > 2 ? 52 : 64}px Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = dark ? 'rgba(238,242,252,0.9)' : 'rgba(22,26,38,0.8)';
  g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  labelCache.set(key, t);
  return t;
}

/**
 * Outline bodi grand piano pada bidang shape (x, u),
 * u = jarak ke belakang dari ujung depan (0 .. L).
 */
function grandOutline(W, L) {
  const s = new THREE.Shape();
  const hw = W / 2;
  const r = 0.02;
  s.moveTo(-hw, 0);
  s.lineTo(hw - r, 0);
  s.quadraticCurveTo(hw, 0, hw, r);
  // sisi melengkung (treble, kanan)
  s.bezierCurveTo(hw + 0.015, L * 0.3, hw * 0.995, L * 0.5, hw * 0.88, L * 0.68);
  s.bezierCurveTo(hw * 0.77, L * 0.84, hw * 0.52, L * 0.965, hw * 0.17, L);
  // ekor
  s.lineTo(-hw * 0.7, L);
  s.quadraticCurveTo(-hw, L, -hw, L - 0.07);
  // sisi lurus (bass, kiri)
  s.lineTo(-hw, 0);
  return s;
}

/** Ubah shape (x,u) menjadi geometri 3D: u -> -z (ke belakang), tebal -> +y. */
function extrudeCase(shape, depth, opts = {}) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: opts.bevel !== false,
    bevelThickness: opts.bevelThickness ?? 0.005,
    bevelSize: opts.bevelSize ?? 0.005,
    bevelSegments: 2,
    curveSegments: 56,
  });
  geo.rotateX(-Math.PI / 2); // (x, u, d) -> (x, d, -u)
  return geo;
}

export class Piano3D {
  constructor({ startMidi = 36, endMidi = 96 } = {}) {
    this.startMidi = startMidi;
    this.endMidi = endMidi;
    this.group = new THREE.Group();
    this.keys = new Map();
    this.keyMeshes = [];
    this.pressedSet = new Set();
    this._pedalTarget = 0;
    this._pedalCur = 0;

    this._buildMetrics();
    this._buildMaterials();
    this._buildBody();
    this._buildKeys();
    this._buildGlow();
  }

  _buildMetrics() {
    this.whiteTotal = 0;
    for (let m = this.startMidi; m <= this.endMidi; m++) if (!isBlackKey(m)) this.whiteTotal++;
    this.kbWidth = this.whiteTotal * KEY.whiteW;
    this.kbLeft = -this.kbWidth / 2;
  }

  /** Posisi x pusat suatu tuts. */
  keyX(midi) {
    const { whiteW } = KEY;
    if (!isBlackKey(midi)) {
      return this.kbLeft + (whiteCountBefore(this.startMidi, midi) + 0.5) * whiteW;
    }
    const semi = midi % 12;
    const octStart = midi - semi;
    const base = octStart >= this.startMidi
      ? whiteCountBefore(this.startMidi, octStart)
      : -whiteIndexInOctave(this.startMidi % 12);
    return this.kbLeft + (base + BLACK_CENTERS[semi]) * whiteW;
  }

  _buildMaterials() {
    this.mat = {
      lacquer: new THREE.MeshPhysicalMaterial({
        color: 0x0b0b0f, roughness: 0.12, metalness: 0.2,
        clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.9,
      }),
      lacquerSoft: new THREE.MeshPhysicalMaterial({
        color: 0x15151a, roughness: 0.32, metalness: 0.15, clearcoat: 0.6,
      }),
      ivory: new THREE.MeshPhysicalMaterial({
        color: 0xe8e4d9, roughness: 0.42, metalness: 0.015,
        clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.2, sheenColor: new THREE.Color(0xfff4dc),
      }),
      ebony: new THREE.MeshPhysicalMaterial({
        color: 0x121216, roughness: 0.26, metalness: 0.06, clearcoat: 0.8, clearcoatRoughness: 0.14,
      }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a24d, roughness: 0.24, metalness: 1 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xb9bec7, roughness: 0.24, metalness: 1 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xa06f42, roughness: 0.34, metalness: 1 }),
      felt: new THREE.MeshStandardMaterial({ color: 0x7d1527, roughness: 0.95 }),
      wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5, metalness: 0.05 }),
      plate: new THREE.MeshStandardMaterial({ color: 0xa98d42, roughness: 0.4, metalness: 0.9 }),
    };
  }

  _buildBody() {
    const { whiteLen, whiteH } = KEY;
    const W = this.kbWidth + 0.1;      // lebar bodi
    const L = W * 1.9;                 // panjang bodi (depan -> ekor)
    const rimH = 0.24;                 // tinggi dinding bodi
    const bodyY = 0.7;                 // ketinggian bidang pivot tuts dari lantai
    const front = 0.042;               // z ujung depan bodi (sedikit di depan tuts)

    this.caseW = W;
    this.caseL = L;
    this.keyTopY = bodyY + whiteH;

    const body = new THREE.Group();
    body.position.set(0, bodyY, front);
    this.group.add(body);
    this.body = body;

    const shape = grandOutline(W, L);

    // ---- dinding bodi (rim), terbuka di atas ----
    const rimGeo = extrudeCase(shape, rimH, { bevelThickness: 0.006, bevelSize: 0.006 });
    rimGeo.translate(0, -rimH, 0); // bagian atas rim sejajar bidang tuts
    const rim = new THREE.Mesh(rimGeo, this.mat.lacquer);
    rim.castShadow = true;
    rim.receiveShadow = true;
    body.add(rim);

    // ---- isi bodi: soundboard, pelat, senar ----
    const innerShape = grandOutline(W - 0.055, L - 0.06);
    const innerGeo = new THREE.ShapeGeometry(innerShape, 48);
    innerGeo.rotateX(-Math.PI / 2);

    const soundboard = new THREE.Mesh(innerGeo, this.mat.wood);
    soundboard.position.set(0, -0.1, -0.028);
    soundboard.receiveShadow = true;
    body.add(soundboard);

    const plate = new THREE.Mesh(innerGeo.clone(), this.mat.plate);
    plate.position.set(0, -0.062, -0.028);
    plate.scale.set(0.96, 1, 0.95);
    body.add(plate);

    // lubang pelat
    for (let i = 0; i < 4; i++) {
      const rr = 0.045 + i * 0.014;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.03, 20), this.mat.wood);
      hole.position.set((i - 1.6) * 0.15, -0.07, -(0.45 + i * 0.17) * L * 0.55 - whiteLen);
      body.add(hole);
    }

    // senar: membentang dari pinblock (dekat tuts) ke arah ekor
    const strings = new THREE.Group();
    strings.position.y = -0.048;
    body.add(strings);
    const zPin = -whiteLen - 0.075;
    const nStr = 56;
    for (let i = 0; i < nStr; i++) {
      const t = i / (nStr - 1);
      const x = -W / 2 + 0.07 + t * (W - 0.14);
      const len = (0.2 + Math.pow(1 - t, 1.5) * 1.3) * (L / 1.8);
      const bass = t < 0.2;
      const r = bass ? 0.0017 : 0.0009;
      const geo = new THREE.CylinderGeometry(r, r, len, 5, 1, true);
      geo.rotateX(Math.PI / 2);
      const s = new THREE.Mesh(geo, bass ? this.mat.copper : this.mat.steel);
      s.position.set(x, 0, zPin - len / 2);
      s.rotation.y = (t - 0.5) * 0.1;
      strings.add(s);
    }
    this.strings = strings;

    // bridge
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.72, 0.024, 0.028),
      new THREE.MeshStandardMaterial({ color: 0x5d3c1f, roughness: 0.55 })
    );
    bridge.position.set(0.02, -0.055, -L * 0.55);
    bridge.rotation.y = -0.08;
    body.add(bridge);

    // ---- tutup (lid) terbuka, berengsel di sisi bass (kiri) ----
    const lidGeo = extrudeCase(grandOutline(W, L), 0.017, { bevelThickness: 0.003, bevelSize: 0.003 });
    lidGeo.translate(W / 2, 0, 0); // engsel di x = 0 lokal pivot
    const lid = new THREE.Mesh(lidGeo, this.mat.lacquer);
    lid.castShadow = true;
    lid.receiveShadow = true;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(-W / 2, 0.012, 0);
    lidPivot.rotation.z = 0.58; // terangkat ke atas
    lidPivot.add(lid);
    body.add(lidPivot);
    this.lidPivot = lidPivot;

    // penyangga lid
    const prop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.46, 10),
      new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.35, metalness: 0.35 })
    );
    prop.position.set(W * 0.3, 0.2, -L * 0.34);
    prop.rotation.z = -0.34;
    prop.castShadow = true;
    body.add(prop);

    // ---- area tuts: keybed, pipi, fallboard ----
    const keybed = new THREE.Mesh(
      new THREE.BoxGeometry(this.kbWidth + 0.012, 0.026, whiteLen + 0.03),
      this.mat.lacquerSoft
    );
    keybed.position.set(0, -0.015, -whiteLen / 2 - 0.012);
    keybed.receiveShadow = true;
    body.add(keybed);

    // keyslip (bilah tipis di depan tuts)
    const keyslip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.026, 0.016), this.mat.lacquer);
    keyslip.position.set(0, whiteH * 0.45, 0.018);
    keyslip.castShadow = true;
    body.add(keyslip);

    // balok pipi kiri/kanan
    const cheekGeo = new THREE.BoxGeometry(0.046, 0.082, whiteLen + 0.05);
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(cheekGeo, this.mat.lacquer);
      cheek.position.set(sx * (this.kbWidth / 2 + 0.025), 0.03, -whiteLen / 2 + 0.005);
      cheek.castShadow = true;
      body.add(cheek);
    }

    // fallboard / nameboard di belakang tuts
    const nameboard = new THREE.Mesh(new THREE.BoxGeometry(W, 0.085, 0.032), this.mat.lacquer);
    nameboard.position.set(0, 0.036, -whiteLen - 0.028);
    nameboard.castShadow = true;
    body.add(nameboard);

    // logo emas
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 1024; logoCanvas.height = 160;
    const lg = logoCanvas.getContext('2d');
    lg.font = 'bold 74px Georgia, serif';
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    lg.fillStyle = '#caa24e';
    lg.fillText('P I A L N O', 512, 86);
    const logoTex = new THREE.CanvasTexture(logoCanvas);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.0406),
      new THREE.MeshBasicMaterial({ map: logoTex, transparent: true })
    );
    logo.position.set(0, 0.042, -whiteLen - 0.0115);
    body.add(logo);

    // felt merah di pangkal tuts
    const feltStrip = new THREE.Mesh(new THREE.BoxGeometry(this.kbWidth, 0.005, 0.012), this.mat.felt);
    feltStrip.position.set(0, whiteH * 0.4, -whiteLen - 0.008);
    body.add(feltStrip);

    // music desk (sandaran partitur) — di belakang fallboard, miring
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.6, 0.185, 0.011),
      new THREE.MeshPhysicalMaterial({ color: 0x131318, roughness: 0.28, clearcoat: 0.7 })
    );
    desk.position.set(0, 0.135, -whiteLen - 0.085);
    desk.rotation.x = 0.3;
    desk.castShadow = true;
    body.add(desk);

    // ---- kaki, roda, lyre, pedal ----
    const legGeo = new THREE.CylinderGeometry(0.034, 0.048, bodyY - 0.03, 16);
    const legPos = [
      [-W / 2 + 0.11, front - 0.1],
      [W / 2 - 0.11, front - 0.1],
      [-W * 0.05, front - L + 0.14],
    ];
    for (const [x, z] of legPos) {
      const leg = new THREE.Mesh(legGeo, this.mat.lacquer);
      leg.position.set(x, (bodyY - 0.03) / 2 + 0.03, z);
      leg.castShadow = true;
      this.group.add(leg);
      const caster = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), this.mat.brass);
      caster.position.set(x, 0.03, z);
      caster.scale.y = 0.75;
      caster.castShadow = true;
      this.group.add(caster);
    }

    // lyre + pedal (di bawah, sedikit ke depan)
    const lyre = new THREE.Group();
    lyre.position.set(0, 0, front - 0.16);
    this.group.add(lyre);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.42, 0.028), this.mat.lacquer);
      post.position.set(sx * 0.075, bodyY - 0.26, 0);
      post.rotation.z = -sx * 0.05;
      post.castShadow = true;
      lyre.add(post);
    }
    const pedalBox = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.048, 0.095), this.mat.lacquer);
    pedalBox.position.set(0, bodyY - 0.47, 0.01);
    pedalBox.castShadow = true;
    lyre.add(pedalBox);

    this.pedals = [];
    for (let i = -1; i <= 1; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(i * 0.072, bodyY - 0.475, 0.04);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.11), this.mat.brass);
      pedal.position.z = 0.052;
      pedal.castShadow = true;
      pivot.add(pedal);
      lyre.add(pivot);
      this.pedals.push(pivot);
    }

    // bangku
    const bench = new THREE.Group();
    bench.position.set(0, 0, front + 0.62);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.31), this.mat.lacquer);
    seat.position.y = 0.5;
    seat.castShadow = true;
    bench.add(seat);
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.032, 0.27),
      new THREE.MeshStandardMaterial({ color: 0x15171e, roughness: 0.92 })
    );
    cushion.position.y = 0.537;
    bench.add(cushion);
    for (const [bx, bz] of [[-0.28, -0.115], [0.28, -0.115], [-0.28, 0.115], [0.28, 0.115]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.019, 0.5, 10), this.mat.lacquer);
      l.position.set(bx, 0.25, bz);
      l.castShadow = true;
      bench.add(l);
    }
    this.group.add(bench);
    this.bench = bench;
  }

  // ---------- geometri tuts ----------
  /** Tuts putih: profil khas dengan takik untuk tuts hitam tetangga. */
  _whiteKeyGeometry(midi) {
    const { whiteW, whiteGap, whiteLen, whiteH, blackLenRatio, blackWRatio } = KEY;
    const semi = midi % 12;
    const backLen = whiteLen * blackLenRatio; // bagian sempit (di antara tuts hitam)
    const bwHalf = (whiteW * blackWRatio) / 2 / whiteW; // setengah lebar tuts hitam (satuan whiteW)

    const idx = whiteIndexInOctave(semi);
    const fl0 = idx, fr0 = idx + 1;
    const pb = PREV_BLACK[semi], nb = NEXT_BLACK[semi];
    const bl0 = pb !== null ? BLACK_CENTERS[pb] + bwHalf : fl0;
    const br0 = nb !== null ? BLACK_CENTERS[nb] - bwHalf : fr0;

    const cx = fl0 + 0.5;
    const g = whiteGap / 2;
    const fl = (fl0 - cx) * whiteW + g;
    const fr = (fr0 - cx) * whiteW - g;
    const bl = (bl0 - cx) * whiteW + g;
    const br = (br0 - cx) * whiteW - g;

    // shape pada bidang (x, u); u = 0 di ujung depan, u = whiteLen di pangkal
    const s = new THREE.Shape();
    const r = 0.0025;
    s.moveTo(fl, r);
    s.quadraticCurveTo(fl, 0, fl + r, 0);
    s.lineTo(fr - r, 0);
    s.quadraticCurveTo(fr, 0, fr, r);
    s.lineTo(fr, whiteLen - backLen);
    s.lineTo(br, whiteLen - backLen);
    s.lineTo(br, whiteLen);
    s.lineTo(bl, whiteLen);
    s.lineTo(bl, whiteLen - backLen);
    s.lineTo(fl, whiteLen - backLen);
    s.closePath();

    const geo = new THREE.ExtrudeGeometry(s, {
      depth: whiteH, bevelEnabled: true,
      bevelThickness: 0.0011, bevelSize: 0.0011, bevelSegments: 1, curveSegments: 3,
    });
    // (x, u, d) -> (x, d, -u): u ke belakang, tebal ke atas
    geo.rotateX(-Math.PI / 2);
    // pivot di pangkal: geser agar pangkal ada di z = 0, ujung depan di z = +whiteLen
    geo.translate(0, 0, whiteLen);
    return geo;
  }

  _blackKeyGeometry() {
    const { whiteW, whiteLen, blackLenRatio, blackRise, whiteH } = KEY;
    const w = whiteW * KEY.blackWRatio;
    const len = whiteLen * blackLenRatio;
    const h = blackRise + whiteH * 0.6;

    const geo = new THREE.BoxGeometry(w, h, len, 1, 2, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y > h * 0.2) {
        pos.setX(i, x * 0.84);                 // permukaan atas menyempit
        if (z > 0) pos.setZ(i, z - len * 0.06); // ujung depan miring
      }
    }
    geo.computeVertexNormals();
    geo.translate(0, h / 2, len / 2); // pivot di pangkal, dasar di y = 0
    return geo;
  }

  _buildKeys() {
    const { whiteLen, whiteH, blackLenRatio, blackRise } = KEY;
    const keyboard = new THREE.Group();
    keyboard.position.set(0, 0, -whiteLen); // pivot tuts di z = -whiteLen
    this.body.add(keyboard);
    this.keyboard = keyboard;

    const blackGeo = this._blackKeyGeometry();
    const blackH = blackRise + whiteH * 0.6;

    for (let midi = this.startMidi; midi <= this.endMidi; midi++) {
      const black = isBlackKey(midi);
      const pivot = new THREE.Group();
      pivot.position.set(this.keyX(midi), black ? whiteH - whiteH * 0.6 + 0.0 : 0, 0);

      let mesh;
      if (black) {
        mesh = new THREE.Mesh(blackGeo, this.mat.ebony);
        pivot.position.y = whiteH * 0.4;
      } else {
        mesh = new THREE.Mesh(this._whiteKeyGeometry(midi), this.mat.ivory);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.midi = midi;
      pivot.add(mesh);
      keyboard.add(pivot);

      // label di permukaan tuts, dekat ujung depan
      const noteName = midiToName(midi);
      const topY = black ? blackH + 0.0008 : whiteH + 0.0007;
      const labelZ = black ? whiteLen * blackLenRatio - 0.017 : whiteLen - 0.015;
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.0155, 0.0155),
        new THREE.MeshBasicMaterial({ map: labelTexture(noteName, black), transparent: true, depthWrite: false })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(0, topY, labelZ);
      label.renderOrder = 2;
      pivot.add(label);

      this.keys.set(midi, {
        midi, mesh, pivot, black, label, noteName,
        topY, target: 0, current: 0, vel: 0, glow: 0,
      });
      this.keyMeshes.push(mesh);
    }
  }

  _buildGlow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,150,0.95)');
    gr.addColorStop(0.35, 'rgba(255,172,72,0.4)');
    gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    this.glows = new Map();
    for (const [midi, k] of this.keys) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      }));
      sp.scale.set(0.07, 0.07, 1);
      sp.position.set(0, k.topY + 0.008, KEY.whiteLen * (k.black ? KEY.blackLenRatio : 1) - 0.035);
      k.pivot.add(sp);
      this.glows.set(midi, sp);
    }
  }

  // ---------- API ----------
  pressKey(midi, velocity = 0.8) {
    const k = this.keys.get(midi);
    if (!k) return;
    k.target = 1;
    k.glow = Math.min(1, 0.45 + velocity * 0.7);
    this.pressedSet.add(midi);
  }

  releaseKey(midi) {
    const k = this.keys.get(midi);
    if (!k) return;
    k.target = 0;
    this.pressedSet.delete(midi);
  }

  setPedal(down) {
    this._pedalTarget = down ? 1 : 0;
  }

  setLabels({ noteNames = true, letters = null } = {}) {
    for (const [midi, k] of this.keys) {
      const txt = letters && letters[midi] ? letters[midi] : (noteNames ? k.noteName : null);
      k.label.visible = !!txt;
      if (!txt) continue;
      k.label.material.map = labelTexture(txt, k.black);
      k.label.material.needsUpdate = true;
    }
  }

  update(dt) {
    for (const [midi, k] of this.keys) {
      // pegas teredam menuju posisi target
      k.vel += (k.target - k.current) * 260 * dt;
      k.vel *= Math.exp(-24 * dt);
      k.current += k.vel * dt;
      if (k.current < 0) { k.current = 0; k.vel *= -0.22; }
      if (k.current > 1.15) { k.current = 1.15; k.vel = 0; }
      k.pivot.rotation.x = k.current * KEY.dip; // ujung depan turun

      if (k.glow > 0) {
        k.glow = Math.max(0, k.glow - dt * (k.target ? 0.85 : 2.4));
        const sp = this.glows.get(midi);
        sp.material.opacity = k.glow * 0.8;
        const s = 0.055 + (1 - k.glow) * 0.05;
        sp.scale.set(s, s, 1);
      }
    }

    this._pedalCur += (this._pedalTarget - this._pedalCur) * Math.min(1, dt * 14);
    if (this.pedals) this.pedals[1].rotation.x = -this._pedalCur * 0.2;

    if (this.strings) {
      const amt = Math.min(1, this.pressedSet.size / 6);
      this.strings.position.y = -0.048 + Math.sin(performance.now() * 0.02) * 0.0004 * amt;
    }
  }
}
