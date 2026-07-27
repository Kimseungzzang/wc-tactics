'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPlayer, submitCampaignLineup } from '@/lib/api';
import type { PlayerStatsResponse, PreviousLineup, SquadEntry, TacticalProfile } from '@/lib/types';
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

// -1 = the single goalkeeper slot; 0-9 = index into outfieldSlots (which
// itself maps 1:1 to FORMATION_POSITION_IDS[formation].slice(1), so the
// slot a player sits in on the board is exactly the slot the backend will
// assign them to - see campaigns.service.ts submitLineup, which builds
// [goalkeeperPlayerId, ...outfieldPlayerIds] in this same order).
type SlotIndex = -1 | number;

interface DragPayload {
  playerId: number;
  positionGroup: string;
  fromSlot: SlotIndex | null; // null = dragged from the candidate list (bench)
}

function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData('application/json');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

interface LineupSelectProps {
  campaignId: string;
  matchId: number;
  squad: SquadEntry[];
  tacticalBaseline: TacticalProfile | null;
  /** The manager's own last submitted starting XI elsewhere in this
   * campaign, if any - pre-fills the board instead of starting blank, so
   * picking a lineup every single match isn't mandatory busywork when it's
   * usually the same XI anyway. Still fully editable/clearable. */
  previousLineup?: PreviousLineup | null;
}

