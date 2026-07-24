/**
 * Generates MatchPlayerEvent + MatchFrame rows for a real match by running
 * its real MatchBallEvent stream through the shared team-shape simulator
 * (src/lib/team-shape-simulator.ts) - the same engine the live AI what-if
 * endpoint uses for hypothetical continuations. Match context (continuous
 * clock, attack direction, lineup-at-time) comes from
 * src/lib/match-sim-context.ts.
 *
 * Run with: pnpm seed:frames [matchId]  (defaults to 3857255, Japan vs Spain)
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client-factory';
import { buildMatchSimContext } from '../src/lib/match-sim-context';
import { simulateTeamShape } from '../src/lib/team-shape-simulator';

const DEFAULT_MATCH_ID = 3857255;

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const matchId = Number(process.argv[2] ?? DEFAULT_MATCH_ID);

  const ctx = await buildMatchSimContext(prisma, matchId);
  if (ctx.ballEvents.length === 0) {
    throw new Error(
      `No MatchBallEvent rows for match ${matchId} - run seed:ball-events first`,
    );
  }

  const { playerEvents, frames } = simulateTeamShape({
    ballEvents: ctx.ballEvents,
    teamIds: ctx.teamIds,
    getLineup: ctx.getLineupAt,
    attackDirection: ctx.attackDirection,
  });

  await prisma.matchPlayerEvent.deleteMany({ where: { matchId } });
  const CHUNK = 500;
  const playerEventRows = playerEvents.map((pe) => ({
    id: `${matchId}-${pe.playerId}-${pe.triggerBallEventId}`,
    matchId,
    ...pe,
  }));
  for (let i = 0; i < playerEventRows.length; i += CHUNK) {
    await prisma.matchPlayerEvent.createMany({ data: playerEventRows.slice(i, i + CHUNK) });
  }
  console.log(`Generated ${playerEventRows.length} player events for match ${matchId}`);

  await prisma.matchFrame.deleteMany({ where: { matchId } });
  const frameRows = frames.map((f, i) => ({
    id: `${matchId}-${i}`,
    matchId,
    t: f.t,
    period: f.period,
    minute: f.minute,
    second: f.second,
    ballX: f.ballX,
    ballY: f.ballY,
    players: JSON.stringify(f.players),
  }));
  for (let i = 0; i < frameRows.length; i += CHUNK) {
    await prisma.matchFrame.createMany({ data: frameRows.slice(i, i + CHUNK) });
  }
  console.log(`Generated ${frameRows.length} frames for match ${matchId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
