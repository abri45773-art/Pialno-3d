/**
 * Falling notes: balok cahaya yang turun ke tuts (gaya Synthesia),
 * memakai InstancedMesh agar ringan.
 */
import * as THREE from 'three';
import { KEY } from './piano.js';

const MAX = 256;

export class FallingNotes {
  /**
   * @param {import('./piano.js').Piano3D} piano
   * @param {object} opt
   */
  constructor(piano, { lead = 2.6, height = 0.9 } = {}) {
    this.piano = piano;
    this.lead = lead;        // detik sebelum not dibunyikan
    this.height = height;    // tinggi jatuh (meter)
    this.items = [];         // { midi, time, dur, done }
    this.enabled = true;

    const geo = new THREE.BoxGeometry(1, 1, 1);

    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;

    this.group = new THREE.Group();
    this.group.add(this.mesh);
    piano.body.add(this.group);
    this.group.position.set(0, 0, -KEY.whiteLen);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  setEnabled(v) {
    this.enabled = v;
    this.group.visible = v;
    if (!v) this.items.length = 0;
  }

  /** @param {{midi:number,time:number,dur:number}[]} notes  waktu relatif terhadap `startAt` */
  schedule(notes, startAt) {
    this.items = notes.map((n) => ({ midi: n.midi, at: startAt + n.time, dur: n.dur }));
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }

  /** @param {number} now waktu "transport" saat ini (detik, sama basis dengan schedule) */
  update(now) {
    if (!this.enabled) return;
    let i = 0;
    const H = this.height;
    const lead = this.lead;

    for (const it of this.items) {
      const tToHit = it.at - now;
      if (tToHit > lead || tToHit < -it.dur - 0.35) continue;
      if (i >= MAX) break;

      const k = this.piano.keys.get(it.midi);
      if (!k) continue;

      // progres 0 (baru muncul, tinggi) .. 1 (menyentuh tuts)
      const prog = 1 - tToHit / lead;
      const len = Math.max(0.02, (it.dur / lead) * H);
      const y = KEY.whiteH + 0.004 + Math.max(0, (1 - prog) * H);
      const fade = tToHit < 0 ? Math.max(0, 1 + tToHit / 0.3) : Math.min(1, prog * 3.2);

      const w = (k.black ? KEY.whiteW * KEY.blackWRatio : KEY.whiteW) * 0.72;
      this._p.set(this.piano.keyX(it.midi), y + len / 2, KEY.whiteLen * (k.black ? KEY.blackLenRatio : 1) * 0.62);
      this._s.set(w, len, 0.006);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);

      // warna: hitam = ungu-biru, putih = amber
      if (k.black) this._c.setHSL(0.58, 0.85, 0.42 + fade * 0.22);
      else this._c.setHSL(0.09, 0.95, 0.44 + fade * 0.22);
      this.mesh.setColorAt(i, this._c);
      i++;
    }

    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
