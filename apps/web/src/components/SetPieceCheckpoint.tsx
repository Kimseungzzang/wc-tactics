'use client';

import { useState } from 'react';
import type { WhatIfCheckpoint, WhatIfMoment } from '@/lib/types';

interface SetPieceCheckpointProps {
  checkpoint: WhatIfCheckpoint;
  /** True while the resume request (with the chosen kicker) is in flight. */
  resolving: boolean;
  /** The kick's own resolution moment, once the resumed stream's first
   * chunk has it - drives the reveal state. */
  resolvedMoment: WhatIfMoment | null;
  error: string | null;
  onChoose: (player: { playerId: number; name: string }) => void;
  onDismiss: () => void;
}

const KIND_LABEL: Record<WhatIfCheckpoint['kind'], { eyebrow: string; title: string }> = {
  FREE_KICK: { eyebrow: 'Free Kick', title: '직접 프리킥 찬스' },
  PENALTY: { eyebrow: 'Penalty', title: '페널티킥 찬스' },
};

/**
 * Full-screen checkpoint the AI stream pauses on for a direct free-kick or
 * penalty chance (see WhatIfService/gemini.service.ts) - picker -> suspense
 * -> reveal, then dismisses back into normal auto-play. Text-only by
 * design, matching the pitch visualization's removal earlier in the
 * project (no mini pitch/ball animation) - the "몰입감" comes from the
 * pause + reveal beat itself, not a rendered kick.
 */
export function SetPieceCheckpoint({
  checkpoint,
  resolving,
  resolvedMoment,
  error,
  onChoose,
  onDismiss,
}: SetPieceCheckpointProps) {
  const [chosenKicker, setChosenKicker] = useState<{ playerId: number; name: string } | null>(
    null,
  );

  const handlePick = (player: { playerId: number; name: string }) => {
    setChosenKicker(player);
    onChoose(player);
  };

  const label = KIND_LABEL[checkpoint.kind];
  const kickLabel = checkpoint.kind === 'PENALTY' ? '페널티킥' : '프리킥';
  const isGoal = resolvedMoment?.outcome === 'Goal';
  const phase: 'picking' | 'suspense' | 'reveal' = resolvedMoment
    ? 'reveal'
    : chosenKicker || resolving
      ? 'suspense'
      : 'picking';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      {phase === 'reveal' && (
        <div
          className={`animate-outcome-glow-pulse pointer-events-none absolute h-[60vh] w-[60vh] rounded-full blur-3xl ${
            isGoal ? 'bg-[var(--hud-accent)]/30' : 'bg-neutral-500/20'
          }`}
        />
      )}

      <div className="relative max-w-md px-6 text-center">
        {phase === 'picking' && (
          <>
            <p className="font-hud text-xs font-bold tracking-[0.3em] text-[var(--hud-accent)] uppercase">
              {label.eyebrow}
            </p>
            <h2 className="font-hud mt-3 text-2xl font-bold text-white sm:text-3xl">
              {label.title}
            </h2>
            <p className="mt-3 text-sm text-neutral-300">{checkpoint.description}</p>
            <p className="mt-6 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              누가 찰까요?
            </p>
            <div className="mt-3 space-y-2">
              {checkpoint.eligiblePlayers.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => handlePick(p)}
                  className="hud-card hud-card-interactive w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-neutral-100 hover:border-[var(--hud-accent)] hover:text-[var(--hud-accent)]"
                >
                  {p.name}
                </button>
              ))}
            </div>
            {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
          </>
        )}

        {phase === 'suspense' && (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-[var(--hud-accent)]" />
            <p className="font-hud mt-5 text-sm font-bold tracking-wide text-neutral-300">
              {chosenKicker?.name}의 {kickLabel}, 키킹 준비 중...
            </p>
            {error && (
              <div className="mt-4">
                <p className="text-xs text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={() => chosenKicker && onChoose(chosenKicker)}
                  className="hud-btn mt-3 rounded border border-neutral-700 px-4 py-2 text-xs text-neutral-200"
                >
                  다시 시도
                </button>
              </div>
            )}
          </>
        )}

        {phase === 'reveal' && (
          <div className="animate-outcome-pop">
            <p
              className={`font-hud text-xs font-bold tracking-[0.3em] uppercase ${
                isGoal ? 'text-[var(--hud-accent)]' : 'text-neutral-400'
              }`}
            >
              {isGoal ? 'Goal' : '결과'}
            </p>
            <h2
              className={`font-hud mt-4 text-4xl font-bold sm:text-5xl ${
                isGoal ? 'text-[var(--hud-accent)]' : 'text-neutral-200'
              }`}
            >
              {isGoal ? '⚽ 골!' : resolvedMoment?.outcome === 'Saved' ? '선방!' : '아쉽게 실패'}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-200">
              {resolvedMoment?.commentary}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="hud-btn mt-8 rounded bg-[var(--hud-accent-strong)] px-8 py-3 text-sm text-white"
            >
              중계 이어보기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
