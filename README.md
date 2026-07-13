# BuktiScan Agent

Desktop agent for cashier PCs: USB scanner ingest, RTSP CCTV recording, local MP4 storage.

## Konfigurasi `.env` (production)

File `.env` di **folder yang sama** dengan `BuktiScan Agent.exe`:

```env
BuktiScan_API_URL=http://api-BuktiScan.hexadim.com
BuktiScan_CLIPS_DIR=D:\BuktiScan\clips
```

Release portable sudah menyertakan `.env` dari `.env.production`. Edit file itu untuk ganti URL backend tanpa rebuild.

Alternatif: `%APPDATA%\BuktiScan\.env`

Setelah pairing, URL tersimpan di `%APPDATA%\BuktiScan\config.json` (prioritas lebih tinggi dari `.env`).

## Development

```bash
cp .env.example .env
pnpm install
pnpm build:core
pnpm dev:electron
```

## Verifikasi tanpa rebuild Windows

```bash
pnpm test          # unit tests (scan parse, config sync, clips)
pnpm check         # test + compile core + build UI
```

Setelah `pnpm check` lulus, baru `pnpm dist:win:web` sekali untuk ZIP final.

## Windows release

```bash
pnpm dist:win
# atau sekaligus salin ke frontend:
pnpm dist:win:web
```

Mengunduh `ffmpeg.exe` (Windows) otomatis via `ensure:ffmpeg:win`, lalu pack ZIP (~220 MB).

Copy manual: `release/BuktiScanAgent-portable.zip` → `frontend/public/downloads/`.

## Pairing

1. Admin generates pairing code in dashboard.
2. Buka agent — URL API terisi otomatis dari `.env`.
3. Masukkan Workstation ID + kode pairing.

## Local clip playback

`http://127.0.0.1:19500/clips/{invoice}.mp4` untuk dashboard di PC kasir yang sama.
