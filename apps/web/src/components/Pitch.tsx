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
  /** Static ball-path overlay (0-100 coords) - used to compare the real
   * match's actual path against the AI what-if's live ball position on
   * the same pitch ("평행세계 비교"). Purely decorative, never draggable. */
  trail?: { x: number; y: number }[];
}

export function Pitch({ tokens, onMove, smooth, smoothMs = 950, trail }: PitchProps) {
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
      <div className="pointer-events-none absolute inset-0 m-3">
        <div className="absolute inset-0 rounded-sm border-2 border-white/25" />
        <div
          className="absolute top-1/2 left-0 h-0 w-full border-t-2 border-white/25"
          style={{ transform: 'translateY(-50%)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 h-24 w-24 rounded-full border-2 border-white/25"
          style={{ transform: 'translate(-50%, -50%)' }}
        />

        {/* Left goal */}
        <div
          className="absolute left-0 border-2 border-l-0 border-white/25"
          style={{ top: '19%', height: '62%', width: '16%' }}
        />
        <div
          className="absolute left-0 border-2 border-l-0 border-white/25"
          style={{ top: '37%', height: '26%', width: '5.5%' }}
        />
        <div
          className="absolute left-0 bg-white/80"
          style={{ top: '45%', height: '10%', width: '3px' }}
        />

        {/* Right goal (mirrored) */}
        <div
          className="absolute right-0 border-2 border-r-0 border-white/25"
          style={{ top: '19%', height: '62%', width: '16%' }}
        />
        <div
          className="absolute right-0 border-2 border-r-0 border-white/25"
          style={{ top: '37%', height: '26%', width: '5.5%' }}
        />
        <div
          className="absolute right-0 bg-white/80"
          style={{ top: '45%', height: '10%', width: '3px' }}
        />
      </div>

      {trail && trail.length > 1 && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={trail.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="0.6"
            strokeDasharray="1.6 1.4"
            strokeLinecap="round"
            opacity={0.75}
          />
          {trail.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === trail.length - 1 ? 1.3 : 0.7}
              fill="#fbbf24"
              opacity={i === trail.length - 1 ? 0.95 : 0.55}
            />
          ))}
        </svg>
      )}

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
