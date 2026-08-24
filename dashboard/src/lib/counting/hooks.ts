'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DETECTION_CATEGORIES,
  type DetectionKey,
} from '@/lib/counting/type';
import { supabase } from '@/lib/supabase';
import { pickFrameSnapshot } from '@/lib/minio';

// ---------------------------------------------------------------------------
// Sumber data: LANGSUNG dari Supabase (engine -> DB, dashboard consume realtime).
//   - counts   : frame_detection_count_table
//   - snapshot : frame_detection_uploaded (baris terakhir -> URL MinIO)
// Tidak lagi lewat FastAPI.
// ---------------------------------------------------------------------------

const COUNT_TABLE =
  process.env.NEXT_PUBLIC_COUNT_TABLE ?? 'frame_detection_count_table';
const FRAME_TABLE =
  process.env.NEXT_PUBLIC_FRAME_TABLE ?? 'frame_detection_uploaded';
const MAX_ROWS = 20;

// Nama kolom sumber di frame_detection_count_table.
const SRC_THROWING = 'throwing_detection_count';
const SRC_SMOKING = 'smoking_detection_count';
const SRC_TRESPASSING = 'trespassing_detection_count';

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

// created_at di count_table = `timestamp without time zone` dengan default WIB,
// jadi string-nya naif (tanpa offset). Perlakukan sebagai WIB (+07:00) supaya
// instant-nya benar walau browser bukan di zona WIB.
function toIsoInstant(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return new Date().toISOString();
  // sudah ada offset (Z / +hh:mm / -hh:mm setelah 'T') -> pakai apa adanya
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
  const iso = hasTz ? s : `${s.replace(' ', 'T')}+07:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

// Satu row DB (count) -> satu baris kontrak frontend.
function mapCountRow(raw: Record<string, unknown>): CountingRow {
  return {
    id: Number(raw.id),
    timestamp: toIsoInstant(raw.created_at),
    ...emptyCounts(),
    throwing_count: Number(raw[SRC_THROWING] ?? 0),
    smoking_count: Number(raw[SRC_SMOKING] ?? 0),
    trespassing_count: Number(raw[SRC_TRESPASSING] ?? 0),
  };
}

function wibDayStartNaive(): string {
  // 'YYYY-MM-DDT00:00:00' menurut tanggal WIB sekarang (untuk filter kolom naif).
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600_000); // geser ke WIB
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wib.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00`;
}

function hourKey(ts: string): string {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

// Agregasi baris count hari ini -> bucket per jam (isi semua jam sampai jam kini).
function buildTodaySeries(rows: Record<string, unknown>[]): HourBucket[] {
  const buckets = new Map<string, HourBucket>();
  for (const raw of rows) {
    const row = mapCountRow(raw);
    const key = hourKey(row.timestamp);
    const b =
      buckets.get(key) ?? ({ hour: key, ...emptyCounts() } as HourBucket);
    for (const c of DETECTION_CATEGORIES) b[c.key] += row[c.key];
    buckets.set(key, b);
  }

  // Isi jam kosong dari awal hari sampai jam sekarang biar chart mulus.
  const start = new Date(hourKey(toIsoInstant(wibDayStartNaive())));
  const end = new Date();
  end.setMinutes(0, 0, 0);
  const series: HourBucket[] = [];
  for (let t = new Date(start); t <= end; t.setHours(t.getHours() + 1)) {
    const key = t.toISOString();
    series.push(buckets.get(key) ?? ({ hour: key, ...emptyCounts() } as HourBucket));
  }
  return series;
}

export function useCountingData(): CountingData {
  const [counts, setCounts] = useState<CountingRow[]>([]);
  const [todayData, setToday] = useState<HourBucket[]>([]);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;

    async function loadInitial() {
      setLoading(true);
      try {
        const [latest, today, frame] = await Promise.all([
          supabase
            .from(COUNT_TABLE)
            .select('*')
            .order('id', { ascending: false })
            .limit(MAX_ROWS),
          supabase
            .from(COUNT_TABLE)
            .select('*')
            .gte('created_at', wibDayStartNaive())
            .order('created_at', { ascending: true }),
          supabase
            .from(FRAME_TABLE)
            .select('*')
            .order('id', { ascending: false })
            .limit(1),
        ]);
        if (!alive) return;
        if (latest.error) throw latest.error;

        setCounts((latest.data ?? []).map(mapCountRow));
        setToday(buildTodaySeries(today.data ?? []));
        setSnapshot(pickFrameSnapshot(frame.data?.[0]));
        setLastUpdated(new Date());
      } catch (err) {
        console.error('load awal Supabase gagal:', err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    refreshRef.current = loadInitial;
    loadInitial();

    // ── Realtime: INSERT di dua tabel ──
    const channel = supabase
      .channel('safe-secure')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: COUNT_TABLE },
        (payload) => {
          const row = mapCountRow(payload.new as Record<string, unknown>);
          setLastUpdated(new Date());
          setCounts((prev) => [row, ...prev].slice(0, MAX_ROWS));

          // Akumulasi ke bucket jam berjalan (buat chart), handle pergantian jam.
          setToday((prev) => {
            const key = hourKey(row.timestamp);
            const copy = [...prev];
            const idx = copy.findIndex((b) => b.hour === key);
            if (idx >= 0) {
              const b = { ...copy[idx] };
              for (const c of DETECTION_CATEGORIES) b[c.key] += row[c.key];
              copy[idx] = b;
              return copy;
            }
            const fresh = { hour: key, ...emptyCounts() } as HourBucket;
            for (const c of DETECTION_CATEGORIES) fresh[c.key] = row[c.key];
            return [...copy, fresh];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: FRAME_TABLE },
        (payload) => {
          const snap = pickFrameSnapshot(payload.new as Record<string, unknown>);
          if (snap) {
            setSnapshot(snap);
            setLastUpdated(new Date());
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // latestRow = baris count terbaru + snapshot terbaru dari tabel frame.
  const latestRow = useMemo<CountingRow | null>(() => {
    const top = counts[0] ?? null;
    if (!top) return null;
    return snapshot ? { ...top, snapshot } : top;
  }, [counts, snapshot]);

  const totals = useMemo(
    () =>
      counts.reduce((acc, r) => {
        for (const c of DETECTION_CATEGORIES) acc[c.key] += r[c.key];
        return acc;
      }, emptyCounts()),
    [counts]
  );

  const refresh = () => refreshRef.current();

  return {
    counts,
    todayData,
    latestRow,
    totals,
    loading,
    connected,
    lastUpdated,
    refresh,
  };
}
