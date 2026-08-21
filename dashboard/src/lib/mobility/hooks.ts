'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VEHICLE_CATEGORIES,
  type VehicleKey,
  type Congestion,
} from '@/lib/mobility/types';

export type TrafficRow = {
  id: number;
  timestamp: string;
  snapshot?: string;
  plate?: string;
  total_vehicles: number;
  avg_speed: number; // km/jam
  congestion: Congestion;
  incident: boolean;
} & Record<VehicleKey, number>;

export type TrafficHourBucket = {
  hour: string;
  avg_speed: number;
  congestion_index: number; // 0-100
} & Record<VehicleKey, number>;

export interface TrafficData {
  counts: TrafficRow[];
  todayData: TrafficHourBucket[];
  latestRow: TrafficRow | null;
  totals: Record<VehicleKey, number>;
  loading: boolean;
  connected: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}

const MAX_ROWS = 20;
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

function emptyCounts(): Record<VehicleKey, number> {
  return Object.fromEntries(
    VEHICLE_CATEGORIES.map((c) => [c.key, 0])
  ) as Record<VehicleKey, number>;
}

function tickCounts(): Record<VehicleKey, number> {
  return {
    car_count: rand(2, 16),
    motorcycle_count: rand(6, 34),
    truck_count: rand(0, 4),
    bus_count: rand(0, 3),
  } as Record<VehicleKey, number>;
}

function congestionFor(total: number): Congestion {
  if (total >= 40) return 'macet';
  if (total >= 26) return 'padat';
  return 'lancar';
}
function speedFor(c: Congestion): number {
  if (c === 'macet') return rand(5, 15);
  if (c === 'padat') return rand(16, 30);
  return rand(31, 48);
}

const PLATE_AREAS = ['AB', 'B', 'D', 'L', 'N', 'AA'] as const;
const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
function randomPlate(): string {
  const s = () => PLATE_LETTERS[Math.floor(Math.random() * PLATE_LETTERS.length)];
  return `${pick(PLATE_AREAS)} ${rand(1000, 9999)} ${s()}${s()}`;
}

function makeRow(id: number, tsOffset = 0): TrafficRow {
  const counts = tickCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const congestion = congestionFor(total);
  return {
    id,
    timestamp: new Date(Date.now() - tsOffset).toISOString(),
    ...counts,
    total_vehicles: total,
    avg_speed: speedFor(congestion),
    congestion,
    incident: Math.random() < 0.06,
    plate: randomPlate(),
  };
}

function seedRows(): TrafficRow[] {
  return Array.from({ length: MAX_ROWS }, (_, i) => makeRow(1000 - i, i * 45_000));
}

function seedToday(): TrafficHourBucket[] {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const currentHour = start.getHours();
  return Array.from({ length: currentHour + 1 }, (_, h) => {
    const d = new Date(start);
    d.setHours(h);
    const rush = (h >= 7 && h <= 9) || (h >= 16 && h <= 19);
    const scale = rush ? 1.8 : 1;
    const counts = {
      car_count: Math.round(rand(60, 180) * scale),
      motorcycle_count: Math.round(rand(150, 400) * scale),
      truck_count: rand(10, 40),
      bus_count: rand(5, 25),
    } as Record<VehicleKey, number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const congestion_index = Math.min(100, Math.round((total / (rush ? 1200 : 900)) * 100));
    const avg_speed = Math.max(6, 50 - Math.round(congestion_index * 0.4));
    return { hour: d.toISOString(), ...counts, avg_speed, congestion_index };
  });
}

export function useTrafficData(): TrafficData {
  const [counts, setCounts] = useState<TrafficRow[]>([]);
  const [todayData, setToday] = useState<TrafficHourBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const nextId = useRef(1001);

  // TODO(api): ganti dengan fetch ke endpoint traffic-mu.
  const refresh = useCallback(() => {
    setLoading(true);
    setCounts(seedRows());
    setToday(seedToday());
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  // TODO(api): ganti dengan EventSource (SSE) dari pipeline deteksi kendaraan.
  useEffect(() => {
    refresh();
    setConnected(true);

    const tick = setInterval(() => {
      const row = makeRow(nextId.current++);
      setCounts((prev) => [row, ...prev].slice(0, MAX_ROWS));
      setLastUpdated(new Date());
      setToday((prev) => {
        if (prev.length === 0) return prev;
        const copy = [...prev];
        const last = { ...copy[copy.length - 1] };
        for (const c of VEHICLE_CATEGORIES) last[c.key] += row[c.key];
        last.avg_speed = row.avg_speed;
        last.congestion_index = Math.min(
          100,
          Math.round((last[VEHICLE_CATEGORIES[0].key] +
            last.motorcycle_count) / 12)
        );
        copy[copy.length - 1] = last;
        return copy;
      });
    }, 4000);

    return () => {
      clearInterval(tick);
      setConnected(false);
    };
  }, [refresh]);

  const latestRow = counts[0] ?? null;
  const totals = counts.reduce((acc, r) => {
    for (const c of VEHICLE_CATEGORIES) acc[c.key] += r[c.key];
    return acc;
  }, emptyCounts());

  return { counts, todayData, latestRow, totals, loading, connected, lastUpdated, refresh };
}