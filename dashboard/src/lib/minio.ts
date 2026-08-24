// Bangun URL http lengkap ke objek MinIO dari PATH yang tersimpan di DB.
// DB hanya menyimpan path (mis. "frames/throw_01.jpg"); http-nya dibangun di sini.
//   URL akhir = {NEXT_PUBLIC_MINIO_URL}/{NEXT_PUBLIC_MINIO_BUCKET}/{path}
//
// Catatan: agar <img src> bisa memuat gambar tanpa kredensial, bucket MinIO
// harus di-set PUBLIC (anonymous download). Lihat catatan setup.

const MINIO_URL = (process.env.NEXT_PUBLIC_MINIO_URL ?? '').replace(/\/+$/, '');
const MINIO_BUCKET = (process.env.NEXT_PUBLIC_MINIO_BUCKET ?? '').replace(
  /^\/+|\/+$/g,
  ''
);

export function buildMinioUrl(path?: string | null): string | null {
  if (!path) return null;
  const p = String(path).trim();
  if (!p) return null;

  // Sudah lengkap (http/https/data URI) -> pakai apa adanya.
  if (/^(https?:|data:)/i.test(p)) return p;

  let obj = p.replace(/^\/+/, '');
  if (MINIO_BUCKET && !obj.startsWith(`${MINIO_BUCKET}/`)) {
    obj = `${MINIO_BUCKET}/${obj}`;
  }
  return MINIO_URL ? `${MINIO_URL}/${obj}` : `/${obj}`;
}

// Kolom gambar di frame_detection_uploaded (urutan prioritas).
const FRAME_KEYS = ['throwing_frame', 'smoking_frame', 'trespassing_frame'] as const;

export function pickFrameSnapshot(
  frameRow: Record<string, unknown> | null | undefined
): string | null {
  if (!frameRow) return null;
  for (const k of FRAME_KEYS) {
    const url = buildMinioUrl(frameRow[k] as string | null | undefined);
    if (url) return url;
  }
  return null;
}
