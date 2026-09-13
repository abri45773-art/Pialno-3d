# 🎹 Pialno-3d

Grand piano **3D interaktif** yang berjalan langsung di browser. Dibuat dengan
[Three.js](https://threejs.org) untuk visual dan **Web Audio API** untuk suara —
tanpa satu pun file sampel audio (semua nada disintesis secara real-time).

## ✨ Fitur

| | |
|---|---|
| 🎼 **61 tuts (C2–C7)** | Geometri tuts putih bertakik seperti piano asli, tuts hitam trapesium |
| 🔊 **Synthesis piano** | Multi-partial + inharmonisitas dawai, transien palu, decay per-register |
| 🖱️ **Mouse / sentuh** | Klik tuts; velocity mengikuti posisi pukulan, drag = glissando |
| ⌨️ **Keyboard komputer** | Dua oktaf penuh, bisa digeser dengan ← → |
| 🎹 **Web MIDI** | Otomatis mendeteksi MIDI controller (termasuk pedal sustain CC64) |
| 🎵 **6 lagu demo** | Für Elise, Ode to Joy, Canon in D, Moonlight Sonata, Greensleeves, Twinkle |
| 💡 **Falling notes** | Balok cahaya gaya Synthesia yang jatuh ke tuts |
| ⏺️ **Rekam & putar ulang** | Rekam permainan lalu putar kembali lengkap dengan animasi |
| 🎚️ **Kontrol suara** | Volume, reverb (convolver prosedural), kecerahan nada, pedal sustain |
| 🎥 **3 preset kamera** | Pemain, Sinematik, Atas — plus orbit/zoom bebas |

## 🚀 Menjalankan

```bash
npm install
npm run dev      # buka http://localhost:5173
```

Build untuk produksi:

```bash
npm run build    # hasil di dist/
npm run preview
```

## 🎮 Kontrol

**Tuts (oktaf bawah)**
```
Putih :  Z  X  C  V  B  N  M  ,  .  /
Hitam :   S  D     G  H  J     L  ;
```

**Tuts (oktaf atas)**
```
Putih :  Q  W  E  R  T  Y  U  I  O  P
Hitam :   2  3     5  6  7     9  0
```

| Tombol | Fungsi |
|---|---|
| `Space` | Pedal sustain |
| `←` `→` | Geser oktaf |
| `Shift` + tuts | Mainkan lebih keras |
| `F` | Layar penuh |
| Drag kanan / 2 jari | Putar kamera |
| Scroll | Zoom |

## 🏗️ Struktur

```
src/
├── main.js     # scene, pencahayaan, input, pemutar lagu, perekam, UI
├── piano.js    # geometri 3D grand piano (bodi, tuts, senar, pedal, bangku)
├── audio.js    # mesin sintesis piano (Web Audio API)
├── falling.js  # efek falling notes (InstancedMesh)
├── songs.js    # data lagu demo (domain publik)
└── style.css   # antarmuka & tata letak responsif
```

### Catatan teknis

- **Sintesis nada** — setiap not dibangun dari 5–11 parsial sinus dengan
  inharmonisitas dawai `fₙ = n·f₀·√(1 + B·n²)`, ditambah noise transien palu,
  amplop dua tahap (peluruhan cepat → aftersound), dan filter yang ikut
  velocity sehingga pukulan keras terdengar lebih cerah.
- **Gain staging** — kompresor + limiter di master menjaga akord tebal tetap
  di bawah 0 dBFS (diverifikasi: 8 not serentak → peak ≈ 0.79).
- **Rendering** — `MeshPhysicalMaterial` dengan clearcoat untuk pernis, IBL dari
  `RoomEnvironment`, shadow map PCF lembut, dan bloom halus yang bereaksi
  terhadap jumlah not yang sedang dimainkan.
- **Responsif** — kamera otomatis mundur pada layar potret, dan panel kontrol
  berubah menjadi bottom sheet di layar sempit.

## 📄 Lisensi

MIT. Semua lagu demo adalah domain publik.
