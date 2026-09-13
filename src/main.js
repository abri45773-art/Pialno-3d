import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

import { PianoAudio, midiToName, isBlackKey } from './audio.js';
import { Piano3D, KEY } from './piano.js';
import { FallingNotes } from './falling.js';
import { SONGS } from './songs.js';

// ======================================================
// Setup dasar
// ======================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.085);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 60);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.5;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 0.78, 0);
controls.mouseButtons = {
  LEFT: null,                          // klik kiri = memainkan tuts
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

// Lingkungan (IBL) untuk pantulan pernis
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ======================================================
// Piano + panggung
// ======================================================
const piano = new Piano3D({ startMidi: 36, endMidi: 96 }); // C2..C7 (61 tuts)
scene.add(piano.group);

const falling = new FallingNotes(piano, { lead: 2.4, height: 0.85 });

// --- lantai ---
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.42, metalness: 0.32 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// cincin dekoratif di lantai
const ring = new THREE.Mesh(
  new THREE.RingGeometry(2.3, 2.36, 96),
  new THREE.MeshBasicMaterial({ color: 0x2a3550, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.002;
scene.add(ring);

// --- pencahayaan ---
scene.add(new THREE.HemisphereLight(0x53648c, 0x0a0c12, 0.38));
scene.add(new THREE.AmbientLight(0xffffff, 0.1));

RectAreaLightUniformsLib.init();

const keyLight = new THREE.SpotLight(0xfff1dc, 16, 14, 0.72, 0.6, 1.4);
keyLight.position.set(-1.9, 3.1, 2.1);
keyLight.target.position.set(0, 0.7, -0.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.01;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 14;
scene.add(keyLight, keyLight.target);

const rimLight = new THREE.SpotLight(0x5fa4ff, 16, 14, 0.85, 0.7, 1.3);
rimLight.position.set(2.8, 2.5, -2.6);
rimLight.target.position.set(0, 0.7, -0.5);
scene.add(rimLight, rimLight.target);

const warmFill = new THREE.PointLight(0xff9a4d, 1.6, 5.5, 2);
warmFill.position.set(1.5, 1.05, 1.5);
scene.add(warmFill);

// lampu lembut yang menyapu tuts
const keyboardLight = new THREE.RectAreaLight(0xfff4e4, 0.45, piano.kbWidth * 1.05, 0.34);
keyboardLight.position.set(0, 1.25, 0.12);
keyboardLight.lookAt(0, piano.keyTopY, -0.08);
scene.add(keyboardLight);

// ======================================================
// Post-processing (bloom lembut)
// ======================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.65, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ======================================================
// Kamera: preset tampilan
// ======================================================
const VIEWS = {
  player: { pos: new THREE.Vector3(0, 1.42, 1.28), target: new THREE.Vector3(0, 0.74, -0.12) },
  cinematic: { pos: new THREE.Vector3(-1.55, 1.34, 1.55), target: new THREE.Vector3(0.1, 0.72, -0.35) },
  top: { pos: new THREE.Vector3(0, 1.52, 0.34), target: new THREE.Vector3(0, 0.72, -0.16) },
};

let camAnim = null;
let currentView = 'player';

/**
 * Skala jarak kamera agar keyboard tetap masuk frame pada layar sempit
 * (aspect kecil = potret → kamera mundur).
 */
function fitScale() {
  const aspect = innerWidth / innerHeight;
  const ref = 1.6; // aspect desktop acuan
  return aspect >= ref ? 1 : THREE.MathUtils.clamp(ref / aspect, 1, 2.35);
}

function viewPose(name) {
  const v = VIEWS[name];
  const k = fitScale();
  const target = v.target.clone();
  // mundur dari target sepanjang vektor arah kamera
  const dir = v.pos.clone().sub(v.target);
  dir.multiplyScalar(k);
  // pada layar potret, turunkan sedikit sudut agar tidak terlalu dari atas
  if (k > 1.2) dir.y *= 0.86;
  return { pos: target.clone().add(dir), target };
}

function setView(name, instant = false) {
  if (!VIEWS[name]) return;
  currentView = name;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  const { pos, target } = viewPose(name);
  if (instant) {
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
    return;
  }
  camAnim = {
    t: 0, dur: 1.05,
    fromPos: camera.position.clone(), toPos: pos,
    fromTgt: controls.target.clone(), toTgt: target,
  };
}

setView('player', true);

// ======================================================
// Audio + status aplikasi
// ======================================================
const audio = new PianoAudio();
const activeNotes = new Set();

function noteOn(midi, velocity = 0.8, source = 'user') {
  if (midi < piano.startMidi || midi > piano.endMidi) return;
  audio.noteOn(midi, velocity);
  piano.pressKey(midi, velocity);
  activeNotes.add(midi);
  if (recording && source === 'user') {
    recEvents.push({ type: 'on', midi, vel: velocity, t: audio.currentTime - recStart });
  }
  flashNowPlaying(midi);
}

function noteOff(midi, source = 'user') {
  if (!activeNotes.has(midi)) return;
  audio.noteOff(midi);
  piano.releaseKey(midi);
  activeNotes.delete(midi);
  if (recording && source === 'user') {
    recEvents.push({ type: 'off', midi, t: audio.currentTime - recStart });
  }
}

// tampilkan not terakhir di topbar
const nowPlayingEl = document.getElementById('nowPlaying');
let npTimer = null;
let npBuf = [];
function flashNowPlaying(midi) {
  npBuf.push(midiToName(midi));
  if (npBuf.length > 6) npBuf.shift();
  nowPlayingEl.textContent = npBuf.join('  ·  ');
  clearTimeout(npTimer);
  npTimer = setTimeout(() => { npBuf = []; nowPlayingEl.textContent = '—'; }, 2600);
}

// ======================================================
// Input: mouse / sentuh pada tuts
// ======================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerNotes = new Map(); // pointerId -> midi

function pickKey(clientX, clientY) {
  pointer.x = (clientX / innerWidth) * 2 - 1;
  pointer.y = -(clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(piano.keyMeshes, false);
  if (!hits.length) return null;
  // utamakan tuts hitam kalau tumpang tindih
  const black = hits.find((h) => isBlackKey(h.object.userData.midi));
  const hit = black && black.distance < hits[0].distance + 0.02 ? black : hits[0];
  return { midi: hit.object.userData.midi, point: hit.point };
}

/** Velocity berdasarkan posisi pukulan: makin ke ujung depan tuts, makin keras. */
function velocityFromHit(hit, midi) {
  const k = piano.keys.get(midi);
  const local = piano.keyboard.worldToLocal(hit.point.clone());
  const len = KEY.whiteLen * (k.black ? KEY.blackLenRatio : 1);
  const t = THREE.MathUtils.clamp(local.z / len, 0, 1);
  return 0.45 + t * 0.5;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const hit = pickKey(e.clientX, e.clientY);
  if (!hit) return;
  canvas.setPointerCapture(e.pointerId);
  pointerNotes.set(e.pointerId, hit.midi);
  noteOn(hit.midi, velocityFromHit(hit, hit.midi));
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointerNotes.has(e.pointerId)) return;
  const hit = pickKey(e.clientX, e.clientY);
  const cur = pointerNotes.get(e.pointerId);
  if (hit && hit.midi !== cur) {           // glissando
    noteOff(cur);
    pointerNotes.set(e.pointerId, hit.midi);
    noteOn(hit.midi, velocityFromHit(hit, hit.midi) * 0.85);
  }
});

function endPointer(e) {
  const midi = pointerNotes.get(e.pointerId);
  if (midi === undefined) return;
  noteOff(midi);
  pointerNotes.delete(e.pointerId);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ======================================================
// Input: keyboard komputer
// ======================================================
const KEYMAP = {
  // oktaf bawah (mulai dari baseOctave)
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6,
  KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  // oktaf atas (+12)
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18,
  KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28, BracketLeft: 29, Equal: 30, BracketRight: 31,
};

let baseOctave = 4; // C4 sebagai acuan bawah
const heldKeys = new Set();

function codeToMidi(code) {
  const off = KEYMAP[code];
  if (off === undefined) return null;
  return 12 * (baseOctave + 1) + off - 12; // KeyZ -> C(baseOctave)
}

addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) setSustain(true);
    return;
  }
  if (e.code === 'ArrowLeft') { e.preventDefault(); shiftOctave(-1); return; }
  if (e.code === 'ArrowRight') { e.preventDefault(); shiftOctave(1); return; }
  if (e.code === 'KeyF' && !e.repeat) { toggleFullscreen(); return; }

  if (e.repeat) return;
  const midi = codeToMidi(e.code);
  if (midi === null) return;
  e.preventDefault();
  if (heldKeys.has(e.code)) return;
  heldKeys.add(e.code);
  noteOn(midi, e.shiftKey ? 0.98 : 0.82);
});

addEventListener('keyup', (e) => {
  if (e.code === 'Space') { setSustain(false); return; }
  if (!heldKeys.has(e.code)) return;
  heldKeys.delete(e.code);
  const midi = codeToMidi(e.code);
  if (midi !== null) noteOff(midi);
});

addEventListener('blur', () => {
  for (const code of [...heldKeys]) {
    const m = codeToMidi(code);
    if (m !== null) noteOff(m);
  }
  heldKeys.clear();
});

const octavePill = document.getElementById('octavePill');
function shiftOctave(d) {
  const next = THREE.MathUtils.clamp(baseOctave + d, 1, 6);
  if (next === baseOctave) return;
  for (const code of [...heldKeys]) {
    const m = codeToMidi(code);
    if (m !== null) noteOff(m);
  }
  heldKeys.clear();
  baseOctave = next;
  octavePill.innerHTML = `Oktaf: <b>C${baseOctave}</b> &nbsp;·&nbsp; ← →`;
  updateLabels();
}
octavePill.innerHTML = `Oktaf: <b>C${baseOctave}</b> &nbsp;·&nbsp; ← →`;

// ======================================================
// Input: Web MIDI
// ======================================================
const midiStatusEl = document.getElementById('midiStatus');
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess()
    .then((access) => {
      const attach = () => {
        const names = [];
        for (const input of access.inputs.values()) {
          input.onmidimessage = onMidiMessage;
          names.push(input.name);
        }
        midiStatusEl.innerHTML = names.length
          ? `<b>MIDI:</b> terhubung — ${names.join(', ')}`
          : '<b>MIDI:</b> tidak ada perangkat';
      };
      attach();
      access.onstatechange = attach;
    })
    .catch(() => { midiStatusEl.innerHTML = '<b>MIDI:</b> izin ditolak'; });
} else {
  midiStatusEl.innerHTML = '<b>MIDI:</b> tidak didukung browser ini';
}

