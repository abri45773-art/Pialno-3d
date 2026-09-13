/**
 * Lagu demo (semuanya domain publik / tradisional).
 * Format not: [waktuKetuk, "namaNot", durasiKetuk, velocity?]
 */
import { noteToMidi } from './audio.js';

function seq(bpm, title, composer, raw) {
  const notes = raw.map(([t, n, d, v = 0.75]) => ({
    time: (t * 60) / bpm,
    midi: noteToMidi(n),
    dur: (d * 60) / bpm,
    vel: v,
  }));
  notes.sort((a, b) => a.time - b.time);
  const duration = notes.reduce((m, n) => Math.max(m, n.time + n.dur), 0) + 1;
  return { title, composer, bpm, notes, duration };
}

/* ---------------- Für Elise (pembuka) ---------------- */
const furElise = (() => {
  const r = [];
  let t = 0;
  const mel = (n, d = 0.5, v = 0.78) => { r.push([t, n, d, v]); t += d; };
  const chord = (arr, at, d, v = 0.6) => arr.forEach((n) => r.push([at, n, d, v]));

  const themeA = () => {
    mel('E5', 0.5); mel('D#5', 0.5); mel('E5', 0.5); mel('D#5', 0.5);
    mel('E5', 0.5); mel('B4', 0.5); mel('D5', 0.5); mel('C5', 0.5);
    const at = t;
    chord(['A3', 'E4'], at, 1.5, 0.5);
    mel('A4', 0.5); mel('C4', 0.5); mel('E4', 0.5);
    const at2 = t;
    chord(['E3'], at2, 1.5, 0.5);
    mel('A4', 0.5); mel('B4', 0.5); mel('E4', 0.5);
    const at3 = t;
    chord(['A3'], at3, 1.5, 0.5);
    mel('C5', 0.5); mel('E5', 0.5); mel('A5', 0.5, 0.85);
  };

  themeA();
  // frasa penutup
  mel('B5', 1, 0.7);
  chord(['E3', 'E4'], t, 1.5, 0.5);
  mel('E5', 0.5, 0.6); mel('E5', 0.25); mel('D#5', 0.25);
  mel('E5', 0.25); mel('D#5', 0.25); mel('E5', 0.25); mel('B4', 0.25);
  mel('D5', 0.5); mel('C5', 0.5);
  chord(['A3', 'E4'], t, 1.5, 0.5);
  mel('A4', 0.5); mel('C4', 0.5); mel('E4', 0.5);
  chord(['E3'], t, 1.5, 0.5);
  mel('A4', 0.5); mel('B4', 0.5); mel('E4', 0.5);
  chord(['A3'], t, 2, 0.5);
  mel('C5', 0.5); mel('B4', 0.5); mel('A4', 2, 0.8);
  return seq(72, 'Für Elise', 'Beethoven', r);
})();

/* ---------------- Ode to Joy ---------------- */
const odeToJoy = (() => {
  const r = [];
  let t = 0;
  const melody = [
    ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
    ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
    ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1],
    ['E4', 1.5], ['D4', 0.5], ['D4', 2],
    ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
    ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
    ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1],
    ['D4', 1.5], ['C4', 0.5], ['C4', 2],
  ];
  const bassPattern = ['C3', 'C3', 'F2', 'C3', 'C3', 'F2', 'G2', 'G2', 'C3', 'C3', 'G2', 'C3', 'C3', 'G2', 'C3', 'C3'];
  melody.forEach(([n, d]) => { r.push([t, n, d * 0.95, 0.8]); t += d; });
  bassPattern.forEach((n, i) => {
    r.push([i * 2, n, 1.8, 0.5]);
    const up = { C3: 'G3', F2: 'C3', G2: 'D3' }[n];
    r.push([i * 2 + 1, up, 0.9, 0.4]);
  });
  return seq(112, 'Ode to Joy', 'Beethoven', r);
})();

/* ---------------- Canon in D (potongan) ---------------- */
const canonInD = (() => {
  const r = [];
  const bass = ['D3', 'A2', 'B2', 'F#2', 'G2', 'D2', 'G2', 'A2'];
  // bass ostinato 4 putaran
  for (let cyc = 0; cyc < 4; cyc++) {
    bass.forEach((n, i) => r.push([cyc * 16 + i * 2, n, 1.9, 0.48]));
  }
  // melodi utama (tema Pachelbel disederhanakan)
  const mel = [
    'F#5', 'E5', 'D5', 'C#5', 'B4', 'A4', 'B4', 'C#5',
    'D5', 'C#5', 'B4', 'A4', 'G4', 'F#4', 'G4', 'E4',
  ];
  mel.forEach((n, i) => r.push([16 + i * 2, n, 1.9, 0.74]));
  const mel2 = [
    'D5', 'F#5', 'A5', 'G5', 'F#5', 'D5', 'F#5', 'E5',
    'D5', 'B4', 'D5', 'A5', 'G5', 'B5', 'A5', 'G5',
    'F#5', 'D5', 'E5', 'C#5', 'B4', 'G4', 'A4', 'F#4',
    'G4', 'A4', 'B4', 'G4', 'A4', 'B4', 'C#5', 'D5',
  ];
  mel2.forEach((n, i) => r.push([32 + i, n, 0.95, 0.7]));
  // iringan akord ringan
  const chords = [['D4', 'F#4'], ['C#4', 'E4'], ['B3', 'D4'], ['A3', 'C#4'], ['B3', 'D4'], ['A3', 'D4'], ['B3', 'D4'], ['C#4', 'E4']];
  for (let cyc = 1; cyc < 4; cyc++) {
    chords.forEach((c, i) => c.forEach((n) => r.push([cyc * 16 + i * 2 + 1, n, 0.9, 0.36])));
  }
  return seq(100, 'Canon in D', 'Pachelbel', r);
})();

