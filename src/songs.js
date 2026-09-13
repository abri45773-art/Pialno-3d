import { chordMidis, noteToMidi } from './music.js';

/* ================================================================== */
/* Pembangun notasi                                                    */
/*                                                                     */
/* Nada ditulis sebagai pasangan [nada, durasiBeat]. Nada boleh berupa */
/* angka MIDI, nama ('C5', 'F#4', 'Bb3'), atau array untuk akor.       */
/* null berarti istirahat.                                             */
/* ================================================================== */

/** Ubah satu kejadian menjadi daftar { beat, midi, dur }. */
function expand(events, startBeat = 0) {
  const out = [];
  let t = startBeat;
  for (const ev of events) {
    const raw = ev[0];
    const dur = ev[1] == null ? 1 : ev[1];
    if (raw != null) {
      const arr = Array.isArray(raw) ? raw : [raw];
      for (const one of arr) {
        const midi = noteToMidi(one);
        if (Number.isFinite(midi)) out.push({ beat: t, midi, dur });
      }
    }
    t += dur;
  }
  return out;
}

/** Ulangi sebuah frasa sebanyak n kali. */
function rep(events, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...events);
  return out;
}

/**
 * Pengiring dari progresi akor.
 * prog: [[namaAkor, beats], ...]
 * opts: { octave, div, pattern }  — div = jumlah langkah per beat,
 *       pattern = indeks nada akor (boleh array untuk akor serentak).
 */
function chordTrack(prog, { octave = 4, div = 2, pattern = [0, 2, 1, 2] } = {}) {
  const out = [];
  let t = 0;
  for (const [name, beats] of prog) {
    let tones = chordMidis(name, octave);
    if (!tones.length) continue;
    // tambahkan akar satu oktaf di atas agar pola arpeggio lebih kaya
    tones = tones.concat([tones[0] + 12]);
    const steps = Math.max(1, Math.round(beats * div));
    const stepDur = beats / steps;
    for (let i = 0; i < steps; i++) {
      const pick = pattern[i % pattern.length];
      const idx = Array.isArray(pick) ? pick : [pick];
      const midis = idx.map((p) => tones[p % tones.length]).filter((m) => m != null);
      for (const m of midis) out.push({ beat: t, midi: m, dur: stepDur });
      t += stepDur;
    }
  }
  return out;
}

/** Ulangi progresi sampai mencapai panjang (beat) tertentu. */
function cycleProg(base, totalBeats) {
  const oneCycle = base.reduce((s, [, b]) => s + b, 0);
  const out = [];
  let t = 0;
  while (t < totalBeats - 1e-6) {
    for (const [name, beats] of base) {
      if (t >= totalBeats - 1e-6) break;
      const b = Math.min(beats, totalBeats - t);
      out.push([name, b]);
      t += b;
    }
    if (oneCycle <= 0) break;
  }
  return out;
}

/** Laras naik/turun: semua nada diatonis dari A ke B. */
function scaleNotes(from, to, dur, pcs) {
  const a = noteToMidi(from);
  const b = noteToMidi(to);
  const dir = b >= a ? 1 : -1;
  const out = [];
  let m = a;
  out.push([m, dur]);
  let guard = 0;
  while (m !== b && guard++ < 200) {
    do {
      m += dir;
    } while (!pcs.includes(((m % 12) + 12) % 12) && m !== b && guard++ < 200);
    out.push([m, dur]);
  }
  return out;
}

/** Arpeggio akor bolak-balik. */
function arpNotes(chord, octave, dur, times = 1) {
  const tones = chordMidis(chord, octave);
  const seq = [...tones, tones[0] + 12];
  const out = [];
  for (let i = 0; i < times; i++) {
    for (const m of seq) out.push([m, dur]);
    for (let j = seq.length - 2; j > 0; j--) out.push([seq[j], dur]);
  }
  return out;
}

/* ================================================================== */
/* Lagu                                                                */
/* ================================================================== */

const SONGS = [];

SONGS.push({
  id: 'bintang-kecil',
  title: 'Bintang Kecil',
  composer: 'Twinkle Twinkle Little Star',
  bpm: 100,
  stars: 1,
  color: '#4dc7ff',
  tracks: {
    melody: expand([
      ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
      ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2],
      ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2],
      ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2],
      ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
      ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2],
    ]),
    harmony: chordTrack(
      [
        ['C', 4], ['C', 2], ['G', 2], ['F', 4], ['C', 2], ['G', 2],
        ['C', 4], ['F', 2], ['C', 2], ['G', 4],
        ['C', 4], ['F', 2], ['C', 2], ['G', 4],
        ['C', 4], ['C', 2], ['G', 2], ['F', 4], ['C', 2], ['G', 2],
        ['C', 4], ['F', 2], ['C', 2], ['G', 4], ['C', 4],
      ],
      { octave: 3, div: 0.5, pattern: [[0, 2]] },
    ),
  },
});