function onMidiMessage(msg) {
  const [status, d1, d2] = msg.data;
  const cmd = status & 0xf0;
  if (cmd === 0x90 && d2 > 0) noteOn(d1, d2 / 127);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteOff(d1);
  else if (cmd === 0xb0 && d1 === 64) setSustain(d2 >= 64);
}

// ======================================================
// Pemutar lagu
// ======================================================
const songSelect = document.getElementById('songSelect');
SONGS.forEach((s, i) => {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = `${s.title} — ${s.composer}`;
  songSelect.appendChild(o);
});

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const tempoSlider = document.getElementById('tempo');
const tempoOut = document.getElementById('tempoOut');
const loopCheck = document.getElementById('loop');

let player = null;

function startSong(index) {
  stopSong();
  const song = SONGS[index];
  const rate = parseInt(tempoSlider.value, 10) / 100;
  const startAt = audio.currentTime + 0.6;

  const events = [];
  for (const n of song.notes) {
    events.push({ t: startAt + n.time / rate, type: 'on', midi: n.midi, vel: n.vel });
    events.push({ t: startAt + (n.time + n.dur) / rate, type: 'off', midi: n.midi });
  }
  events.sort((a, b) => a.t - b.t);

  player = { song, events, i: 0, endsAt: startAt + song.duration / rate, startAt };

  falling.schedule(song.notes.map((n) => ({ midi: n.midi, time: n.time / rate, dur: n.dur / rate })), startAt);

  playBtn.textContent = '❚❚ Jeda';
  playBtn.classList.add('active');
  stopBtn.disabled = false;
  nowPlayingEl.textContent = `♪ ${song.title} — ${song.composer}`;
}

