'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSnapshot, recommendTactics } from '@/lib/api';
import type {
  MatchDetail,
  MatchSnapshotResponse,
  PositionCoordinate,
  SnapshotPlayer,
  TacticsRecommendation,
} from '@/lib/types';
import { Pitch, type PitchToken } from './Pitch';
import { Timeline } from './Timeline';

interface MatchBoardProps {
  match: MatchDetail;
  positions: PositionCoordinate[];
  initialSnapshot: MatchSnapshotResponse;
}

function computeMaxMinute(match: MatchDetail): number {
  const halfEnds = match.timeline
    .filter((e) => e.type === 'HALF_END')
    .map((e) => e.minute);
  return halfEnds.length > 0 ? Math.max(...halfEnds, 90) : 90;
}

export function MatchBoard({ match, positions, initialSnapshot }: MatchBoardProps) {
  const maxMinute = useMemo(() => computeMaxMinute(match), [match]);
  const positionById = useMemo(
    () => new Map(positions.map((p) => [p.id, p])),
    [positions],
  );
  const jerseyByPlayer = useMemo(() => {
    const map = new Map<number, number>();
    for (const list of Object.values(match.squads)) {
      for (const s of list) map.set(s.playerId, s.jerseyNumber);
    }
    return map;
  }, [match.squads]);
  const nameByPlayer = useMemo(() => {
    const map = new Map<number, string>();
    for (const list of Object.values(match.squads)) {
      for (const s of list) map.set(s.playerId, s.name);
    }
    return map;
  }, [match.squads]);

  const [minute, setMinute] = useState(initialSnapshot.minute);
  const [snapshot, setSnapshot] = useState<MatchSnapshotResponse>(initialSnapshot);
  const [managedTeamId, setManagedTeamId] = useState(match.homeTeam.id);
  const [positionOverrides, setPositionOverrides] = useState<
    Record<number, { x: number; y: number }>
  >({});
  const [lineupOverride, setLineupOverride] = useState<SnapshotPlayer[] | null>(
    null,
  );
  const [ai, setAi] = useState<{
    loading: boolean;
    result: TacticsRecommendation | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const snap = await getSnapshot(match.id, minute);
      setSnapshot(snap);
      setPositionOverrides({});
      setLineupOverride(null);
      setAi({ loading: false, result: null, error: null });
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [minute, match.id]);

  const tokens: PitchToken[] = useMemo(() => {
    const result: PitchToken[] = [];
    const sides: Array<['home' | 'away', typeof snapshot.home]> = [
      ['home', snapshot.home],
      ['away', snapshot.away],
    ];
    for (const [side, team] of sides) {
      if (!team) continue;
      const isManaged = team.teamId === managedTeamId;
      const lineup = isManaged && lineupOverride ? lineupOverride : team.lineup;
      for (const p of lineup) {
        const coord = positionById.get(p.positionId);
        const baseX = coord?.x ?? 50;
        const baseY = coord?.y ?? 50;
        const displayX = side === 'away' ? 100 - baseX : baseX;
        const override = positionOverrides[p.playerId];
        result.push({
          key: `${side}-${p.playerId}`,
          playerId: p.playerId,
          name: p.name.split(' ').slice(-1)[0],
          jerseyNumber: p.jerseyNumber,
          x: override?.x ?? displayX,
          y: override?.y ?? baseY,
          side,
          draggable: isManaged,
        });
      }
    }
    return result;
  }, [snapshot, positionById, positionOverrides, lineupOverride, managedTeamId]);

  const handleMove = (playerId: number, x: number, y: number) => {
    setPositionOverrides((prev) => ({ ...prev, [playerId]: { x, y } }));
  };

  const managedSnapshot =
    snapshot.home?.teamId === managedTeamId ? snapshot.home : snapshot.away;

  const handleRecommend = async () => {
    setAi({ loading: true, result: null, error: null });
    try {
      const result = await recommendTactics(match.id, {
        minute,
        teamId: managedTeamId,
      });
      setAi({ loading: false, result, error: null });
    } catch (err) {
      setAi({
        loading: false,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const applySubstitution = (outPlayerId: number, inPlayerId: number) => {
    const base = lineupOverride ?? managedSnapshot?.lineup ?? [];
    const outEntry = base.find((p) => p.playerId === outPlayerId);
    if (!outEntry) return;
    const inName = nameByPlayer.get(inPlayerId) ?? `#${inPlayerId}`;
    const inJersey = jerseyByPlayer.get(inPlayerId) ?? 0;
    const next = base.map((p) =>
      p.playerId === outPlayerId
        ? {
            ...p,
            playerId: inPlayerId,
            name: inName,
            jerseyNumber: inJersey,
          }
        : p,
    );
    setLineupOverride(next);
    setPositionOverrides((prev) => {
      const rest = { ...prev };
      delete rest[outPlayerId];
      return rest;
    });
  };

  const cardsSoFar = match.timeline.filter(
    (e) => e.type === 'CARD' && e.minute <= minute,
  );
  const goalsSoFar = match.timeline.filter(
    (e) => (e.type === 'GOAL' || e.type === 'OWN_GOAL') && e.minute <= minute,
  );
  const scoreAtMinute = {
    home: goalsSoFar.filter((e) => e.teamId === match.homeTeam.id).length,
    away: goalsSoFar.filter((e) => e.teamId === match.awayTeam.id).length,
  };

  return (
    <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-4 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <TeamHeader
            name={match.homeTeam.name}
            formation={snapshot.home?.formation}
            active={managedTeamId === match.homeTeam.id}
            onManage={() => setManagedTeamId(match.homeTeam.id)}
          />
          <div className="px-4 text-center">
            <div className="font-mono text-2xl font-bold">
              {scoreAtMinute.home} - {scoreAtMinute.away}
            </div>
            <div className="text-xs text-neutral-500">{minute}&apos; 시점</div>
          </div>
          <TeamHeader
            name={match.awayTeam.name}
            formation={snapshot.away?.formation}
            active={managedTeamId === match.awayTeam.id}
            onManage={() => setManagedTeamId(match.awayTeam.id)}
            alignRight
          />
        </div>

        <Pitch tokens={tokens} onMove={handleMove} />

        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <Timeline
            minute={minute}
            maxMinute={maxMinute}
            events={match.timeline}
            onChange={setMinute}
          />
        </div>

        {cardsSoFar.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
            {cardsSoFar.map((e) => (
              <span
                key={e.id}
                className="rounded bg-neutral-800 px-2 py-1"
                title={String(e.detail.cardType)}
              >
                🟨 {String(e.detail.name)} ({e.minute}&apos;)
              </span>
            ))}
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-200">
            감독 모드: {managedTeamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name}
          </h3>
          <p className="mb-3 text-xs text-neutral-500">
            노란 테두리가 있는 선수를 드래그해 위치를 바꿀 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setPositionOverrides({});
              setLineupOverride(null);
            }}
            className="mb-2 w-full rounded border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            배치 초기화
          </button>
          <button
            type="button"
            onClick={handleRecommend}
            disabled={ai.loading}
            className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {ai.loading ? 'AI 분석 중...' : 'AI 전술 추천 받기'}
          </button>
        </div>

        {ai.error && (
          <div className="rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-300">
            {ai.error}
          </div>
        )}

        {ai.result && (
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-4">
            <h4 className="text-sm font-semibold text-emerald-300">
              추천 포메이션: {ai.result.recommendedFormation ?? '현행 유지'}
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-300">
              {ai.result.reasoning}
            </p>
            {ai.result.substitutions.length > 0 && (
              <ul className="mt-3 space-y-2">
                {ai.result.substitutions.map((s, i) => (
                  <li
                    key={i}
                    className="rounded border border-neutral-700 bg-neutral-900 p-2 text-xs"
                  >
                    <div className="font-medium text-neutral-100">
                      {s.outName} ➜ {s.inName}
                    </div>
                    <div className="mt-1 text-neutral-400">{s.reason}</div>
                    <button
                      type="button"
                      onClick={() => applySubstitution(s.outPlayerId, s.inPlayerId)}
                      className="mt-2 rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
                    >
                      적용
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function TeamHeader({
  name,
  formation,
  active,
  onManage,
  alignRight,
}: {
  name: string;
  formation?: string;
  active: boolean;
  onManage: () => void;
  alignRight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onManage}
      className={`flex flex-col rounded px-2 py-1 ${alignRight ? 'items-end text-right' : 'items-start'} ${
        active ? 'bg-emerald-900/40 ring-1 ring-emerald-600' : ''
      }`}
    >
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-xs text-neutral-500">{formation ?? '-'}</span>
    </button>
  );
}
