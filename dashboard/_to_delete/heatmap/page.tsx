'use client';

/**
 * Room Heatmap (suhu & kelembapan) — visualisasi 3D
 * -------------------------------------------------
 * - Model 3D lantai/gedung di-load dari /public (lihat MODEL_URL).
 * - Titik sensor DUMMY (hardcode) di bawah -> lihat SENSORS.
 * - Warna tiap pixel dihitung via IDW (inverse-distance weighting) di sebuah
 *   <canvas>, lalu dijadikan tekstur dan ditempel sebagai plane transparan
 *   sedikit di atas lantai -> efek "heat draped" seperti heatmap coverage WiFi.
 * - Tidak butuh library heatmap tambahan; interpolasi murni JS/canvas.
 *
 * Cara pakai:
 *   1) npm install three @react-three/fiber @react-three/drei
 *      npm install -D @types/three
 *   2) Taruh model kamu di: public/models/room.glb  (atau ganti MODEL_URL)
 *   3) Buka /heatmap
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  Thermometer,
  Droplets,
  RotateCcw,
  Flame,
  MapPin,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ─────────────────────────────────────────────────────────────────────────
// KONFIGURASI (silakan tweak di sini)
// ─────────────────────────────────────────────────────────────────────────

/** Path model 3D di folder public. */
const MODEL_URL = '/models/room.glb';

/** Tinggi plane heatmap di atas lantai (unit dunia model). Naikkan bila heat
 *  "tenggelam" ke dalam lantai. */
const HEAT_Y_OFFSET = 0.05;

/** Transparansi lapisan heat (0..1). */
const HEAT_OPACITY = 0.72;

/** Resolusi tekstur heatmap (semakin besar = semakin halus, lebih berat). */
const HEAT_RES = 256;

/** Pangkat IDW. 2 = 1/d^2. Lebih besar = titik panas lebih "tajam"/lokal. */
const IDW_POWER = 2.4;

/** true  = heat selalu digambar di atas segalanya (gaya overlay, seperti foto
 *          referensi — tidak terhalang dinding).
 *  false = heat bisa terhalang objek yang lebih tinggi (lebih "realistis 3D"). */
const HEAT_ALWAYS_ON_TOP = true;

// ─────────────────────────────────────────────────────────────────────────
// DATA SENSOR DUMMY (hardcode)
// x, z dalam koordinat ternormalisasi 0..1 terhadap footprint denah.
//   x: 0 = sisi kiri (min X), 1 = sisi kanan (max X)
//   z: 0 = sisi depan (min Z), 1 = sisi belakang (max Z)
// temp: °C, humidity: %RH
// ─────────────────────────────────────────────────────────────────────────

type Sensor = {
  id: string;
  x: number;
  z: number;
  temp: number;
  humidity: number;
};

const SENSORS: Sensor[] = [
  { id: 'S-01', x: 0.12, z: 0.15, temp: 24.1, humidity: 61 },
  { id: 'S-02', x: 0.30, z: 0.10, temp: 27.5, humidity: 55 },
  { id: 'S-03', x: 0.52, z: 0.18, temp: 31.8, humidity: 48 },
  { id: 'S-04', x: 0.74, z: 0.12, temp: 29.2, humidity: 52 },
  { id: 'S-05', x: 0.90, z: 0.22, temp: 25.6, humidity: 58 },
  { id: 'S-06', x: 0.18, z: 0.42, temp: 23.0, humidity: 66 },
  { id: 'S-07', x: 0.40, z: 0.48, temp: 33.4, humidity: 44 }, // hot spot (mis. ruang server)
  { id: 'S-08', x: 0.60, z: 0.45, temp: 30.1, humidity: 50 },
  { id: 'S-09', x: 0.82, z: 0.52, temp: 26.3, humidity: 57 },
  { id: 'S-10', x: 0.22, z: 0.72, temp: 22.4, humidity: 70 }, // cold spot (mis. dekat AC)
  { id: 'S-11', x: 0.45, z: 0.78, temp: 28.7, humidity: 53 },
  { id: 'S-12', x: 0.68, z: 0.74, temp: 32.6, humidity: 46 },
  { id: 'S-13', x: 0.88, z: 0.82, temp: 27.9, humidity: 54 },
  { id: 'S-14', x: 0.35, z: 0.92, temp: 25.0, humidity: 60 },
];

// Rentang suhu untuk skala warna (biar legend & warna stabil, tidak ikut
// berubah tiap render). Sesuaikan dengan rentang sensor kamu.
const TEMP_MIN = 22;
const TEMP_MAX = 34;