function stopSong() {
  if (!player) return;
  for (const m of [...activeNotes]) noteOff(m, 'player');
  player = null;
  falling.clear();
  playBtn.textContent = '▶ Putar';
  playBtn.classList.remove('active');
  stopBtn.disabled = true;
}

function tickPlayer() {
  if (!player) return;
  const now = audio.currentTime;
  while (player.i < player.events.length && player.events[player.i].t <= now + 0.02) {
    const e = player.events[player.i++];
    if (e.type === 'on') noteOn(e.midi, e.vel, 'player');
    else noteOff(e.midi, 'player');
  }
  if (now > player.endsAt) {
    const idx = parseInt(songSelect.value, 10);
    const again = loopCheck.checked;
    stopSong();
    if (again) startSong(idx);
  }
}

playBtn.addEventListener('click', async () => {
  await ensureAudio();
  if (player) stopSong();
  else startSong(parseInt(songSelect.value, 10));
});
stopBtn.addEventListener('click', stopSong);
songSelect.addEventListener('change', () => { if (player) startSong(parseInt(songSelect.value, 10)); });
tempoSlider.addEventListener('input', () => {
  tempoOut.textContent = `${tempoSlider.value}%`;
  if (player) startSong(parseInt(songSelect.value, 10));
});

// ======================================================
// Perekam
// ======================================================
const recBtn = document.getElementById('recBtn');
const playRecBtn = document.getElementById('playRecBtn');
const clearRecBtn = document.getElementById('clearRecBtn');
const recInfo = document.getElementById('recInfo');

