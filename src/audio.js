import { midiToFreq } from './music.js';

/**
 * Mesin audio piano: sintesis aditif berbasis PeriodicWave + noise "palu",
 * filter lowpass yang menutup seiring waktu, reverb konvolusi (IR dibuat
 * secara prosedural), kompresor, dan pedal sustain.
 *
 * Tidak ada berkas sampel — semua suara dihasilkan runtime.
 */
export class PianoAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.voices = new Map(); // midi -> Array<Voice>
    this.sustained = new Map(); // midi -> Array<Voice> (ditahan pedal)
    this.sustain = false;
    this.volume = 0.8;
    this.reverbAmount = 0.35;
    this.tone = 0.6;
    this.uiSound = true;
    this.level = 0;
    this._levelData = null;
    this.maxVoices = 48;
  }

  /** Buat AudioContext dan seluruh rantai efek. */
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // --- rantai master -------------------------------------------------
    this.bus = ctx.createGain(); // semua nada masuk sini
    this.bus.gain.value = 1;

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.92;

    this.wet = ctx.createGain();
    this.wet.gain.value = this.reverbAmount;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this._makeImpulse(2.6, 2.8);

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 3.4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.72;
    this._levelData = new Float32Array(this.analyser.fftSize);

    this.bus.connect(this.dry).connect(this.master);
    this.bus.connect(this.wet).connect(this.convolver).connect(this.master);
    this.master.connect(this.comp).connect(this.analyser).connect(ctx.destination);

    // --- gelombang nada -------------------------------------------------
    this.waveWarm = this._makeWave([1, 0.42, 0.24, 0.12, 0.07, 0.045, 0.03, 0.02, 0.012]);
    this.waveBright = this._makeWave([1, 0.55, 0.34, 0.21, 0.14, 0.1, 0.07, 0.05, 0.035, 0.022, 0.014]);
    this.waveBell = this._makeWave([0.6, 1, 0.5, 0.28, 0.16, 0.09, 0.05, 0.03]);

    // --- buffer noise untuk serangan palu -------------------------------
    this.noise = this._makeNoise(0.6);

    this.ready = true;
    return ctx;
  }

  /** Lanjutkan AudioContext (harus dipanggil dari gestur pengguna). */
  async unlock() {
    const ctx = this.init();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* diabaikan */
      }
    }
    return ctx.state === 'running';
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  _makeWave(harmonics) {
    const n = harmonics.length;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    for (let i = 0; i < n; i++) imag[i + 1] = harmonics[i];
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // serangan sangat pendek lalu ekor meluruh eksponensial
        const attack = Math.min(1, i / (rate * 0.006));
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * attack * 0.6;
      }
      // beberapa refleksi awal
      for (let k = 0; k < 7; k++) {
        const idx = Math.floor(rate * (0.012 + k * 0.023 + (ch ? 0.006 : 0)));
        if (idx < len) d[idx] += (k % 2 ? -1 : 1) * 0.28 * Math.pow(0.72, k);
      }
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setReverb(v) {
    this.reverbAmount = v;
    if (this.wet) this.wet.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setTone(v) {
    this.tone = v;
  }

  /** Nada dinyalakan. velocity 0..1 */
  noteOn(midi, velocity = 0.85, when = 0) {
    if (!this.ready) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const vel = Math.max(0.06, Math.min(1, velocity));
    const freq = midiToFreq(midi);

    // buang suara lama pada nada yang sama agar tidak menumpuk
    this._killVoices(midi, 0.03);

    const decay = Math.min(5.2, Math.max(0.85, 5.4 * Math.pow(0.93, midi - 58)));
    const voice = {};
    voice.stopAt = t + decay + 0.4;
    voice.midi = midi;
    voice.born = t;

    const gain = ctx.createGain();
    const peak = 0.3 * vel + 0.03;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(peak * 0.42, t + decay * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0006, t + decay);
    voice.gain = gain;

    // filter: nada tinggi lebih redup, menutup seiring waktu
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    const bright = 0.35 + this.tone * 1.1;
    const cut = Math.min(15000, (freq * 7 + 900) * bright * (0.55 + 0.5 * vel));
    filt.frequency.setValueAtTime(cut, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(260, cut * 0.18), t + decay * 0.8);
    filt.Q.value = 0.5;
    voice.filter = filt;

    // panning: nada rendah ke kiri, tinggi ke kanan (seperti duduk di depan piano)
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = Math.max(-0.62, Math.min(0.62, ((midi - 72) / 16) * 0.62));
      voice.pan = pan;
    }

    // osilator utama (+ satu sedikit detune untuk lebar)
    const oscA = ctx.createOscillator();
    oscA.frequency.value = freq;
    oscA.setPeriodicWave(midi < 64 ? this.waveWarm : this.waveBright);
    oscA.detune.value = -3;

    const oscB = ctx.createOscillator();
    oscB.frequency.value = freq;
    oscB.setPeriodicWave(midi < 70 ? this.waveBell : this.waveBright);
    oscB.detune.value = 6;
    const gB = ctx.createGain();
    gB.gain.value = 0.28 * (1 - Math.min(0.6, (midi - 55) / 60));

    oscA.connect(filt);
    oscB.connect(gB).connect(filt);
    filt.connect(gain);
    if (pan) gain.connect(pan).connect(this.bus);
    else gain.connect(this.bus);

    oscA.start(t);
    oscB.start(t);
    oscA.stop(t + decay + 0.5);
    oscB.stop(t + decay + 0.5);
    voice.osc = [oscA, oscB];

    // noise serangan palu
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    noise.playbackRate.value = 0.8 + Math.random() * 0.5;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.min(9000, freq * 3.2 + 600);
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    const nPeak = 0.06 * vel;
    ng.gain.setValueAtTime(nPeak, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    noise.connect(nf).connect(ng);
    if (pan) ng.connect(pan);
    else ng.connect(this.bus);
    noise.start(t, Math.random() * 0.4);
    noise.stop(t + 0.09);
    voice.noise = noise;

    const list = this.voices.get(midi) || [];
    list.push(voice);
    this.voices.set(midi, list);

    // batasi polifoni: lepas suara paling tua bila melewati batas
    let total = 0;
    for (const arr of this.voices.values()) total += arr.length;
    if (total > this.maxVoices) {
      const all = [];
      for (const arr of this.voices.values()) for (const v of arr) all.push(v);
      all.sort((a, b) => a.born - b.born);
      const excess = total - this.maxVoices;
      for (let i = 0; i < excess; i++) this._releaseVoice(all[i], 0.08);
    }
    return voice;
  }

  /** Nada dilepas (dengan pedal sustain bila aktif). */
  noteOff(midi, release = 0.28) {
    const list = this.voices.get(midi);
    if (!list) return;
    if (this.sustain) {
      const held = this.sustained.get(midi) || [];
      this.sustained.set(midi, held.concat(list));
      this.voices.delete(midi);
      return;
    }
    this.voices.delete(midi);
    for (const v of list) this._releaseVoice(v, release);
  }

  setSustain(on) {
    this.sustain = !!on;
    if (!this.sustain && this.sustained.size) {
      for (const [, list] of this.sustained) {
        for (const v of list) this._releaseVoice(v, 1.1);
      }
      this.sustained.clear();
    }
  }

  allNotesOff(fast = false) {
    for (const list of this.voices.values()) {
      for (const v of list) this._releaseVoice(v, fast ? 0.05 : 0.22);
    }
    this.voices.clear();
    for (const [, list] of this.sustained) for (const v of list) this._releaseVoice(v, 0.06);
    this.sustained.clear();
  }

  _killVoices(midi, release) {
    const list = this.voices.get(midi);
    if (!list) return;
    this.voices.delete(midi);
    for (const v of list) this._releaseVoice(v, release);
  }

  _releaseVoice(voice, release) {
    if (!voice || voice.released) return;
    voice.released = true;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = voice.gain.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0002, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + release);
    } catch {
      /* diabaikan */
    }
    const stop = t + release + 0.05;
    for (const o of voice.osc || []) {
      try {
        o.stop(stop);
      } catch {
        /* sudah berhenti */
      }
    }
  }

  /** Tingkat energi audio (0..1) untuk visual reaktif. */
  updateLevel() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this._levelData);
    let sum = 0;
    const d = this._levelData;
    for (let i = 0; i < d.length; i += 2) sum += d[i] * d[i];
    const rms = Math.sqrt(sum / (d.length / 2));
    const target = Math.min(1, rms * 3.6);
    this.level += (target - this.level) * (target > this.level ? 0.55 : 0.12);
    return this.level;
  }

  /** Efek suara antarmuka. */
  blip(freq = 720, dur = 0.09, type = 'triangle', gain = 0.16) {
    if (!this.uiSound) return;
    if (!this.ready) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.7), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master || ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Klik metronom. */
  click(accent = false) {
    if (!this.ready) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = accent ? 1800 : 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.14 : 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    o.connect(f).connect(g).connect(this.master || ctx.destination);
    o.start(t);
    o.stop(t + 0.06);
  }

  /** Sapuan nada untuk hasil / game over. */
  fanfare(up = true) {
    const notes = up ? [72, 76, 79, 84] : [72, 68, 65, 60];
    const t0 = this.now;
    notes.forEach((m, i) => this.noteOn(m, 0.72, t0 + i * 0.09));
    setTimeout(() => notes.forEach((m) => this.noteOff(m, 0.7)), 340);
  }
}

export const audio = new PianoAudio();
