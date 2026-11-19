# BloxCraft 🧱

Game voxel sandbox ala Minecraft dengan gaya blok plastik Roblox. Dunia bisa digali, dibangun, dan dimainkan **bareng-bareng** lewat kode room — cukup buka link yang sama, tanpa install apa pun.

Dibuat dengan **Vite + Three.js**, mabar pakai **WebRTC (PeerJS)**, dan siap di-hosting gratis di **GitHub Pages**.

## Fitur

- 🌱 Dunia voxel tak terbatas (generasi prosedural: bukit, pantai, pohon, puncak salju)
- ⛏️ Hancurkan & pasang blok (9 jenis blok di hotbar)
- 🎮 Kontrol FPS: WASD, Spasi lompat, Shift lari, F mode terbang
- 🧑‍🤝‍🧑 Mabar P2P: satu orang jadi host, teman masuk pakai kode room 5 huruf
- 👋 Karakter blok ala Roblox dengan nama di atas kepala
- ⚡ Semua edit blok ikut tersinkron, pemain telat gabung tetap dapat dunia yang sudah dibangun

## Jalankan di komputer sendiri

Butuh Node.js 18+.

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Build versi produksi:

```bash
npm run build     # hasilnya ada di folder dist/
npm run preview   # coba hasil build
```

## Kontrol

| Tombol | Fungsi |
| --- | --- |
| `W` `A` `S` `D` | Jalan |
| `Spasi` | Lompat / naik saat terbang |
| `Shift` | Lari / turun saat terbang |
| `F` | Aktifkan mode terbang |
| `R` | Respawn |
| `1` – `9` / scroll | Pilih blok |
| Klik kiri | Hancurkan blok |
| Klik kanan | Pasang blok |
| `Esc` | Jeda / lepas mouse |

Kalau browser memblokir pointer-lock (misalnya di dalam iframe), game otomatis pindah ke mode mouse bebas: **tahan klik kiri lalu geser** untuk melihat sekeliling.

## Cara mabar

1. Satu orang klik **Buat Dunia** → muncul kode room, misal `K7QP2`.
2. Bagikan **link game** + **kode room** ke teman.
3. Teman buka link, isi nama, masukkan kode di kolom **KODE**, lalu klik **Gabung**.
4. Semua blok yang dipasang/dihancurkan langsung terlihat oleh semua pemain.

Catatan:

- Host harus tetap membuka tab game-nya selama mabar (host = server dunia).
- Koneksi memakai WebRTC peer-to-peer; kalau jaringan sangat ketat (NAT simetris tanpa STUN) sambungan bisa gagal.
- Batas praktis: sekitar 4–8 pemain per room.

## Upload ke GitHub & online-kan

```bash
git init
git add .
git commit -m "BloxCraft: game voxel mabar"
git branch -M main
git remote add origin https://github.com/USERNAME/bloxcraft.git
git push -u origin main
```

Lalu di repo GitHub:

1. Buka **Settings → Pages**.
2. Di bagian **Build and deployment**, pilih **Source: GitHub Actions**.
3. Setiap `git push` ke branch `main`, workflow [deploy.yml](.github/workflows/deploy.yml) otomatis build dan publish.
4. Link game kamu: `https://USERNAME.github.io/bloxcraft/`

Karena `vite.config.js` memakai `base: './'`, game tetap jalan walau di-host di subfolder repo mana pun.

## Struktur proyek

```
index.html                  # menu, HUD, hotbar
src/main.js                 # loop game, kontrol, alur solo/host/join
src/world.js                # chunk 16×16×64, generasi terrain, meshing, edit blok
src/player.js               # fisika pemain + raycast voxel (DDA)
src/atlas.js                # tekstur blok digambar prosedural (gaya stud Roblox)
src/blocks.js               # daftar jenis blok
src/avatar.js               # karakter blok pemain lain + name tag
src/net.js                  # mabar WebRTC/PeerJS (host & client)
src/noise.js                # value noise untuk terrain
```

## Lisensi

Bebas dipakai dan dimodifikasi untuk proyek pribadi maupun belajar.
