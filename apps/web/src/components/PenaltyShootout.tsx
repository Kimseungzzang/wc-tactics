'use client';

import { useEffect, useState } from 'react';

interface Kicker {
  playerId: number;
  name: string;
}

interface Kick {
  side: 'me' | 'opp';
  name: string;
  scored: boolean;
}

interface PenaltyShootoutProps {
  myTeamName: string;
  opponentTeamName: string;
  /** The manager's own current on-pitch XI (subs already applied) - see
   * MatchBoard's managedLineup. The user picks a kicking order from these. */
  myLineup: Kicker[];
  /** The opponent's current on-pitch XI - kicking order is just this array's
   * order, no picker needed (only the manager's own team is interactive). */
  opponentLineup: Kicker[];
  submitting: boolean;
  error: string | null;
  onComplete: (myScore: number, opponentScore: number) => void;
}

const SUCCESS_RATE = 0.7;
const KICK_SUSPENSE_MS = 700;

/**
 * Real shootout rules, simplified only in HOW a kick's outcome is decided
 * (flat 70% coin flip, no attribute weighting - see the recordResult
 * doc comment this replaces): 5 regular rounds each, early stop the moment
 * the trailing side can no longer mathematically catch up, then sudden
 * death (one kick each, decided the instant scores differ after a full
 * round) if still level after 5-5.
 */
function checkDecided(kicks: Kick[]): { myScore: number; oppScore: number } | null {
  const myTaken = kicks.filter((k) => k.side === 'me').length;
  const oppTaken = kicks.filter((k) => k.side === 'opp').length;
  const myScore = kicks.filter((k) => k.side === 'me' && k.scored).length;
  const oppScore = kicks.filter((k) => k.side === 'opp' && k.scored).length;

  if (myTaken <= 5 && oppTaken <= 5 && !(myTaken === 5 && oppTaken === 5)) {
    const myRemaining = 5 - myTaken;
    const oppRemaining = 5 - oppTaken;
    if (myScore - oppScore > oppRemaining) return { myScore, oppScore };
    if (oppScore - myScore > myRemaining) return { myScore, oppScore };
    return null;
  }
  if (myTaken === oppTaken && myScore !== oppScore) return { myScore, oppScore };
  return null;
}

