import { buildChart, DIFFS } from './chart.js';

/** Jendela penilaian (detik). */
export const WINDOWS = { perfect: 0.055, great: 0.1, good: 0.155, hit: 0.19 };

export const GRADES = {
  perfect: { label: 'SEMPURNA', cls: 'j-perfect', score: 320, hp: 0.7, acc: 1 },
  great: { label: 'HEBAT', cls: 'j-great', score: 240, hp: 0.35, acc: 0.86 },
  good: { label: 'BAGUS', cls: 'j-good', score: 120, hp: 0, acc: 0.55 },
  miss: { label: 'MELESET', cls: 'j-miss', score: 0, hp: -7, acc: 0 },
  hold: { label: 'TAHAN!', cls: 'j-hold', score: 150, hp: 0.4, acc: 0 },
  breakHold: { label: 'LEPAS!', cls: 'j-miss', score: 0, hp: -3.5, acc: 0 },
};

export const LEAD_IN = 3.2; // detik hitung mundur sebelum nada pertama
const HOLD_TICK = 0.1; // detik per tick skor nada tahan

function rankFor(acc, failed) {
  if (failed) return { rank: 'F', cls: 'e', label: 'HP habis — coba lagi!' };
  if (acc >= 95) return { rank: 'S', cls: '', label: 'Luar biasa! Nyaris sempurna.' };
  if (acc >= 90) return { rank: 'A', cls: 'a', label: 'Hebat sekali!' };
  if (acc >= 80) return { rank: 'B', cls: 'b', label: 'Bagus, terus berlatih.' };
  if (acc >= 70) return { rank: 'C', cls: 'c', label: 'Lumayan, perbaiki timing.' };
  if (acc >= 60) return { rank: 'D', cls: 'd', label: 'Perlu latihan lagi.' };
  return { rank: 'E', cls: 'e', label: 'Jangan menyerah!' };
}

/**
 * Sesi permainan ritme. Murni logika (tanpa WebGL/audio) sehingga mudah diuji.
 * Waktu lagu memakai detik; nilai negatif = hitung mundur.
 */
