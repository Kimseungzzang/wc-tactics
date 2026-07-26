'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPlayer, submitCampaignLineup } from '@/lib/api';
import type { PlayerStatsResponse, SquadEntry, TacticalProfile } from '@/lib/types';
import { TacticalDialPanel } from './TacticalDialPanel';
import { PlayerStatsBars } from './PlayerStatsBars';
import { FORMATIONS, FORMATION_POSITION_IDS, POSITION_BY_ID } from '@/lib/formations';

const POSITION_GROUP_ORDER = ['GK', 'DF', 'MF', 'FW'] as const;
const POSITION_GROUP_LABEL: Record<string, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
};

interface LineupSelectProps {
  campaignId: string;
  matchId: number;
  squad: SquadEntry[];
  tacticalBaseline: TacticalProfile | null;
}

export function LineupSelect({ campaignId, matchId, squad, tacticalBaseline }: LineupSelectProps) {
  const router = useRouter();
  const [formation, setFormation] = useState<string>(FORMATIONS[0]);
  const [goalkeeperId, setGoalkeeperId] = useState<number | null>(null);
  // Insertion order doubles as submission order - the backend assigns
  // formation slots in exactly this order (see campaigns.service.ts
  // submitLineup: chosenIds = [goalkeeperPlayerId, ...outfieldPlayerIds]),
  // so the pitch board below renders the same slot assignment the backend
  // will apply.
  const [outfieldIds, setOutfieldIds] = useState<number[]>([]);
  const [tacticalDial, setTacticalDial] = useState<TacticalProfile | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsPlayerId, setStatsPlayerId] = useState<number | null>(null);
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const squadById = useMemo(() => new Map(squad.map((p) => [p.playerId, p])), [squad]);

  const togglePlayer = (p: SquadEntry) => {
    if (p.position === 'GK') {
      setGoalkeeperId((prev) => (prev === p.playerId ? null : p.playerId));
      return;
    }
    setOutfieldIds((prev) => {
      if (prev.includes(p.playerId)) return prev.filter((id) => id !== p.playerId);
      if (prev.length >= 10) return prev;
      return [...prev, p.playerId];
    });
  };

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
      setStats(await getPlayer(playerId));
    } finally {
      setStatsLoading(false);
    }
  };

  const canSubmit = goalkeeperId != null && outfieldIds.length === 10 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || goalkeeperId == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCampaignLineup(campaignId, {
        matchId,
        formation,
        goalkeeperPlayerId: goalkeeperId,
        outfieldPlayerIds: outfieldIds,
      });
      const dialParams = tacticalDial
        ? `&pressingIntensity=${tacticalDial.pressingIntensity}&possessionStyle=${tacticalDial.possessionStyle}&defensiveLine=${tacticalDial.defensiveLine}`
        : '';
      router.push(`/match/${matchId}?campaignId=${campaignId}${dialParams}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const positionIds = FORMATION_POSITION_IDS[formation] ?? FORMATION_POSITION_IDS[FORMATIONS[0]];
  const slots = positionIds.map((positionId, i) => {
    const playerId = i === 0 ? goalkeeperId : outfieldIds[i - 1];
    return { positionId, player: playerId != null ? (squadById.get(playerId) ?? null) : null };
  });

  const grouped = POSITION_GROUP_ORDER.map((group) => ({
    group,
    players: squad.filter((p) => p.position === group).sort((a, b) => a.jerseyNumber - b.jerseyNumber),
  }));

  const isSelected = (p: SquadEntry) => p.playerId === goalkeeperId || outfieldIds.includes(p.playerId);

  return (
    <div className="space-y-6">
      <div className="hud-card flex flex-wrap items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div>
          <label className="font-hud mb-1 block text-xs font-bold text-neutral-400">포메이션</label>
          <select
            value={formation}
            onChange={(e) => setFormation(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100"
          >
            {FORMATIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <p className="hud-score text-sm text-neutral-300">
          골키퍼 {goalkeeperId != null ? 1 : 0}/1 · 필드 플레이어 {outfieldIds.length}/10
        </p>
        {error && (
          <div className="rounded border border-red-900 bg-red-950 px-3 py-1.5 text-xs text-red-300">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="hud-btn ml-auto rounded bg-[var(--hud-accent-strong)] px-5 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? '적용하는 중...' : '이 라인업으로 시작'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <PitchBoard slots={slots} onRemove={togglePlayer} />

        <div className="hud-card flex max-h-[640px] flex-col gap-4 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div>
            <h2 className="font-hud text-sm font-bold text-neutral-200">선발 후보 명단</h2>
            <p className="mt-1 text-xs text-neutral-500">이름을 누르면 선발에 넣거나 빼고, 상세보기로 능력치를 봅니다.</p>
          </div>
          {grouped.map(({ group, players }) => (
            <div key={group}>
              <h3 className="font-hud mb-1.5 text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
                {POSITION_GROUP_LABEL[group]} ({players.length})
              </h3>
              <ul className="space-y-1">
                {players.map((p) => {
                  const selected = isSelected(p);
                  const disabledToAdd = !selected && group !== 'GK' && outfieldIds.length >= 10;
                  return (
                    <li key={p.playerId}>
                      <CandidateRow
                        player={p}
                        selected={selected}
                        disabled={disabledToAdd}
                        onToggle={() => togglePlayer(p)}
                        onDetail={() => showStats(p.playerId)}
                      />
                      {statsPlayerId === p.playerId && (
                        <PlayerStatsBars loading={statsLoading} stats={stats} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <TacticalDialPanel
        baseline={tacticalBaseline}
        value={tacticalDial}
        onChange={setTacticalDial}
        onReset={() => setTacticalDial(undefined)}
      />
    </div>
  );
}

function PitchBoard({
  slots,
  onRemove,
}: {
  slots: { positionId: number; player: SquadEntry | null }[];
  onRemove: (p: SquadEntry) => void;
}) {
  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border-2 border-white/25 bg-gradient-to-r from-emerald-950 to-emerald-900">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 40px, transparent 40px 80px)',
        }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/30" />
      <div className="absolute top-1/2 left-1/2 h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30" />
      <div className="absolute top-1/2 left-0 h-[46%] w-[13%] -translate-y-1/2 border-2 border-l-0 border-white/30" />
      <div className="absolute top-1/2 right-0 h-[46%] w-[13%] -translate-y-1/2 border-2 border-r-0 border-white/30" />

      {slots.map(({ positionId, player }) => {
        const coord = POSITION_BY_ID.get(positionId);
        if (!coord) return null;
        return (
          <div
            key={positionId}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
          >
            {player ? (
              <button
                type="button"
                onClick={() => onRemove(player)}
                className="group flex flex-col items-center gap-0.5"
                title="눌러서 선발에서 빼기"
              >
                <span className="hud-card flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--hud-accent)] bg-neutral-900 text-xs font-bold text-white group-hover:border-red-500 group-hover:bg-red-950">
                  {player.jerseyNumber}
                </span>
                <span className="max-w-[76px] truncate rounded bg-black/55 px-1 text-[10px] text-white">
                  {player.name}
                </span>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-0.5 opacity-60">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-white/50 text-[10px] font-bold text-white/70">
                  {coord.abbrev}
                </span>
                <span className="text-[9px] text-white/50">빈 자리</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CandidateRow({
  player,
  selected,
  disabled,
  onToggle,
  onDetail,
}: {
  player: SquadEntry;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDetail: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
        selected
          ? 'border border-[var(--hud-accent)] bg-emerald-950/30'
          : 'border border-transparent bg-neutral-950 hover:bg-neutral-800'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
            selected ? 'bg-[var(--hud-accent-strong)]' : 'bg-neutral-700'
          }`}
        >
          {player.jerseyNumber}
        </span>
        <span className="truncate text-neutral-200">{player.name}</span>
      </button>
      <span className="shrink-0 text-[10px] text-neutral-500">{player.position}</span>
      <button
        type="button"
        onClick={onDetail}
        className="shrink-0 rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:border-[var(--hud-accent)] hover:text-[var(--hud-accent)]"
      >
        상세보기
      </button>
    </div>
  );
}
