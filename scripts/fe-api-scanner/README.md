# FE API Scanner — Panduan

Fitur **FE API Map** (`/fe-api`) menampilkan daftar API backend yang dipanggil oleh
repo Frontend (`Digiroom-Web-FrontEnd`), beserta halaman FE yang memakainya.

Datanya berasal dari satu file JSON: `src/data/fe-api-map.json`. File itu dibuat
oleh scanner dan di-commit ke repo ini. **Repo FE tidak pernah disalin ke sini** —
scanner hanya membacanya.

## Cara update data (kalau FE team ada perubahan)

Semua perintah `npm` dijalankan di folder **personal-planner**, bukan di folder FE.

```bash
# 1. Pull dulu di repo FE
cd D:\WORK\Digiroom-Web-FrontEnd
git checkout <branch-yang-aktif>   # mis. ascomm/development
git pull

# 2. Scan ulang (jalankan dari repo planner)
cd D:\AI\WORK_PLANNER\personal-planner
npm run fe-api:scan

# 3. Commit hasilnya
git add src/data/fe-api-map.json
git commit -m "chore: update FE API map"
git push
```

Scan memakan waktu sekitar 10 detik. Di akhir, scanner menampilkan:

- branch dan commit FE yang dipindai
- peringatan kalau folder FE punya perubahan yang belum di-commit
- jumlah endpoint yang **bertambah / berkurang** dibanding scan sebelumnya

Halaman `/fe-api` juga menampilkan ringkasan perubahan itu.

## Konfigurasi

File: `scripts/fe-api-scanner/config.json`

```json
{
  "repoPath": "D:/WORK/Digiroom-Web-FrontEnd"
}
```