// ─────────────────────────────────────────────────────────────────────────
// WARNA: ramp ala "jet" (biru -> cyan -> hijau -> kuning -> merah)
// ─────────────────────────────────────────────────────────────────────────

const JET_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [26, 76, 173]], // biru
  [0.25, [43, 196, 221]], // cyan
  [0.5, [74, 194, 82]], // hijau
  [0.75, [245, 205, 66]], // kuning
  [1.0, [214, 48, 39]], // merah
];

function jet(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < JET_STOPS.length - 1; i++) {
    const [t0, c0] = JET_STOPS[i];
    const [t1, c1] = JET_STOPS[i + 1];
    if (x >= t0 && x <= t1) {
      const f = (x - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return JET_STOPS[JET_STOPS.length - 1][1];
}

/** CSS gradient string untuk legend. */
const LEGEND_GRADIENT = `linear-gradient(to right, ${JET_STOPS.map(
  ([t, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${Math.round(t * 100)}%`
).join(', ')})`;

// ─────────────────────────────────────────────────────────────────────────
// TEKSTUR HEATMAP (IDW di canvas)
// ─────────────────────────────────────────────────────────────────────────

function buildHeatmapTexture(sensors: Sensor[]): THREE.CanvasTexture {
  const size = HEAT_RES;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const span = TEMP_MAX - TEMP_MIN || 1;

  for (let py = 0; py < size; py++) {
    const v = py / (size - 1);
    for (let px = 0; px < size; px++) {
      const u = px / (size - 1);

      // IDW
      let num = 0;
      let den = 0;
      let exact: number | null = null;
      for (const s of sensors) {
        const dx = u - s.x;
        const dz = v - s.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1e-6) {
          exact = s.temp;
          break;
        }
        const w = 1 / Math.pow(d2, IDW_POWER / 2);
        num += w * s.temp;
        den += w;
      }
      const val = exact !== null ? exact : num / den;
      const t = (val - TEMP_MIN) / span;
      const [r, g, b] = jet(t);

      const idx = (py * size + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────
// KOMPONEN 3D
// ─────────────────────────────────────────────────────────────────────────

type Box = {
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  size: THREE.Vector3;
};

function useModelBox(scene: THREE.Object3D): Box {
  return useMemo(() => {
    const b = new THREE.Box3().setFromObject(scene);
    const center = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    return { min: b.min.clone(), max: b.max.clone(), center, size };
  }, [scene]);
}

function Model() {
  const { scene } = useGLTF(MODEL_URL);
  return <primitive object={scene} />;
}

function HeatPlane({ box }: { box: Box }) {
  const texture = useMemo(() => buildHeatmapTexture(SENSORS), []);
  const width = box.size.x;
  const depth = box.size.z;
  const y = box.min.y + HEAT_Y_OFFSET;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[box.center.x, y, box.center.z]}
      renderOrder={HEAT_ALWAYS_ON_TOP ? 999 : 0}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={HEAT_OPACITY}
        depthWrite={false}
        depthTest={!HEAT_ALWAYS_ON_TOP}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function SensorMarkers({ box }: { box: Box }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <group renderOrder={1000}>
      {SENSORS.map((s) => {
        const wx = box.min.x + s.x * box.size.x;
        const wz = box.min.z + s.z * box.size.z;
        const wy = box.min.y + HEAT_Y_OFFSET + 0.02;
        const t = (s.temp - TEMP_MIN) / (TEMP_MAX - TEMP_MIN || 1);
        const [r, g, b] = jet(t);
        const color = `rgb(${r},${g},${b})`;
        return (
          <group key={s.id} position={[wx, wy, wz]}>
            <mesh
              onPointerOver={(e) => {
                e.stopPropagation();
                setActive(s.id);
              }}
              onPointerOut={() => setActive(null)}
            >
              <sphereGeometry args={[Math.max(box.size.x, box.size.z) * 0.008, 16, 16]} />
              <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
            </mesh>
            {active === s.id && (
              <Html center distanceFactor={Math.max(box.size.x, box.size.z)}>
                <div className="pointer-events-none whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-medium text-white shadow-lg">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {s.id}
                  </div>
                  <div className="flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-orange-400" /> {s.temp.toFixed(1)}°C
                  </div>
                  <div className="flex items-center gap-1">
                    <Droplets className="h-3 w-3 text-sky-400" /> {s.humidity}%
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Framing kamera otomatis dari bounding box model. `resetKey` naik -> re-fit. */
function FitCamera({
  box,
  controlsRef,
  resetKey,
}: {
  box: Box;
  controlsRef: React.RefObject<any>;
  resetKey: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    const { center, size } = box;
    const maxDim = Math.max(size.x, size.z);
    const dist = maxDim * 1.4 + size.y;
    camera.position.set(center.x + dist, center.y + dist * 0.85, center.z + dist);
    (camera as THREE.PerspectiveCamera).near = Math.max(0.01, dist / 200);
    (camera as THREE.PerspectiveCamera).far = dist * 200;
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, resetKey]);
  return null;
}

function Scene({
  showHeat,
  showSensors,
  controlsRef,
  resetKey,
}: {
  showHeat: boolean;
  showSensors: boolean;
  controlsRef: React.RefObject<any>;
  resetKey: number;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const box = useModelBox(scene);

  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight intensity={0.4} groundColor="#94a3b8" />
      <directionalLight
        position={[box.center.x + box.size.x, box.max.y + box.size.y, box.center.z + box.size.z]}
        intensity={1.1}
      />
      <primitive object={scene} />
      {showHeat && <HeatPlane box={box} />}
      {showSensors && <SensorMarkers box={box} />}
      <OrbitControls ref={controlsRef} makeDefault enableDamping />
      <FitCamera box={box} controlsRef={controlsRef} resetKey={resetKey} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HALAMAN
// ─────────────────────────────────────────────────────────────────────────

export default function RoomHeatmapPage() {
  const [mounted, setMounted] = useState(false);
  const [showHeat, setShowHeat] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const controlsRef = useRef<any>(null);

  useEffect(() => setMounted(true), []);

  const avgTemp = useMemo(
    () => SENSORS.reduce((a, s) => a + s.temp, 0) / SENSORS.length,
    []
  );
  const avgHum = useMemo(
    () => SENSORS.reduce((a, s) => a + s.humidity, 0) / SENSORS.length,
    []
  );
  const hottest = useMemo(
    () => SENSORS.reduce((m, s) => (s.temp > m.temp ? s : m), SENSORS[0]),
    []
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <header>
        <h1 className="text-lg font-semibold leading-tight">Room Heatmap</h1>
        <p className="text-sm text-muted-foreground">
          Distribusi suhu &amp; kelembapan ruangan (data dummy) di atas denah 3D.
        </p>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Thermometer className="h-4 w-4 text-orange-500" /> Suhu rata-rata
            </span>
            <span className="text-3xl font-semibold tabular-nums">
              {avgTemp.toFixed(1)}°C
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Droplets className="h-4 w-4 text-sky-500" /> Kelembapan rata-rata
            </span>
            <span className="text-3xl font-semibold tabular-nums">
              {avgHum.toFixed(0)}%
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Flame className="h-4 w-4 text-red-500" /> Titik terpanas
            </span>
            <span className="text-3xl font-semibold tabular-nums">
              {hottest.temp.toFixed(1)}°C
            </span>
            <span className="text-xs text-muted-foreground">{hottest.id}</span>
          </CardContent>
        </Card>
      </section>

      {/* Canvas 3D */}
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Flame className="h-4 w-4 text-orange-500" />
            Peta Panas Ruangan (3D)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={showHeat ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowHeat((v) => !v)}
            >
              <Flame className="mr-1 h-3.5 w-3.5" /> Heat
            </Button>
            <Button
              variant={showSensors ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowSensors((v) => !v)}
            >
              <MapPin className="mr-1 h-3.5 w-3.5" /> Sensor
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setResetKey((k) => k + 1)}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="relative h-[560px] w-full bg-slate-200 dark:bg-slate-800">
            {mounted ? (
              <Canvas
                camera={{ fov: 45, position: [5, 5, 5] }}
                dpr={[1, 2]}
                gl={{ antialias: true, alpha: true }}
              >
                <Scene
                  showHeat={showHeat}
                  showSensors={showSensors}
                  controlsRef={controlsRef}
                  resetKey={resetKey}
                />
              </Canvas>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Memuat model 3D…
              </div>
            )}

            {/* Legend suhu */}
            <div className="absolute bottom-4 left-4 rounded-lg bg-background/85 p-3 shadow-md backdrop-blur">
              <div className="mb-1 flex items-center gap-1 text-xs font-medium">
                <Thermometer className="h-3.5 w-3.5 text-orange-500" /> Suhu (°C)
              </div>
              <div
                className="h-2.5 w-40 rounded-full"
                style={{ background: LEGEND_GRADIENT }}
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>{TEMP_MIN}</span>
                <span>{Math.round((TEMP_MIN + TEMP_MAX) / 2)}</span>
                <span>{TEMP_MAX}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Data sensor masih dummy (hardcode). Ganti array <code>SENSORS</code> di
        file ini, atau sambungkan ke API/Supabase untuk data real-time.
      </p>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
