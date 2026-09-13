import { Stage3D } from './scene3d.js';
import { audio } from './audio.js';
import { GameSession, GRADES, LEAD_IN } from './game.js';
import { buildFullChart, DIFFS } from './chart.js';
import { SONG_LIST, getSong } from './songs.js';
import { KEY_CODES, MIDI_TO_CODE, CODE_LABEL, buildKeyboard, noteName } from './music.js';

/* ================================================================== */
/* Util                                                                */
/* ================================================================== */
const $ = (id) => document.getElementById(id);
const dom = {};
const SETTINGS_KEY = 'piano3d.settings.v1';
const BEST_KEY = 'piano3d.best.v1';

const isSmallScreen = Math.min(window.innerWidth || 1200, window.innerHeight || 800) < 700;
const fewCores = (navigator.hardwareConcurrency || 4) <= 4;

const DEFAULT_SETTINGS = {
  volume: 0.8,
  reverb: 0.35,
  tone: 0.6,
  speed: 1,
  quality: isSmallScreen || fewCores ? 'medium' : 'high',
  names: true,
  holds: true,
  uiSound: true,
  pedal: false,
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

const fmt = (n) => Math.round(n).toLocaleString('id-ID');

/* ================================================================== */
/* Status aplikasi                                                     */
/* ================================================================== */
const settings = loadJSON(SETTINGS_KEY, DEFAULT_SETTINGS);
let bests = loadJSON(BEST_KEY, {});

const app = {
  mode: 'boot', // boot | menu | songs | help | settings | free | game | paused | result
  songId: SONG_LIST[0].id,
  diff: 'sedang',
  auto: false,
  metronome: false,
  session: null,
  startClock: 0,
  countdownStep: 99,
  silentCountdown: false,
  heldKeys: new Set(),
  heldByPointer: new Map(),
  shiftPedal: false,
  recording: null,
  lastRec: null,
  playback: null,
  judgeTimer: 0,
  toastTimer: 0,
  demoReturn: 'free',
  lastResult: null,
  attractDone: false,
};

let stage = null;

/* ================================================================== */
/* Jam lagu                                                            */
/* ================================================================== */
function clockNow() {
  return audio.ctx ? audio.now : performance.now() / 1000;
}

function songTime() {
  if (!app.session) return 0;
  return clockNow() - app.startClock;
}

/* ================================================================== */
/* UI kecil                                                            */
/* ================================================================== */
function toast(msg, ms = 1900) {
  const el = dom.toast;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(app.toastTimer);
  app.toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function showJudgment(grade) {
  const g = GRADES[grade];
  if (!g) return;
  const el = dom.judgment;
  el.className = g.cls;
  el.textContent = g.label;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(app.judgeTimer);
  app.judgeTimer = setTimeout(() => el.classList.add('hidden'), 520);
}

function showScreen(name) {
  for (const key of ['screenMenu', 'screenSongs', 'screenHelp', 'screenSettings', 'screenPause', 'screenResult']) {
    dom[key].classList.toggle('hidden', key !== name);
  }
  dom.hud.classList.toggle('hidden', app.mode !== 'game');
  dom.freebar.classList.toggle('hidden', app.mode !== 'free');
}

function setMode(mode) {
  app.mode = mode;
  if (mode !== 'menu') cancelAttract();
  const screenMap = {
    menu: 'screenMenu',
    songs: 'screenSongs',
    help: 'screenHelp',
    settings: 'screenSettings',
    paused: 'screenPause',
    result: 'screenResult',
    free: null,
    game: null,
  };
  showScreen(screenMap[mode] || '');
  stage?.setMode(mode === 'free' ? 'free' : mode === 'game' || mode === 'paused' ? 'game' : 'menu');
  if (mode === 'menu' || mode === 'free') stage?.piano.setLabelOpacity(0.92);
}

/** Hentikan demo latar di menu utama. */
function cancelAttract() {
  if (app.session && app.session.demo && app.demoReturn === 'menu') {
    app.session = null;
    stage?.notes.setVisible(false);
    dom.countdown.classList.add('hidden');
    releaseEverything();
    audio.allNotesOff(true);
  }
}

/** Demo singkat yang berjalan sendiri di belakang menu utama. */
function startAttract() {
  if (app.attractDone || app.mode !== 'menu' || app.session) return;
  app.attractDone = true;
  const song = getSong('fur-elise');
  const full = buildFullChart(song);
  const demoNotes = full.notes.filter((n) => !n.harmony).slice(0, 34);
  if (!demoNotes.length) return;
  const chart = { ...full, notes: demoNotes, duration: demoNotes[demoNotes.length - 1].time + 2.5 };
  app.session = new GameSession(song, { demo: true, auto: true, chart });
  app.startClock = clockNow() + LEAD_IN;
  app.demoReturn = 'menu';
  app.silentCountdown = true;
  stage.notes.setVisible(true);
  dom.hud.classList.add('hidden');
  dom.countdown.classList.add('hidden');
}

function uiBlip(freq = 660) {
  audio.unlock();
  audio.blip(freq, 0.07, 'triangle', 0.1);
}

/* ================================================================== */
/* Input nada                                                          */
/* ================================================================== */
function pressNote(midi, velocity = 0.9) {
  audio.unlock();
  if (!stage) return;
  stage.piano.press(midi, velocity);
  audio.noteOn(midi, velocity);
  stage.notes.pulse(midi, Math.min(1.2, velocity));
  stage.burstAtKey(midi, 0.35 + velocity * 0.5);

  if (app.recording) {
    app.recording.events.push({
      t: (performance.now() - app.recording.start) / 1000,
      midi,
      on: true,
      v: velocity,
    });
  }

  if (app.mode === 'free') {
    const binding = CODE_LABEL[MIDI_TO_CODE[midi]];
    dom.freeInfo.textContent = `Nada ${noteName(midi)}${binding ? ` · tombol ${binding}` : ''} · Shift = pedal`;
  }

  const s = app.session;
  if (s && app.mode === 'game' && !s.auto) {
    const ev = s.press(midi, songTime(), velocity);
    if (ev) handleEvent(ev);
  }
}

function releaseNote(midi) {
  if (!stage) return;
  stage.piano.release(midi);
  audio.noteOff(midi);

  if (app.recording) {
    app.recording.events.push({ t: (performance.now() - app.recording.start) / 1000, midi, on: false });
  }

  const s = app.session;
  if (s && app.mode === 'game' && !s.auto) {
    const ev = s.release(midi, songTime());
    if (ev) handleEvent(ev);
  }
}

function releaseEverything() {
  for (const code of app.heldKeys) {
    const midi = KEY_CODES[code];
    if (midi != null) releaseNote(midi);
  }
  app.heldKeys.clear();
  for (const [, midi] of app.heldByPointer) releaseNote(midi);
  app.heldByPointer.clear();
  if (app.session) for (const m of app.session.releaseAll()) stage?.piano.release(m);
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'judge': {
      showJudgment(ev.grade);
      if (ev.grade === 'perfect') {
        stage.burstAtKey(ev.midi, 1.15);
        stage.kick(0.16);
      } else if (ev.grade === 'great') {
        stage.burstAtKey(ev.midi, 0.8);
      } else if (ev.grade === 'good') {
        stage.burstAtKey(ev.midi, 0.5);
      } else if (ev.grade === 'miss') {
        stage.kick(0.3);
      } else if (ev.grade === 'breakHold') {
        stage.kick(0.45);
      } else if (ev.grade === 'hold') {
        stage.burstAtKey(ev.midi, 0.9);
      }
      break;
    }
    case 'missFx':
      stage.piano.flash(ev.midi, 0.25);
      break;
    case 'autoPress':
      pressNoteAuto(ev.midi, ev.velocity ?? 0.9);
      break;
    case 'autoRelease':
      stage.piano.release(ev.midi);
      audio.noteOff(ev.midi, 0.4);
      break;
    case 'release':
      stage.burstAtKey(ev.midi, 0.7);
      break;
    case 'metronome':
      audio.click(ev.accent);
      break;
    case 'end':
      endGame(ev.result);
      break;
    default:
      break;
  }
}

/** Auto-play: bunyikan tanpa menilai ulang. */
function pressNoteAuto(midi, velocity) {
  stage.piano.press(midi, velocity);
  audio.noteOn(midi, velocity);
  stage.notes.pulse(midi, velocity);
  stage.burstAtKey(midi, 0.4 + velocity * 0.7);
}

/* ================================================================== */
/* Alur permainan                                                      */
/* ================================================================== */
function startGame(opts = {}) {
  audio.unlock();
  const song = opts.song ? getSong(opts.song) : getSong(app.songId);
  releaseEverything();
  audio.allNotesOff(true);

  const session = new GameSession(song, {
    diffId: app.diff,
    speed: settings.speed,
    auto: !!opts.auto,
    demo: !!opts.demo,
    holds: settings.holds,
    metronome: app.metronome && !opts.demo,
    chart: opts.chart,
  });

  app.session = session;
  app.startClock = clockNow() + LEAD_IN;
  app.countdownStep = 99;
  app.silentCountdown = false;
  app.demoReturn = opts.demoReturn || 'free';

  stage.notes.setVisible(true);
  stage.piano.setNames(settings.names);
  stage.piano.setLabelOpacity(opts.demo ? 0.5 : 0.38);
  dom.hudSong.textContent = opts.demo ? `Demo — ${song.title}` : song.title;
  dom.hudMeta.textContent = opts.demo
    ? `${song.composer} · AUTO`
    : `${DIFFS[app.diff].label} · ${song.bpm} BPM · ${session.total} nada`;
  dom.countdown.classList.remove('hidden');
  setMode('game');
  updateHud();
  uiBlip(880);
}

function togglePause(force) {
  if (!app.session) return;
  if (app.mode === 'game' && force !== false) {
    app.session.pause();
    releaseEverything();
    audio.allNotesOff(true);
    audio.ctx?.suspend?.();
    dom.pauseInfo.textContent = `${dom.hudSong.textContent} · skor ${fmt(app.session.score)}`;
    setMode('paused');
    uiBlip(420);
  } else if (app.mode === 'paused' && force !== true) {
    const p = audio.ctx && audio.ctx.state === 'suspended' ? audio.ctx.resume() : null;
    Promise.resolve(p)
      .catch(() => {})
      .then(() => {
        if (!app.session) return;
        app.startClock = clockNow() - app.session.time; // jaga posisi waktu tetap
        app.session.resume();
        setMode('game');
        uiBlip(720);
      });
  }
}

function endGame(result) {
  app.lastResult = result;
  releaseEverything();
  audio.allNotesOff();
  stage.notes.setVisible(false);
  dom.countdown.classList.add('hidden');

  if (result.demo) {
    const back = app.demoReturn === 'menu';
    if (!back) {
      toast('Demo selesai ✨');
      audio.fanfare(true);
    }
    app.session = null;
    setMode(back ? 'menu' : 'free');
    return;
  }

  // simpan rekor
  const key = `${app.songId}|${app.diff}`;
  const prev = bests[key];
  const isRecord = !prev || result.score > prev.score;
  if (isRecord && !app.auto) {
    bests[key] = {
      score: result.score,
      acc: result.accuracy,
      rank: result.rank,
      combo: result.maxCombo,
      at: Date.now(),
    };
    saveJSON(BEST_KEY, bests);
  }

  dom.resRank.textContent = result.rank;
  dom.resRank.className = `rank-big ${result.rankCls}`;
  dom.resTitle.textContent = result.failed ? 'HP Habis!' : 'Lagu Selesai!';
  dom.resSong.textContent = `${result.songTitle} · ${result.diff} · ${result.rankLabel}`;
  dom.resScore.textContent = fmt(result.score);
  const c = result.counts;
  const cells = [
    ['SEMPURNA', c.perfect, 'j-perfect'],
    ['HEBAT', c.great, 'j-great'],
    ['BAGUS', c.good, 'j-good'],
    ['MELESET', c.miss, 'j-miss'],
    ['TAHAN OK', c.hold, 'j-hold'],
    ['LEPAS', c.breakHold, 'j-miss'],
    ['KOMBO', result.maxCombo, ''],
    ['HP', `${Math.round(result.hp)}%`, ''],
  ];
  dom.resGrid.innerHTML = cells
    .map(
      ([label, value, cls]) =>
        `<div class="res-cell"><span>${label}</span><b class="${cls}">${value}</b></div>`,
    )
    .join('');
  dom.resAccFill.style.width = `${Math.max(2, result.accuracy).toFixed(1)}%`;
  dom.resBest.textContent = isRecord
    ? `🏆 Rekor baru! Akurasi ${result.accuracy.toFixed(1)}%`
    : `Akurasi ${result.accuracy.toFixed(1)}% · Rekor: ${fmt(prev?.score || 0)}`;

  audio.fanfare(!result.failed);
  setMode('result');
  renderSongGrid();
}

/* ================================================================== */
/* HUD                                                                 */
/* ================================================================== */
function updateHud() {
  const s = app.session;
  if (!s) return;
  dom.hudScore.textContent = fmt(s.score);
  dom.hudAcc.textContent = `${s.accuracy.toFixed(1)}%`;
  dom.hudMult.textContent = `x${s.multiplier.toFixed(1)}`;
  const hp = Math.max(0, Math.min(100, s.hp));
  dom.hpFill.style.width = `${hp}%`;
  dom.hpFill.classList.toggle('low', hp < 35);
  dom.progressFill.style.width = `${(s.progress * 100).toFixed(2)}%`;
  if (s.combo >= 3) {
    dom.hudCombo.classList.remove('hidden');
    const b = dom.hudCombo.querySelector('b');
    if (b.textContent !== String(s.combo)) {
      b.textContent = s.combo;
      dom.hudCombo.classList.remove('pop');
      void dom.hudCombo.offsetWidth;
      dom.hudCombo.classList.add('pop');
    }
  } else {
    dom.hudCombo.classList.add('hidden');
  }
}

function updateCountdown() {
  const s = app.session;
  if (!s) return;
  const el = dom.countdown;
  if (app.silentCountdown) {
    el.classList.add('hidden');
    return;
  }
  const t = s.time;
  if (t >= 0) {
    if (!el.classList.contains('hidden')) el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const n = Math.ceil(-t);
  if (n !== app.countdownStep) {
    app.countdownStep = n;
    el.textContent = n <= 3 ? String(n) : 'SIAP';
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    if (n <= 3) audio.click(n === 1);
  }
}

/* ================================================================== */
/* Daftar lagu                                                         */
/* ================================================================== */
function renderSongGrid() {
  const grid = dom.songGrid;
  grid.innerHTML = '';
  for (const s of SONG_LIST) {
    const key = `${s.id}|${app.diff}`;
    const best = bests[key];
    const btn = document.createElement('button');
    btn.className = `song${s.id === app.songId ? ' active' : ''}`;
    btn.type = 'button';
    const stars = '★'.repeat(s.stars) + '☆'.repeat(3 - s.stars);
    btn.innerHTML = `
      <div class="s-title">${s.title}</div>
      <div class="s-sub">${s.composer}</div>
      <div class="s-foot">
        <span class="stars" title="Tingkat kesulitan">${stars}</span>
        <span>${s.bpm} BPM · ${Math.round(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}</span>
        ${best ? `<span class="s-best">${best.rank} · ${fmt(best.score)}</span>` : '<span>belum ada rekor</span>'}
      </div>`;
    btn.addEventListener('click', () => {
      app.songId = s.id;
      renderSongGrid();
      uiBlip(760);
    });
    btn.addEventListener('dblclick', () => startGame({ song: s.id }));
    grid.appendChild(btn);
  }
}

function renderKeymap() {
  const kb = buildKeyboard();
  const wrap = dom.keymap;
  if (!wrap) return;
  const unit = 100 / kb.whiteCount;
  let html = '<div class="km-piano">';
  let whiteIdx = 0;
  for (const k of kb.keys) {
    const code = MIDI_TO_CODE[k.midi];
    const label = code ? CODE_LABEL[code] : '';
    if (k.black) {
      const left = whiteIdx * unit - unit * 0.3;
      html += `<span class="km-black" style="left:${left}%;width:${unit * 0.6}%">${label}</span>`;
    } else {
      html += `<span class="km-white" style="left:${whiteIdx * unit}%;width:${unit}%">${label}</span>`;
      whiteIdx++;
    }
  }
  html += '</div>';
  wrap.innerHTML = html;
}

/* ================================================================== */
/* Pengaturan                                                          */
/* ================================================================== */
function applySettings() {
  audio.setVolume(settings.volume);
  audio.setReverb(settings.reverb);
  audio.setTone(settings.tone);
  audio.uiSound = settings.uiSound;
  stage?.setQuality(settings.quality);
  stage?.piano.setNames(settings.names);
  dom.setVolume.value = Math.round(settings.volume * 100);
  dom.outVolume.textContent = `${Math.round(settings.volume * 100)}%`;
  dom.setReverb.value = Math.round(settings.reverb * 100);
  dom.outReverb.textContent = `${Math.round(settings.reverb * 100)}%`;
  dom.setTone.value = Math.round(settings.tone * 100);
  dom.outTone.textContent = `${Math.round(settings.tone * 100)}%`;
  dom.setSpeed.value = Math.round(settings.speed * 100);
  dom.outSpeed.textContent = `${settings.speed.toFixed(2)}×`;
  dom.speedRange.value = Math.round(settings.speed * 100);
  dom.speedOut.textContent = `${settings.speed.toFixed(2)}×`;
  dom.setQuality.value = settings.quality;
  dom.setNames.value = settings.names ? 'on' : 'off';
  dom.setHolds.value = settings.holds ? 'on' : 'off';
  dom.setUiSound.value = settings.uiSound ? 'on' : 'off';
  dom.btnNames.textContent = `Nama Nada: ${settings.names ? 'ON' : 'OFF'}`;
  dom.btnNames.classList.toggle('on', settings.names);
  updatePedal();
}

/** Pedal sustain: tombol UI atau tombol Shift/M yang sedang ditahan. */
function updatePedal() {
  const on = settings.pedal || app.shiftPedal;
  audio.setSustain(on);
  if (!dom.btnPedal) return;
  dom.btnPedal.textContent = `Pedal: ${on ? 'ON' : 'OFF'}`;
  dom.btnPedal.classList.toggle('on', on);
}

function persistSettings() {
  saveJSON(SETTINGS_KEY, settings);
}

/* ================================================================== */
/* Mode bebas: rekam & putar                                           */
/* ================================================================== */
function toggleRecording() {
  if (app.recording) {
    const events = app.recording.events;
    app.recording = null;
    app.lastRec = events.length ? events : null;
    dom.btnRec.textContent = '● Rekam';
    dom.btnRec.classList.remove('rec');
    dom.btnPlayRec.disabled = !app.lastRec;
    toast(events.length ? `Rekaman tersimpan (${events.length} kejadian)` : 'Tidak ada nada yang terekam');
    uiBlip(520);
  } else {
    app.playback = null;
    app.recording = { events: [], start: performance.now() };
    dom.btnRec.textContent = '■ Stop';
    dom.btnRec.classList.add('rec');
    dom.btnPlayRec.disabled = true;
    toast('Merekam… mainkan pianonya');
    uiBlip(700);
  }
}

function startPlayback() {
  if (!app.lastRec || app.recording) return;
  app.playback = { events: app.lastRec, idx: 0, start: performance.now() };
  uiBlip(760);
  toast('Memutar rekaman…');
}

function updatePlayback() {
  const pb = app.playback;
  if (!pb) return;
  const t = (performance.now() - pb.start) / 1000;
  while (pb.idx < pb.events.length && pb.events[pb.idx].t <= t) {
    const e = pb.events[pb.idx++];
    if (e.on) pressNote(e.midi, e.v ?? 0.85);
    else releaseNote(e.midi);
  }
  if (pb.idx >= pb.events.length && t > (pb.events[pb.events.length - 1]?.t ?? 0) + 1.2) {
    app.playback = null;
    toast('Pemutaran selesai');
  }
}

/* ================================================================== */
/* Loop utama                                                          */
/* ================================================================== */
let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  const energy = audio.updateLevel();

  const s = app.session;
  const sessionActive = s && (app.mode === 'game' || app.mode === 'paused' || (app.mode === 'menu' && s.demo));
  if (sessionActive) {
    if (app.mode !== 'paused') {
      const evs = s.update(songTime());
      for (const ev of evs) handleEvent(ev);
      if (app.mode === 'game') {
        updateHud();
        updateCountdown();
      }
    }
    stage.update(dt, {
      energy,
      chart: s.visibleNotes(),
      songTime: s.time,
      approach: s.approach,
    });
  } else {
    if (app.mode === 'free') updatePlayback();
    stage.update(dt, { energy });
  }

  stage.render();
  requestAnimationFrame(frame);
}

/* ================================================================== */
/* Wiring                                                              */
/* ================================================================== */
function bindUI() {
  const ids = [
    'hud', 'hudSong', 'hudMeta', 'hudScore', 'hudCombo', 'hudAcc', 'hudMult', 'hpFill', 'progressFill',
    'btnPause', 'judgment', 'countdown', 'freebar', 'btnFreeBack', 'btnNames', 'btnPedal', 'btnRec',
    'btnPlayRec', 'btnDemo', 'freeInfo', 'screenMenu', 'screenSongs', 'screenHelp', 'screenSettings',
    'screenPause', 'screenResult', 'btnPlay', 'btnFree', 'btnHelp', 'btnSettings', 'btnSongsBack',
    'diffPicker', 'songGrid', 'speedRange', 'speedOut', 'chkAuto', 'chkMetronome', 'btnStart',
    'btnHelpBack', 'keymap', 'btnSetBack', 'setVolume', 'outVolume', 'setReverb', 'outReverb',
    'setTone', 'outTone', 'setSpeed', 'outSpeed', 'setQuality', 'setNames', 'setHolds', 'setUiSound',
    'btnTestSound', 'btnResetData', 'pauseInfo', 'btnResume', 'btnRestart', 'btnChangeSong', 'btnQuit',
    'resRank', 'resTitle', 'resSong', 'resScore', 'resGrid', 'resAccFill', 'resBest', 'btnRetry',
    'btnResSongs', 'btnResMenu', 'toast', 'loader', 'heroStatus',
  ];
  for (const id of ids) dom[id] = $(id);

  // navigasi
  dom.btnPlay.addEventListener('click', () => {
    audio.unlock();
    renderSongGrid();
    setMode('songs');
    uiBlip(700);
  });
  dom.btnFree.addEventListener('click', () => {
    audio.unlock();
    enterFreeMode();
    uiBlip(600);
  });
  dom.btnHelp.addEventListener('click', () => {
    setMode('help');
    uiBlip(600);
  });
  dom.btnSettings.addEventListener('click', () => {
    setMode('settings');
    uiBlip(600);
  });
  dom.btnHelpBack.addEventListener('click', () => {
    setMode('menu');
    uiBlip(480);
  });
  dom.btnSetBack.addEventListener('click', () => {
    setMode('menu');
    uiBlip(480);
  });
  dom.btnSongsBack.addEventListener('click', () => {
    setMode('menu');
    uiBlip(480);
  });
  dom.btnFreeBack.addEventListener('click', () => {
    releaseEverything();
    audio.allNotesOff(true);
    stopPlayback();
    setMode('menu');
    uiBlip(480);
  });

  // pilih tingkat kesulitan
  dom.diffPicker.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-diff]');
    if (!b) return;
    app.diff = b.dataset.diff;
    for (const el of dom.diffPicker.querySelectorAll('button')) el.classList.toggle('active', el === b);
    renderSongGrid();
    uiBlip(820);
  });

  dom.btnStart.addEventListener('click', () => {
    app.auto = dom.chkAuto.checked;
    app.metronome = dom.chkMetronome.checked;
    startGame({ song: app.songId, auto: app.auto });
  });

  const onSpeed = (e) => {
    settings.speed = Math.max(0.6, Math.min(1.8, Number(e.target.value) / 100));
    dom.speedOut.textContent = `${settings.speed.toFixed(2)}×`;
    dom.outSpeed.textContent = `${settings.speed.toFixed(2)}×`;
    dom.setSpeed.value = e.target.value;
    dom.speedRange.value = e.target.value;
    persistSettings();
  };
  dom.speedRange.addEventListener('input', onSpeed);
  dom.setSpeed.addEventListener('input', onSpeed);

  // jeda
  dom.btnPause.addEventListener('click', () => togglePause(true));
  dom.btnResume.addEventListener('click', () => togglePause(false));
  dom.btnRestart.addEventListener('click', () => {
    audio.ctx?.resume?.();
    startGame({ song: app.songId, auto: app.auto, demo: app.session?.demo });
  });
  dom.btnChangeSong.addEventListener('click', () => {
    audio.ctx?.resume?.();
    app.session = null;
    stage.notes.setVisible(false);
    dom.countdown.classList.add('hidden');
    renderSongGrid();
    setMode('songs');
  });
  dom.btnQuit.addEventListener('click', () => {
    audio.ctx?.resume?.();
    app.session = null;
    stage.notes.setVisible(false);
    dom.countdown.classList.add('hidden');
    releaseEverything();
    audio.allNotesOff(true);
    setMode('menu');
  });

  // hasil
  dom.btnRetry.addEventListener('click', () => startGame({ song: app.songId, auto: app.auto }));
  dom.btnResSongs.addEventListener('click', () => {
    renderSongGrid();
    setMode('songs');
  });
  dom.btnResMenu.addEventListener('click', () => setMode('menu'));

  // mode bebas
  dom.btnNames.addEventListener('click', () => {
    settings.names = !settings.names;
    stage.piano.setNames(settings.names);
    persistSettings();
    applySettings();
    uiBlip(settings.names ? 780 : 520);
  });
  dom.btnPedal.addEventListener('click', () => {
    settings.pedal = !settings.pedal;
    persistSettings();
    updatePedal();
    toast(settings.pedal ? 'Pedal sustain aktif (Shift juga bisa)' : 'Pedal sustain mati');
    uiBlip(settings.pedal ? 780 : 520);
  });
  dom.btnRec.addEventListener('click', toggleRecording);
  dom.btnPlayRec.addEventListener('click', startPlayback);
  dom.btnDemo.addEventListener('click', () => {
    const song = getSong(app.songId);
    startGame({
      song: song.id,
      demo: true,
      auto: true,
      demoReturn: 'free',
      chart: buildFullChart(song),
    });
  });

  // pengaturan
  const bindRange = (el, out, key, scale = 100, suffix = '%') => {
    el.addEventListener('input', (e) => {
      settings[key] = Number(e.target.value) / scale;
      out.textContent = suffix === '%' ? `${Math.round(settings[key] * 100)}%` : settings[key].toFixed(2);
      persistSettings();
      applySettings();
    });
  };
  bindRange(dom.setVolume, dom.outVolume, 'volume');
  bindRange(dom.setReverb, dom.outReverb, 'reverb');
  bindRange(dom.setTone, dom.outTone, 'tone');

  dom.setQuality.addEventListener('change', (e) => {
    settings.quality = e.target.value;
    persistSettings();
    applySettings();
  });
  dom.setNames.addEventListener('change', (e) => {
    settings.names = e.target.value === 'on';
    persistSettings();
    applySettings();
  });
  dom.setHolds.addEventListener('change', (e) => {
    settings.holds = e.target.value === 'on';
    persistSettings();
    applySettings();
  });
  dom.setUiSound.addEventListener('change', (e) => {
    settings.uiSound = e.target.value === 'on';
    persistSettings();
    applySettings();
  });
  dom.btnTestSound.addEventListener('click', () => {
    audio.unlock();
    [60, 64, 67, 72].forEach((m, i) => {
      audio.noteOn(m, 0.8, audio.now + i * 0.14);
      setTimeout(() => audio.noteOff(m, 0.5), 500 + i * 140);
    });
  });
  dom.btnResetData.addEventListener('click', () => {
    bests = {};
    saveJSON(BEST_KEY, bests);
    renderSongGrid();
    toast('Semua rekor dihapus');
  });

  dom.chkAuto.checked = app.auto;
  dom.chkMetronome.checked = app.metronome;
}