SONGS.push({
  id: 'mary-domba',
  title: 'Mary Punya Domba Kecil',
  composer: 'Mary Had a Little Lamb',
  bpm: 112,
  stars: 1,
  color: '#7ee081',
  tracks: {
    melody: expand([
      ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 2],
      ['D4', 1], ['D4', 1], ['D4', 2], ['E4', 1], ['G4', 1], ['G4', 2],
      ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['E4', 1],
      ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 1], ['C4', 4],
    ]),
    harmony: chordTrack(
      [
        ['C', 4], ['C', 4], ['G', 4], ['C', 4],
        ['C', 4], ['G', 4], ['C', 2], ['G', 2], ['C', 4],
      ],
      { octave: 3, div: 0.5, pattern: [[0, 2]] },
    ),
  },
});

SONGS.push({
  id: 'selamat-ulang-tahun',
  title: 'Selamat Ulang Tahun',
  composer: 'Happy Birthday (F major)',
  bpm: 112,
  stars: 1,
  color: '#ffd24d',
  tracks: {
    melody: expand([
      ['C4', 0.75], ['C4', 0.25], ['D4', 1], ['C4', 1], ['F4', 1], ['E4', 2],
      ['C4', 0.75], ['C4', 0.25], ['D4', 1], ['C4', 1], ['G4', 1], ['F4', 2],
      ['C4', 0.75], ['C4', 0.25], ['C5', 1], ['A4', 1], ['F4', 1], ['G4', 1], ['F4', 2],
      ['Bb4', 0.75], ['Bb4', 0.25], ['A4', 1], ['F4', 1], ['G4', 1], ['F4', 2],
    ]),
    harmony: chordTrack(
      [
        ['F', 3], ['F', 3], ['Bb', 3], ['F', 3],
        ['F', 3], ['C7', 3], ['F', 3], ['F', 3],
        ['F', 3], ['C7', 3], ['Bb', 3], ['F', 3],
        ['Bb', 3], ['F', 3], ['C7', 3], ['F', 3],
      ],
      { octave: 3, div: 0.5, pattern: [[0, 2]] },
    ),
  },
});

SONGS.push({
  id: 'ode-to-joy',
  title: 'Ode to Joy',
  composer: 'L. van Beethoven (arr.)',
  bpm: 112,
  stars: 2,
  color: '#ff8a4d',
  tracks: {
    melody: expand([
      // A
      ['E5', 1], ['E5', 1], ['F5', 1], ['G5', 1],
      ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
      ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1],
      ['E5', 1.5], ['D5', 0.5], ['D5', 2],
      // B
      ['E5', 1], ['E5', 1], ['F5', 1], ['G5', 1],
      ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
      ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1],
      ['D5', 1.5], ['C5', 0.5], ['C5', 2],
      // C
      ['D5', 1], ['D5', 1], ['E5', 1], ['C5', 1],
      ['D5', 1], ['E5', 0.5], ['F5', 0.5], ['E5', 1], ['C5', 1],
      ['D5', 1], ['E5', 0.5], ['F5', 0.5], ['E5', 1], ['D5', 1],
      ['C5', 1], ['D5', 1], ['A4', 2],
      // B'
      ['E5', 1], ['E5', 1], ['F5', 1], ['G5', 1],
      ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
      ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1],
      ['D5', 1.5], ['C5', 0.5], ['C5', 2],
    ]),
    harmony: chordTrack(
      [
        ['C', 4], ['C', 4], ['C', 4], ['G', 4],
        ['C', 4], ['C', 4], ['C', 4], ['G', 2], ['C', 2],
        ['C', 4], ['F', 4], ['G', 4], ['C', 4],
        ['C', 4], ['C', 4], ['C', 4], ['G', 2], ['C', 2],
      ],
      { octave: 3, div: 2, pattern: [0, 2, 1, 2] },
    ),
  },
});

SONGS.push({
  id: 'jingle-bells',
  title: 'Jingle Bells',
  composer: 'J. S. Pierpont (arr.)',
  bpm: 132,
  stars: 2,
  color: '#ff4d6d',
  tracks: {
    melody: expand(
      rep([
        ['E4', 1], ['E4', 1], ['E4', 2],
        ['E4', 1], ['E4', 1], ['E4', 2],
        ['E4', 1], ['G4', 1], ['C4', 1.5], ['D4', 0.5], ['E4', 4],
        ['F4', 1], ['F4', 1], ['F4', 1.5], ['F4', 0.5],
        ['F4', 1], ['E4', 1], ['E4', 1], ['E4', 0.5], ['E4', 0.5],
        ['E4', 1], ['D4', 1], ['D4', 1], ['E4', 1],
        ['D4', 2], ['G4', 2],
      ], 2),
    ),
    harmony: chordTrack(
      rep([
        ['C', 4], ['C', 4], ['C', 4], ['C', 4],
        ['F', 4], ['F', 2], ['C', 2], ['C', 2], ['G', 2], ['G', 4],
      ], 2),
      { octave: 3, div: 2, pattern: [0, 2, 1, 2] },
    ),
  },
});

