'use client';

import type { MatchDetail, MatchFrame } from '@/lib/types';
import { Pitch } from './Pitch';
import { useFramePlayback } from './useFramePlayback';

interface FramePlayerProps {
  frames: MatchFrame[];
  match: MatchDetail;
  autoPlay?: boolean;
}

export function FramePlayer({ frames, match, autoPlay }: FramePlayerProps) {
  const { idx, setIdx, playing, setPlaying, speed, setSpeed, current, tokens } =
    useFramePlayback(frames, match, autoPlay);

  if (!current) return null;

  return (
    <>
      <Pitch tokens={tokens} smooth smoothMs={1000 / speed} />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          {playing ? '일시정지' : '재생'}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setIdx(Number(e.target.value));
          }}
          className="flex-1 accent-emerald-500"
        />
        <span className="w-16 shrink-0 text-right font-mono text-xs text-neutral-400">
          {current.minute}&apos;{String(current.second).padStart(2, '0')}
        </span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
        >
          <option value={1}>1x</option>
          <option value={4}>4x</option>
          <option value={10}>10x</option>
        </select>
      </div>
    </>
  );
}
