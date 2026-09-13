/**
 * Teori musik ringan + tata letak tuts + pemetaan keyboard.
 * Semua nada memakai nomor MIDI. C4 = 60.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

/** Rentang piano yang dipakai game: C4 (60) sampai C6 (84) = 25 tuts. */
export const LOW_MIDI = 60;
export const HIGH_MIDI = 84;

/** Dimensi tuts dalam satuan dunia 3D. */
export const GEO = {
  whiteW: 1.0,
  whiteH: 0.44,
  whiteD: 5.4,
  blackW: 0.58,
  blackH: 0.66,
  blackD: 3.25,
  blackLift: 0.36,
  keyTop: 0, // permukaan tuts putih berada di y = 0
};

export function isBlack(midi) {
  return BLACK_PCS.has(((midi % 12) + 12) % 12);
}

export function noteName(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Geser oktaf agar nada masuk ke rentang tuts piano. */
export function fitRange(midi) {
  let m = midi;
  while (m < LOW_MIDI) m += 12;
  while (m > HIGH_MIDI) m -= 12;
  return m;
}

/** Warna per kelas nada (gaya Synthesia). */
export const PITCH_COLORS = [
  0xff4d6d, 0xff8a4d, 0xffd24d, 0xd7e34d, 0x7ee081, 0x4ddbb4, 0x4dc7ff, 0x5b8cff, 0x8a6bff, 0xc86bff,
  0xff6bd6, 0xff6b9d,
];

export function pitchColor(midi) {
  return PITCH_COLORS[((midi % 12) + 12) % 12];
}

/* ------------------------------------------------------------------ */
/* Tata letak tuts                                                     */
/* ------------------------------------------------------------------ */

/**
 * Hitung posisi X setiap tuts. Tuts putih berderet, tuts hitam duduk di
 * antara dua tuts putih.
 */
export function buildKeyboard(low = LOW_MIDI, high = HIGH_MIDI) {
  const midis = [];
  for (let m = low; m <= high; m++) midis.push(m);
  const whites = midis.filter((m) => !isBlack(m));
  const n = whites.length;
  const whiteIndex = new Map();
  whites.forEach((m, i) => whiteIndex.set(m, i));

  const keys = midis.map((midi) => {
    const black = isBlack(midi);
    let x;
    if (!black) {
      const i = whiteIndex.get(midi);
      x = (i - (n - 1) / 2) * GEO.whiteW;
    } else {
      // tuts hitam: di batas antara tuts putih kiri & kanan
      const left = midi - 1;
      const li = whiteIndex.get(left);
      const base = li !== undefined ? li : 0;
      x = (base - (n - 1) / 2) * GEO.whiteW + GEO.whiteW / 2;
      // offset halus seperti piano asli (nada hitam setelah E/B sedikit maju)
      const pc = midi % 12;
      if (pc === 1 || pc === 6) x -= GEO.whiteW * 0.045;
      else if (pc === 3 || pc === 10) x += GEO.whiteW * 0.045;
    }
    return { midi, black, x, index: black ? -1 : whiteIndex.get(midi) };
  });

  return {
    keys,
    whiteCount: n,
    width: n * GEO.whiteW,
    byMidi: new Map(keys.map((k) => [k.midi, k])),
    frontZ: GEO.whiteD / 2,
    backZ: -GEO.whiteD / 2,
  };
}

/* ------------------------------------------------------------------ */
/* Pemetaan keyboard fisik                                             */
/* ------------------------------------------------------------------ */

/** event.code -> nomor MIDI */
export const KEY_CODES = {
  KeyA: 60,
  KeyW: 61,
  KeyS: 62,
  KeyE: 63,
  KeyD: 64,
  KeyF: 65,
  KeyT: 66,
  KeyG: 67,
  KeyY: 68,
  KeyH: 69,
  KeyU: 70,
  KeyJ: 71,
  KeyK: 72,
  KeyO: 73,
  KeyL: 74,
  KeyP: 75,
  Semicolon: 76,
  Quote: 77,
  BracketRight: 78,
  KeyZ: 79,
  KeyX: 80,
  KeyC: 81,
  KeyV: 82,
  KeyB: 83,
  KeyN: 84,
};

/** Label tampilan untuk setiap kode tombol. */
export const CODE_LABEL = {
  KeyA: 'A',
  KeyW: 'W',
  KeyS: 'S',
  KeyE: 'E',
  KeyD: 'D',
  KeyF: 'F',
  KeyT: 'T',
  KeyG: 'G',
  KeyY: 'Y',
  KeyH: 'H',
  KeyU: 'U',
  KeyJ: 'J',
  KeyK: 'K',
  KeyO: 'O',
  KeyL: 'L',
  KeyP: 'P',
  Semicolon: ';',
  Quote: "'",
  BracketRight: ']',
  KeyZ: 'Z',
  KeyX: 'X',
  KeyC: 'C',
  KeyV: 'V',
  KeyB: 'B',
  KeyN: 'N',
};

/** midi -> event.code (untuk tampilan petunjuk & auto-detect). */
export const MIDI_TO_CODE = Object.fromEntries(Object.entries(KEY_CODES).map(([c, m]) => [m, c]));

/* ------------------------------------------------------------------ */
/* Akor                                                                */
/* ------------------------------------------------------------------ */

const QUALITIES = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m6: [0, 3, 7, 9],
  6: [0, 4, 7, 9],
  add9: [0, 4, 7, 14],
  '7sus4': [0, 5, 7, 10],
};

const ROOT_PC = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

/** 'C5' / 'F#4' / 'Bb3' -> nomor MIDI */
export function noteToMidi(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(String(name).trim());
  if (!m) throw new Error(`Nama nada tidak dikenal: ${name}`);
  const key = m[1] + (m[2] === 'b' ? 'b' : m[2] === '#' ? '#' : '');
  const pc = ROOT_PC[key];
  if (pc === undefined) throw new Error(`Nama nada tidak dikenal: ${name}`);
  return 12 * (parseInt(m[3], 10) + 1) + pc;
}

/** 'F#m7' -> { root: 6, intervals: [...] } */
export function parseChord(name) {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(name.trim());
  if (!m) return null;
  const root = ROOT_PC[m[1]];
  const q = m[2] || '';
  return { root, intervals: QUALITIES[q] || QUALITIES[''], quality: q };
}

/** Nada-nada akor sebagai nomor MIDI pada oktaf tertentu. */
export function chordMidis(name, octave = 4) {
  const c = parseChord(name);
  if (!c) return [];
  const base = 12 * (octave + 1) + c.root;
  return c.intervals.map((i) => base + i);
}
