'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DETECTION_CATEGORIES,
  type DetectionKey,
} from '@/lib/counting/type';
import { supabase } from '@/lib/supabase';
import { buildMinioUrl } from '@/lib/minio';

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

// Tiga jenis frame yang punya gambar snapshot sendiri.
export type FrameType = 'throwing' | 'smoking' | 'trespassing';
export type FrameSnapshots = Record<FrameType, string | null>;

// Peta jenis -> nama kolom di frame_detection_uploaded.
const FRAME_COL: Record<FrameType, string> = {
  throwing: 'throwing_frame',
  smoking: 'smoking_frame',
  trespassing: 'trespassing_frame',
};
const FRAME_TYPES = Object.keys(FRAME_COL) as FrameType[];

function emptySnapshots(): FrameSnapshots {
  return { throwing: null, smoking: null, trespassing: null };
}

// Dari beberapa baris frame (urut id DESC / terbaru dulu), ambil URL gambar
// TERAKHIR yang ada untuk masing-masing jenis (lewati yang null).
function pickPerType(
  rows: Record<string, unknown>[] | null | undefined
): FrameSnapshots {
  const out = emptySnapshots();
  for (const row of rows ?? []) {
    for (const t of FRAME_TYPES) {
      if (!out[t]) {
        const url = buildMinioUrl(row[FRAME_COL[t]] as string | null | undefined);
        if (url) out[t] = url;
      }
    }
  }
  return out;
}

export interface CountingData {
  counts: CountingRow[];
  todayData: HourBucket[];
  latestRow: CountingRow | null;
  snapshots: FrameSnapshots;
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
  const [snapshots, setSnapshots] = useState<FrameSnapshots>(emptySnapshots);
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
          // Ambil beberapa baris terakhir supaya tiap jenis dapat gambar
          // terakhirnya walau baris paling baru kolomnya null.
          supabase
            .from(FRAME_TABLE)
            .select('*')
            .order('id', { ascending: false })
            .limit(50),
        ]);
        if (!alive) return;
        if (latest.error) throw latest.error;

        const initSnaps = pickPerType(frame.data);
        // [DEBUG] cek load awal: error tabel frame (RLS?) & gambar per jenis
        console.log('[safe-secure] init frame:', {
          error: frame.error,
          rowCount: frame.data?.length ?? 0,
          snapshots: initSnaps,
        });
        if (today.error) console.warn('[safe-secure] today error:', today.error);

        setCounts((latest.data ?? []).map(mapCountRow));
        setToday(buildTodaySeries(today.data ?? []));
        setSnapshots(initSnaps);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('load awal Supabase gagal:', err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    refreshRef.current = loadInitial;
    loadInitial();

    // ── Realtime: pisah jadi 2 channel (1 channel banyak listener kadang flaky) ──
    // event: '*' sengaja, biar kelihatan kalau ADA perubahan apa pun yang masuk.
    const countCh = supabase
      .channel('safe-secure-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: COUNT_TABLE },
        (payload) => {
          console.log(
            '[safe-secure] COUNT event:',
            payload.eventType,
            (payload.new as Record<string, unknown>)?.id
          ); // [DEBUG]
          if (payload.eventType !== 'INSERT') return;
          const row = mapCountRow(payload.new as Record<string, unknown>);
          setLastUpdated(new Date());
          // Cegah id ganda (realtime kadang kirim ulang / bertabrakan load awal).
          setCounts((prev) =>
            prev.some((r) => r.id === row.id)
              ? prev
              : [row, ...prev].slice(0, MAX_ROWS)
          );

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
      .subscribe((status, err) => {
        console.log('[safe-secure] COUNT channel status:', status, err ?? ''); // [DEBUG]
        setConnected(status === 'SUBSCRIBED');
      });

    const frameCh = supabase
      .channel('safe-secure-frame')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: FRAME_TABLE },
        (payload) => {
          console.log('[safe-secure] FRAME event:', payload.eventType); // [DEBUG]
          if (payload.eventType !== 'INSERT') return;
          const row = payload.new as Record<string, unknown>;
          // Update gambar per jenis; jenis yang null di baris ini TETAP pakai
          // gambar sebelumnya (nggak dikosongin).
          setSnapshots((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const t of FRAME_TYPES) {
              const url = buildMinioUrl(row[FRAME_COL[t]] as string | null | undefined);
              if (url) {
                next[t] = url;
                changed = true;
              }
            }
            return changed ? next : prev;
          });
          console.log('[safe-secure] FRAME insert:', {
            throwing_frame: row.throwing_frame,
            smoking_frame: row.smoking_frame,
            trespassing_frame: row.trespassing_frame,
          }); // [DEBUG]
          setLastUpdated(new Date());
        }
      )
      .subscribe((status, err) => {
        console.log('[safe-secure] FRAME channel status:', status, err ?? ''); // [DEBUG]
      });

    return () => {
      alive = false;
      supabase.removeChannel(countCh);
      supabase.removeChannel(frameCh);
    };
  }, []);

  // latestRow = baris count terbaru (buat KPI, rekomendasi, badge).
  const latestRow = useMemo<CountingRow | null>(
    () => counts[0] ?? null,
    [counts]
  );

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
    snapshots,
    totals,
    loading,
    connected,
    lastUpdated,
    refresh,
  };
}
