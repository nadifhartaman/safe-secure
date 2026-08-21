'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DETECTION_CATEGORIES,
  type DetectionKey,
} from '@/lib/counting/type';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_ROWS = 20;

export type HourBucket = { hour: string } & Record<DetectionKey, number>;
export type CountingRow = {
  id: number;
  timestamp: string;
  snapshot?: string;
} & Record<DetectionKey, number>;

export interface CountingData {
  counts: CountingRow[];
  todayData: HourBucket[];
  latestRow: CountingRow | null;
  totals: Record<DetectionKey, number>;
  loading: boolean;
  connected: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}

function emptyCounts(): Record<DetectionKey, number> {
  return Object.fromEntries(
    DETECTION_CATEGORIES.map((c) => [c.key, 0])
  ) as Record<DetectionKey, number>;
}

// Pastikan semua key kategori ada (default 0) walau backend tak mengirimnya.
function normalizeRow(raw: Record<string, unknown>): CountingRow {
  const row = {
    id: Number(raw.id),
    timestamp: String(raw.timestamp),
    snapshot: (raw.snapshot as string) || undefined,
    ...emptyCounts(),
  } as CountingRow;
  for (const c of DETECTION_CATEGORIES) row[c.key] = Number(raw[c.key] ?? 0);
  return row;
}

function normalizeBucket(raw: Record<string, unknown>): HourBucket {
  const b = { hour: String(raw.hour), ...emptyCounts() } as HourBucket;
  for (const c of DETECTION_CATEGORIES) b[c.key] = Number(raw[c.key] ?? 0);
  return b;
}

// Ambil array data, dukung envelope { success, data } maupun array langsung.
async function fetchList(path: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

export function useCountingData(): CountingData {
  const [counts, setCounts] = useState<CountingRow[]>([]);
  const [todayData, setToday] = useState<HourBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [latest, today] = await Promise.all([
        fetchList('/api/counting/latest?limit=20'),
        fetchList('/api/counting/today'),
      ]);
      setCounts(latest.map(normalizeRow));
      setToday(today.map(normalizeBucket));
      setLastUpdated(new Date());
    } catch (err) {
      console.error('fetch counting gagal:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // ── Live stream (SSE) ──
    const es = new EventSource(`${API_BASE}/api/counting/stream`);

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      if (!e.data) return;
      try {
        const row = normalizeRow(JSON.parse(e.data));
        setLastUpdated(new Date());
        setCounts((prev) => [row, ...prev].slice(0, MAX_ROWS));

        // Akumulasi ke bucket jam berjalan (buat chart), handle pergantian jam.
        setToday((prev) => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          const lastIdx = copy.length - 1;
          const last = { ...copy[lastIdx] };
          const rowHour = new Date(row.timestamp).getHours();
          if (new Date(last.hour).getHours() === rowHour) {
            for (const c of DETECTION_CATEGORIES) last[c.key] += row[c.key];
            copy[lastIdx] = last;
            return copy;
          }
          const bucketDate = new Date(row.timestamp);
          bucketDate.setMinutes(0, 0, 0);
          const fresh = { hour: bucketDate.toISOString(), ...emptyCounts() } as HourBucket;
          for (const c of DETECTION_CATEGORIES) fresh[c.key] = row[c.key];
          return [...copy, fresh];
        });
      } catch {
        /* abaikan pesan yang tidak valid */
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource otomatis reconnect; polling di bawah jadi cadangan.
    };

    // ── Polling fallback tiap 15 detik (koreksi drift / kalau SSE mati) ──
    const poll = setInterval(refresh, 15_000);

    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [refresh]);

  const latestRow = counts[0] ?? null;
  const totals = counts.reduce((acc, r) => {
    for (const c of DETECTION_CATEGORIES) acc[c.key] += r[c.key];
    return acc;
  }, emptyCounts());

  return { counts, todayData, latestRow, totals, loading, connected, lastUpdated, refresh };
}