SONGS.push({
  id: 'fur-elise',
  title: 'Für Elise',
  composer: 'L. van Beethoven (arr.)',
  bpm: 76,
  stars: 3,
  color: '#a78bfa',
  tracks: {
    melody: expand([
      // tema A
      ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 1],
      [null, 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5], ['B4', 1],
      [null, 0.5], ['E4', 0.5], ['G#4', 0.5], ['B4', 0.5], ['C5', 1],
      [null, 0.5], ['E4', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 1],
      [null, 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5], ['B4', 1],
      [null, 0.5], ['E4', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 1.5],
      // bagian B
      [null, 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 1],
      ['G4', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 1],
      ['F4', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 1],
      ['E4', 0.5], ['D5', 0.5], ['C5', 0.5], ['B4', 1],
      [null, 0.5], ['E4', 0.5], ['G#4', 0.5], ['B4', 0.5], ['C5', 1],
      [null, 0.5], ['E4', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 1],
      [null, 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5], ['B4', 1],
      [null, 0.5], ['E4', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 2],
    ]),
    harmony: chordTrack(
      [
        ['A', 4], ['E', 4], ['A', 4], ['E', 4], ['A', 4], ['E', 4], ['A', 4], ['A', 4],
        ['E', 4], ['G', 4], ['F', 4], ['E', 4], ['A', 4], ['E', 4], ['A', 4], ['A', 4],
      ],
      { octave: 3, div: 0.5, pattern: [[0, 2]] },
    ),
  },
});

