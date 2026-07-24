/**
 * Seeds real, location-bearing StatsBomb events (Pass/Carry/Shot/Duel/...)
 * for a single match into MatchBallEvent. This is the ground-truth ball
 * path used by the frame simulator (scripts/simulate-frames.ts) - never
 * fabricated, unlike the off-ball player movement it drives.
 *
 * Run with: pnpm seed:ball-events [matchId]  (defaults to 3857255, Japan vs Spain)
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client-factory';
import { fetchEvents } from './statsbomb-fetch';
import type { SbEvent } from './statsbomb-types';

const DEFAULT_MATCH_ID = 3857255;

interface BallEventRow {
  id: string;
  matchId: number;
  teamId: number;
  type: string;
  period: number;
  minute: number;
  second: number;
  duration: number;
  playerId: number | null;
  playerName: string | null;
  recipientId: number | null;
  recipientName: string | null;
  x: number;
  y: number;
  endX: number | null;
  endY: number | null;
  outcome: string | null;
}

function extractEndLocation(e: SbEvent): [number, number] | null {
  if (e.type.name === 'Pass' && e.pass?.end_location) return e.pass.end_location;
  if (e.type.name === 'Carry' && e.carry?.end_location) return e.carry.end_location;
  if (e.type.name === 'Shot' && e.shot?.end_location) {
    return [e.shot.end_location[0], e.shot.end_location[1]];
  }
  return null;
}

function extractOutcome(e: SbEvent): string | null {
  switch (e.type.name) {
    case 'Pass':
      return e.pass?.outcome?.name ?? 'Complete';
    case 'Shot':
      return e.shot?.outcome?.name ?? null;
    case 'Dribble':
      return e.dribble?.outcome?.name ?? null;
    case 'Duel':
      return e.duel?.type?.name ?? e.duel?.outcome?.name ?? null;
    case 'Interception':
      return e.interception?.outcome?.name ?? null;
    default:
      return null;
  }
}

const prisma = createPrismaClient();

async function seedBallEvents(matchId: number): Promise<void> {
  const events = await fetchEvents<SbEvent[]>(matchId);
  const withLocation = events.filter((e) => e.location && e.team);

  const rows: BallEventRow[] = withLocation.map((e) => {
    const end = extractEndLocation(e);
    const isPass = e.type.name === 'Pass';
    return {
      id: e.id,
      matchId,
      teamId: e.team!.id,
      type: e.type.name,
      period: e.period,
      minute: e.minute,
      second: e.second,
      duration: e.duration ?? 0,
      playerId: e.player?.id ?? null,
      playerName: e.player?.name ?? null,
      recipientId: isPass ? (e.pass?.recipient?.id ?? null) : null,
      recipientName: isPass ? (e.pass?.recipient?.name ?? null) : null,
      x: e.location![0],
      y: e.location![1],
      endX: end?.[0] ?? null,
      endY: end?.[1] ?? null,
      outcome: extractOutcome(e),
    };
  });

  await prisma.matchBallEvent.deleteMany({ where: { matchId } });
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.matchBallEvent.createMany({ data: rows.slice(i, i + CHUNK) });
  }
  console.log(`Seeded ${rows.length} ball events for match ${matchId}`);
}

async function main(): Promise<void> {
  const matchId = Number(process.argv[2] ?? DEFAULT_MATCH_ID);
  await seedBallEvents(matchId);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
