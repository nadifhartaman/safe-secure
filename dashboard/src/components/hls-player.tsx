'use client';

import { Loader2, VideoOff } from 'lucide-react';
import { useHls } from '@/lib/hls/hooks';
import { cn } from '@/lib/utils';

interface HlsPlayerProps {
  src: string;
  autoPlay?: boolean;
  controls?: boolean;
  className?: string;
}

export function HlsPlayer({
  src,
  autoPlay = true,
  controls = true,
  className,
}: HlsPlayerProps) {
  const { videoRef, error, ready } = useHls(src, autoPlay);

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-black', className)}>
      <video
        ref={videoRef}
        muted={autoPlay}
        playsInline
        controls={controls}
        className="h-full w-full object-cover"
      />

      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Menghubungkan stream…
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center">
          <VideoOff className="h-6 w-6 text-red-400" />
          <p className="text-sm font-medium text-white">Stream tidak dapat dimuat</p>
          <p className="max-w-xs break-words text-xs text-white/50">{error}</p>
        </div>
      )}
    </div>
  );
}