function stopPlayback() {
  app.playback = null;
  if (app.recording) {
    app.recording = null;
    dom.btnRec.textContent = '● Rekam';
    dom.btnRec.classList.remove('rec');
    dom.btnPlayRec.disabled = !app.lastRec;
  }
}

function enterFreeMode() {
  app.session = null;
  stage.notes.setVisible(false);
  stage.piano.setNames(settings.names);
  stage.piano.setLabelOpacity(0.92);
  dom.countdown.classList.add('hidden');
  setMode('free');
  dom.freeInfo.textContent = `Mode bebas · rentang ${noteName(60)}–${noteName(84)} · Shift = pedal`;
  // sapaan: mainkan akor lembut
  setTimeout(() => {
    [60, 64, 67, 72].forEach((m, i) => {
      pressNote(m, 0.55);
      setTimeout(() => releaseNote(m), 900 + i * 60);
    });
  }, 220);
}

function bindKeys() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (app.mode === 'game' || app.mode === 'paused') togglePause();
        return;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyM') {
        if (!app.shiftPedal) {
          app.shiftPedal = true;
          updatePedal();
        }
        return;
      }
      if (e.code === 'ArrowLeft') {
        stage.orbit(-0.08, 0);
        return;
      }
      if (e.code === 'ArrowRight') {
        stage.orbit(0.08, 0);
        return;
      }
      if (e.code === 'ArrowUp') {
        stage.zoom(0.94);
        e.preventDefault();
        return;
      }
      if (e.code === 'ArrowDown') {
        stage.zoom(1.06);
        e.preventDefault();
        return;
      }
      if ((e.code === 'Enter' || e.code === 'Space') && app.mode === 'songs') {
        e.preventDefault();
        app.auto = dom.chkAuto.checked;
        app.metronome = dom.chkMetronome.checked;
        startGame({ song: app.songId, auto: app.auto });
        return;
      }
      const midi = KEY_CODES[e.code];
      if (midi == null) return;
      e.preventDefault();
      if (app.heldKeys.has(e.code)) return;
      app.heldKeys.add(e.code);
      pressNote(midi, 0.92);
    },
    { passive: false },
  );

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyM') {
      if (app.shiftPedal) {
        app.shiftPedal = false;
        updatePedal();
      }
      return;
    }
    const midi = KEY_CODES[e.code];
    if (midi == null) return;
    app.heldKeys.delete(e.code);
    releaseNote(midi);
  });

  window.addEventListener('blur', () => {
    releaseEverything();
    app.shiftPedal = false;
    updatePedal();
  });

  // buka kunci audio pada gestur pertama, lalu jalankan demo latar di menu
  const unlock = () => {
    audio.unlock().then((ok) => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (ok) setTimeout(() => startAttract(), 1400);
    });
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function bindStageInput() {
  stage.onSelect = (midi, info) => {
    if (info.down) {
      app.heldByPointer.set(info.id, midi);
      pressNote(midi, 0.95);
    } else {
      const m = app.heldByPointer.get(info.id);
      app.heldByPointer.delete(info.id);
      releaseNote(m ?? midi);
    }
  };
}

/* ================================================================== */
/* Boot                                                                */
/* ================================================================== */
function boot() {
  bindUI();
  const canvas = $('stage');
  try {
    stage = new Stage3D(canvas);
  } catch (err) {
    console.error(err);
    dom.loader.innerHTML =
      '<div style="max-width:34rem;text-align:center;line-height:1.6">' +
      '<h2 style="margin:0 0 .5rem">WebGL tidak tersedia</h2>' +
      '<p style="color:#9aa0c0;margin:0">Game piano 3D ini butuh WebGL. ' +
      'Coba peramban lain, atau aktifkan akselerasi perangkat keras di pengaturan perambanmu.</p>' +
      `<p style="color:#6b7194;font-size:12px;margin-top:1rem">${String(err?.message || err)}</p></div>`;
    return;
  }
  bindStageInput();
  applySettings();
  renderSongGrid();
  renderKeymap();
  bindKeys();

  // status di menu utama
  dom.heroStatus.textContent = `${SONG_LIST.length} lagu · 3 tingkat kesulitan · 25 tuts`;

  requestAnimationFrame(frame);

  setTimeout(() => {
    dom.loader.classList.add('done');
    setMode('menu');
    setTimeout(() => dom.loader.remove(), 600);
  }, 320);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
