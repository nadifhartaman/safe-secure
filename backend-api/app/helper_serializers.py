"""Bentuk data sesuai kontrak frontend, dibaca dari frame_detection_count_table.

Catatan timezone: kolom created_at di tabel itu = `timestamp without time zone`
dengan default (now() AT TIME ZONE 'Asia/Jakarta') -> nilainya waktu dinding WIB.
Jadi timestamp naif diperlakukan sebagai WIB (UTC+7), lalu di-output sebagai UTC 'Z'.
"""

from datetime import datetime, timedelta, timezone

WIB = timezone(timedelta(hours=7))  # Asia/Jakarta, tanpa DST

# Key HARUS sama dengan DETECTION_CATEGORIES di frontend.
COUNT_KEYS = [
    "people_count",
    "throwing_count",
    "weapons_count",
    "intruder_count",
    "smoking_count",
    "trespassing_count",
    "vandalism_count",
]

# Nama kolom sumber di frame_detection_count_table.
SRC_THROWING = "throwing_detection_count"
SRC_SMOKING = "smoking_detection_count"
SRC_TRESPASSING = "trespassing_detection_count"


def _aware(value) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=WIB)  # naif = waktu WIB
    return dt


def to_iso_z(value) -> str:
    dt = _aware(value).astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def map_count_row(r: dict) -> dict:
    """Satu row DB -> satu baris kontrak (kategori tak tersedia = 0)."""
    return {
        "id": r["id"],
        "timestamp": to_iso_z(r["created_at"]),
        "people_count": 0,
        "throwing_count": int(r.get(SRC_THROWING) or 0),
        "weapons_count": 0,
        "intruder_count": 0,
        "smoking_count": int(r.get(SRC_SMOKING) or 0),
        "trespassing_count": int(r.get(SRC_TRESPASSING) or 0),
        "vandalism_count": 0,
    }


def wib_now() -> datetime:
    return datetime.now(WIB)


def wib_day_start_str(now_w: datetime) -> str:
    """String naif WIB awal hari, untuk memfilter kolom timestamp-naif."""
    d = now_w.replace(hour=0, minute=0, second=0, microsecond=0)
    return d.strftime("%Y-%m-%dT%H:%M:%S")


def build_today_series(rows: list, now_w: datetime) -> list:
    """Agregasi per jam sejak awal hari WIB; jam kosong tetap muncul (0)."""
    day_start = now_w.replace(hour=0, minute=0, second=0, microsecond=0)

    buckets: dict = {}
    for r in rows or []:
        h = _aware(r["created_at"]).astimezone(WIB).replace(minute=0, second=0, microsecond=0)
        b = buckets.setdefault(h, {k: 0 for k in COUNT_KEYS})
        b["throwing_count"] += int(r.get(SRC_THROWING) or 0)
        b["smoking_count"] += int(r.get(SRC_SMOKING) or 0)
        b["trespassing_count"] += int(r.get(SRC_TRESPASSING) or 0)

    series = []
    cur = day_start
    end = now_w.replace(minute=0, second=0, microsecond=0)
    while cur <= end:
        vals = buckets.get(cur, {})
        obj = {"hour": to_iso_z(cur)}  # WIB -> UTC 'Z'
        for k in COUNT_KEYS:
            obj[k] = int(vals.get(k, 0))
        series.append(obj)
        cur += timedelta(hours=1)
    return series


def generate_security_recommendations(rows: list) -> list:
    # Agregasi total count dari 15 menit / 1 jam ke belakang
    total_throwing = sum(r.get("throwing_detection_count", 0) for r in rows)
    total_smoking = sum(r.get("smoking_detection_count", 0) for r in rows)
    total_trespassing = sum(r.get("trespassing_detection_count", 0) for r in rows)
    
    total_threats = total_throwing + total_smoking + total_trespassing

    # 1. Logika Jumlah Petugas
    if total_trespassing >= 5 or total_threats >= 10:
        officers_val = "6 petugas"
        officers_lvl = "danger"
        officers_reason = f"Ancaman tinggi! Terdapat {total_trespassing} penerobosan dan total {total_threats} pelanggaran."
    elif total_threats > 0:
        officers_val = "3-4 petugas"
        officers_lvl = "caution"
        officers_reason = f"Terdeteksi {total_threats} aktivitas terlarang (pelanggaran/lempar/rokok)."
    else:
        officers_val = "2 petugas (Rutin)"
        officers_lvl = "normal"
        officers_reason = "Kondisi area aman, tidak ada ancaman terdeteksi."

    # 2. Logika Sterilisasi Area
    if total_trespassing >= 3:
        sterilize_val = "Wajib Sterilisasi Total"
        sterilize_lvl = "danger"
        sterilize_reason = "Terdapat indikasi penerobosan area terlarang."
    elif total_throwing >= 3:
        sterilize_val = "Sterilisasi Parsial"
        sterilize_lvl = "caution"
        sterilize_reason = "Terdeteksi pelemparan benda mencurigakan."
    else:
        sterilize_val = "Tidak Perlu"
        sterilize_lvl = "normal"
        sterilize_reason = "Area terpantau kondusif."

    # 3. Logika Panggilan Kepolisian
    if total_trespassing >= 5:
        police_val = "Segera Panggil"
        police_lvl = "danger"
        police_reason = "Penerobosan masif/berulang terdeteksi."
    elif total_trespassing > 0:
        police_val = "Siaga / Standby"
        police_lvl = "caution"
        police_reason = "Terjadi pelanggaran batas wilayah, siapkan kontak darurat."
    else:
        police_val = "Tidak Perlu"
        police_lvl = "normal"
        police_reason = "Tidak ada potensi tindak pidana berat."

    # 4. Logika Penutupan Operasional Sementara
    if total_threats >= 15 or total_trespassing >= 8:
        close_val = "Tutup Sementara"
        close_lvl = "danger"
        close_reason = "Eskalasi ancaman keselamatan tinggi di area operasional."
    else:
        close_val = "Operasional Normal"
        close_lvl = "normal"
        close_reason = "Tingkat risiko masih dalam batas toleransi."

    return [
        {
            "key": "officers",
            "title": "Rekomendasi Jumlah Petugas",
            "value": officers_val,
            "level": officers_lvl,
            "reason": officers_reason,
        },
        {
            "key": "sterilization",
            "title": "Rekomendasi Sterilisasi Area",
            "value": sterilize_val,
            "level": sterilize_lvl,
            "reason": sterilize_reason,
        },
        {
            "key": "police",
            "title": "Panggilan ke Kepolisian / Pihak Berwenang",
            "value": police_val,
            "level": police_lvl,
            "reason": police_reason,
        },
        {
            "key": "operation_closure",
            "title": "Penutupan Operasional Sementara",
            "value": close_val,
            "level": close_lvl,
            "reason": close_reason,
        },
    ]