function KickRow({ label, kicks }: { label: string; kicks: Kick[] }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-left text-neutral-500">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1 text-sm">
        {kicks.map((k, i) => (
          <span key={i} className={k.scored ? '' : 'opacity-50 grayscale'}>
            {k.scored ? '⚽' : '❌'}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-screen interactive shootout, replacing the silent breakKnockoutTie
 * coin-flip for the manager's own knockout draws. Two phases: pick a kicking
 * order for the current XI, then an auto-advancing kick-by-kick sequence
 * (same "no click needed" timer idiom as GroupDrawReveal/
 * TournamentFormationReveal) styled like SetPieceCheckpoint's suspense/reveal
 * beat, ending with the real shootout score handed back via onComplete.
 */
export function PenaltyShootout({
  myTeamName,
  opponentTeamName,
  myLineup,
  opponentLineup,
  submitting,
  error,
  onComplete,
}: PenaltyShootoutProps) {
  const [phase, setPhase] = useState<'picking' | 'playing' | 'done'>('picking');
  const [pickedOrder, setPickedOrder] = useState<Kicker[]>([]);
  const [kicks, setKicks] = useState<Kick[]>([]);

  const decided = phase !== 'picking' ? checkDecided(kicks) : null;

  // Who kicks next, purely derived from `kicks` so far - no separate state,
  // just the next step the effect below is about to resolve.
  const isMyTurn = kicks.length % 2 === 0;
  const nextRound = isMyTurn
    ? kicks.filter((k) => k.side === 'me').length
    : kicks.filter((k) => k.side === 'opp').length;
  const nextPool = isMyTurn ? pickedOrder : opponentLineup;
  const nextKicker =
    phase === 'playing' && !decided ? (nextPool[nextRound % nextPool.length] ?? null) : null;

  useEffect(() => {
    if (!nextKicker) return;
    const timer = setTimeout(() => {
      const scored = Math.random() < SUCCESS_RATE;
      setKicks((prev) => [...prev, { side: isMyTurn ? 'me' : 'opp', name: nextKicker.name, scored }]);
    }, KICK_SUSPENSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kicks.length, phase]);

  const togglePick = (kicker: Kicker) => {
    setPickedOrder((prev) =>
      prev.some((p) => p.playerId === kicker.playerId) ? prev : [...prev, kicker],
    );
  };
  const undoLastPick = () => setPickedOrder((prev) => prev.slice(0, -1));

  const myScore = kicks.filter((k) => k.side === 'me' && k.scored).length;
  const oppScore = kicks.filter((k) => k.side === 'opp' && k.scored).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 px-4">
      <div className="relative w-full max-w-md text-center">
        {phase === 'picking' && (
          <>
            <p className="font-hud text-xs font-bold tracking-[0.3em] text-[var(--hud-accent)] uppercase">
              Penalty Shootout
            </p>
            <h2 className="font-hud mt-3 text-2xl font-bold text-white sm:text-3xl">
              승부차기 키커 순서를 정하세요
            </h2>
            <p className="mt-2 text-xs text-neutral-400">
              {myTeamName} 출전 선수를 찰 순서대로 눌러 선택하세요.
            </p>

            <div className="mt-5 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {myLineup.map((p) => {
                const order = pickedOrder.findIndex((x) => x.playerId === p.playerId);
                const picked = order >= 0;
                return (
                  <button
                    key={p.playerId}
                    type="button"
                    onClick={() => togglePick(p)}
                    disabled={picked}
                    className={`hud-card rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
                      picked
                        ? 'border-neutral-800 bg-neutral-900 text-neutral-600'
                        : 'hud-card-interactive border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-[var(--hud-accent)] hover:text-[var(--hud-accent)]'
                    }`}
                  >
                    {picked ? `${order + 1}. ` : ''}
                    {p.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={undoLastPick}
                disabled={pickedOrder.length === 0}
                className="text-xs text-neutral-500 underline disabled:opacity-30"
              >
                마지막 선택 취소
              </button>
              <p className="text-xs text-neutral-500">
                {pickedOrder.length} / {myLineup.length}명 선택
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPhase('playing')}
              disabled={pickedOrder.length < myLineup.length}
              className="hud-btn mt-6 w-full rounded bg-[var(--hud-accent-strong)] px-6 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              승부차기 시작
            </button>
          </>
        )}

        {phase === 'playing' && (
          <>
            <p className="font-hud text-xs font-bold tracking-[0.3em] text-[var(--hud-accent)] uppercase">
              Penalty Shootout
            </p>
            <div className="mt-4 flex items-center justify-center gap-6">
              <div className="text-right">
                <p className="text-xs font-semibold text-neutral-400">{myTeamName}</p>
                <p className="hud-score text-3xl font-bold text-[var(--hud-accent)]">{myScore}</p>
              </div>
              <p className="text-neutral-600">:</p>
              <div className="text-left">
                <p className="text-xs font-semibold text-neutral-400">{opponentTeamName}</p>
                <p className="hud-score text-3xl font-bold text-neutral-200">{oppScore}</p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <KickRow label={myTeamName} kicks={kicks.filter((k) => k.side === 'me')} />
              <KickRow label={opponentTeamName} kicks={kicks.filter((k) => k.side === 'opp')} />
            </div>

            <div className="mt-8 h-16">
              {nextKicker && (
                <>
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-[var(--hud-accent)]" />
                  <p className="font-hud mt-3 text-sm font-bold tracking-wide text-neutral-300">
                    {nextKicker.name}의 키킹...
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {phase === 'done' && decided && (
          <div className="animate-outcome-pop">
            <p
              className={`font-hud text-xs font-bold tracking-[0.3em] uppercase ${
                decided.myScore > decided.oppScore ? 'text-[var(--hud-accent)]' : 'text-red-500'
              }`}
            >
              Shootout
            </p>
            <h2
              className={`font-hud mt-4 text-4xl font-bold sm:text-5xl ${
                decided.myScore > decided.oppScore ? 'text-[var(--hud-accent)]' : 'text-red-400'
              }`}
            >
              {decided.myScore > decided.oppScore ? '승부차기 승리!' : '승부차기 패배'}
            </h2>
            <p className="hud-score mt-4 text-lg text-neutral-300">
              {myTeamName} {decided.myScore} - {decided.oppScore} {opponentTeamName}
            </p>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            <button
              type="button"
              onClick={() => onComplete(decided.myScore, decided.oppScore)}
              disabled={submitting}
              className="hud-btn mt-8 rounded bg-[var(--hud-accent-strong)] px-8 py-3 text-sm text-white disabled:opacity-50"
            >
              {submitting ? '기록하는 중...' : '결과 기록하고 다음 경기로'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