let recording = false;
let recEvents = [];
let recStart = 0;
let recPlayer = null;

recBtn.addEventListener('click', async () => {
  await ensureAudio();
  recording = !recording;
  if (recording) {
    recEvents = [];
    recStart = audio.currentTime;
    recBtn.textContent = '■ Stop';
    recBtn.classList.add('rec-on');
    recInfo.textContent = 'Merekam… mainkan sesuatu!';
    playRecBtn.disabled = true;
  } else {
    recBtn.textContent = '● Rekam';
    recBtn.classList.remove('rec-on');
    const notes = recEvents.filter((e) => e.type === 'on').length;
    const dur = recEvents.length ? recEvents[recEvents.length - 1].t : 0;
    recInfo.textContent = notes ? `${notes} not · ${dur.toFixed(1)} detik` : 'Tidak ada not terekam.';
    playRecBtn.disabled = !notes;
    clearRecBtn.disabled = !notes;
  }
});

playRecBtn.addEventListener('click', async () => {
  await ensureAudio();
  if (recPlayer) { stopRecPlayback(); return; }
  stopSong();
  const startAt = audio.currentTime + 0.25;
  recPlayer = {
    events: recEvents.map((e) => ({ ...e, at: startAt + e.t })),
    i: 0,
    endsAt: startAt + (recEvents[recEvents.length - 1]?.t ?? 0) + 1.5,
  };
  playRecBtn.textContent = '■ Stop';
  playRecBtn.classList.add('active');

  // falling notes untuk rekaman
  const pairs = [];
  const open = new Map();
  for (const e of recEvents) {
    if (e.type === 'on') open.set(e.midi, e);
    else {
      const on = open.get(e.midi);
      if (on) { pairs.push({ midi: e.midi, time: on.t, dur: Math.max(0.12, e.t - on.t) }); open.delete(e.midi); }
    }
  }
  for (const [midi, on] of open) pairs.push({ midi, time: on.t, dur: 0.6 });
  falling.schedule(pairs, startAt);
});

function stopRecPlayback() {
  if (!recPlayer) return;
  for (const m of [...activeNotes]) noteOff(m, 'player');
  recPlayer = null;
  falling.clear();
  playRecBtn.textContent = '▶ Putar';
  playRecBtn.classList.remove('active');
}

function tickRecPlayer() {
  if (!recPlayer) return;
  const now = audio.currentTime;
  while (recPlayer.i < recPlayer.events.length && recPlayer.events[recPlayer.i].at <= now + 0.02) {
    const e = recPlayer.events[recPlayer.i++];
    if (e.type === 'on') noteOn(e.midi, e.vel ?? 0.8, 'player');
    else noteOff(e.midi, 'player');
  }
  if (now > recPlayer.endsAt) stopRecPlayback();
}

clearRecBtn.addEventListener('click', () => {
  stopRecPlayback();
  recEvents = [];
  recInfo.textContent = 'Belum ada rekaman.';
  playRecBtn.disabled = true;
  clearRecBtn.disabled = true;
});

// ======================================================
// Panel UI
// ======================================================
const sustainCheck = document.getElementById('sustain');
function setSustain(on) {
  audio.setSustain(on);
  piano.setPedal(on);
  sustainCheck.checked = on;
}
sustainCheck.addEventListener('change', () => setSustain(sustainCheck.checked));

