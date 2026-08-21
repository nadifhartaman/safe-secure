"""Koneksi ke Supabase. Client dibuat sekali lalu dipakai ulang."""

from functools import lru_cache

from supabase._async.client import create_client as create_async_client, AsyncClient

async def get_supabase_async() -> AsyncClient:
    return await create_async_client(settings.supabase_url, settings.supabase_key)


# @lru_cache
# def get_supabase() -> Client:
#     settings = get_settings()
#     return create_client(settings.supabase_url, settings.supabase_key)
  
from .config import get_settings

settings = get_settings()
