'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Car,
  Gauge,
  Leaf,
  RefreshCw,
  Radio,
  Camera,
  Clock,
  ScanLine,
  AlertTriangle,
  TrendingUp,
  Wallet,
  MapPin,
  ArrowLeftRight,
  MoveRight,
  Construction,
  TrafficCone,
  Bell,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { HlsPlayer } from '@/components/hls-player';
import { useTrafficData } from '@/lib/mobility/hooks';
import {
  VEHICLE_CATEGORIES,
  CONGESTION_META,
  type Congestion,
} from '@/lib/mobility/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const HLS_URL =
  'https://cctvjss.jogjakota.go.id/margo-utomo/Wisma-Ratih.stream/playlist.m3u8';
const CAMERA_NAME = 'CCTV Simpang Margo Utomo';
const ZONE_NAME = 'Zona Margo Utomo';

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);

// Data historis insiden per ruas (dummy).
const RISK_SEGMENTS = [
  { name: 'Kamera Depan', score: 84, incidents: 27 },
  { name: 'Kamera Belakang', score: 84, incidents: 27 },
];

export default function MobilityPage() {
  const {
    counts,
    todayData,
    latestRow,
    loading,
    connected,
    lastUpdated,
    refresh,
  } = useTrafficData();

  const congestionNow: Congestion = latestRow?.congestion ?? 'lancar';
  const totalVehiclesNow = latestRow?.total_vehicles ?? 0;
  const avgSpeedNow = latestRow?.avg_speed ?? 0;

  const todayTotals = useMemo(() => {
    const acc = Object.fromEntries(
      VEHICLE_CATEGORIES.map((c) => [c.key, 0])
    ) as Record<(typeof VEHICLE_CATEGORIES)[number]['key'], number>;
    for (const d of todayData) {
      for (const c of VEHICLE_CATEGORIES) acc[c.key] += d[c.key] ?? 0;
    }
    return acc;
  }, [todayData]);

  const carbonToday = VEHICLE_CATEGORIES.reduce(
    (s, c) => s + todayTotals[c.key] * c.emission,
    0
  );

  // Economic loss akibat kemacetan (dummy: tarif per jam per level kepadatan)
  const macetHours = todayData.filter((d) => d.congestion_index >= 70).length;
  const padatHours = todayData.filter(
    (d) => d.congestion_index >= 45 && d.congestion_index < 70
  ).length;
  const economicLossToday = macetHours * 8_000_000 + padatHours * 2_500_000;

  const strategies = useMemo(
    () => buildStrategies(congestionNow, totalVehiclesNow),
    [congestionNow, totalVehiclesNow]
  );

  // Notifikasi peringatan otomatis — dari kemacetan & insiden pada data terbaru
  const alerts = useMemo(
    () =>
      counts
        .filter((r) => r.incident || r.congestion === 'macet')
        .slice(0, 6)
        .map((r) => ({
          id: r.id,
          time: r.timestamp,
          type: r.incident ? ('insiden' as const) : ('macet' as const),
        })),
    [counts]
  );

  const chart = useMemo(() => {
    const labels = todayData.map(
      (d) => `${String(new Date(d.hour).getHours()).padStart(2, '0')}:00`
    );
    return {
      data: {
        labels,
        datasets: VEHICLE_CATEGORIES.map((c) => ({
          label: c.label,
          data: todayData.map((d) => d[c.key] ?? 0),
          borderColor: c.color,
          backgroundColor: c.color,
          tension: 0.35,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: {
            position: 'top' as const,
            align: 'end' as const,
            labels: { usePointStyle: true, boxWidth: 6, boxHeight: 6 },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.15)' } },
        },
      },
    };
  }, [todayData]);

  const congestionMeta = CONGESTION_META[congestionNow];

  return (
    <div className="min-h-screen w-full bg-muted/30 p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* ── Header ── */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Mobility &amp; Traffic Monitoring
              </h1>
              <p className="text-sm text-muted-foreground">
                Klasifikasi kendaraan, arus lalu lintas &amp; plat nomor real-time.
              </p>
            </div>
          </div>

        </header>

        {/* ── Video + snapshot (plat) ── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Radio className="h-4 w-4 text-indigo-600" />
                {CAMERA_NAME}
              </CardTitle>
              <span className="text-xs text-muted-foreground">Live feed</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="aspect-video w-full">
                <HlsPlayer src={HLS_URL} />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Camera className="h-4 w-4 text-sky-600" />
                Deteksi Terakhir
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative aspect-video w-full bg-muted">
                {latestRow?.snapshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${latestRow.snapshot}`}
                    alt="Detection snapshot"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Camera className="h-7 w-7 opacity-40" />
                    <p className="text-xs">Snapshot dummy — akan terisi dari API</p>
                  </div>
                )}
                {latestRow && (
                  <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-indigo-600/85 px-2 py-0.5 text-[10px] font-medium text-white tabular-nums">
                      {latestRow.total_vehicles} kendaraan
                    </span>
                    {latestRow.plate && (
                      <span className="flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-medium text-white">
                        <ScanLine className="h-3 w-3" />
                        {latestRow.plate}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* ── KPI strip ── */}
              <section className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                <MetricCard
                  accent="indigo"
                  label="Kendaraan (terkini)"
                  value={totalVehiclesNow.toLocaleString('id-ID')}
                  sub={
                    lastUpdated
                      ? `Update ${lastUpdated.toLocaleTimeString('id-ID')}`
                      : 'Menunggu data…'
                  }
                />
                <MetricCard
                  accent={congestionMeta.accent}
                  label="Status arus"
                  value={congestionMeta.label}
                  sub="Kondisi lalu lintas saat ini"
                />
              </section>
            </CardContent>
          </Card>
        </section>


        {/* ── Chart + notifikasi ── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          <Card className="lg:col-span-2">
            <CardHeader className="py-4">
              <CardTitle className="text-base">
                Volume Kendaraan Hari Ini (per jam)
              </CardTitle>
            </CardHeader>
            <CardContent className='pb-5'>
              {todayData.length > 0 ? (
                <div className="h-[300px]">
                  <Line data={chart.data} options={chart.options} />
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada data hari ini.
                </p>
              )}
            </CardContent>
          </Card>
          <section className='flex flex-col gap-3'>
            <section className='grid grid-cols-2 gap-3'>
              <MetricCard
                accent="sky"
                label="Kecepatan rata-rata"
                value={`${avgSpeedNow} km/j`}
                sub="Estimasi arus terkini"
              />
              <MetricCard
                accent="emerald"
                label="Emisi karbon (hari ini)"
                value={`${carbonToday.toFixed(1)} kg`}
                sub={`CO₂ · ${ZONE_NAME}`}
              />
            </section>
            {/* Prediksi tren */}
            <Card className='h-full'>
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Prediksi Arus
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Perkiraan beberapa jam ke depan.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {FORECAST.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <span className="text-sm text-muted-foreground">{f.label}</span>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn('border-transparent font-medium', LEVEL_BADGE[f.level])}
                      >
                        {f.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {f.confidence}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </section>

        {/* ── Risk scoring + prediksi + economic loss ── */}
        <section className="w-full">
          {/* ── Risk scoring + economic loss (satu card) ── */}
          <Card>
            <CardContent className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
              {/* Risk scoring */}
              <div className="flex flex-col gap-3 md:pr-6">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Risk Scoring Ruas
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Berdasarkan data insiden historis.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  {RISK_SEGMENTS.map((s) => {
                    const lvl = riskLevel(s.score);
                    return (
                      <div key={s.name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate">{s.name}</span>
                          <span className={cn('font-semibold tabular-nums', LEVEL_TEXT[lvl])}>
                            {s.score}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', LEVEL_BAR[lvl])}
                            style={{ width: `${s.score}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {s.incidents} insiden tercatat
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Economic loss */}
              <div className="flex flex-col gap-4 md:border-l md:pl-6">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    Kerugian Ekonomi
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Estimasi akibat kemacetan hari ini.
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-red-600">
                    {rupiah(economicLossToday)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Akumulasi sejak awal hari</p>
                </div>
                <div className="flex flex-col gap-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Jam macet</span>
                    <span className="tabular-nums">{macetHours} jam</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Jam padat</span>
                    <span className="tabular-nums">{padatHours} jam</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Tabel riwayat ── */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Riwayat Deteksi Terakhir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead>Rincian</TableHead>
                    <TableHead>Plat</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.map((row) => {
                    const meta = CONGESTION_META[row.congestion];
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">
                          {new Date(row.timestamp).toLocaleTimeString('id-ID')}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className="border-indigo-500/30 text-indigo-600 tabular-nums"
                          >
                            {row.total_vehicles}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {VEHICLE_CATEGORIES.filter((c) => row[c.key] > 0).map(
                              (c) => (
                                <span
                                  key={c.key}
                                  className="rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                                  style={{
                                    color: c.color,
                                    backgroundColor: `${c.color}1a`,
                                  }}
                                >
                                  {c.label} {row[c.key]}
                                </span>
                              )
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {row.plate ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('border-transparent', LEVEL_BADGE_ACCENT[meta.accent])}
                          >
                            {meta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {counts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        Belum ada data.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div >
  );
}

// ── Rekomendasi strategis (dummy, berbasis aturan) ────────────────
type RecoLevel = 'safe' | 'caution' | 'danger';

interface Reco {
  key: string;
  title: string;
  icon: LucideIcon;
  value: string;
  level: RecoLevel;
  reason: string;
}

// TODO(api): ganti dengan hasil dari backend / model optimasi lalu lintas.
function buildStrategies(congestion: Congestion, total: number): Reco[] {
  const isMacet = congestion === 'macet';
  const isPadat = congestion === 'padat';

  const lightsLevel: RecoLevel = isMacet ? 'danger' : isPadat ? 'caution' : 'safe';
  const contraActive = isMacet && total >= 45;
  const contraLevel: RecoLevel = contraActive ? 'danger' : isMacet ? 'caution' : 'safe';
  const onewayLevel: RecoLevel = isMacet ? 'caution' : 'safe';
  const closeActive = isMacet && total >= 55;
  const closeLevel: RecoLevel = closeActive ? 'danger' : isMacet ? 'caution' : 'safe';

  return [
    {
      key: 'lights',
      title: 'Atur Ulang Lampu Lalu Lintas',
      icon: TrafficCone,
      value: isMacet || isPadat ? 'Disarankan' : 'Optimal',
      level: lightsLevel,
      reason:
        isMacet || isPadat
          ? 'Sesuaikan durasi hijau untuk urai antrean.'
          : 'Durasi lampu saat ini memadai.',
    },
    {
      key: 'oneway',
      title: 'Berlakukan Satu Arah',
      icon: MoveRight,
      value: isMacet ? 'Pertimbangkan' : 'Standby',
      level: onewayLevel,
      reason: isMacet
        ? 'Arus dua arah menyebabkan penumpukan.'
        : 'Belum diperlukan.',
    },
    {
      key: 'contraflow',
      title: 'Contraflow',
      icon: ArrowLeftRight,
      value: contraActive ? 'Disarankan' : 'Standby',
      level: contraLevel,
      reason: contraActive
        ? 'Volume sangat tinggi, tambah kapasitas lajur.'
        : 'Volume masih tertangani.',
    },
    {
      key: 'close',
      title: 'Tutup Jalan Sementara',
      icon: Construction,
      value: closeActive ? 'Disarankan' : 'Belum perlu',
      level: closeLevel,
      reason: closeActive
        ? 'Kepadatan ekstrem, alihkan ke rute lain.'
        : 'Jalan dapat tetap dibuka.',
    },
  ];
}

const FORECAST: { label: string; status: string; confidence: number; level: RecoLevel }[] = [
  { label: '+1 jam', status: 'Padat', confidence: 78, level: 'caution' },
  { label: '+2 jam', status: 'Macet', confidence: 71, level: 'danger' },
];

const riskLevel = (s: number): RecoLevel => (s >= 70 ? 'danger' : s >= 45 ? 'caution' : 'safe');

const LEVEL_TEXT: Record<RecoLevel, string> = {
  safe: 'text-emerald-600',
  caution: 'text-amber-600',
  danger: 'text-red-600',
};
const LEVEL_BAR: Record<RecoLevel, string> = {
  safe: 'bg-emerald-500',
  caution: 'bg-amber-500',
  danger: 'bg-red-500',
};
const LEVEL_BADGE: Record<RecoLevel, string> = {
  safe: 'bg-emerald-500/10 text-emerald-600',
  caution: 'bg-amber-500/10 text-amber-600',
  danger: 'bg-red-500/10 text-red-600',
};
const LEVEL_BADGE_ACCENT: Record<'emerald' | 'amber' | 'red', string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600',
  amber: 'bg-amber-500/10 text-amber-600',
  red: 'bg-red-500/10 text-red-600',
};

const LEVEL_STYLE: Record<RecoLevel, { icon: string; badge: string }> = {
  safe: { icon: 'bg-emerald-500/10 text-emerald-600', badge: 'bg-emerald-500/10 text-emerald-600' },
  caution: { icon: 'bg-amber-500/10 text-amber-600', badge: 'bg-amber-500/10 text-amber-600' },
  danger: { icon: 'bg-red-500/10 text-red-600', badge: 'bg-red-500/10 text-red-600' },
};

function RecommendationCard({ reco }: { reco: Reco }) {
  const style = LEVEL_STYLE[reco.level];
  const Icon = reco.icon;
  return (
    <div className="flex flex-col rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', style.icon)}>
          <Icon className="h-4 w-4" />
        </span>
        <Badge variant="outline" className={cn('border-transparent font-medium', style.badge)}>
          {reco.value}
        </Badge>
      </div>
      <p className="mt-3 text-sm font-medium">{reco.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{reco.reason}</p>
    </div>
  );
}

// ── Kartu metrik ──────────────────────────────────────────────────
const ACCENTS = {
  indigo: 'bg-indigo-500/10 text-indigo-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  sky: 'bg-sky-500/10 text-sky-600',
  amber: 'bg-amber-500/10 text-amber-600',
  red: 'bg-red-500/10 text-red-600',
} as const;

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value?: React.ReactNode;
  sub: string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <span className="text-3xl font-semibold tabular-nums">{value ?? '—'}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}