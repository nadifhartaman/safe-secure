"""Konfigurasi aplikasi, dibaca dari environment variables (.env)."""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    supabase_url: str = os.environ.get("SUPABASE_URL", "")
    supabase_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    api_key: str = os.environ.get("API_KEY", "")

    # Endpoint counting membaca & menulis ke tabel ini (tabel yang sudah ada).
    counting_table: str = os.environ.get("COUNTING_TABLE", "frame_detection_count_table")

    # Tabel crime (dipakai endpoint /api/frame-detections*)
    count_table: str = os.environ.get("COUNT_TABLE", "frame_detection_count_table")
    frame_table: str = os.environ.get("FRAME_TABLE", "frame_detection_uploaded")
    rpc_bundle: str = os.environ.get("RPC_BUNDLE", "insert_frame_detection_bundle")

    # MinIO: DB hanya menyimpan PATH objek (mis. "frames/throw_01.jpg"),
    # http-nya dibangun di kode dari nilai di bawah ini.
    #   URL akhir = {minio_public_url}/{minio_bucket}/{path}
    minio_public_url: str = os.environ.get("MINIO_PUBLIC_URL", "")  # mis. http://localhost:9000
    minio_bucket: str = os.environ.get("MINIO_BUCKET", "")          # mis. detections

    # Stream (SSE) polling & keep-alive
    stream_poll_sec: float = float(os.environ.get("STREAM_POLL_SEC", "1.5"))
    stream_ping_sec: float = float(os.environ.get("STREAM_PING_SEC", "15"))
    today_max_rows: int = int(os.environ.get("TODAY_MAX_ROWS", "10000"))

    cors_origins: list[str] = os.environ.get("CORS_ORIGINS", "*").split(",")

    def validate(self) -> None:
        if not self.supabase_url or not self.supabase_key:
            raise RuntimeError(
                "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()