document.getElementById('volume').addEventListener('input', (e) => audio.setVolume(e.target.value / 100));
document.getElementById('reverb').addEventListener('input', (e) => audio.setReverb(e.target.value / 100));
document.getElementById('tone').addEventListener('input', (e) => audio.setTone(e.target.value / 100));

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

const panel = document.getElementById('panel');
document.getElementById('panelToggle').addEventListener('click', () => panel.classList.toggle('hidden'));
// di layar sempit, panel disembunyikan agar piano terlihat penuh
if (innerWidth < 860) panel.classList.add('hidden');

const autoRotate = document.getElementById('autoRotate');
autoRotate.addEventListener('change', () => {
  controls.autoRotate = autoRotate.checked;
  controls.autoRotateSpeed = 0.55;
});

document.getElementById('fallingNotes').addEventListener('change', (e) => falling.setEnabled(e.target.checked));

const noteNamesCheck = document.getElementById('noteNames');
const keyLabelsCheck = document.getElementById('keyLabels');
function updateLabels() {
  let letters = null;
  if (keyLabelsCheck.checked) {
    letters = {};
    const pretty = { Comma: ',', Period: '.', Semicolon: ';', Slash: '/', BracketLeft: '[', BracketRight: ']', Equal: '=' };
    for (const code of Object.keys(KEYMAP)) {
      const midi = codeToMidi(code);
      if (midi === null || midi < piano.startMidi || midi > piano.endMidi) continue;
      if (letters[midi]) continue;
      letters[midi] = pretty[code] || code.replace('Key', '').replace('Digit', '');
    }
  }
  piano.setLabels({ noteNames: noteNamesCheck.checked, letters });
}
noteNamesCheck.addEventListener('change', updateLabels);
keyLabelsCheck.addEventListener('change', updateLabels);
updateLabels();

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ======================================================
// Splash / inisialisasi audio
// ======================================================
const splash = document.getElementById('splash');
let audioReady = false;

async function ensureAudio() {
  if (!audioReady) {
    await audio.init();
    audio.setVolume(document.getElementById('volume').value / 100);
    audio.setReverb(document.getElementById('reverb').value / 100);
    audio.setTone(document.getElementById('tone').value / 100);
    audioReady = true;
  } else if (audio.ctx.state === 'suspended') {
    await audio.ctx.resume();
  }
}

document.getElementById('startBtn').addEventListener('click', async () => {
  await ensureAudio();
  splash.classList.add('gone');
  // akord pembuka C-major yang lembut
  const t0 = audio.currentTime + 0.12;
  [60, 64, 67, 72].forEach((m, i) => {
    setTimeout(() => { noteOn(m, 0.5, 'player'); setTimeout(() => noteOff(m, 'player'), 1400); }, i * 110);
  });
  void t0;
});

// ======================================================
// Loop render
// ======================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  tickPlayer();
  tickRecPlayer();
  piano.update(dt);
  falling.update(audio.currentTime);

  // animasi kamera preset
  if (camAnim) {
    camAnim.t += dt;
    const k = Math.min(1, camAnim.t / camAnim.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
    controls.target.lerpVectors(camAnim.fromTgt, camAnim.toTgt, e);
    if (k >= 1) camAnim = null;
  }

  // cahaya bereaksi terhadap permainan
  const energy = Math.min(1, activeNotes.size / 5);
  keyboardLight.intensity += (0.45 + energy * 0.5 - keyboardLight.intensity) * Math.min(1, dt * 8);
  warmFill.intensity += (1.6 + energy * 1.8 - warmFill.intensity) * Math.min(1, dt * 6);
  bloom.strength += (0.18 + energy * 0.16 - bloom.strength) * Math.min(1, dt * 5);
  rimLight.position.x = 2.8 + Math.sin(t * 0.25) * 0.4;

  controls.update();
  composer.render();
}
animate();

// ======================================================
// Resize
// ======================================================
let resizeTimer = null;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  // bingkai ulang agar keyboard tetap terlihat setelah rotasi layar
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!camAnim) setView(currentView); }, 160);
});

// debug helper
window.__piano = { piano, audio, scene, camera, controls, noteOn, noteOff, setView };
