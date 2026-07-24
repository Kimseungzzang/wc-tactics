import { PrismaClient } from '@prisma/client';
import { buildMatchClock } from './match-clock';
import type { SimBallEvent, SimSnapshotPlayer } from './team-shape-simulator';

export interface MatchSimContext {
  teamIds: [number, number];
  ballEvents: SimBallEvent[]; // sorted by contStart, real events with continuous-time fields
  attackDirection: (teamId: number, period: number) => 1 | -1;
  getLineupAt: (teamId: number, minute: number, second: number) => SimSnapshotPlayer[];
  clock: (period: number, minute: number, second: number) => number;
}

const PITCH_LENGTH = 120;

/**
 * Builds the shared context (continuous clock, per-team attack direction,
 * lineup-at-time lookup) derived from a real match's stored events. Used
 * both by the offline frame seeder and the live AI what-if generator, so
 * a hypothetical continuation starts from the exact same real-world state.
 */
export async function buildMatchSimContext(
  prisma: PrismaClient,
  matchId: number,
): Promise<MatchSimContext> {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  const teamIds: [number, number] = [match.homeTeamId, match.awayTeamId];

  const rawBallEvents = await prisma.matchBallEvent.findMany({ where: { matchId } });
  const halfEnds = await prisma.matchEvent.findMany({
    where: { matchId, type: 'HALF_END' },
  });
  const clock = buildMatchClock(
    halfEnds.map((h) => ({ period: h.period, minute: h.minute, second: h.second })),
  );

  const ballEvents: SimBallEvent[] = rawBallEvents
    .map((e) => {
      const contStart = clock(e.period, e.minute, e.second);
      return {
        id: e.id,
        teamId: e.teamId,
        type: e.type,
        period: e.period,
        minute: e.minute,
        second: e.second,
        duration: e.duration,
        x: e.x,
        y: e.y,
        endX: e.endX,
        endY: e.endY,
        contStart,
        contEnd: contStart + Math.max(e.duration, 0.1),
        playerId: e.playerId,
        recipientId: e.recipientId,
      };
    })
    .sort((a, b) => a.contStart - b.contStart);

  const snapshots = await prisma.matchSnapshot.findMany({
    where: { matchId },
    orderBy: [{ minute: 'asc' }, { second: 'asc' }],
  });

  const period1Direction = new Map<number, 1 | -1>();
  for (const teamId of teamIds) {
    const firstSnap = snapshots.find((s) => s.teamId === teamId);
    const lineup: SimSnapshotPlayer[] = firstSnap ? JSON.parse(firstSnap.lineup) : [];
    const gk = lineup.find((p) => p.positionId === 1);
    let direction: 1 | -1 = 1;
    if (gk) {
      const gkEvents = rawBallEvents.filter(
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

  const snapshotIdxByTeam = new Map<number, number>(teamIds.map((id) => [id, -1]));
  function getLineupAt(teamId: number, minute: number, second: number): SimSnapshotPlayer[] {
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

  return { teamIds, ballEvents, attackDirection, getLineupAt, clock };
}