export class GameSession {
  constructor(song, opts = {}) {
    this.song = song;
    this.diffId = opts.diffId || 'sedang';
    this.auto = !!opts.auto;
    this.demo = !!opts.demo;
    this.holdsOn = opts.holds !== false;
    this.speed = opts.speed || 1;
    this.metronome = !!opts.metronome;
    this.chart = opts.chart || buildChart(song, this.diffId, this.speed, this.holdsOn);
    this.notes = this.chart.notes.map((n) => ({
      ...n,
      end: n.time + n.dur,
      state: 'idle',
      pop: 0,
      holdScore: 0,
      tickAcc: 0,
    }));

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0, hold: 0, breakHold: 0 };
    this.hp = 100;
    this.time = -LEAD_IN;
    this.prevTime = -LEAD_IN;
    this.state = 'running';
    this.events = [];
    this.cursor = 0;
    this.holding = new Map();
    this.autoReleases = [];
    this.total = this.notes.length;
    this.lastBeat = -1;
    this.hpLoss = this.demo ? 0 : this.chart.diff.hpLoss || 1;
  }

  get approach() {
    return this.chart.approach;
  }

  get multiplier() {
    return 1 + Math.min(1, Math.floor(this.combo / 12) * 0.1);
  }

  get progress() {
    return Math.max(0, Math.min(1, this.time / this.chart.duration));
  }

  get accuracy() {
    const c = this.counts;
    const judged = c.perfect + c.great + c.good + c.miss;
    if (!judged) return 100;
    const w = c.perfect * GRADES.perfect.acc + c.great * GRADES.great.acc + c.good * GRADES.good.acc;
    return (w / judged) * 100;
  }

  /** Nada yang perlu digambar frame ini. */
  visibleNotes() {
    const t = this.time;
    const from = t - 1.4;
    const to = t + this.approach + 0.9;
    const out = [];
    for (const n of this.notes) {
      if (n.end < from && n.state !== 'done') continue;
      if (n.state === 'done' && n.pop > 0.4) continue;
      if (n.state === 'missed' && n.time < from) continue;
      if (n.time > to) break;
      out.push(n);
    }
    return out;
  }

  /** Majukan waktu lagu dan kembalikan daftar peristiwa frame ini. */
  update(t) {
    const dt = Math.max(0, Math.min(0.2, t - this.prevTime));
    this.prevTime = t;
    this.time = t;
    this.events.length = 0;
    if (this.state !== 'running') return this.events;

    if (this.metronome && t >= 0) {
      const beat = Math.floor(t / this.chart.spb);
      if (beat !== this.lastBeat) {
        this.lastBeat = beat;
        this.events.push({ type: 'metronome', accent: beat % 4 === 0 });
      }
    }

    // maju ke nada pertama yang belum dinilai
    while (this.cursor < this.notes.length && this.notes[this.cursor].state !== 'idle') this.cursor++;

    if (this.auto) {
      for (let i = this.cursor; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.state !== 'idle') continue;
        if (n.time > t) break;
        this.events.push({ type: 'autoPress', midi: n.midi, velocity: n.harmony ? 0.5 : 0.92 });
        this._judge(n, 0, 'perfect');
        if (n.hold) {
          n.state = 'holding';
          this.holding.set(n.midi, n);
        } else {
          // lepas setelah durasi nada (supaya terdengar legato/staccato wajar)
          this.autoReleases.push({ midi: n.midi, at: t + Math.min(1.3, Math.max(0.12, n.dur * 0.92)) });
        }
      }
      for (const [midi, n] of this.holding) {
        if (t >= n.end) {
          const ev = this._finishHold(n, false);
          this.holding.delete(midi);
          if (ev) this.events.push(ev);
          this.events.push({ type: 'autoRelease', midi });
        }
      }
      for (let i = this.autoReleases.length - 1; i >= 0; i--) {
        if (t >= this.autoReleases[i].at) {
          this.events.push({ type: 'autoRelease', midi: this.autoReleases[i].midi });
          this.autoReleases.splice(i, 1);
        }
      }
    } else {
      for (let i = this.cursor; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.state !== 'idle') continue;
        if (n.time > t + WINDOWS.hit) break;
        if (t > n.time + WINDOWS.good) {
          this._miss(n);
        }
      }
      for (const [midi, n] of this.holding) {
        if (t >= n.end) {
          const ev = this._finishHold(n, false);
          this.holding.delete(midi);
          if (ev) this.events.push(ev);
          this.events.push({ type: 'release', midi });
        } else {
          this._holdTick(n, dt);
        }
      }
    }

    if (t >= this.chart.duration) {
      this.state = 'finished';
      this.events.push({ type: 'end', result: this.result(false) });
    } else if (!this.demo && this.hp <= 0) {
      this.hp = 0;
      this.state = 'failed';
      this.events.push({ type: 'end', result: this.result(true) });
    }
    return this.events;
  }

  _holdTick(n, dt) {
    n.tickAcc += dt;
    while (n.tickAcc >= HOLD_TICK) {
      n.tickAcc -= HOLD_TICK;
      const gain = Math.round(18 * this.multiplier);
      this.score += gain;
      n.holdScore += gain;
    }
  }

  /** Pemain menekan tuts. Mengembalikan peristiwa (bukan lewat this.events). */
  press(midi, t = this.time, velocity = 0.9) {
    if (this.state !== 'running' || this.auto) return { type: 'ghost', midi, velocity };
    let best = null;
    let bestDelta = Infinity;
    for (let i = Math.max(0, this.cursor - 4); i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.midi !== midi || n.state !== 'idle') continue;
      const d = t - n.time;
      if (d > WINDOWS.hit) continue;
      if (d < -WINDOWS.hit) break;
      if (Math.abs(d) < Math.abs(bestDelta)) {
        best = n;
        bestDelta = d;
      }
    }
    if (!best) return { type: 'ghost', midi, velocity };
    const grade = this._grade(bestDelta);
    this._judge(best, bestDelta, grade);
    if (best.hold) {
      best.state = 'holding';
      this.holding.set(midi, best);
    }
    return { type: 'judge', grade, midi, delta: bestDelta, note: best, velocity };
  }

  /** Pemain melepas tuts. */
  release(midi, t = this.time) {
    if (this.state !== 'running' || this.auto) return null;
    const n = this.holding.get(midi);
    if (!n) return null;
    this.holding.delete(midi);
    const broken = t < n.end - 0.12;
    const ev = this._finishHold(n, broken);
    return ev;
  }

  _grade(delta) {
    const d = Math.abs(delta);
    if (d <= WINDOWS.perfect) return 'perfect';
    if (d <= WINDOWS.great) return 'great';
    return 'good';
  }

  _judge(note, delta, grade) {
    const g = GRADES[grade];
    note.state = note.hold ? 'holding' : 'hit';
    note.judged = true;
    note.pop = 0;
    note.grade = grade;
    note.delta = delta;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.counts[grade] = (this.counts[grade] || 0) + 1;
    this.score += Math.round(g.score * this.multiplier);
    this.hp = Math.min(100, this.hp + g.hp);
  }

  _finishHold(note, broken) {
    if (note.state === 'done') return null;
    note.state = 'done';
    note.pop = 0;
    if (broken) {
      this.combo = 0;
      this.counts.breakHold++;
      this.hp = Math.max(0, this.hp + GRADES.breakHold.hp * this.hpLoss);
    } else {
      this.counts.hold++;
      this.score += Math.round(GRADES.hold.score * this.multiplier);
      this.hp = Math.min(100, this.hp + GRADES.hold.hp);
    }
    return { type: 'judge', grade: broken ? 'breakHold' : 'hold', midi: note.midi, note };
  }

  _miss(note) {
    note.state = 'missed';
    note.judged = true;
    note.pop = 0;
    this.combo = 0;
    this.counts.miss++;
    this.hp = Math.max(0, this.hp + GRADES.miss.hp * this.hpLoss);
    this.events.push({ type: 'judge', grade: 'miss', midi: note.midi, note });
    this.events.push({ type: 'missFx', midi: note.midi });
  }

  result(failed = false) {
    const acc = this.accuracy;
    const isFail = failed || this.state === 'failed';
    const r = rankFor(acc, isFail);
    return {
      rank: r.rank,
      rankCls: r.cls,
      rankLabel: r.label,
      failed: isFail,
      demo: this.demo,
      score: this.score,
      maxCombo: this.maxCombo,
      accuracy: acc,
      counts: { ...this.counts },
      total: this.total,
      hp: this.hp,
      songTitle: this.song.title,
      diff: (DIFFS[this.diffId] || DIFFS.sedang).label,
    };
  }

  pause() {
    if (this.state === 'running') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'running';
      this.prevTime = this.time;
    }
  }

  /** Semua tuts yang sedang ditahan (dipakai saat jeda/berhenti). */
  releaseAll() {
    const midis = [...this.holding.keys()];
    this.holding.clear();
    return midis;
  }
}
