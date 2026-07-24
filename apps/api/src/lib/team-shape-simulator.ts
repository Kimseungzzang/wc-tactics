import { POSITION_COORDINATES } from '../positions/position-coordinates';

const STEP_SECONDS = 1;
const MAX_GAP_SECONDS = 20; // gaps larger than this (e.g. halftime) are skipped, not interpolated
const PITCH_LENGTH = 120; // StatsBomb units
const PITCH_WIDTH = 80;
const PRESS_THRESHOLD = 0.12; // pull magnitude above which a player's event is tagged PRESS/SUPPORT rather than HOME

export type PlayerEventType = 'HOME' | 'SUPPORT' | 'PRESS';

export interface SimBallEvent {
  id: string;
  teamId: number;
  period: number;
  minute: number;
  second: number;
  duration: number;
  x: number;
  y: number;
  endX: number | null;
  endY: number | null;
  contStart: number;
  contEnd: number;
}

export interface SimSnapshotPlayer {
  playerId: number;
  name: string;
  jerseyNumber: number;
  positionId: number;
  positionName: string;
}

export interface SimPlayerEventRow {
  playerId: number;
  teamId: number;
  type: PlayerEventType;
  t: number;
  endT: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  triggerBallEventId: string;
}

export interface SimFramePlayer {
  playerId: number;
  teamId: number;
  x: number; // 0-100
  y: number; // 0-100
}

export interface SimFrameRow {
  t: number;
  period: number;
  minute: number;
  second: number;
  ballX: number; // 0-100
  ballY: number; // 0-100
  players: SimFramePlayer[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const POSITION_BY_ID = new Map(POSITION_COORDINATES.map((p) => [p.id, p]));

export function homePosition(
  positionId: number,
  period: number,
  attackDirection: (period: number) => 1 | -1,
): { x: number; y: number } {
  const coord = POSITION_BY_ID.get(positionId) ?? { x: 50, y: 50 };
  const dir = attackDirection(period);
  const rawX =
    dir === 1
      ? (coord.x / 100) * PITCH_LENGTH
      : PITCH_LENGTH - (coord.x / 100) * PITCH_LENGTH;
  const rawY = (coord.y / 100) * PITCH_WIDTH;
  return { x: rawX, y: rawY };
}

/**
 * Given a real or AI-generated ball-event stream (ball position is always
 * ground truth for whichever source produced it - real StatsBomb data or
 * an AI what-if scenario), computes discrete per-player movement events
 * (constructed team-shape heuristic, not tracking data) and samples both
 * into 1-second frames for playback. Shared by the offline match seeder
 * (scripts/simulate-frames.ts) and the live AI what-if endpoint so both
 * produce frames the same Replay UI can play back identically.
 */
export function simulateTeamShape(params: {
  ballEvents: SimBallEvent[]; // must be sorted by contStart ascending
  teamIds: [number, number];
  getLineup: (teamId: number, minute: number, second: number) => SimSnapshotPlayer[];
  attackDirection: (teamId: number, period: number) => 1 | -1;
}): { playerEvents: SimPlayerEventRow[]; frames: SimFrameRow[] } {
  const { ballEvents, teamIds, getLineup, attackDirection } = params;
  if (ballEvents.length === 0) return { playerEvents: [], frames: [] };

  const lastPos = new Map<number, { x: number; y: number }>();
  const playerEvents: SimPlayerEventRow[] = [];
  const playerEventsByBallEvent = new Map<string, SimPlayerEventRow[]>();

  for (const ev of ballEvents) {
    const ballTargetX = ev.endX ?? ev.x;
    const ballTargetY = ev.endY ?? ev.y;
    const possessionTeamId = ev.teamId;
    const segment: SimPlayerEventRow[] = [];

    for (const teamId of teamIds) {
      const lineup = getLineup(teamId, ev.minute, ev.second);
      const isPossessing = teamId === possessionTeamId;
      for (const p of lineup) {
        const home = homePosition(p.positionId, ev.period, (period) =>
          attackDirection(teamId, period),
        );
        const dx = ballTargetX - home.x;
        const dy = ballTargetY - home.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximity = 1 - clamp(dist / 40, 0, 1);
        let pull = (isPossessing ? 0.22 : 0.13) * proximity;
        if (p.positionId === 1) pull *= 0.15; // goalkeepers barely leave their line

        const toX = clamp(home.x + dx * pull, 1, PITCH_LENGTH - 1);
        const toY = clamp(home.y + dy * pull, 1, PITCH_WIDTH - 1);
        const from = lastPos.get(p.playerId) ?? home;
        const type: PlayerEventType =
          pull <= PRESS_THRESHOLD ? 'HOME' : isPossessing ? 'SUPPORT' : 'PRESS';

        const row: SimPlayerEventRow = {
          playerId: p.playerId,
          teamId,
          type,
          t: ev.contStart,
          endT: ev.contEnd,
          fromX: from.x,
          fromY: from.y,
          toX,
          toY,
          triggerBallEventId: ev.id,
        };
        segment.push(row);
        playerEvents.push(row);
        lastPos.set(p.playerId, { x: toX, y: toY });
      }
    }
    playerEventsByBallEvent.set(ev.id, segment);
  }

  const firstT = ballEvents[0].contStart;
  const lastT = ballEvents[ballEvents.length - 1].contEnd;
  const frames: SimFrameRow[] = [];

  let eventIdx = 0;
  for (let t = firstT; t <= lastT; t += STEP_SECONDS) {
    while (eventIdx + 1 < ballEvents.length && ballEvents[eventIdx + 1].contStart <= t) {
      eventIdx++;
    }
    const ev = ballEvents[eventIdx];
    const nextEv = ballEvents[eventIdx + 1];

    if (t > ev.contEnd && nextEv && nextEv.contStart - t > MAX_GAP_SECONDS) {
      t = nextEv.contStart - STEP_SECONDS;
      continue;
    }

    const progress = clamp((t - ev.contStart) / (ev.contEnd - ev.contStart), 0, 1);

    let ballX: number;
    let ballY: number;
    if (ev.endX != null && ev.endY != null && t <= ev.contEnd) {
      ballX = lerp(ev.x, ev.endX, progress);
      ballY = lerp(ev.y, ev.endY, progress);
    } else {
      ballX = ev.endX ?? ev.x;
      ballY = ev.endY ?? ev.y;
    }

    const segment = playerEventsByBallEvent.get(ev.id) ?? [];
    const players: SimFramePlayer[] = segment.map((pe) => {
      const px = t <= pe.endT ? lerp(pe.fromX, pe.toX, progress) : pe.toX;
      const py = t <= pe.endT ? lerp(pe.fromY, pe.toY, progress) : pe.toY;
      return {
        playerId: pe.playerId,
        teamId: pe.teamId,
        x: (clamp(px, 0, PITCH_LENGTH) / PITCH_LENGTH) * 100,
        y: (clamp(py, 0, PITCH_WIDTH) / PITCH_WIDTH) * 100,
      };
    });

    frames.push({
      t,
      period: ev.period,
      minute: ev.minute,
      second: ev.second,
      ballX: (ballX / PITCH_LENGTH) * 100,
      ballY: (ballY / PITCH_WIDTH) * 100,
      players,
    });
  }

  return { playerEvents, frames };
}
