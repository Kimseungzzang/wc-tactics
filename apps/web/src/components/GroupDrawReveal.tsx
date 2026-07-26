'use client';

import { useEffect, useState } from 'react';
import type { FullDrawGroup } from '@/lib/types';

interface GroupDrawRevealProps {
  myTeamId: number;
  groups: FullDrawGroup[];
  onContinue: () => void;
}

/**
 * Post-team-select "조 추첨" moment - a deliberate one-off exception to
 * the app's console-HUD dark tone, styled instead like the official FIFA
 * group-stage broadcast graphic (see the reference image this was built
 * from): all 12 groups on one poster, not just the manager's own. The
 * draw itself is real (see campaigns.service.ts's group-draw.ts - real
 * pot/confederation constraints, freshly randomized per campaign), this
 * only adds the reveal choreography on top.
 */
export function GroupDrawReveal({ myTeamId, groups, onContinue }: GroupDrawRevealProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const allRevealed = revealedCount >= groups.length;

  useEffect(() => {
    if (revealedCount >= groups.length) return;
    const timer = setTimeout(() => setRevealedCount((n) => n + 1), 90);
    return () => clearTimeout(timer);
  }, [revealedCount, groups.length]);

  const myGroup = groups.find((g) => g.teams.some((t) => t.id === myTeamId));

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center overflow-y-auto px-4 py-8 sm:py-12"
      style={{
        background:
          'linear-gradient(135deg, #ff5b2e 0%, #e0293f 28%, #8a1e6b 55%, #2c2c8f 78%, #1a3a7a 100%)',
      }}
    >
      <div className="w-full max-w-5xl text-center">
        <p className="font-hud text-sm font-bold tracking-[0.4em] text-white/80 uppercase">
          2026 FIFA World Cup
        </p>
        <h1 className="font-hud mt-1 text-5xl font-black tracking-tight text-white sm:text-6xl">
          GROUP STAGE
        </h1>
        {myGroup && (
          <p className="font-hud mt-3 text-sm font-bold text-yellow-300 uppercase tracking-wide">
            {myGroup.teams.find((t) => t.id === myTeamId)?.name}, Group {myGroup.letter}
          </p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group, i) => {
            const revealed = i < revealedCount;
            const isMyGroup = group.teams.some((t) => t.id === myTeamId);
            return (
              <div
                key={group.letter}
                className={`overflow-hidden rounded-lg bg-white shadow-xl transition-all duration-500 ${
                  revealed ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                } ${isMyGroup ? 'ring-4 ring-yellow-300' : ''}`}
              >
                <div className="px-4 py-2" style={{ backgroundColor: '#0a0a0a' }}>
                  <span className="font-hud text-sm font-bold tracking-[0.15em] text-white uppercase">
                    Group {group.letter}
                  </span>
                </div>
                <ul>
                  {group.teams.map((team) => (
                    <li
                      key={team.id}
                      className={`border-b border-neutral-200 px-4 py-2 text-left text-sm font-semibold last:border-0 ${
                        team.id === myTeamId ? 'bg-yellow-100 text-neutral-900' : 'text-neutral-800'
                      }`}
                    >
                      {team.name}
                    </li>
                  ))}
                </ul>
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
          커리어 시작하기
        </button>
      </div>
    </div>
  );
}
