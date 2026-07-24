'use client';

import { useMemo, useState } from 'react';
import type { MatchDetail, SnapshotPlayer } from '@/lib/types';

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

  const bench = useMemo(() => {
    const onPitchIds = new Set(currentLineup.map((p) => p.playerId));
    return (match.squads[managedTeamId] ?? []).filter((s) => !onPitchIds.has(s.playerId));
  }, [match.squads, managedTeamId, currentLineup]);

  const handleStarterClick = (playerId: number) => {
    setPendingOutId((prev) => (prev === playerId ? null : playerId));
  };

  const handleBenchClick = (inPlayerId: number) => {
    if (pendingOutId == null) return;
    onSubstitute(pendingOutId, inPlayerId);
    setPendingOutId(null);
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-200">{managedTeamName} 스쿼드</h3>
        <p className="mt-1 text-xs text-neutral-500">
          선발 선수 클릭 → 벤치 선수 클릭 순서로 교체를 적용하세요.
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
              <button
                type="button"
                onClick={() => handleStarterClick(p.playerId)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                  pendingOutId === p.playerId
                    ? 'bg-red-900/50 ring-1 ring-red-500'
                    : 'bg-neutral-950 hover:bg-neutral-800'
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-bold text-white">
                  {p.jerseyNumber}
                </span>
                <span className="truncate text-neutral-200">{p.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-neutral-500">
                  {p.positionName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-neutral-400">벤치 ({bench.length})</h4>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {bench.map((p) => (
            <li key={p.playerId}>
              <button
                type="button"
                onClick={() => handleBenchClick(p.playerId)}
                disabled={pendingOutId == null}
                className="flex w-full items-center gap-2 rounded bg-neutral-950 px-2 py-1.5 text-left text-xs hover:bg-emerald-900/40 disabled:opacity-40 disabled:hover:bg-neutral-950"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-bold text-white">
                  {p.jerseyNumber}
                </span>
                <span className="truncate text-neutral-300">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
