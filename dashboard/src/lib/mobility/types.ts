// Sumber tunggal kategori kendaraan — dipakai hook (seed) & page (chart/tabel).
// Tambah kategori = cukup satu baris, semua UI ikut menyesuaikan.

export const VEHICLE_CATEGORIES = [
  { key: 'car_count',        label: 'Mobil', color: '#6366f1', emission: 0.25 },
  { key: 'motorcycle_count', label: 'Motor', color: '#10b981', emission: 0.08 },
  { key: 'truck_count',      label: 'Truk',  color: '#f59e0b', emission: 0.62 },
  { key: 'bus_count',        label: 'Bus',   color: '#ec4899', emission: 0.55 },
] as const;
// emission = estimasi kg CO₂ per kendaraan terhitung (dummy, sesuaikan nanti).

export type VehicleKey = (typeof VEHICLE_CATEGORIES)[number]['key'];

export type Congestion = 'lancar' | 'padat' | 'macet';

export const CONGESTION_META: Record<
  Congestion,
  { label: string; accent: 'emerald' | 'amber' | 'red' }
> = {
  lancar: { label: 'Lancar', accent: 'emerald' },
  padat: { label: 'Padat', accent: 'amber' },
  macet: { label: 'Macet', accent: 'red' },
};