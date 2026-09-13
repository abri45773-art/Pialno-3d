/**
 * PianoAudio — mesin suara piano berbasis Web Audio API.
 *
 * Setiap not disintesis dari beberapa parsial sinus dengan inharmonisitas
 * (seperti dawai asli), ditambah transien "hammer noise" dan resonansi.
 * Tidak butuh file sampel sama sekali.
 */

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" | "Eb3" | "A0" -> nomor MIDI */
export function noteToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Nama not tidak valid: ${name}`);
  let semi = NOTE_INDEX[m[1].toUpperCase()];
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  return semi + (parseInt(m[3], 10) + 1) * 12;
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToName(midi) {
  return SHARP_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class PianoAudio {
  constructor() {
    this.ctx = null;
    this.voices = new Map(); // midi -> voice
    this.sustain = false;
    this.heldByPedal = new Set();
    this._volume = 0.75;
    this._reverb = 0.34;
    this._tone = 0.55;
  }

  /** Harus dipanggil dari gestur pengguna (klik) agar AudioContext aktif. */
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // Rantai master: [voices] -> toneFilter -> {dry, wet->convolver} -> comp -> out
    this.busIn = ctx.createGain();

    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = this._toneHz(this._tone);
    this.toneFilter.Q.value = 0.3;

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this._makeImpulse(2.6, 2.4);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 16;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.22;

    // limiter pengaman agar akord tebal tidak clipping
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;

    this.master = ctx.createGain();
    this.master.gain.value = this._volume;

    this.busIn.connect(this.toneFilter);
    this.toneFilter.connect(this.dry);
    this.toneFilter.connect(this.wet);
    this.wet.connect(this.convolver);
    this.convolver.connect(this.comp);
    this.dry.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this._applyMix();

    // Buffer noise untuk transien palu (hammer)
    this.noiseBuffer = this._makeNoise(0.4);

    if (ctx.state === 'suspended') await ctx.resume();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------- kontrol ----------
  setVolume(v) {
    this._volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setReverb(v) {
    this._reverb = v;
    if (this.ctx) this._applyMix();
  }

  setTone(v) {
    this._tone = v;
    if (this.toneFilter) {
      this.toneFilter.frequency.setTargetAtTime(this._toneHz(v), this.ctx.currentTime, 0.05);
    }
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      for (const midi of [...this.heldByPedal]) {
        if (!this.voices.get(midi)?.keyDown) this._release(midi);
      }
      this.heldByPedal.clear();
    }
  }

  _toneHz(v) {
    return 700 * Math.pow(2, v * 4.6); // ~700 Hz .. ~17 kHz
  }

  _applyMix() {
    const t = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(this._reverb * 0.85, t, 0.05);
    this.dry.gain.setTargetAtTime(1 - this._reverb * 0.42, t, 0.05);
  }

  // ---------- buffer helper ----------
  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Impulse response reverb prosedural (ruang konser kecil). */
  _makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        // early reflections tipis + tail difus, dilembutkan lowpass 1-pole
        const n = (Math.random() * 2 - 1) * env;
        lp += (n - lp) * 0.36;
        d[i] = lp * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
      }
    }
    return buf;
  }

  // ---------- pemutaran not ----------
  /**
   * @param {number} midi  nomor not MIDI
   * @param {number} velocity 0..1
   * @param {number} [when] waktu AudioContext (default: sekarang)
   */
  noteOn(midi, velocity = 0.8, when) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const v = Math.min(1, Math.max(0.05, velocity));

    // Retrigger: matikan cepat suara lama pada not yang sama
    const old = this.voices.get(midi);
    if (old) this._kill(midi, 0.03);

    const f0 = midiToFreq(midi);
    const out = ctx.createGain();
    out.gain.value = 0;

    // Filter per-not: makin keras dipukul, makin cerah
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(Math.min(16000, f0 * (7 + 16 * v)), t0);
    lpf.frequency.setTargetAtTime(Math.min(16000, f0 * (3 + 5 * v)), t0, 0.35);
    lpf.Q.value = 0.0001;
    lpf.connect(out);
    out.connect(this.busIn);

    // Loudness & durasi bergantung register (bass panjang, treble pendek)
    const pitchN = (midi - 21) / 87; // 0..1
    const baseDecay = 16 * Math.pow(0.5, pitchN * 3.6) + 0.6; // ~16s bass .. ~1.9s treble
    const peak = (0.115 + 0.21 * v) * (1.25 - 0.45 * pitchN);

    // Inharmonisitas dawai
    const B = 0.0004 + 0.0016 * Math.pow(pitchN, 2.2);
    const partials = midi > 84 ? 5 : midi > 60 ? 8 : 11;

    const oscs = [];
    for (let n = 1; n <= partials; n++) {
      const freq = f0 * n * Math.sqrt(1 + B * n * n);
      if (freq > 18000) break;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      // sedikit "pitch drop" saat dipukul keras — khas dawai piano
      osc.frequency.setTargetAtTime(freq * (1 - 0.0015 * v), t0, 0.06);
      osc.detune.value = (Math.random() * 2 - 1) * (2 + n * 0.7);

      const g = ctx.createGain();
      // amplitudo parsial: makin tinggi makin lemah, dipengaruhi velocity
      const tilt = 1.05 + 0.85 * (1 - v);
      let amp = (1 / Math.pow(n, tilt)) * (n % 2 === 0 ? 0.72 : 1);
      amp *= peak;

      const atk = 0.002 + 0.004 * (1 - v) + pitchN * -0.001;
      const dec = baseDecay / Math.pow(n, 0.62);

      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + Math.max(0.0015, atk));
      // peluruhan dua tahap: cepat lalu "aftersound" panjang
      g.gain.setTargetAtTime(amp * 0.26, t0 + atk, dec * 0.12);
      g.gain.setTargetAtTime(0.0001, t0 + atk + dec * 0.22, dec * 0.42);

      osc.connect(g);
      g.connect(lpf);
      osc.start(t0);
      oscs.push({ osc, g });
    }

    // Transien palu: klik noise singkat, difilter di sekitar pitch
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = 0.8 + Math.random() * 0.4;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.min(9000, f0 * 5.5);
    nf.Q.value = 0.7;
    const ng = ctx.createGain();
    const nAmp = 0.05 * v * (0.5 + pitchN * 0.9);
    ng.gain.setValueAtTime(0, t0);
    ng.gain.linearRampToValueAtTime(nAmp, t0 + 0.0015);
    ng.gain.exponentialRampToValueAtTime(0.00008, t0 + 0.07 + 0.05 * (1 - pitchN));
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(lpf);
    noise.start(t0);
    noise.stop(t0 + 0.4);

    out.gain.setValueAtTime(1, t0);

    const voice = { oscs, out, lpf, noise, keyDown: true, startedAt: t0, stopAt: t0 + baseDecay + 1 };
    this.voices.set(midi, voice);

    // bersih-bersih otomatis kalau tidak ada noteOff (mis. dilepas via pedal)
    voice.timer = setTimeout(() => {
      if (this.voices.get(midi) === voice) this._kill(midi, 0.2);
    }, (baseDecay + 1.5) * 1000);

    return voice;
  }

  noteOff(midi, when) {
    const voice = this.voices.get(midi);
    if (!voice) return;
    voice.keyDown = false;
    if (this.sustain) {
      this.heldByPedal.add(midi);
      return;
    }
    this._release(midi, when);
  }

  /** Damper turun: peluruhan cepat, lebih lambat di bass. */
  _release(midi, when) {
    const voice = this.voices.get(midi);
    if (!voice || !this.ctx) return;
    const t = Math.max(when ?? this.ctx.currentTime, this.ctx.currentTime);
    const damp = midi < 45 ? 0.16 : midi < 70 ? 0.1 : 0.055;
    voice.out.gain.cancelScheduledValues(t);
    voice.out.gain.setValueAtTime(voice.out.gain.value, t);
    voice.out.gain.setTargetAtTime(0.0001, t, damp);
    this._scheduleKill(midi, voice, t + damp * 6);
  }

  _scheduleKill(midi, voice, at) {
    clearTimeout(voice.timer);
    const delay = Math.max(0, (at - this.ctx.currentTime) * 1000);
    voice.timer = setTimeout(() => {
      if (this.voices.get(midi) === voice) this._kill(midi, 0.02);
    }, delay);
  }

  _kill(midi, fade = 0.02) {
    const voice = this.voices.get(midi);
    if (!voice) return;
    this.voices.delete(midi);
    clearTimeout(voice.timer);
    const t = this.ctx.currentTime;
    try {
      voice.out.gain.cancelScheduledValues(t);
      voice.out.gain.setValueAtTime(voice.out.gain.value, t);
      voice.out.gain.linearRampToValueAtTime(0, t + fade);
    } catch (e) { /* noop */ }
    for (const { osc } of voice.oscs) {
      try { osc.stop(t + fade + 0.01); } catch (e) { /* noop */ }
    }
    setTimeout(() => {
      try { voice.out.disconnect(); voice.lpf.disconnect(); } catch (e) { /* noop */ }
    }, (fade + 0.06) * 1000);
  }

  allNotesOff() {
    this.heldByPedal.clear();
    for (const midi of [...this.voices.keys()]) this._kill(midi, 0.08);
  }
}
