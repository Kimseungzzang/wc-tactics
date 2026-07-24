'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFrames, getSnapshot, recommendTactics } from '@/lib/api';
import type {
  MatchDetail,
  MatchFrame,
  MatchSnapshotResponse,
  MatchTimelineEntry,
  SnapshotPlayer,
  TacticsRecommendation,
  WhatIfMoment,
} from '@/lib/types';
import { Pitch } from './Pitch';
import { WhatIfPanel } from './WhatIfPanel';
import { SquadPanel } from './SquadPanel';
import { PLAYBACK_TRANSITION_MS, SPEED_OPTIONS, useFramePlayback } from './useFramePlayback';

interface MatchBoardProps {
  match: MatchDetail;
  initialSnapshot: MatchSnapshotResponse;
}

function timelineEventBanner(e: MatchTimelineEntry): { icon: string; text: string } {
  switch (e.type) {
    case 'GOAL':
      return { icon: '⚽', text: `GOAL! ${String(e.detail.name)}` };
    case 'OWN_GOAL':
      return { icon: '⚽', text: `자책골 (${String(e.detail.name)})` };
    case 'CARD': {
      const cardType = String(e.detail.cardType);
      const icon = cardType.includes('Red') || cardType.includes('Second') ? '🟥' : '🟨';
      return { icon, text: `${String(e.detail.name)} 경고` };
    }
    case 'SUBSTITUTION':
      return { icon: '🔄', text: `${String(e.detail.outName)} ➜ ${String(e.detail.inName)}` };
    default:
      return { icon: '•', text: e.type };
  }
}

const MOMENT_ICON: Record<string, string> = {
  SHOT: '⚽',
  CHANCE: '🔥',
  TURNOVER: '🔁',
  CLEARANCE: '🧤',
  BUILD_UP: '▶️',
};