- Ubah `repoPath` kalau folder FE pindah (pakai `/`, bukan `\`).
- Atau pakai path lain sekali jalan: `npm run fe-api:scan -- --repo D:/path/lain`.

## Hal yang perlu diingat

- **Scanner membaca branch yang sedang ter-checkout** di folder FE. Pastikan
  branch yang benar (branch yang aktif dikerjakan FE team). `main` di repo FE
  terakhir berubah tahun 2024, jadi bukan itu.
- Hasil scan = isi folder FE saat itu. Kalau ada perubahan yang belum di-commit di
  folder FE, scanner akan memberi peringatan.
- Tidak perlu `git fetch` atau akses TFS dari scanner. Cukup `git pull` sendiri.

## Cara kerja singkat

- `refresh.mjs` — perintah `npm run fe-api:scan`: membaca info git FE, memanggil
  scanner, menghitung perbedaan dengan scan sebelumnya, menulis JSON.
- `scan.mjs` — scanner (TypeScript compiler API). Mencari pemanggilan
  `makeApi…WithEndpoint`, `api.get/post/…`, `axios.*`, dan `fetch`, lalu menelusuri
  import dari setiap halaman (`src/pages/**`, `src/app/**`) untuk tahu halaman
  mana yang memakai endpoint tersebut.

## Format JSON

```jsonc
{
  "generatedAt": "...",
  "repo": { "branch": "...", "commit": "...", "dirty": false },
  "stats": { "filesScanned": 4038, "pages": 773, "endpoints": 945 },
  "changes": { "added": ["GET /x"], "removed": [] },   // vs scan sebelumnya
  "endpoints": [
    {
      "key": "POST /customer/v1/saphybris/refresh-token",
      "method": "POST",
      "path": "/customer/v1/saphybris/refresh-token",
      "target": "backend",        // backend | next-bff | external | dynamic
      "service": "customer",
      "usedBy": ["digiroom-cms:/news-tips/[slug]"],   // "<app>:<route>"
      "calls": [{ "file": "...", "line": 12, "symbol": "...", "client": "api" }]
    }
  ]
}
```

Untuk endpoint `next-bff` (route `/api/...` milik FE), ada field `backendCalls`: API backend
yang dipanggil oleh route itu, lengkap dengan kondisinya (`when`, mis. `type = 'profile'`).
`depth` kecil (0-2) = dipanggil langsung di route/helper-nya; `depth` besar = infrastruktur
bersama (mis. refresh token). Method `ANY` berarti route meneruskan method request yang masuk.

Arti `target`:

- `backend` — API backend (yang relevan untuk tim BE)
- `next-bff` — route `/api/...` milik Next.js FE sendiri
- `external` — layanan luar (Facebook, YouTube, dll.)
- `dynamic` — URL dibentuk saat runtime, tidak bisa ditentukan statis

## Cara mencari "API FE ini hit BE apa?"

Di halaman `/fe-api`, tempel URL FE lengkap ke kolom pencarian, mis.
`https://sit-ascom.auto2000.co.id/api/get-singleid?type=profile`. Halaman mengambil
path-nya (`/api/get-singleid`), membuka endpoint-nya, dan menandai API backend yang cocok
dengan `type=profile`.

## Cakupan: hanya API storefront yang hidup

- **CMS dan boilerplate tidak dipindai** (`excludeApps` di `config.json`).
- **Kode mati tidak dimasukkan.** Endpoint yang tidak dijangkau halaman, route, atau middleware
  mana pun dibuang, begitu juga route `/api/...` yang tidak dipanggil kode FE. Daftar yang dibuang
  tetap ada di `audit.deadOmitted` / `audit.unreferencedRoutes` supaya bisa dicek ulang.
  Route yang dipanggil di luar kode FE (mis. NextAuth) didaftarkan di `annotations.json`
  (`externallyInvokedRoutes`).
- **Bukan API backend, sudah dibaca kodenya.** Panggilan seperti download file dari URL hasil BE,
  upload ke Azure Blob, atau proxy Evergage didaftarkan di `annotations.json` (`notApi`) lengkap dengan
  alasannya. Hasilnya tampil di `audit.verifiedNonApi`, bukan di daftar endpoint.
- **Route `/api` FE tanpa panggilan BE** (mis. hanya mengatur cookie) tidak dimasukkan
  (`audit.bffWithoutBackend`).

## Cara membaca satu endpoint

- `hosts`: nama environment variable server tujuan. Default-nya dibaca dari `axios.create({ baseURL })`
  milik client; kalau panggilan memberi `baseURL` sendiri (mis. `API_GATEWAY_URL_CONTENT`), itu yang dipakai.
- `method`: dari pemanggilan langsung, atau, untuk route yang meneruskan `req.method`, dari penjagaan
  (`if (req.method !== 'POST') return`) di sekitar panggilan. Kalau tidak ada penjagaan, method
  mengikuti method yang dipakai FE saat memanggil route itu (atau GET untuk SSR halaman). Asalnya
  ada di `calls[].methodSource` (`guard` / `forwarded` / `inferred`).
- `when` (di `backendCalls` dan `calls`): kondisi `switch/case` dan `if` di sekitar panggilan.

## Memastikan semua API tercatat (audit)

Scanner tidak bisa "membuktikan" kelengkapan, jadi ada tiga pengaman:

1. **Audit otomatis.** Setiap scan melaporkan pemanggilan yang *mirip* panggilan jaringan tapi
   tidak berhasil dikenali (mis. `new WebSocket`, `x.get('/path')` pada objek yang tidak dikenal,
   atau method baru pada client seperti `api.postFormData(...)`).
   Daftarnya ada di akhir output `npm run fe-api:scan`, di `audit.suspects` pada JSON, dan di
   halaman `/fe-api`. Idealnya **0**. Kalau ada isinya: itu API yang terlewat (perbaiki
   `scan.mjs`, tambahkan test) atau memang bukan panggilan API.
   `npm run fe-api:scan -- --strict` membuat scan gagal kalau audit tidak kosong.
2. **Endpoint `dynamic`.** URL yang hanya diketahui saat runtime tetap dicatat dan ditandai, tidak
   dibuang diam-diam. Kalau isinya sudah dibaca dan ternyata bukan API backend, daftarkan di
   `annotations.json` dengan alasannya.
3. **Test regresi.** `npm run fe-api:test` menjalankan scanner pada contoh FE kecil
   (`scripts/fe-api-scanner/test/fixture`) dan memastikan setiap pola yang pernah terlewat
   tetap terdeteksi. Setiap kali menemukan pola baru yang terlewat, tambahkan ke fixture.

## Menelusuri "kenapa halaman X dianggap memakai API Y?"

```bash
node scripts/fe-api-scanner/scan.mjs --repo D:/WORK/Digiroom-Web-FrontEnd --out %TEMP%/x.json   --exclude-apps digiroom-cms,boilerplate --explain "buy-now"
```

Mencetak rantai pemanggilan (halaman -> fungsi -> ... -> panggilan API) untuk beberapa halaman.
Dipakai kalau sebuah endpoint terlihat dipakai padahal seharusnya tidak, atau sebaliknya.

## Batasan

- Analisis statis: URL yang dibentuk dinamis ditandai `dynamic`, bukan ditebak.
- Endpoint tanpa halaman (`usedBy` kosong) kemungkinan kode mati, atau dipanggil
  lewat jalur yang tidak bisa dilacak scanner.
- Menunjukkan apa yang **dipanggil** FE, bukan apa yang aktif di production.
