'use client';

import { useEffect, useState } from 'react';
import type { BracketMatchRow } from '@/lib/types';

interface TournamentFormationRevealProps {
  myTeamId: number;
  matches: BracketMatchRow[];
  onContinue: () => void;
}

/**
 * Group Stage -> Round of 32 transition moment - a sibling of
 * GroupDrawReveal's "조 추첨" broadcast-poster reveal (same gradient
 * background, same staggered white-card choreography), but for the
 * freshly-formed knockout bracket instead of the group draw. By the time
 * this renders, ensureKnockoutRound has already simulated every match
 * except the manager's own (see campaigns.service.ts), so every pairing
 * and every background result is already known - only the manager's own
 * matchup is shown without a score.
 */
export function TournamentFormationReveal({
  myTeamId,
  matches,
  onContinue,
}: TournamentFormationRevealProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const allRevealed = revealedCount >= matches.length;

  useEffect(() => {
    if (revealedCount >= matches.length) return;
    const timer = setTimeout(() => setRevealedCount((n) => n + 1), 90);
    return () => clearTimeout(timer);
  }, [revealedCount, matches.length]);

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center overflow-y-auto px-4 py-8 sm:py-12"
      style={{
        background:
          'linear-gradient(135deg, #ff5b2e 0%, #e0293f 28%, #8a1e6b 55%, #2c2c8f 78%, #1a3a7a 100%)',
      }}
    >
      <div className="w-full max-w-4xl text-center">
        <p className="font-hud text-sm font-bold tracking-[0.4em] text-white/80 uppercase">
          2026 FIFA World Cup
        </p>
        <h1 className="font-hud mt-1 text-5xl font-black tracking-tight text-white sm:text-6xl">
          ROUND OF 32
        </h1>
        <p className="font-hud mt-3 text-sm font-bold text-yellow-300 uppercase tracking-wide">
          조별리그를 통과한 32개 팀의 대진표가 확정되었습니다
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {matches.map((match, i) => {
            const revealed = i < revealedCount;
            const involvesMe = match.homeTeamId === myTeamId || match.awayTeamId === myTeamId;
            return (
              <div
                key={match.id}
                className={`overflow-hidden rounded-lg bg-white shadow-xl transition-all duration-500 ${
                  revealed ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                } ${involvesMe ? 'ring-4 ring-yellow-300' : ''}`}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <span
                    className={`truncate text-left text-sm font-bold ${
                      involvesMe && match.homeTeamId === myTeamId ? 'text-emerald-700' : 'text-neutral-800'
                    }`}
                  >
                    {match.homeTeamName}
                  </span>
                  <span className="hud-score shrink-0 px-2 text-xs font-bold text-neutral-500">
                    {match.played ? `${match.homeScore} - ${match.awayScore}` : 'VS'}
                  </span>
                  <span
                    className={`truncate text-right text-sm font-bold ${
                      involvesMe && match.awayTeamId === myTeamId ? 'text-emerald-700' : 'text-neutral-800'
                    }`}
                  >
                    {match.awayTeamName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={!allRevealed}
          className="hud-btn mt-10 mb-4 rounded bg-yellow-400 px-8 py-3 text-sm text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          토너먼트 계속하기
        </button>
      </div>
    </div>
  );
}
