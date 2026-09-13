# 🎹 Piano 3D — Game Piano Ritme Tiga Dimensi

Game piano 3D yang berjalan sepenuhnya di peramban. Balok-balok nada jatuh dari atas menuju
tuts piano tiga dimensi; tekan tuts yang tepat pada waktunya untuk menjaga kombo, mengisi HP,
dan meraih peringkat **S**. Semua suara piano disintesis langsung dengan Web Audio API — tanpa
berkas sampel, tanpa aset eksternal.

> Halo, saya ownernya 👋 — repo ini sekarang berisi game piano 3D lengkap yang siap dimainkan.

---

## ✨ Fitur

| Fitur | Keterangan |
| --- | --- |
| 🎮 **Mode Game (ritme)** | Nada jatuh gaya *Synthesia*, penilaian **SEMPURNA / HEBAT / BAGUS / MELESET**, kombo, multiplier sampai ×2.0, bar HP, dan layar hasil berperingkat S–E. |
| 🎹 **Mode Bebas** | Mainkan piano 25 tuts (C4–C6) sesukamu, lengkap dengan **pedal sustain**, label nama nada + tombol keyboard di setiap tuts. |
| 🎼 **10 lagu bawaan** | Bintang Kecil, Mary Punya Domba Kecil, Selamat Ulang Tahun, Ode to Joy, Jingle Bells, Für Elise, Canon in D, Gymnopédie No. 1, Senja di C Minor (original), Sprint Skala (original). |
| 🎚️ **3 tingkat kesulitan** | *Mudah* (melodi saja), *Sedang* (melodi + pengiring), *Sulit* (semua nada, nada jatuh lebih cepat, HP lebih ketat). |
| 🎵 **Nada tahan (hold)** | Balok panjang harus ditahan sampai ekornya melewati garis cahaya. |
| 🤖 **Mode Auto / Demo** | Tonton piano memainkan dirinya sendiri — dipakai juga sebagai demo lagu dari mode bebas. |
| 🎙️ **Rekam & Putar** | Rekam permainanmu di mode bebas lalu putar ulang. |
| 🥁 **Metronom opsional** | Klik penanda birama saat bermain. |
| 🏆 **Rekor tersimpan** | Skor terbaik per lagu & kesulitan disimpan di `localStorage`. |
| 🎨 **Visual 3D** | Piano mengilap, panggung neon, bayangan lembut, bloom, partikel, kabut, langit berbintang, dan lampu yang bereaksi terhadap audio. |
| ⚙️ **Pengaturan** | Volume, gema (reverb), kecerahan nada, kecepatan nada, kualitas grafis, label nada, nada tahan, suara UI. |
| 📱 **Responsif** | Mendukung mouse, keyboard, dan layar sentuh (ketuk tutsnya langsung, multi-jari). |

---

## 🚀 Menjalankan

Butuh **Node.js 18+**.

```bash
npm install      # pasang dependensi (three + vite)
npm run dev      # server pengembangan  ->  http://localhost:5173
npm run build    # build produksi ke folder dist/
npm run preview  # pratinjau hasil build
```

---

## 🎯 Cara Bermain

1. Klik **Main Game**, pilih lagu dan tingkat kesulitan, lalu tekan **Mulai ▶**.
2. Setelah hitung mundur, balok nada jatuh menuju tuts.
3. Tekan tuts (lewat keyboard, klik mouse, atau ketukan jari) **tepat saat** balok menyentuh
   garis cahaya di permukaan tuts.
4. Balok panjang = **tahan** tutsnya sampai ujung balok melewati garis.
5. Jaga kombo untuk menaikkan multiplier. HP habis → permainan berakhir.

### Penilaian

| Penilaian | Jendela waktu | Skor |
| --- | --- | --- |
| SEMPURNA | ±55 ms | 320 |
| HEBAT | ±100 ms | 240 |
| BAGUS | ±155 ms | 120 |
| MELESET | terlewat | 0 (kombo reset, HP −7) |

Peringkat akhir berdasarkan akurasi: **S** ≥ 95%, **A** ≥ 90%, **B** ≥ 80%, **C** ≥ 70%, **D** ≥ 60%.

