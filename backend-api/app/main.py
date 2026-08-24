import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import get_settings
from .database import get_supabase_async
from .models import CountingIn, FrameDetectionIn
from .helper_serializers import (
    build_today_series,
    map_count_row,
    pick_frame_snapshot,
    wib_day_start_str,
    wib_now,
    generate_security_recommendations,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("detection-api")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate()
    logger.info("API siap. counting_table=%s", settings.counting_table)
    yield


app = FastAPI(title="Detection API", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_api_key(x_api_key: str | None = Header(default=None)):
    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key tidak valid.")


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


# ===========================================================================
# SERVING FRONTEND — Safe & Secure (useCountingData)
# ===========================================================================

@app.get("/api/counting/latest", tags=["counting"])
async def counting_latest(limit: int = Query(default=20, ge=1, le=200)):
    supabase = await get_supabase_async()
    try:
        resp = await (
            supabase.table(settings.counting_table)
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gagal ambil latest")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Gagal ambil data: {exc}")
        
    data = [map_count_row(r) for r in (resp.data or [])]

    # Snapshot "Deteksi Terakhir": ambil PATH dari baris TERAKHIR di tabel frame,
    # lalu bangun URL MinIO di kode (DB cuma simpan path, tanpa http).
    if data:
        try:
            frame_resp = await (
                supabase.table(settings.frame_table)
                .select("*")
                .order("id", desc=True)
                .limit(1)
                .execute()
            )
            frame_rows = frame_resp.data or []
            if frame_rows:
                snap = pick_frame_snapshot(
                    frame_rows[0], settings.minio_public_url, settings.minio_bucket
                )
                if snap:
                    data[0]["snapshot"] = snap  # baris terbaru = latestRow di frontend
        except Exception:  # noqa: BLE001
            logger.exception("Gagal ambil frame terakhir untuk snapshot")

    return {"success": True, "data": data}


@app.get("/api/counting/today", tags=["counting"])
async def counting_today():
    supabase = await get_supabase_async()
    now_w = wib_now()
    day_start = wib_day_start_str(now_w)
    try:
        resp = await (
            supabase.table(settings.counting_table)
            .select("*")
            .gte("created_at", day_start)
            .order("created_at", desc=False)
            .limit(settings.today_max_rows)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gagal agregasi today")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Gagal agregasi: {exc}")
        
    data = build_today_series(resp.data or [], now_w)
    return {"success": True, "data": data}


async def _max_id(supabase) -> int:
    resp = await (
        supabase.table(settings.counting_table)
        .select("id")
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0]["id"] if resp.data else 0


async def _fetch_new(supabase, last_id: int, limit: int = 100) -> list:
    resp = await (
        supabase.table(settings.counting_table)
        .select("*")
        .gt("id", last_id)
        .order("id", desc=False)
        .limit(limit)
        .execute()
    )
    return resp.data or []


@app.get("/api/counting/stream", tags=["counting"])
async def counting_stream(request: Request):
    """SSE: tiap baris baru dikirim sebagai `data: {...}\n\n`."""

    async def event_generator():
        supabase = await get_supabase_async()
        try:
            last_id = await _max_id(supabase)
        except Exception:  # noqa: BLE001
            logger.exception("stream init _max_id error")
            last_id = 0
        last_ping = time.monotonic()
        yield ": connected\n\n"

        while True:
            if await request.is_disconnected():
                break
            try:
                rows = await _fetch_new(supabase, last_id)
            except Exception:  # noqa: BLE001
                logger.exception("stream fetch error")
                rows = []

            for r in rows:
                last_id = max(last_id, r["id"])
                payload = json.dumps(map_count_row(r), separators=(",", ":"))
                yield f"data: {payload}\n\n"

            if time.monotonic() - last_ping >= settings.stream_ping_sec:
                yield ": ping\n\n"
                last_ping = time.monotonic()

            await asyncio.sleep(settings.stream_poll_sec)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        event_generator(), media_type="text/event-stream", headers=headers
    )


@app.post("/api/counting", status_code=status.HTTP_201_CREATED, tags=["counting"])
async def counting_ingest(payload: CountingIn, _=Depends(verify_api_key)):
    supabase = await get_supabase_async()
    row = {
        "throwing_detection_count": payload.throwing_count,
        "smoking_detection_count": payload.smoking_count,
        "trespassing_detection_count": payload.trespassing_count,
    }
    try:
        resp = await supabase.table(settings.counting_table).insert(row).execute()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gagal insert counting")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Gagal insert: {exc}")
    out = map_count_row(resp.data[0]) if resp.data else None
    return {"success": True, "data": out}


# ===========================================================================
# INGEST CRIME DETECTION (2 tabel)
# ===========================================================================

@app.post("/api/frame-detections", status_code=status.HTTP_201_CREATED, tags=["crime"])
async def create_frame_detection(payload: FrameDetectionIn, _=Depends(verify_api_key)):
    supabase = await get_supabase_async()
    try:
        count_resp = await supabase.table(settings.count_table).insert(payload.count_row()).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Gagal insert count: {exc}")

    count_id = count_resp.data[0]["id"] if count_resp.data else None
    try:
        frame_resp = await supabase.table(settings.frame_table).insert(payload.frame_row()).execute()
    except Exception as exc:  # noqa: BLE001
        if count_id is not None:
            try:
                await supabase.table(settings.count_table).delete().eq("id", count_id).execute()
            except Exception:  # noqa: BLE001
                logger.error("Rollback count GAGAL id=%s", count_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Gagal insert frame: {exc}")

    return {
        "count": count_resp.data[0] if count_resp.data else None,
        "frame": frame_resp.data[0] if frame_resp.data else None,
    }


@app.post("/api/frame-detections/atomic", status_code=status.HTTP_201_CREATED, tags=["crime"])
async def create_frame_detection_atomic(payload: FrameDetectionIn, _=Depends(verify_api_key)):
    supabase = await get_supabase_async()
    try:
        resp = await supabase.rpc(settings.rpc_bundle, payload.rpc_params()).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Gagal menyimpan (atomik): {exc}")
    return resp.data
  

@app.get("/api/recommendations", tags=["recommendations"])
async def get_recommendations(
    timeframe: str = Query(
        default="15m", 
        regex="^(15m|1h|1d)$", 
        description="Filter rentang waktu ke belakang: 15m (15 menit), 1h (1 jam), 1d (1 hari)"
    )
):
    supabase = await get_supabase_async()
    
    # Hitung timestamp UTC/WIB rentang waktu ke belakang
    now_utc = datetime.now(timezone.utc)
    
    if timeframe == "15m":
        from_time = now_utc - timedelta(minutes=15)
    elif timeframe == "1h":
        from_time = now_utc - timedelta(hours=1)
    elif timeframe == "1d":
        from_time = now_utc - timedelta(days=1)
    else:
        from_time = now_utc - timedelta(minutes=15)

    from_time_iso = from_time.isoformat()

    try:
        resp = await (
            supabase.table(settings.counting_table)
            .select("*")
            .gte("created_at", from_time_iso)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gagal mengambil data rekomendasi")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Gagal mengambil data rekomendasi: {exc}")

    rows = resp.data or []
    recommendations = generate_security_recommendations(rows)

    return {
        "success": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timeframe": timeframe,
        "data": recommendations
    }