export function MatchBoard({ match, initialSnapshot }: MatchBoardProps) {
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

  const [managedTeamId, setManagedTeamId] = useState(match.homeTeam.id);
  const [snapshot, setSnapshot] = useState<MatchSnapshotResponse>(initialSnapshot);
  const [lineupOverride, setLineupOverride] = useState<SnapshotPlayer[] | null>(null);
  const [manualSubstitutions, setManualSubstitutions] = useState<
    { outPlayerId: number; inPlayerId: number }[]
  >([]);
  const [selectedFormation, setSelectedFormation] = useState<string | undefined>(undefined);
  const [ai, setAi] = useState<{
    loading: boolean;
    result: TacticsRecommendation | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });
  const [whatIf, setWhatIf] = useState<{
    frames: MatchFrame[];
    summary: string;
    moments: WhatIfMoment[];
    rollbackMinute: number;
  } | null>(null);

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

  // Once the user diverges from reality (applies a substitution/formation
  // change, or an AI what-if scenario is active), stop syncing the
  // real-match snapshot - the squad panel reflects the roster at the
  // moment of divergence, and the pitch itself switches to AI frames.
  const diverged = manualSubstitutions.length > 0 || !!selectedFormation || !!whatIf;
  const activeFrames = whatIf ? whatIf.frames : matchFrames;
  const hasReplayData = matchFrames.length > 0;

  const replay = useFramePlayback(activeFrames, match, false);
  const currentMinute = Math.floor(replay.current?.minute ?? initialSnapshot.minute);

  useEffect(() => {
    if (diverged) return;
    let cancelled = false;
    getSnapshot(match.id, currentMinute).then((snap) => {
      if (!cancelled) setSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [currentMinute, diverged, match.id]);

  const managedSnapshot =
    snapshot.home?.teamId === managedTeamId ? snapshot.home : snapshot.away;
  const managedTeamName =
    managedTeamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  const managedLineup = lineupOverride ?? managedSnapshot?.lineup ?? [];

  const handleRecommend = async () => {
    setAi({ loading: true, result: null, error: null });
    try {
      const result = await recommendTactics(match.id, {
        minute: currentMinute,
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
        ? { ...p, playerId: inPlayerId, name: inName, jerseyNumber: inJersey }
        : p,
    );
    setLineupOverride(next);
    setManualSubstitutions((prev) => [
      ...prev.filter((s) => s.outPlayerId !== outPlayerId),
      { outPlayerId, inPlayerId },
    ]);
  };

  const resetChanges = () => {
    setLineupOverride(null);
    setManualSubstitutions([]);
    setSelectedFormation(undefined);
    setWhatIf(null);
    setAi({ loading: false, result: null, error: null });
  };

  const proposedChange =
    manualSubstitutions.length > 0 || selectedFormation
      ? {
          formation: selectedFormation,
          substitutions: manualSubstitutions.length > 0 ? manualSubstitutions : undefined,
        }
      : undefined;

  const bannerContent = useMemo(() => {
    const cur = replay.current;
    if (!cur) return null;
    if (whatIf) {
      const moment = whatIf.moments.find((m) => {
        const mMinute = whatIf.rollbackMinute + Math.floor(m.offsetSeconds / 60);
        const mSecond = m.offsetSeconds % 60;
        return cur.minute === mMinute && cur.second >= mSecond && cur.second < mSecond + 4;
      });
      if (!moment) return null;
      return { icon: MOMENT_ICON[moment.type] ?? '▶️', text: moment.commentary };
    }
    const event = match.timeline.find(
      (e) =>
        ['GOAL', 'OWN_GOAL', 'CARD', 'SUBSTITUTION'].includes(e.type) &&
        e.minute === cur.minute &&
        cur.second >= e.second &&
        cur.second < e.second + 4,
    );
    return event ? timelineEventBanner(event) : null;
  }, [replay, whatIf, match.timeline]);

  const cardsSoFar = match.timeline.filter(
    (e) => e.type === 'CARD' && e.minute <= currentMinute,
  );
  const goalsSoFar = match.timeline.filter(
    (e) => (e.type === 'GOAL' || e.type === 'OWN_GOAL') && e.minute <= currentMinute,
  );
  const scoreAtMinute = {
    home: goalsSoFar.filter((e) => e.teamId === match.homeTeam.id).length,
    away: goalsSoFar.filter((e) => e.teamId === match.awayTeam.id).length,
  };

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
              {currentMinute}&apos;{String(replay.current?.second ?? 0).padStart(2, '0')}
              {whatIf ? ' · AI 시뮬레이션 재생 중' : ' · 실제 경기 재생 중'}
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

        {framesLoading ? (
          <div className="flex aspect-[3/2] w-full items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-sm text-neutral-500">
            재생 데이터 불러오는 중...
          </div>
        ) : !hasReplayData ? (
          <div className="flex aspect-[3/2] w-full items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-sm text-neutral-500">
            이 경기는 재생 데이터가 아직 없습니다.
          </div>
        ) : (
          <>
            <div className="relative">
              <Pitch tokens={replay.tokens} smooth smoothMs={PLAYBACK_TRANSITION_MS} />
              {bannerContent && (
                <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-lg">
                  {bannerContent.icon} {bannerContent.text}
                </div>
              )}
            </div>
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
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
                  min={replay.firstT}
                  max={replay.lastT}
                  value={replay.t}
                  onChange={(e) => {
                    replay.setPlaying(false);
                    replay.setT(Number(e.target.value));
                  }}
                  className="flex-1 accent-emerald-500"
                />
                <select
                  value={replay.speed}
                  onChange={(e) => replay.setSpeed(Number(e.target.value))}
                  className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                >
                  {SPEED_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                공의 실제 좌표는 StatsBomb 데이터, 나머지 선수 움직임은 포메이션 기반으로
                구성한 시각화입니다.
                {whatIf &&
                  ' 지금은 왼쪽에서 적용한 변경 이후를 AI가 다시 생성한 가상 시나리오를 재생 중입니다.'}
              </p>
            </div>
          </>
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
            감독 모드: {managedTeamName}
          </h3>
          <p className="mb-3 text-xs text-neutral-500">
            왼쪽 스쿼드에서 교체하거나 전술을 바꾸면, 그 순간부터 AI가 다시 만든 흐름으로
            재생됩니다.
          </p>
          <button
            type="button"
            onClick={resetChanges}
            className="mb-2 w-full rounded border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            변경 초기화 (실제 경기로 복귀)
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
            minute={currentMinute}
            teamId={managedTeamId}
            proposedChange={proposedChange}
            onResult={(result) => setWhatIf(result)}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-800 p-4 text-xs text-neutral-500">
            왼쪽 스쿼드에서 선수 교체를 적용하거나 전술(포메이션)을 변경하면,
            그 이후 전개를 AI가 재생성해서 이 피치에서 이어서 재생합니다.
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
