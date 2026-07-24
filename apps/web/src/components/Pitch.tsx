'use client';

import { useCallback, useRef, useState } from 'react';

export interface PitchToken {
  key: string;
  playerId: number;
  name: string;
  jerseyNumber: number;
  x: number; // 0-100, display coordinate (already mirrored per side)
  y: number; // 0-100
  side: 'home' | 'away';
  draggable: boolean;
  kind?: 'player' | 'ball';
}

interface PitchProps {
  tokens: PitchToken[];
  onMove?: (playerId: number, x: number, y: number) => void;
  /** Animate position changes via CSS transition (for frame playback). */
  smooth?: boolean;
  smoothMs?: number;
}

export function Pitch({ tokens, onMove, smooth, smoothMs = 950 }: PitchProps) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const clampPercent = (v: number) => Math.max(2, Math.min(98, v));

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingId === null || !pitchRef.current || !onMove) return;
      const rect = pitchRef.current.getBoundingClientRect();
      const x = clampPercent(((e.clientX - rect.left) / rect.width) * 100);
      const y = clampPercent(((e.clientY - rect.top) / rect.height) * 100);
      onMove(draggingId, x, y);
    },
    [draggingId, onMove],
  );

  return (
    <div
      ref={pitchRef}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setDraggingId(null)}
      onPointerLeave={() => setDraggingId(null)}
      className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-emerald-900 bg-emerald-800 select-none"
      style={{
        backgroundImage:
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 12.5%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 border-2 border-white/25 m-3 rounded-sm" />
      <div
        className="pointer-events-none absolute top-1/2 left-0 h-0 w-full border-t-2 border-white/25"
        style={{ transform: 'translateY(-50%)' }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-24 w-24 rounded-full border-2 border-white/25"
        style={{ transform: 'translate(-50%, -50%)' }}
      />

      {tokens.map((t) =>
        t.kind === 'ball' ? (
          <div
            key={t.key}
            className="pointer-events-none absolute h-3 w-3 rounded-full border border-neutral-800 bg-white shadow-md"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              transform: 'translate(-50%, -50%)',
              transition: smooth ? `left ${smoothMs}ms linear, top ${smoothMs}ms linear` : undefined,
            }}
          />
        ) : (
          <button
            key={t.key}
            type="button"
            onPointerDown={(e) => {
              if (!t.draggable) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDraggingId(t.playerId);
            }}
            className={`absolute flex flex-col items-center ${
              t.draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
            }`}
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              transform: 'translate(-50%, -50%)',
              touchAction: 'none',
              transition: smooth ? `left ${smoothMs}ms linear, top ${smoothMs}ms linear` : undefined,
            }}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold shadow-md ${
                t.side === 'home'
                  ? 'border-sky-200 bg-sky-600 text-white'
                  : 'border-rose-200 bg-rose-600 text-white'
              } ${t.draggable ? 'ring-2 ring-yellow-300/80' : ''}`}
            >
              {t.jerseyNumber}
            </span>
            <span className="mt-0.5 max-w-16 truncate rounded bg-black/60 px-1 text-[10px] leading-tight text-white">
              {t.name}
            </span>
          </button>
        ),
      )}
    </div>
  );
}
