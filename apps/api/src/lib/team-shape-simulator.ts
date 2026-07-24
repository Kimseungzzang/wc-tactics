import { POSITION_COORDINATES } from '../positions/position-coordinates';

const STEP_SECONDS = 0.4; // sampling step WITHIN a single event's span (not a global fixed grid)
const PITCH_LENGTH = 120; // StatsBomb units
const PITCH_WIDTH = 80;
const PRESS_THRESHOLD = 0.12; // pull magnitude above which a player's event is tagged PRESS/SUPPORT rather than HOME

export type PlayerEventType = 'HOME' | 'SUPPORT' | 'PRESS';

export interface SimBallEvent {
  id: string;
  teamId: number;
  type: string;
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
  /** The player physically performing this action (passer/carrier/shooter). */
  playerId: number | null;
  /** For Pass events: who the ball is going to. */
  recipientId: number | null;
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
        const from = lastPos.get(p.playerId) ?? home;

        const isActor = p.playerId === ev.playerId;
        const isRecipient = ev.recipientId != null && p.playerId === ev.recipientId;
        const hasRealEnd = ev.endX != null && ev.endY != null;

        let toX: number;
        let toY: number;
        let type: PlayerEventType;

        if (isActor && ev.type === 'Carry' && hasRealEnd) {
          // The real ball path IS this player physically running with the
          // ball - use it directly rather than the generic pull heuristic.
          toX = ev.endX!;
          toY = ev.endY!;
          type = 'SUPPORT';
        } else if (isActor) {
          // Passer/shooter/duel participant: real touch point.
          toX = ev.x;
          toY = ev.y;
          type = 'SUPPORT';
        } else if (isRecipient && hasRealEnd) {
          // Pass target: moves to meet the incoming ball.
          toX = ev.endX!;
          toY = ev.endY!;
          type = 'SUPPORT';
        } else {
          const dx = ballTargetX - home.x;
          const dy = ballTargetY - home.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const proximity = 1 - clamp(dist / 55, 0, 1);
          let pull = (isPossessing ? 0.5 : 0.32) * proximity;
          if (p.positionId === 1) pull *= 0.2; // goalkeepers barely leave their line
          toX = clamp(home.x + dx * pull, 1, PITCH_LENGTH - 1);
          toY = clamp(home.y + dy * pull, 1, PITCH_WIDTH - 1);
          type = pull <= PRESS_THRESHOLD ? 'HOME' : isPossessing ? 'SUPPORT' : 'PRESS';
        }

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

  // Sample frames WITHIN each event's own real span (not a fixed global time
  // grid) - a fixed 1s grid was silently skipping short events (a quick
  // Ball Receipt/Pressure/Duel spanning <1s could fall entirely between two
  // grid ticks), which read as the ball "freezing" during buildup play.
  // Gaps between events (e.g. halftime) are naturally skipped since we
  // never interpolate across them - only within a single event's span.
  const frames: SimFrameRow[] = [];

  for (const ev of ballEvents) {
    const span = Math.max(ev.contEnd - ev.contStart, 0.01);
    const steps = Math.max(1, Math.ceil(span / STEP_SECONDS));
    const segment = playerEventsByBallEvent.get(ev.id) ?? [];

    for (let s = 0; s <= steps; s++) {
      const progress = s / steps;
      const t = ev.contStart + progress * span;

      let ballX: number;
      let ballY: number;
      if (ev.endX != null && ev.endY != null) {
        ballX = lerp(ev.x, ev.endX, progress);
        ballY = lerp(ev.y, ev.endY, progress);
      } else {
        ballX = ev.x;
        ballY = ev.y;
      }

      const players: SimFramePlayer[] = segment.map((pe) => {
        const px = lerp(pe.fromX, pe.toX, progress);
        const py = lerp(pe.fromY, pe.toY, progress);
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
        ballX: (clamp(ballX, 0, PITCH_LENGTH) / PITCH_LENGTH) * 100,
        ballY: (clamp(ballY, 0, PITCH_WIDTH) / PITCH_WIDTH) * 100,
        players,
      });
    }
  }

  return { playerEvents, frames };
}
