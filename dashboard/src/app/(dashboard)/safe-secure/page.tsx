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
  Camera,
  Siren,
  Clock,
  Sparkles,
  Ban,
  UserCog,
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
import { useCountingData, type CountingRow } from '@/lib/counting/hooks';
import {
  DETECTION_CATEGORIES,
  type DetectionKey,
} from '@/lib/counting/type';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

// const HLS_URL = 'https://cctvjss.jogjakota.go.id/margo-utomo/Wisma-Ratih.stream/playlist.m3u8';
const HLS_URL = 'rtsp://admin:password1@10.251.102.191:555/Streaming/Channels/101';
// const HLS_URL2 = 'https://cctvjss.jogjakota.go.id/margo-utomo/Wisma-Ratih.stream/playlist.m3u8';
const HLS_URL2 = 'rtsp://admin:password1@10.251.102.191:554/Streaming/Channels/101';
const CAMERA_NAME = 'Kamera Utama Depan';
const CAMERA_NAME2 = 'Kamera Utama Belakang';

const THREATS = DETECTION_CATEGORIES.filter((c) => c.rare);

export function snapshotSrc(s?: string): string | null {
  if (!s) return null;
  if (s.startsWith('data:')) return s;                 // sudah data URI
  if (/^https?:\/\//.test(s) || s.startsWith('/')) return s; // URL MinIO / path
  return `data:image/jpeg;base64,${s}`;                // base64 mentah
}

export default function SecurePage() {
  const {
    counts,
    todayData,
    latestRow,
    snapshots,
    loading,
    connected,
    lastUpdated,
    refresh,
  } = useCountingData();

  // Total per kategori untuk HARI INI (dari todayData)
  const todayTotals = useMemo(() => {
    const acc = Object.fromEntries(
      DETECTION_CATEGORIES.map((c) => [c.key, 0])
    ) as Record<DetectionKey, number>;
    for (const d of todayData) {
      for (const c of DETECTION_CATEGORIES) acc[c.key] += d[c.key] ?? 0;
    }
    return acc;
  }, [todayData]);

  const totalThreatsToday = THREATS.reduce((s, c) => s + todayTotals[c.key], 0);
  const activeThreatTypes = THREATS.filter((c) => todayTotals[c.key] > 0).length;
  const recentThreats = latestRow
    ? THREATS.reduce((s, c) => s + (latestRow[c.key] ?? 0), 0)
    : 0;

  const recommendations = useMemo(
    () => buildRecommendations(latestRow),
    [latestRow]
  );

  const chart = useMemo(() => {
    const labels = todayData.map(
      (d) => `${String(new Date(d.hour).getHours()).padStart(2, '0')}:00`
    );
    return {
      data: {
        labels,
        datasets: DETECTION_CATEGORIES.map((c) => ({
          label: c.label,
          data: todayData.map((d) => d[c.key] ?? 0),
          borderColor: c.color,
          backgroundColor: c.color,
          tension: 0.35,
          fill: false, // 7 area kalau di-fill saling numpuk & buram
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

  return (
    <div className="min-h-screen w-full bg-muted/30 p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* ── Header ── */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Safe &amp; Secure Monitoring
              </h1>
              <p className="text-sm text-muted-foreground">
                Deteksi orang &amp; kejadian keamanan real-time dari stream CCTV.
              </p>
            </div>
          </div>
        </header>

        {/* ── KPI strip ── */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MetricCard
            accent={recentThreats > 0 ? 'red' : 'emerald'}
            label="Ancaman (terkini)"
            value={recentThreats}
            sub={recentThreats > 0 ? 'Perlu perhatian' : 'Aman'}
          />
          <MetricCard
            accent="amber"
            label="Total ancaman hari ini"
            value={totalThreatsToday}
            sub={`${activeThreatTypes} jenis ancaman aktif`}
          />
          <MetricCard
            accent="sky"
            label="Deteksi terekam"
            value={counts.length}
            sub="Baris terakhir"
          />
        </section>

        {/* ── Video + snapshot ── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-1">
          {/* <Card className="overflow-hidden lg:col-span-2 justify-end flex flex-col bg-white rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3 h-full">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-black">
                <Camera className="h-4 w-4 text-sky-600" />
                Live View {CAMERA_NAME} - {CAMERA_NAME2}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col">
              <div className="aspect-video w-full">
                <HlsPlayer src={HLS_URL} />
              </div>
              <div className="aspect-video w-full">
                <HlsPlayer src={HLS_URL2} />
              </div>
            </CardContent>
          </Card> */}

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-black">
                <Camera className="h-4 w-4 text-sky-600" />
                Deteksi Terakhir
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-2">
                <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'throwing', label: 'Throwing Object', color: '#f59e0b' },
                  { key: 'smoking', label: 'Smoking', color: '#0ea5e9' },
                  { key: 'trespassing', label: 'Trespassing', color: '#ec4899' },
                ] as const).map((slot) => {
                  const src = snapshotSrc(snapshots[slot.key] ?? undefined);
                  return (
                    <div
                      key={slot.key}
                      className="relative aspect-video w-full overflow-hidden rounded-md bg-muted"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={slot.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                          <Camera className="h-6 w-6 opacity-40" />
                          <p className="text-[10px]">Belum ada gambar</p>
                        </div>
                      )}
                      <span
                        className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: `${slot.color}d9` }}
                      >
                        {slot.label}
                      </span>
                    </div>
                  );
                })}
                </div>

                {recentThreats > 0 && (
                  <span className="mt-2 inline-block w-fit rounded-full bg-red-600/85 px-2 py-0.5 text-[10px] font-medium text-white tabular-nums">
                    {recentThreats} ancaman terkini
                  </span>
                )}
              </div>
              <Card className='rounded-none border-none '>
                <CardHeader className="py-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Rekomendasi Tindakan
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Saran otomatis berdasarkan deteksi terkini
                  </p>
                </CardHeader>
                <CardContent >
                  <div className="grid grid-cols-4 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    {recommendations.map((r) => (
                      <RecommendationCard key={r.key} reco={r} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </section>
        {/* ── Chart + rincian ancaman ── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 py-5">
            <CardHeader className="">
              <CardTitle className="text-base">
                Volume Ancaman Hari Ini (per jam)
              </CardTitle>
            </CardHeader>
            <CardContent>
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

          {/* Rincian ancaman — otomatis dari kategori */}
          <Card className="py-5">
            <CardHeader>
              <CardTitle className="text-base">Rincian Ancaman (hari ini)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {THREATS.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/60"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.label}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      todayTotals[c.key] > 0
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {todayTotals[c.key]}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* ── Tabel event ── */}
        <Card className="py-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Riwayat Deteksi Terakhir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Terdeteksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.map((row) => {
                    const triggered = THREATS.filter((c) => (row[c.key] ?? 0) > 0);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {row.id}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {new Date(row.timestamp).toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell>
                          {triggered.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {triggered.map((c) => (
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
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Aman</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {counts.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-muted-foreground"
                      >
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

// ── Kartu metrik ──────────────────────────────────────────────────
const ACCENTS = {
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
  value?: number;
  sub: string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <span className="text-3xl font-semibold tabular-nums">
          {value != null ? value.toLocaleString('id-ID') : '—'}
        </span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}


// ── Rekomendasi (dummy, berbasis aturan) ──────────────────────────
type RecoLevel = 'safe' | 'caution' | 'danger';

interface Reco {
  key: string;
  title: string;
  icon: LucideIcon;
  value: string;
  level: RecoLevel;
  reason: string;
}

// TODO(api): ganti fungsi ini dengan hasil dari backend / model AI.
function buildRecommendations(row: CountingRow | null): Reco[] {
  const v = (k: DetectionKey) => row?.[k] ?? 0;
  const weapon = v('weapons_count');
  const intruder = v('intruder_count');
  const throwing = v('throwing_count');
  const vandalism = v('vandalism_count');
  const trespassing = v('trespassing_count');

  // 1. Jumlah petugas — murni dari bobot ancaman (tanpa faktor jumlah orang)
  const officers = Math.max(
    2,
    weapon * 3 + intruder * 2 + throwing + vandalism + trespassing
  );
  const officerLevel: RecoLevel =
    officers >= 8 ? 'danger' : officers >= 4 ? 'caution' : 'safe';
  const officerDrivers = [
    weapon > 0 && 'senjata',
    intruder > 0 && 'penyusup',
    throwing > 0 && 'lempar benda',
    vandalism > 0 && 'vandalisme',
    trespassing > 0 && 'akses tanpa izin',
  ].filter(Boolean);

  // 2. Sterilisasi area
  const sterilActive = weapon > 0 || throwing > 0 || vandalism > 0;
  const sterilLevel: RecoLevel = weapon > 0 ? 'danger' : sterilActive ? 'caution' : 'safe';

  // 3. Panggilan ke kepolisian / pihak berwenang
  const policeActive = weapon > 0 || intruder > 0;
  const policeLevel: RecoLevel = weapon > 0 ? 'danger' : policeActive ? 'caution' : 'safe';

  // 4. Penutupan operasional sementara — tanpa faktor jumlah orang
  const closureActive = (weapon > 0 && intruder > 0) || weapon >= 2;
  const closureLevel: RecoLevel = closureActive
    ? 'danger'
    : weapon > 0 || intruder > 0
      ? 'caution'
      : 'safe';

  return [
    {
      key: 'officers',
      title: 'Jumlah Petugas',
      icon: UserCog,
      value: `${officers} petugas`,
      level: officerLevel,
      reason:
        officerDrivers.length > 0
          ? `Ditambah karena ${officerDrivers.join(', ')}.`
          : 'Situasi normal, penjagaan standar.',
    },
    {
      key: 'sterilization',
      title: 'Sterilisasi Area',
      icon: Sparkles,
      value: sterilActive ? 'Disarankan' : 'Tidak perlu',
      level: sterilLevel,
      reason: sterilActive
        ? 'Terdeteksi benda/senjata berbahaya di area.'
        : 'Tidak ada objek berbahaya terdeteksi.',
    },
    {
      key: 'police',
      title: 'Panggil Pihak Berwenang',
      icon: Siren,
      value: policeActive ? 'Segera' : 'Standby',
      level: policeLevel,
      reason: policeActive
        ? 'Ada indikasi senjata atau penyusup.'
        : 'Belum ada indikasi yang memerlukan kepolisian.',
    },
  ];
}

const LEVEL_STYLE: Record<RecoLevel, { icon: string; badge: string }> = {
  safe: {
    icon: 'bg-emerald-500/10 text-emerald-600',
    badge: 'bg-emerald-500/10 text-emerald-600',
  },
  caution: {
    icon: 'bg-amber-500/10 text-amber-600',
    badge: 'bg-amber-500/10 text-amber-600',
  },
  danger: {
    icon: 'bg-red-500/10 text-red-600',
    badge: 'bg-red-500/10 text-red-600',
  },
};

function RecommendationCard({ reco }: { reco: Reco }) {
  const style = LEVEL_STYLE[reco.level];
  const Icon = reco.icon;
  return (
    <div className="flex flex-col rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            style.icon
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <Badge
          variant="outline"
          className={cn('border-transparent font-medium', style.badge)}
        >
          {reco.value}
        </Badge>
      </div>
      <p className="mt-3 text-sm font-medium">{reco.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {reco.reason}
      </p>
    </div>
  );
}