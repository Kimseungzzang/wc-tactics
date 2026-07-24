'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getFrames, getSnapshot, recommendTactics } from '@/lib/api';
import type {
  MatchDetail,
  MatchFrame,
  MatchSnapshotResponse,
  PositionCoordinate,
  SnapshotPlayer,
  TacticsRecommendation,
} from '@/lib/types';
import { Pitch, type PitchToken } from './Pitch';
import { Timeline } from './Timeline';
import { WhatIfPanel } from './WhatIfPanel';
import { SquadPanel } from './SquadPanel';
import { useFramePlayback } from './useFramePlayback';

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
  const [manualSubstitutions, setManualSubstitutions] = useState<
    { outPlayerId: number; inPlayerId: number }[]
  >([]);
  const [selectedFormation, setSelectedFormation] = useState<string | undefined>(
    undefined,
  );
  const [ai, setAi] = useState<{
    loading: boolean;
    result: TacticsRecommendation | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });

  const [viewMode, setViewMode] = useState<'snapshot' | 'replay'>('snapshot');
  // Stable [] reference until real frames arrive, so useFramePlayback's
  // render-time reset (keyed on array identity) doesn't loop.
  const [matchFrames, setMatchFrames] = useState<MatchFrame[]>([]);
  const [framesLoading, setFramesLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getFrames(match.id)
      .then((f) => {
        if (!cancelled) setMatchFrames(f);
      })
      .catch(() => {
        if (!cancelled) setMatchFrames([]);
      })
      .finally(() => {
        if (!cancelled) setFramesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [match.id]);
  const replay = useFramePlayback(matchFrames, match);
  const hasReplayData = matchFrames.length > 0;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const snap = await getSnapshot(match.id, minute);
      setSnapshot(snap);
      setPositionOverrides({});
      setLineupOverride(null);
      setManualSubstitutions([]);
      setSelectedFormation(undefined);
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
        proposedChange,
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
    setManualSubstitutions((prev) => [
      ...prev.filter((s) => s.outPlayerId !== outPlayerId),
      { outPlayerId, inPlayerId },
    ]);
  };

  const proposedChange =
    manualSubstitutions.length > 0 || selectedFormation
      ? {
          formation: selectedFormation,
          substitutions: manualSubstitutions.length > 0 ? manualSubstitutions : undefined,
        }
      : undefined;

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

  const managedTeamName =
    managedTeamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  const managedLineup = lineupOverride ?? managedSnapshot?.lineup ?? [];

  return (
    <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[280px_1fr_360px]">
      <SquadPanel
        match={match}
        managedTeamId={managedTeamId}
        managedTeamName={managedTeamName}
        currentLineup={managedLineup}
        currentFormation={managedSnapshot?.formation}
        selectedFormation={selectedFormation}
        onFormationChange={setSelectedFormation}
        onSubstitute={applySubstitution}
      />

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
            <div className="text-xs text-neutral-500">
              {viewMode === 'snapshot'
                ? `${minute}' 시점`
                : `${replay.current?.minute ?? minute}'${String(replay.current?.second ?? 0).padStart(2, '0')} 재생 중`}
            </div>
          </div>
          <TeamHeader
            name={match.awayTeam.name}
            formation={snapshot.away?.formation}
            active={managedTeamId === match.awayTeam.id}
            onManage={() => setManagedTeamId(match.awayTeam.id)}
            alignRight
          />
        </div>

        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('snapshot')}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${
              viewMode === 'snapshot'
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            포메이션 스냅샷 (감독 모드)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('replay')}
            disabled={!hasReplayData}
            className={`rounded px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
              viewMode === 'replay'
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {framesLoading
              ? '재생 데이터 불러오는 중...'
              : hasReplayData
                ? '실제 경기 재생'
                : '실제 경기 재생 (이 경기는 미지원)'}
          </button>
        </div>

        <Pitch
          tokens={viewMode === 'replay' ? replay.tokens : tokens}
          onMove={viewMode === 'snapshot' ? handleMove : undefined}
          smooth={viewMode === 'replay'}
          smoothMs={1000 / replay.speed}
        />

        {viewMode === 'snapshot' ? (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <Timeline
              minute={minute}
              maxMinute={maxMinute}
              events={match.timeline}
              onChange={setMinute}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="mb-2 text-xs text-neutral-500">
              공의 실제 좌표는 StatsBomb 데이터, 나머지 선수 움직임은 포메이션 기반으로
              구성한 시각화입니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => replay.setPlaying((p) => !p)}
                className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                {replay.playing ? '일시정지' : '재생'}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(matchFrames.length - 1, 0)}
                value={replay.idx}
                onChange={(e) => {
                  replay.setPlaying(false);
                  replay.setIdx(Number(e.target.value));
                }}
                className="flex-1 accent-emerald-500"
              />
              <select
                value={replay.speed}
                onChange={(e) => replay.setSpeed(Number(e.target.value))}
                className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
              >
                <option value={1}>1x</option>
                <option value={4}>4x</option>
                <option value={10}>10x</option>
              </select>
            </div>
          </div>
        )}

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
              setManualSubstitutions([]);
              setSelectedFormation(undefined);
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

        {proposedChange ? (
          <WhatIfPanel
            match={match}
            minute={minute}
            teamId={managedTeamId}
            proposedChange={proposedChange}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-800 p-4 text-xs text-neutral-500">
            왼쪽 스쿼드에서 선수 교체를 적용하거나 전술(포메이션)을 변경하면,
            그 이후 전개를 AI가 시뮬레이션할 수 있습니다.
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
