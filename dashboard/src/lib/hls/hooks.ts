'use client';

import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

export interface UseHlsResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
  ready: boolean;
}

const isHevc = (codec?: string) => /^(hvc1|hev1)/i.test(codec ?? '');
const canPlayHevc = () =>
  typeof MediaSource !== 'undefined' &&
  MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"');

export function useHls(src: string, autoPlay = true): UseHlsResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setReady(false);

    // Native HLS (Safari / iOS) — Safari bisa HEVC kalau hardware mendukung
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      const onLoaded = () => {
        setReady(true);
        if (autoPlay) video.play().catch(() => {});
      };
      video.addEventListener('loadedmetadata', onLoaded);
      return () => video.removeEventListener('loadedmetadata', onLoaded);
    }

    let hls: Hls | null = null;
    let cancelled = false;

    import('hls.js').then(({ default: HlsLib }) => {
      if (cancelled) return;
      if (!HlsLib.isSupported()) {
        setError('Browser tidak mendukung HLS.');
        return;
      }

      hls = new HlsLib({
        enableWorker: true,
        backBufferLength: 90,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxBufferLength: 30,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, data) => {
        // Deteksi H.265 dari codec yang diiklankan manifest
        const hevc = data.levels?.some((l) => isHevc(l.videoCodec));
        if (hevc && !canPlayHevc()) {
          setError(
            'Stream ini memakai codec H.265 (HEVC) yang tidak didukung browser. Perlu transcode ke H.264.'
          );
          return; // percuma play, hasilnya hitam
        }
        setReady(true);
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(HlsLib.Events.ERROR, (_evt, data) => {
        // Gagal append buffer → hampir selalu codec tak didukung (H.265)
        if (
          data.details === HlsLib.ErrorDetails.BUFFER_ADD_CODEC_ERROR ||
          data.details === HlsLib.ErrorDetails.BUFFER_APPEND_ERROR ||
          data.details === HlsLib.ErrorDetails.FRAG_PARSING_ERROR
        ) {
          setError(
            'Gagal decode video — kemungkinan codec H.265 tidak didukung browser. Perlu transcode ke H.264.'
          );
          return;
        }

        // Stall live: lompat ke live edge, bukan destroy
        if (
          data.details === HlsLib.ErrorDetails.BUFFER_STALLED_ERROR ||
          data.details === HlsLib.ErrorDetails.BUFFER_NUDGE_ON_STALL
        ) {
          if (hls && hls.liveSyncPosition != null) {
            video.currentTime = hls.liveSyncPosition;
          }
          return;
        }

        if (!data.fatal) return;
        setError(`${data.type} — ${data.details}`);
        switch (data.type) {
          case HlsLib.ErrorTypes.NETWORK_ERROR:
            hls?.startLoad();
            break;
          case HlsLib.ErrorTypes.MEDIA_ERROR:
            hls?.recoverMediaError();
            break;
          default:
            hls?.destroy();
        }
      });
    });

    const onWaiting = () => {
      if (hls && hls.liveSyncPosition != null) {
        const gap = hls.liveSyncPosition - video.currentTime;
        if (gap > 3) video.currentTime = hls.liveSyncPosition;
      }
    };
    video.addEventListener('waiting', onWaiting);

    return () => {
      cancelled = true;
      video.removeEventListener('waiting', onWaiting);
      hls?.destroy();
    };
  }, [src, autoPlay]);

  return { videoRef, error, ready };
}