SONGS.push({
  id: 'canon-in-d',
  title: 'Canon in D',
  composer: 'J. Pachelbel (arr.)',
  bpm: 76,
  stars: 3,
  color: '#4ddbb4',
  tracks: {
    melody: expand([
      // frasa lambat
      ['A5', 2], ['F#5', 2],
      ['G5', 2], ['E5', 2],
      ['F#5', 2], ['D5', 2],
      ['E5', 2], ['C#5', 2],
      ['D5', 2], ['B4', 2],
      ['C#5', 2], ['A4', 2],
      ['B4', 2], ['G4', 2],
      ['A4', 4],
      // frasa cepat
      ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F#5', 0.5], ['E5', 0.5],
      ['A4', 0.5], ['B4', 0.5], ['C#5', 0.5], ['D5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C#5', 0.5], ['B4', 0.5],
      ['B4', 0.5], ['C#5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C#5', 0.5],
      ['A4', 0.5], ['B4', 0.5], ['C#5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['E5', 0.5], ['D5', 0.5],
      ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F#5', 0.5], ['E5', 0.5],
      ['F#5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C#5', 0.5], ['B4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C#5', 0.5],
      ['B4', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5],
      ['A4', 0.5], ['B4', 0.5], ['C#5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 0.5], ['A5', 0.5],
      // akor penutup
      [['D5', 'F#5', 'A5'], 4],
    ]),
    harmony: chordTrack(
      rep([['D', 4], ['A', 4], ['Bm', 4], ['F#m', 4], ['G', 4], ['D', 4], ['G', 4], ['A', 4]], 2),
      { octave: 3, div: 2, pattern: [0, 1, 2, 3, 2, 1] },
    ),
  },
});

SONGS.push({
  id: 'gymnopedie',
  title: 'Gymnopédie No. 1',
  composer: 'E. Satie (arr.)',
  bpm: 72,
  stars: 2,
  color: '#8a6bff',
  tracks: {
    melody: expand([
      ['F#5', 2], ['A5', 1],
      ['B5', 2], ['A5', 1],
      ['G5', 2], ['F#5', 1],
      ['E5', 3],
      ['D5', 2], ['F#5', 1],
      ['E5', 2], ['D5', 1],
      ['B4', 2], ['D5', 1],
      ['A4', 3],
      ['C#5', 2], ['E5', 1],
      ['D5', 2], ['C#5', 1],
      ['B4', 2], ['A4', 1],
      ['F#4', 3],
      ['G4', 2], ['A4', 1],
      ['F#4', 3],
      ['E4', 2], ['G4', 1],
      [['F#4', 'D5'], 3],
    ]),
    harmony: chordTrack(
      rep([['G', 3], ['D7', 3]], 8),
      { octave: 3, div: 1, pattern: [0, [1, 2], [1, 2]] },
    ),
  },
});

SONGS.push({
  id: 'senja-c-minor',
  title: 'Senja di C Minor',
  composer: 'Pialno 3D Original',
  bpm: 72,
  stars: 2,
  color: '#ff6bd6',
  tracks: {
    melody: expand([
      ['G5', 1], ['Eb5', 1], ['C5', 1], ['D5', 1],
      ['C5', 2], ['Eb5', 1], ['Ab4', 1],
      ['Bb4', 1], ['G4', 1], ['Eb5', 2],
      ['D5', 2], ['F5', 1], ['Bb4', 1],
      ['C5', 1], ['Eb5', 1], ['G5', 2],
      ['Ab5', 1], ['G5', 1], ['Eb5', 2],
      ['Eb5', 1], ['D5', 1], ['Bb4', 2],
      ['F5', 2], ['D5', 2],
      ['Eb5', 0.5], ['F5', 0.5], ['G5', 1], ['Ab5', 1], ['G5', 1],
      ['G5', 0.5], ['Ab5', 0.5], ['Bb5', 1], ['Ab5', 1], ['G5', 1],
      ['Eb5', 1], ['G5', 1], ['Bb5', 2],
      ['Bb5', 2], ['F5', 1], ['D5', 1],
      ['G5', 1], ['Eb5', 1], ['C5', 2],
      ['C5', 1], ['Ab4', 1], ['Eb5', 2],
      ['D5', 1], ['Eb5', 1], ['G4', 2],
      ['Bb4', 2], ['C5', 2],
      [['C5', 'Eb5', 'G5'], 4],
    ]),
    harmony: chordTrack(
      cycleProg([['Cm', 4], ['Ab', 4], ['Eb', 4], ['Bb', 4]], 68),
      { octave: 3, div: 2, pattern: [0, 1, 2, 3, 2, 1] },
    ),
  },
});

SONGS.push({
  id: 'sprint-skala',
  title: 'Sprint Skala',
  composer: 'Latihan Teknik (original)',
  bpm: 100,
  stars: 3,
  color: '#d7e34d',
  tracks: (() => {
    const C = [0, 2, 4, 5, 7, 9, 11];
    const q = 0.25; // not 1/16 pada 4/4 -> 1/4 beat
    const ev = [];
    // bagian 1: skala naik-turun
    ev.push(...scaleNotes('C5', 'C6', q, C), ...scaleNotes('C6', 'C5', q, C));
    ev.push(...arpNotes('C', 5, q, 1), ...arpNotes('Am', 5, q, 1));
    // bagian 2: lompatan
    ev.push(
      ...scaleNotes('C5', 'A5', q, C),
      ...scaleNotes('A5', 'E5', q, C),
      ['G5', 0.5], ['C6', 0.5], ['G5', 1],
    );
    ev.push(...arpNotes('F', 5, q, 1), ...arpNotes('G', 5, q, 1));
    // bagian 3: oktaf & akor
    ev.push(
      ['C5', q], ['G5', q], ['C6', q], ['G5', q], ['E5', q], ['C6', q], ['G5', q], ['E5', q],
      ['F5', q], ['C6', q], ['A5', q], ['F5', q], ['G5', q], ['B5', q], ['D5', q], ['G5', q],
    );
    ev.push(...scaleNotes('C6', 'C5', q, C), ...scaleNotes('C5', 'G5', q, C));
    // bagian 4: penutup
    ev.push(
      ['E5', q], ['G5', q], ['C6', q], ['E5', q], ['G5', q], ['C6', q], ['G5', 0.5], ['E5', 0.5],
      ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 0.5],
      [['C5', 'E5', 'G5', 'C6'], 3],
    );
    const melody = expand(ev);
    const total = melody.reduce((s, n) => Math.max(s, n.beat + n.dur), 0);
    const harmony = chordTrack(
      cycleProg([['C', 4], ['Am', 4], ['F', 4], ['G', 4]], total),
      { octave: 3, div: 1, pattern: [0, 2, 1, 2] },
    );
    return { melody, harmony };
  })(),
});

/** Daftar lagu yang bisa dipilih pemain. */
export const SONG_LIST = SONGS.map((s) => ({
  id: s.id,
  title: s.title,
  composer: s.composer,
  bpm: s.bpm,
  stars: s.stars,
  color: s.color,
  bars: Math.round(totalBeats(s) / 4),
  seconds: Math.round((totalBeats(s) * 60) / s.bpm),
}));

function totalBeats(song) {
  let max = 0;
  for (const key of Object.keys(song.tracks)) {
    for (const n of song.tracks[key]) max = Math.max(max, n.beat + n.dur);
  }
  return max;
}

export function getSong(id) {
  return SONGS.find((s) => s.id === id) || SONGS[0];
}

export default SONGS;
