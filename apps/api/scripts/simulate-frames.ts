/**
 * Generates MatchFrame rows (1 per second of live play) for a match.
 *
 * Ball position: real, interpolated from MatchBallEvent's own start/end
 * location across its real duration - never fabricated.
 *
 * The 21 off-ball players' positions: NOT real tracking data. Computed by a
 * deterministic "team shape" heuristic - each player is pulled from their
 * real formation slot (MatchSnapshot) toward the real ball position,
 * proportional to proximity. This is an explicitly constructed/dummy
 * visualization layer, not a claim about where players actually were.
 *
 * Sequencing uses a continuous match clock (src/lib/match-clock.ts) rather
 * than raw minute/second, because StatsBomb's second-half clock restarts
 * at 45:00 and numerically overlaps first-half stoppage time.
 *
 * Run with: pnpm seed:frames [matchId]  (defaults to 3857255, Japan vs Spain)
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client-factory';
import { POSITION_COORDINATES } from '../src/positions/position-coordinates';
import { buildMatchClock } from '../src/lib/match-clock';

const DEFAULT_MATCH_ID = 3857255;
const STEP_SECONDS = 1;
const MAX_GAP_SECONDS = 20; // gaps larger than this (e.g. halftime) are skipped, not interpolated
const PITCH_LENGTH = 120; // StatsBomb units
const PITCH_WIDTH = 80;

interface SnapshotPlayer {
  playerId: number;
  name: string;
  jerseyNumber: number;
  positionId: number;
  positionName: string;
}

interface FramePlayer {
  playerId: number;
  teamId: number;
  x: number; // 0-100
  y: number; // 0-100
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const matchId = Number(process.argv[2] ?? DEFAULT_MATCH_ID);
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });

  const rawBallEvents = await prisma.matchBallEvent.findMany({ where: { matchId } });
  if (rawBallEvents.length === 0) {
    throw new Error(
      `No MatchBallEvent rows for match ${matchId} - run seed:ball-events first`,
    );
  }

  const halfEnds = await prisma.matchEvent.findMany({
    where: { matchId, type: 'HALF_END' },
  });
  const clock = buildMatchClock(
    halfEnds.map((h) => ({ period: h.period, minute: h.minute, second: h.second })),
  );

  const ballEvents = rawBallEvents
    .map((e) => ({
      ...e,
      contStart: clock(e.period, e.minute, e.second),
    }))
    .sort((a, b) => a.contStart - b.contStart)
    .map((e) => ({ ...e, contEnd: e.contStart + Math.max(e.duration, 0.1) }));

  const snapshots = await prisma.matchSnapshot.findMany({
    where: { matchId },
    orderBy: [{ minute: 'asc' }, { second: 'asc' }],
  });

  const posById = new Map(POSITION_COORDINATES.map((p) => [p.id, p]));
  const teamIds = [match.homeTeamId, match.awayTeamId];

  // Determine each team's period-1 attack direction from their goalkeeper's
  // real touches (a keeper's events cluster tightly near their own goal
  // line, giving a reliable signal). Directions alternate each period
  // (teams swap ends at halftime), so only period 1 needs inferring.
  const period1Direction = new Map<number, 1 | -1>();
  for (const teamId of teamIds) {
    const firstSnap = snapshots.find((s) => s.teamId === teamId);
    const lineup: SnapshotPlayer[] = firstSnap ? JSON.parse(firstSnap.lineup) : [];
    const gk = lineup.find((p) => p.positionId === 1);
    let direction: 1 | -1 = 1;
    if (gk) {
      const gkEvents = ballEvents.filter(
        (e) => e.playerId === gk.playerId && e.period === 1,
      );
      if (gkEvents.length > 0) {
        const avgX = gkEvents.reduce((s, e) => s + e.x, 0) / gkEvents.length;
        direction = avgX < PITCH_LENGTH / 2 ? 1 : -1;
      }
    }
    period1Direction.set(teamId, direction);
  }
  function attackDirection(teamId: number, period: number): 1 | -1 {
    const base = period1Direction.get(teamId) ?? 1;
    return period % 2 === 1 ? base : ((base * -1) as 1 | -1);
  }

  // Per-team pointer into snapshots, advanced monotonically as sim time increases.
  const snapshotIdxByTeam = new Map<number, number>(teamIds.map((id) => [id, -1]));
  function currentLineup(teamId: number, minute: number, second: number): SnapshotPlayer[] {
    let idx = snapshotIdxByTeam.get(teamId)!;
    const teamSnapshots = snapshots.filter((s) => s.teamId === teamId);
    let best = idx >= 0 ? teamSnapshots[idx] : undefined;
    for (let i = idx + 1; i < teamSnapshots.length; i++) {
      const s = teamSnapshots[i];
      if (s.minute > minute || (s.minute === minute && s.second > second)) break;
      best = s;
      idx = i;
    }
    snapshotIdxByTeam.set(teamId, idx);
    return best ? JSON.parse(best.lineup) : [];
  }

  function homePosition(
    positionId: number,
    teamId: number,
    period: number,
  ): { x: number; y: number } {
    const coord = posById.get(positionId) ?? { x: 50, y: 50 };
    const dir = attackDirection(teamId, period);
    const rawX =
      dir === 1
        ? (coord.x / 100) * PITCH_LENGTH
        : PITCH_LENGTH - (coord.x / 100) * PITCH_LENGTH;
    const rawY = (coord.y / 100) * PITCH_WIDTH;
    return { x: rawX, y: rawY };
  }

  const firstT = ballEvents[0].contStart;
  const lastT = ballEvents[ballEvents.length - 1].contEnd;

  const frames: {
    id: string;
    matchId: number;
    t: number;
    period: number;
    minute: number;
    second: number;
    ballX: number;
    ballY: number;
    players: string;
  }[] = [];

  let eventIdx = 0;
  for (let t = firstT; t <= lastT; t += STEP_SECONDS) {
    while (eventIdx + 1 < ballEvents.length && ballEvents[eventIdx + 1].contStart <= t) {
      eventIdx++;
    }
    const ev = ballEvents[eventIdx];
    const nextEv = ballEvents[eventIdx + 1];

    // Skip dead-time gaps (halftime, long stoppages) rather than interpolating across them.
    if (t > ev.contEnd && nextEv && nextEv.contStart - t > MAX_GAP_SECONDS) {
      t = nextEv.contStart - STEP_SECONDS;
      continue;
    }

    let ballX: number;
    let ballY: number;
    if (ev.endX != null && ev.endY != null && t <= ev.contEnd) {
      const progress = clamp((t - ev.contStart) / (ev.contEnd - ev.contStart), 0, 1);
      ballX = lerp(ev.x, ev.endX, progress);
      ballY = lerp(ev.y, ev.endY, progress);
    } else {
      ballX = ev.endX ?? ev.x;
      ballY = ev.endY ?? ev.y;
    }

    const minute = ev.minute;
    const second = ev.second;
    const period = ev.period;
    const possessionTeamId = ev.teamId;

    const framePlayers: FramePlayer[] = [];
    for (const teamId of teamIds) {
      const lineup = currentLineup(teamId, minute, second);
      const isPossessing = teamId === possessionTeamId;
      for (const p of lineup) {
        const home = homePosition(p.positionId, teamId, period);
        const dx = ballX - home.x;
        const dy = ballY - home.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximity = 1 - clamp(dist / 40, 0, 1);
        let pull = (isPossessing ? 0.22 : 0.13) * proximity;
        if (p.positionId === 1) pull *= 0.15; // goalkeepers barely leave their line
        const rawX = clamp(home.x + dx * pull, 1, PITCH_LENGTH - 1);
        const rawY = clamp(home.y + dy * pull, 1, PITCH_WIDTH - 1);
        framePlayers.push({
          playerId: p.playerId,
          teamId,
          x: (rawX / PITCH_LENGTH) * 100,
          y: (rawY / PITCH_WIDTH) * 100,
        });
      }
    }

    frames.push({
      id: `${matchId}-${Math.round(t * 10)}`,
      matchId,
      t,
      period,
      minute,
      second,
      ballX: (ballX / PITCH_LENGTH) * 100,
      ballY: (ballY / PITCH_WIDTH) * 100,
      players: JSON.stringify(framePlayers),
    });
  }

  await prisma.matchFrame.deleteMany({ where: { matchId } });
  const CHUNK = 500;
  for (let i = 0; i < frames.length; i += CHUNK) {
    await prisma.matchFrame.createMany({ data: frames.slice(i, i + CHUNK) });
  }
  console.log(`Generated ${frames.length} frames for match ${matchId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