export function LineupSelect({
  campaignId,
  matchId,
  squad,
  tacticalBaseline,
  previousLineup,
}: LineupSelectProps) {
  const router = useRouter();
  const [formation, setFormation] = useState<string>(
    () => previousLineup?.formation ?? FORMATIONS[0],
  );
  const [goalkeeperId, setGoalkeeperId] = useState<number | null>(
    () => previousLineup?.goalkeeperPlayerId ?? null,
  );
  const [outfieldSlots, setOutfieldSlots] = useState<(number | null)[]>(
    () => previousLineup?.outfieldPlayerIds ?? Array(10).fill(null),
  );
  const [tacticalDial, setTacticalDial] = useState<TacticalProfile | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsPlayerId, setStatsPlayerId] = useState<number | null>(null);
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<SlotIndex | null>(null);
  const [dragOverBench, setDragOverBench] = useState(false);

  const squadById = useMemo(() => new Map(squad.map((p) => [p.playerId, p])), [squad]);
  const outfieldCount = outfieldSlots.filter((id) => id != null).length;

  const slotOf = (playerId: number): SlotIndex | null => {
    if (playerId === goalkeeperId) return -1;
    const idx = outfieldSlots.indexOf(playerId);
    return idx === -1 ? null : idx;
  };

  const clearSlot = (slot: SlotIndex) => {
    if (slot === -1) {
      setGoalkeeperId(null);
    } else {
      setOutfieldSlots((prev) => {
        const next = [...prev];
        next[slot] = null;
        return next;
      });
    }
  };

  /** Click-to-toggle path: places into the first open slot (GK slot for a
   * keeper, otherwise the first empty outfield slot), or clears if already
   * placed. */
  const togglePlayer = (p: SquadEntry) => {
    if (p.position === 'GK') {
      setGoalkeeperId((prev) => (prev === p.playerId ? null : p.playerId));
      return;
    }
    setOutfieldSlots((prev) => {
      const idx = prev.indexOf(p.playerId);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = null;
        return next;
      }
      const emptyIdx = prev.indexOf(null);
      if (emptyIdx === -1) return prev;
      const next = [...prev];
      next[emptyIdx] = p.playerId;
      return next;
    });
  };

  /** Drag-and-drop path: drops a player onto a specific slot, swapping
   * with whoever is already there (the occupant takes the dragged
   * player's old slot, or goes back to the bench if it came from there). */
  const dropOnSlot = (targetSlot: SlotIndex, payload: DragPayload) => {
    const isGkSlot = targetSlot === -1;
    const isGkPlayer = payload.positionGroup === 'GK';
    if (isGkSlot !== isGkPlayer) return; // GK <-> GK slot only

    if (isGkSlot) {
      setGoalkeeperId(payload.playerId);
      return;
    }
    setOutfieldSlots((prev) => {
      const next = [...prev];
      const occupant = next[targetSlot];
      next[targetSlot] = payload.playerId;
      if (payload.fromSlot != null && payload.fromSlot !== -1) {
        next[payload.fromSlot] = occupant;
      }
      return next;
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

  const canSubmit = goalkeeperId != null && outfieldCount === 10 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || goalkeeperId == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCampaignLineup(campaignId, {
        matchId,
        formation,
        goalkeeperPlayerId: goalkeeperId,
        outfieldPlayerIds: outfieldSlots.filter((id): id is number => id != null),
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
  const slots: { slot: SlotIndex; positionId: number; player: SquadEntry | null }[] = positionIds.map(
    (positionId, i) => {
      const slot: SlotIndex = i === 0 ? -1 : i - 1;
      const playerId = i === 0 ? goalkeeperId : outfieldSlots[i - 1];
      return { slot, positionId, player: playerId != null ? (squadById.get(playerId) ?? null) : null };
    },
  );

  const grouped = POSITION_GROUP_ORDER.map((group) => ({
    group,
    players: squad.filter((p) => p.position === group).sort((a, b) => a.jerseyNumber - b.jerseyNumber),
  }));

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
          골키퍼 {goalkeeperId != null ? 1 : 0}/1 · 필드 플레이어 {outfieldCount}/10
        </p>
        <p className="text-xs text-neutral-500">후보 명단에서 선수를 피치로 드래그하거나 이름을 눌러 선발을 구성하세요.</p>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="mx-auto w-full max-w-[620px]">
          <PitchBoard
            slots={slots}
            dragOverSlot={dragOverSlot}
            onDragOverSlot={setDragOverSlot}
            onDropSlot={dropOnSlot}
            onRemove={(slot) => clearSlot(slot)}
          />
        </div>

        <div
          className={`hud-card flex max-h-[640px] flex-col gap-4 overflow-y-auto rounded-lg border p-4 transition ${
            dragOverBench ? 'border-red-500 bg-red-950/20' : 'border-neutral-800 bg-neutral-900'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverBench(true);
          }}
          onDragLeave={() => setDragOverBench(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverBench(false);
            const payload = readDragPayload(e);
            if (payload?.fromSlot != null) clearSlot(payload.fromSlot);
          }}
        >
          <div>
            <h2 className="font-hud text-sm font-bold text-neutral-200">선발 후보 명단</h2>
            <p className="mt-1 text-xs text-neutral-500">
              이름을 누르거나 피치로 드래그해 선발에 넣고 빼세요. 상세보기로 능력치를 봅니다.
            </p>
          </div>
          {grouped.map(({ group, players }) => (
            <div key={group}>
              <h3 className="font-hud mb-1.5 text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
                {POSITION_GROUP_LABEL[group]} ({players.length})
              </h3>
              <ul className="space-y-1">
                {players.map((p) => {
                  const slot = slotOf(p.playerId);
                  const selected = slot != null;
                  const disabledToAdd = !selected && group !== 'GK' && outfieldCount >= 10;
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
  dragOverSlot,
  onDragOverSlot,
  onDropSlot,
  onRemove,
}: {
  slots: { slot: SlotIndex; positionId: number; player: SquadEntry | null }[];
  dragOverSlot: SlotIndex | null;
  onDragOverSlot: (slot: SlotIndex | null) => void;
  onDropSlot: (slot: SlotIndex, payload: DragPayload) => void;
  onRemove: (slot: SlotIndex) => void;
}) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2 border-white/25 bg-gradient-to-b from-emerald-900 to-emerald-950">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 34px, transparent 34px 68px)',
        }}
      />
      {/* Attacking goal (top) - half-court view, no own-goal end shown */}
      <div className="absolute top-0 left-1/2 h-[15%] w-[46%] -translate-x-1/2 border-2 border-t-0 border-white/25" />
      <div className="absolute top-0 left-1/2 h-[6%] w-[20%] -translate-x-1/2 border-2 border-t-0 border-white/25" />
      {/* Halfway line + center-circle arc, at the bottom edge */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/25" />
      <div className="absolute bottom-0 left-1/2 h-[26%] w-[42%] -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white/25" />

      {slots.map(({ slot, positionId, player }) => {
        const coord = POSITION_BY_ID.get(positionId);
        if (!coord) return null;
        const isOver = dragOverSlot === slot;
        return (
          <div
            key={slot}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-full transition ${
              isOver ? 'scale-110 ring-2 ring-[var(--hud-accent)]' : ''
            }`}
            style={{ left: `${coord.y}%`, top: `${100 - coord.x}%` }}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOverSlot(slot);
            }}
            onDragLeave={() => onDragOverSlot(null)}
            onDrop={(e) => {
              e.preventDefault();
              onDragOverSlot(null);
              const payload = readDragPayload(e);
              if (payload) onDropSlot(slot, payload);
            }}
          >
            {player ? (
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  const payload: DragPayload = { playerId: player.playerId, positionGroup: player.position, fromSlot: slot };
                  e.dataTransfer.setData('application/json', JSON.stringify(payload));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onRemove(slot)}
                className="group flex cursor-grab flex-col items-center gap-0.5 active:cursor-grabbing"
                title="드래그해서 위치를 바꾸거나, 눌러서 선발에서 빼기"
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
      draggable={!disabled}
      onDragStart={(e) => {
        const payload: DragPayload = { playerId: player.playerId, positionGroup: player.position, fromSlot: null };
        e.dataTransfer.setData('application/json', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
        disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      } ${
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
