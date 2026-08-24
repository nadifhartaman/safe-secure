'use client';

import { createClient } from '@supabase/supabase-js';

// Pakai ANON key (public), BUKAN service_role. Aman ditaruh di frontend
// karena RLS di Supabase hanya mengizinkan SELECT untuk anon (lihat schema.sql).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Tidak throw supaya build tidak gagal; cukup warning di console.
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum di-set.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});