/* ---------------- Twinkle Twinkle ---------------- */
const twinkle = (() => {
  const r = [];
  let t = 0;
  const mel = [
    ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
    ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2],
    ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2],
    ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2],
    ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
    ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2],
  ];
  const harmony = ['C3', 'F2', 'C3', 'G2', 'C3', 'F2', 'C3', 'G2', 'C3', 'G2', 'C3', 'G2', 'C3', 'G2', 'C3', 'G2', 'C3', 'F2', 'C3', 'G2', 'C3', 'F2', 'C3', 'G2'];
  mel.forEach(([n, d]) => { r.push([t, n, d * 0.9, 0.78]); t += d; });
  harmony.forEach((n, i) => r.push([i * 2, n, 1.8, 0.45]));
  return seq(120, 'Twinkle Twinkle', 'Tradisional', r);
})();

/* ---------------- Moonlight Sonata (pembuka) ---------------- */
const moonlight = (() => {
  const r = [];
  // triplet arpeggio tangan kanan, bass oktaf tangan kiri
  const pattern = [
    { bass: ['C#2', 'C#3'], tri: ['G#3', 'C#4', 'E4'], bars: 2 },
    { bass: ['B1', 'B2'], tri: ['G#3', 'C#4', 'E4'], bars: 1 },
    { bass: ['A1', 'A2'], tri: ['A3', 'C#4', 'E4'], bars: 1 },
    { bass: ['F#1', 'F#2'], tri: ['A3', 'D4', 'F#4'], bars: 1 },
    { bass: ['G#1', 'G#2'], tri: ['G#3', 'C4', 'F#4'], bars: 0.5 },
    { bass: ['G#1', 'G#2'], tri: ['G#3', 'C#4', 'E4'], bars: 0.5 },
    { bass: ['C#2', 'C#3'], tri: ['G#3', 'C#4', 'E4'], bars: 2 },
  ];
  let bar = 0;
  for (const p of pattern) {
    const beats = p.bars * 4;
    p.bass.forEach((n) => r.push([bar * 4, n, beats * 0.98, 0.45]));
    const triplets = Math.round(beats * 3);
    for (let i = 0; i < triplets; i++) {
      const n = p.tri[i % 3];
      r.push([bar * 4 + i / 3, n, 0.42, 0.32 + (i % 3 === 0 ? 0.1 : 0)]);
    }
    bar += p.bars;
  }
  // sedikit melodi atas
  [['G#4', 8, 2], ['G#4', 12, 1], ['A4', 13, 1], ['G#4', 14, 1], ['F#4', 15, 1]]
    .forEach(([n, at, d]) => r.push([at, n, d * 0.95, 0.6]));
  return seq(108, 'Moonlight Sonata', 'Beethoven', r);
})();

/* ---------------- Greensleeves ---------------- */
const greensleeves = (() => {
  const r = [];
  let t = 0;
  const mel = [
    ['A4', 1], ['C5', 2], ['D5', 1], ['E5', 1.5], ['F5', 0.5], ['E5', 1],
    ['D5', 2], ['B4', 1], ['G4', 1], ['A4', 1.5], ['B4', 0.5], ['C5', 1],
    ['A4', 2], ['A4', 1], ['G#4', 1], ['A4', 1.5], ['B4', 0.5], ['G#4', 1],
    ['E4', 3], ['A4', 1], ['C5', 2], ['D5', 1],
    ['E5', 1.5], ['F5', 0.5], ['E5', 1], ['D5', 2], ['B4', 1],
    ['G4', 1], ['A4', 1.5], ['B4', 0.5], ['C5', 1], ['B4', 1], ['A4', 1], ['G#4', 1], ['A4', 3],
  ];
  mel.forEach(([n, d]) => { r.push([t, n, d * 0.92, 0.76]); t += d; });
  const chords = [['A3', 'E4'], ['A3', 'E4'], ['G3', 'D4'], ['G3', 'D4'], ['A3', 'E4'], ['A3', 'E4'], ['E3', 'B3'], ['E3', 'B3'],
    ['A3', 'E4'], ['A3', 'E4'], ['G3', 'D4'], ['G3', 'D4'], ['A3', 'E4'], ['E3', 'G#3'], ['A3', 'E4'], ['A3', 'E4']];
  chords.forEach((c, i) => c.forEach((n) => r.push([i * 3, n, 2.8, 0.38])));
  return seq(96, 'Greensleeves', 'Tradisional', r);
})();

export const SONGS = [furElise, odeToJoy, canonInD, moonlight, greensleeves, twinkle];