### Peta keyboard

Baris tuts dipetakan seperti piano sungguhan (tuts hitam di baris atas):

```
nada tinggi  →   Z  X   C  V   B  N            (G5 … C6)
                 K  O   L  P   ;  '   ]         (C5 … F#5)
                 A  W   S  E   D  F   T  G   Y  H   U  J   (C4 … B4)
nada rendah  →   tuts putih: A S D F G H J K L ; '  Z X C V B N
```

| Tombol | Fungsi |
| --- | --- |
| `A` `W` `S` `E` `D` `F` `T` `G` `Y` `H` `U` `J` | C4 – B4 |
| `K` `O` `L` `P` `;` `'` `]` | C5 – F#5 |
| `Z` `X` `C` `V` `B` `N` | G5 – C6 |
| `Shift` / `M` | pedal sustain (mode bebas) |
| `Esc` / `P` | jeda |
| `←` `→` | putar kamera |
| `↑` `↓` / roda mouse | zoom kamera |
| seret latar belakang | putar kamera |

---

## 🛠️ Teknologi

- **[three.js](https://three.js.org/)** (r180) — render 3D: `MeshPhysicalMaterial`, `InstancedMesh`
  untuk balok nada, `PMREMGenerator` + `RoomEnvironment` untuk refleksi, `EffectComposer` +
  `UnrealBloomPass` untuk efek cahaya.
- **Web Audio API** — sintesis piano aditif (`PeriodicWave` dengan harmonik + inharmonicity
  ringan), noise serangan palu, filter lowpass yang menutup mengikuti peluruhan nada, panning
  stereo berdasarkan tinggi nada, reverb konvolusi dengan *impulse response* prosedural,
  kompresor, dan pedal sustain.
- **Vite** — dev server & bundler.
- **Vanilla JS (ES modules)** — tanpa framework.

---

## 📁 Struktur Proyek

```
index.html            markup UI (menu, pilih lagu, HUD, hasil, pengaturan, cara main)
vite.config.js        konfigurasi dev server (host 0.0.0.0, allowedHosts)
src/
  main.js             pengendali aplikasi: state machine, input, HUD, localStorage
  scene3d.js          panggung 3D: piano, tuts, balok nada jatuh, partikel, kamera, postfx
  audio.js            mesin suara piano (sintesis + reverb + kompresor + analyser)
  game.js             logika permainan: penilaian, kombo, skor, HP, hold, peringkat
  chart.js            pembangun chart dari data lagu + penyaringan per tingkat kesulitan
  songs.js            data 10 lagu (notasi beat → detik) + pembangun akor/pengiring
  music.js            teori musik: nama nada, frekuensi, warna nada, tata letak & peta tuts
  style.css           gaya antarmuka (glassmorphism neon, responsif)
```

### Menambah lagu baru

Buka `src/songs.js` dan tambahkan entri baru. Notasi memakai pasangan `[nada, durasiBeat]`;
nada boleh berupa nama (`'C5'`, `'F#4'`, `'Bb3'`), angka MIDI, atau array untuk akor:

```js
SONGS.push({
  id: 'lagu-baru',
  title: 'Lagu Baru',
  composer: 'Komponis',
  bpm: 100,
  stars: 2,
  color: '#4dc7ff',
  tracks: {
    melody: expand([['C5', 1], ['E5', 1], ['G5', 2]]),
    harmony: chordTrack([['C', 4], ['G', 4]], { octave: 3, div: 2, pattern: [0, 2, 1, 2] }),
  },
});
```

Nada di luar rentang tuts otomatis digeser oktaf, dan tingkat kesulitan menyaring kerapatan
nada secara otomatis.

---

## 📝 Catatan

- Aransemen lagu bersifat penyederhanaan untuk gameplay (ditandai `(arr.)`); dua lagu
  terakhir adalah komposisi original.
- Audio peramban baru bisa berbunyi setelah interaksi pertama (kebijakan *autoplay*), jadi
  klik/ketuk layar lebih dulu.
- Bila performa terasa berat, turunkan **Kualitas grafis** ke *Sedang* atau *Rendah* di menu
  Pengaturan.
