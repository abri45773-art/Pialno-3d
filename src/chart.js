import { fitRange } from './music.js';

/** Profil tingkat kesulitan. */
export const DIFFS = {
  mudah: {
    id: 'mudah',
    label: 'Mudah',
    tracks: ['melody'],
    minGap: 0.3,
    harmonyGap: 0.6,
    approach: 2.8,
    stars: 1,
    hpLoss: 0.7,
    color: '#7ee081',
  },
  sedang: {
    id: 'sedang',
    label: 'Sedang',
    tracks: ['melody', 'harmony'],
    minGap: 0.16,
    harmonyGap: 0.5,
    approach: 2.2,
    stars: 2,
    hpLoss: 1,
    color: '#4dc7ff',
  },
  sulit: {
    id: 'sulit',
    label: 'Sulit',
    tracks: ['melody', 'harmony'],
    minGap: 0,
    harmonyGap: 0.12,
    approach: 1.75,
    stars: 3,
    hpLoss: 1.35,
    color: '#ff4d6d',
  },
};

/** Kelompokkan nada yang bunyinya serentak. */
function groupByTime(notes, tol = 0.014) {
  const groups = [];
  for (const n of notes) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.time - n.time) <= tol) g.notes.push(n);
    else groups.push({ time: n.time, notes: [n] });
  }
  return groups;
}

/** Buang nada yang terlalu rapat agar sesuai tingkat kesulitan. */
function thin(notes, minGap) {
  if (!(minGap > 0)) return notes.slice();
  const groups = groupByTime(notes);
  const out = [];
  let last = -Infinity;
  for (const g of groups) {
    if (g.time - last >= minGap - 1e-6) {
      out.push(...g.notes);
      last = g.time;
    }
  }
  return out;
}

/**
 * Bangun chart (daftar nada yang harus dimainkan) dari sebuah lagu.
 * @returns {{notes:Array, duration:number, approach:number, spb:number, diff:object, count:number}}
 */
export function buildChart(song, diffId = 'sedang', speedMul = 1, holds = true) {
  const diff = DIFFS[diffId] || DIFFS.sedang;
  const spb = 60 / song.bpm;
  const speed = Math.max(0.5, Math.min(2, speedMul));

  const all = [];
  for (const trackName of diff.tracks) {
    const src = song.tracks && song.tracks[trackName];
    if (!src || !src.length) continue;
    const isHarmony = trackName !== 'melody';
    const gap = isHarmony ? diff.harmonyGap : diff.minGap;
    const mapped = src.map((n) => ({
      midi: fitRange(n.midi),
      time: n.beat * spb,
      durSec: Math.max(0.08, n.dur * spb),
      track: trackName,
      harmony: isHarmony,
    }));
    mapped.sort((a, b) => a.time - b.time || a.midi - b.midi);
    all.push(...thin(mapped, gap));
  }

  all.sort((a, b) => a.time - b.time || a.midi - b.midi);

  // buang nada kembar (nada & waktu sama) supaya satu tuts tidak dinilai dua kali
  const deduped = [];
  const lastByMidi = new Map();
  for (const n of all) {
    const prev = lastByMidi.get(n.midi);
    if (prev !== undefined && n.time - prev < 0.07) continue;
    lastByMidi.set(n.midi, n.time);
    deduped.push(n);
  }
  const unique = deduped;

  // nada panjang: tahan sampai ujung balok
  const nextSame = new Map();
  for (let i = unique.length - 1; i >= 0; i--) {
    const n = unique[i];
    const prev = nextSame.get(n.midi);
    if (prev !== undefined) n._nextStart = prev;
    nextSame.set(n.midi, n.time);
  }

  const notes = unique.map((n, i) => {
    let end = n.time + n.durSec;
    if (n._nextStart !== undefined) end = Math.min(end, n._nextStart - 0.03);
    const holdLen = end - n.time;
    // hanya melodi yang cukup panjang yang jadi nada tahan
    const hold = holds && !n.harmony && holdLen >= 1.0;
    return {
      id: i,
      midi: n.midi,
      time: n.time,
      dur: hold ? Math.max(1.0, holdLen) : Math.min(holdLen, 0.3),
      hold,
      harmony: n.harmony,
      state: 'idle', // idle | hit | holding | done | missed
      judged: false,
      holdScore: 0,
      y: 0,
    };
  });

  const last = notes[notes.length - 1];
  const duration = last ? last.time + last.dur + 2.6 : 8;

  return {
    notes,
    count: notes.length,
    duration,
    approach: Math.max(0.7, diff.approach / speed),
    spb,
    bpm: song.bpm,
    diff,
    speed,
    holds: !!holds,
  };
}

/** Chart lengkap untuk demo / mode bebas (semua track, tanpa penyaringan). */
export function buildFullChart(song) {
  const spb = 60 / song.bpm;
  const notes = [];
  for (const key of Object.keys(song.tracks)) {
    for (const n of song.tracks[key]) {
      notes.push({
        midi: fitRange(n.midi),
        time: n.beat * spb,
        dur: n.dur * spb,
        hold: false,
        state: 'idle',
        judged: true,
        harmony: key !== 'melody',
      });
    }
  }
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const last = notes[notes.length - 1];
  return {
    notes,
    count: notes.length,
    duration: last ? last.time + last.dur + 2 : 8,
    approach: 2.4,
    spb,
    bpm: song.bpm,
    diff: DIFFS.sedang,
    speed: 1,
    holds: false,
    full: true,
  };
}
