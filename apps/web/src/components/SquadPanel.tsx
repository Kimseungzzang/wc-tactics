'use client';

import { useMemo, useState } from 'react';
import { getPlayer } from '@/lib/api';
import type { MatchDetail, PlayerStatsResponse, SnapshotPlayer } from '@/lib/types';

const FORMATIONS = [
  '4-3-3',
  '4-4-2',
  '4-2-3-1',
  '3-4-3',
  '3-5-2',
  '5-3-2',
  '4-1-4-1',
  '4-4-1-1',
];

const ATTRIBUTE_LABEL: Record<string, string> = {
  pace: '속도',
  shooting: '슈팅',
  passing: '패스',
  defending: '수비',
  physical: '피지컬',
  stamina: '체력',
};

interface SquadPanelProps {
  match: MatchDetail;
  managedTeamId: number;
  managedTeamName: string;
  currentLineup: SnapshotPlayer[];
  currentFormation?: string;
  selectedFormation: string | undefined;
  onFormationChange: (formation: string | undefined) => void;
  onSubstitute: (outPlayerId: number, inPlayerId: number) => void;
}

export function SquadPanel({
  match,
  managedTeamId,
  managedTeamName,
  currentLineup,
  currentFormation,
  selectedFormation,
  onFormationChange,
  onSubstitute,
}: SquadPanelProps) {
  const [pendingOutId, setPendingOutId] = useState<number | null>(null);
  const [statsPlayerId, setStatsPlayerId] = useState<number | null>(null);
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const bench = useMemo(() => {
    const onPitchIds = new Set(currentLineup.map((p) => p.playerId));
    return (match.squads[managedTeamId] ?? []).filter((s) => !onPitchIds.has(s.playerId));
  }, [match.squads, managedTeamId, currentLineup]);

  const showStats = async (playerId: number) => {
    if (statsPlayerId === playerId) {
      setStatsPlayerId(null);
      setStats(null);
      return;
    }
    setStatsPlayerId(playerId);
    setStats(null);
    setStatsLoading(true);
    try {
      const data = await getPlayer(playerId);
      setStats(data);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleSub = (outPlayerId: number, inPlayerId: number) => {
    onSubstitute(outPlayerId, inPlayerId);
    setPendingOutId(null);
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-200">{managedTeamName} 스쿼드</h3>
        <p className="mt-1 text-xs text-neutral-500">
          이름을 누르면 능력치·기록을 보고, 교체 버튼으로 선수를 바꾸세요.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">
          전술 변경 (포메이션)
        </label>
        <select
          value={selectedFormation ?? ''}
          onChange={(e) => onFormationChange(e.target.value || undefined)}
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200"
        >
          <option value="">현재 유지{currentFormation ? ` (${currentFormation})` : ''}</option>
          {FORMATIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-neutral-400">
          선발 ({currentLineup.length})
        </h4>
        <ul className="space-y-1">
          {currentLineup.map((p) => (
            <li key={p.playerId}>
              <PlayerRow
                jerseyNumber={p.jerseyNumber}
                name={p.name}
                sub={p.positionName}
                highlighted={pendingOutId === p.playerId}
                onClick={() => showStats(p.playerId)}
                actionLabel="교체"
                onAction={() =>
                  setPendingOutId((prev) => (prev === p.playerId ? null : p.playerId))
                }
              />
              {statsPlayerId === p.playerId && (
                <StatsCard loading={statsLoading} stats={stats} />
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-neutral-400">벤치 ({bench.length})</h4>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {bench.map((p) => (
            <li key={p.playerId}>
              <PlayerRow
                jerseyNumber={p.jerseyNumber}
                name={p.name}
                onClick={() => showStats(p.playerId)}
                actionLabel="투입"
                actionDisabled={pendingOutId == null}
                onAction={() => {
                  if (pendingOutId != null) handleSub(pendingOutId, p.playerId);
                }}
              />
              {statsPlayerId === p.playerId && (
                <StatsCard loading={statsLoading} stats={stats} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PlayerRow({
  jerseyNumber,
  name,
  sub,
  highlighted,
  onClick,
  actionLabel,
  actionDisabled,
  onAction,
}: {
  jerseyNumber: number;
  name: string;
  sub?: string;
  highlighted?: boolean;
  onClick: () => void;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
        highlighted ? 'bg-red-900/50 ring-1 ring-red-500' : 'bg-neutral-950 hover:bg-neutral-800'
      }`}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-bold text-white">
          {jerseyNumber}
        </span>
        <span className="truncate text-neutral-200">{name}</span>
        {sub && <span className="ml-auto shrink-0 text-[10px] text-neutral-500">{sub}</span>}
      </button>
      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled}
        className="shrink-0 rounded bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function StatsCard({ loading, stats }: { loading: boolean; stats: PlayerStatsResponse | null }) {
  return (
    <div className="mt-1 mb-1 rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px]">
      {loading && <p className="text-neutral-500">불러오는 중...</p>}
      {!loading && stats && (
        <>
          <div className="mb-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-neutral-400">
            <span>출전 {stats.tournamentAppearances}</span>
            <span>선발 {stats.starts}</span>
            <span>골 {stats.goals}</span>
            <span>
              경고/퇴장 {stats.yellowCards}/{stats.redCards}
            </span>
          </div>
          {stats.attributes && (
            <div className="space-y-1">
              {Object.entries(stats.attributes).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-neutral-500">
                    {ATTRIBUTE_LABEL[key] ?? key}
                  </span>
                  <div className="h-1.5 flex-1 rounded-full bg-neutral-800">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-neutral-400">{value}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
