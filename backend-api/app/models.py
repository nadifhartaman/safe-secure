"""Skema validasi (Pydantic). Satu payload -> dipecah ke 2 tabel."""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class FrameDetectionIn(BaseModel):
    """Payload dari Engine/AI. Satu objek untuk mengisi 2 tabel sekaligus."""

    # extra="forbid" -> tolak field asing supaya data tetap bersih.
    model_config = ConfigDict(extra="forbid")

    # --- Bagian counts -> frame_detection_count_table ---
    # throwing = smallint (maks 32767), dua lainnya = integer.
    throwing_detection_count: int = Field(default=0, ge=0, le=32767, examples=[2])
    smoking_detection_count: int = Field(default=0, ge=0, examples=[0])
    trespassing_detection_count: int = Field(default=0, ge=0, examples=[1])

    # --- Bagian frames -> frame_detection_uploaded ---
    # text: bisa URL Supabase Storage, path, atau base64. Boleh null.
    throwing_frame: Optional[str] = Field(default=None, examples=["frames/throw_01.jpg"])
    smoking_frame: Optional[str] = Field(default=None)
    trespassing_frame: Optional[str] = Field(default=None)

    def count_row(self) -> dict:
        # created_at TIDAK dikirim; DB isi otomatis (default Asia/Jakarta).
        return {
            "throwing_detection_count": self.throwing_detection_count,
            "smoking_detection_count": self.smoking_detection_count,
            "trespassing_detection_count": self.trespassing_detection_count,
        }

    def frame_row(self) -> dict:
        return {
            "throwing_frame": self.throwing_frame,
            "smoking_frame": self.smoking_frame,
            "trespassing_frame": self.trespassing_frame,
        }

    def rpc_params(self) -> dict:
        return {
            "p_throwing_count": self.throwing_detection_count,
            "p_smoking_count": self.smoking_detection_count,
            "p_trespassing_count": self.trespassing_detection_count,
            "p_throwing_frame": self.throwing_frame,
            "p_smoking_frame": self.smoking_frame,
            "p_trespassing_frame": self.trespassing_frame,
        }


class CountingIn(BaseModel):
    """Ingest 1 deteksi untuk tabel kanonik counting_detection (7 kategori)."""

    model_config = ConfigDict(extra="forbid")

    people_count: int = Field(default=0, ge=0)
    throwing_count: int = Field(default=0, ge=0)
    weapons_count: int = Field(default=0, ge=0)
    intruder_count: int = Field(default=0, ge=0)
    smoking_count: int = Field(default=0, ge=0)
    trespassing_count: int = Field(default=0, ge=0)
    vandalism_count: int = Field(default=0, ge=0)

    # base64 JPEG mentah TANPA prefix data:image/jpeg;base64, (page yang menambah)
    snapshot: Optional[str] = None
    # opsional; kalau kosong DB isi now() (UTC)
    timestamp: Optional["datetime"] = None

    def to_row(self) -> dict:
        row = {
            "people_count": self.people_count,
            "throwing_count": self.throwing_count,
            "weapons_count": self.weapons_count,
            "intruder_count": self.intruder_count,
            "smoking_count": self.smoking_count,
            "trespassing_count": self.trespassing_count,
            "vandalism_count": self.vandalism_count,
        }
        if self.snapshot is not None:
            row["snapshot"] = self.snapshot
        if self.timestamp is not None:
            row["created_at"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return row