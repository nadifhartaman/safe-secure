# Detection API

FastAPI backend. Dua bagian:
- **Serving frontend** Safe & Secure (`useCountingData`) — 3 endpoint yang dibutuhkan halaman.
- **Ingest** deteksi ke tabel kanonik `counting_detection` + endpoint crime lama (2 tabel).

## Endpoint untuk frontend

| Endpoint | Bentuk | Untuk |
|----------|--------|-------|
| `GET /api/counting/latest?limit=20` | `{success, data:[row]}` urut terbaru | tabel, snapshot, angka terkini |
| `GET /api/counting/today` | `{success, data:[hourly]}` | chart & rincian ancaman |
| `GET /api/counting/stream` | SSE `text/event-stream` | update real-time |
| `POST /api/counting` | ingest 1 deteksi | mengisi data |

### Bentuk baris (cocok dengan DETECTION_CATEGORIES)
`id`, `timestamp` (ISO 8601 UTC, `...Z`), lalu 7 count integer:
`people_count`, `throwing_count`, `weapons_count`, `intruder_count`,
`smoking_count`, `trespassing_count`, `vandalism_count`, plus `snapshot` (opsional).

- Count yang tidak ada otomatis `0`.
- `snapshot` = base64 JPEG mentah **tanpa** prefix `data:image/jpeg;base64,` (page yang menambah). Bisa juga diisi URL.
- Di `/latest` snapshot ikut; di `/stream` snapshot dikecualikan agar event ringan.
- `/today` mengembalikan satu objek per jam sejak 00:00 **UTC**; jam kosong tetap muncul dengan nilai 0. (Ganti ke Asia/Jakarta bila perlu — lihat `counting_today` di `main.py`.)

### SSE
Tiap deteksi baru: `data: {json satu baris}\n\n`. Keep-alive `: ping\n\n` tiap ~15 detik.
Backend memantau tabel dengan polling id (default tiap 1.5 detik) — tidak butuh Realtime aktif.

## Setup
1. Jalankan `schema.sql` di Supabase SQL Editor (buat `counting_detection`, function `counting_today_hourly`, RLS; juga tabel crime + function bundle).
2. `pip install -r requirements.txt`
3. `cp .env.example .env` lalu isi `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
4. `uvicorn app.main:app --reload --port 8000`
5. Docs: http://localhost:8000/docs

## Contoh
```bash
# ingest
curl -X POST http://localhost:8000/api/counting \
  -H "Content-Type: application/json" \
  -d '{"people_count":5,"smoking_count":1,"snapshot":"/9j/4AAQSkZJRg..."}'

# latest
curl "http://localhost:8000/api/counting/latest?limit=20"

# stream (SSE)
curl -N http://localhost:8000/api/counting/stream
```

## Frontend
```js
// latest / today
const res = await fetch('/api/counting/latest?limit=20').then(r=>r.json())
res.data // array baris

// stream
const es = new EventSource('/api/counting/stream')
es.onmessage = (e) => { const row = JSON.parse(e.data); prependRow(row) }
```

## Keamanan
- SERVICE ROLE KEY hanya di backend (`.env`), tidak pernah ke frontend/Engineer.
- Isi `API_KEY` untuk mewajibkan header `X-API-Key` pada endpoint ingest.