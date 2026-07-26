'use client';

import { useMemo, useState } from 'react';
import { getPlayer } from '@/lib/api';
import type { MatchDetail, PlayerStatsResponse, SnapshotPlayer, TacticalProfile } from '@/lib/types';
import { TacticalDialPanel } from './TacticalDialPanel';
import { PlayerStatsBars } from './PlayerStatsBars';

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

interface SquadPanelProps {
  match: MatchDetail;
  managedTeamId: number;
  managedTeamName: string;
  currentLineup: SnapshotPlayer[];
  currentFormation?: string;
  selectedFormation: string | undefined;
  onFormationChange: (formation: string | undefined) => void;
  onSubstitute: (outPlayerId: number, inPlayerId: number) => void;
  substitutionsUsed: number;
  maxSubstitutions: number;
  /** playerIds currently occupying an already-used substitution slot (i.e.
   * came ON earlier) - re-substituting one of these updates that same slot
   * instead of consuming a new one, so it stays selectable past the cap. */
  substitutedInPlayerIds: Set<number>;
  tacticalBaseline: TacticalProfile | null;
  tacticalDial: TacticalProfile | undefined;
  onTacticalDialChange: (next: TacticalProfile) => void;
  onTacticalDialReset: () => void;
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
  substitutionsUsed,
  maxSubstitutions,
  substitutedInPlayerIds,
  tacticalBaseline,
  tacticalDial,
  onTacticalDialChange,
  onTacticalDialReset,
}: SquadPanelProps) {
  const atSubLimit = substitutionsUsed >= maxSubstitutions;
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
    <div className="hud-card flex w-full flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-hud text-sm font-bold text-neutral-200">{managedTeamName} 스쿼드</h3>
          <span
            className={`font-mono text-[11px] ${atSubLimit ? 'text-amber-400' : 'text-neutral-500'}`}
          >
            교체 {substitutionsUsed}/{maxSubstitutions}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          이름을 누르면 능력치·기록을 보고, 교체 버튼으로 선수를 바꾸세요.
          {atSubLimit && ' 교체 한도를 모두 사용했습니다.'}
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

      <TacticalDialPanel
        baseline={tacticalBaseline}
        value={tacticalDial}
        onChange={onTacticalDialChange}
        onReset={onTacticalDialReset}
      />

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
                actionDisabled={atSubLimit && !substitutedInPlayerIds.has(p.playerId)}
                onAction={() =>
                  setPendingOutId((prev) => (prev === p.playerId ? null : p.playerId))
                }
              />
              {statsPlayerId === p.playerId && (
                <PlayerStatsBars loading={statsLoading} stats={stats} />
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
                <PlayerStatsBars loading={statsLoading} stats={stats} />
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
        className="hud-btn shrink-0 rounded bg-[var(--hud-accent-strong)] px-2 py-1 text-[10px] text-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600 disabled:shadow-none"
      >
        {actionLabel}
      </button>
    </div>
  );
}
