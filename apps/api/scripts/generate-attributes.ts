/**
 * Generates mock/constructed FIFA-style player attributes and team
 * tactical profiles. Explicitly NOT derived from real aggregate stats -
 * deterministic (seeded by id) so re-running is idempotent, with a base
 * range picked from each player's real `position` (GK/DF/MF/FW, from the
 * Wikipedia squad table) so ratings feel grounded even though the numbers
 * themselves are invented. Allowed as "구성 데이터" per contest rules.
 *
 * Run with: pnpm generate:attributes
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client-factory';

type PositionGroup = 'GK' | 'DEF' | 'MID' | 'FWD';

const POSITION_CODE_TO_GROUP: Record<string, PositionGroup> = {
  GK: 'GK',
  DF: 'DEF',
  MF: 'MID',
  FW: 'FWD',
};

const ATTRIBUTE_RANGES: Record<
  PositionGroup,
  Record<'pace' | 'shooting' | 'passing' | 'defending' | 'physical' | 'stamina', [number, number]>
> = {
  GK: {
    pace: [35, 60],
    shooting: [10, 30],
    passing: [40, 68],
    defending: [70, 92],
    physical: [60, 85],
    stamina: [55, 75],
  },
  DEF: {
    pace: [55, 82],
    shooting: [20, 48],
    passing: [55, 78],
    defending: [70, 93],
    physical: [65, 90],
    stamina: [65, 85],
  },
  MID: {
    pace: [60, 87],
    shooting: [45, 72],
    passing: [70, 93],
    defending: [45, 78],
    physical: [60, 85],
    stamina: [75, 96],
  },
  FWD: {
    pace: [70, 96],
    shooting: [70, 94],
    passing: [50, 78],
    defending: [18, 45],
    physical: [55, 85],
    stamina: [65, 88],
  },
};

/** Deterministic PRNG (mulberry32) seeded by an integer id, so re-runs are stable. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rangedInt(rand: () => number, [min, max]: [number, number]): number {
  return Math.round(min + rand() * (max - min));
}

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const players = await prisma.player.findMany({ select: { id: true, position: true } });
  const playerRows = players.map(({ id, position }) => {
    const group = POSITION_CODE_TO_GROUP[position] ?? 'MID';
    const rand = seededRandom(id);
    const ranges = ATTRIBUTE_RANGES[group];
    return {
      playerId: id,
      pace: rangedInt(rand, ranges.pace),
      shooting: rangedInt(rand, ranges.shooting),
      passing: rangedInt(rand, ranges.passing),
      defending: rangedInt(rand, ranges.defending),
      physical: rangedInt(rand, ranges.physical),
      stamina: rangedInt(rand, ranges.stamina),
    };
  });

  await prisma.playerAttributes.deleteMany({});
  const CHUNK = 500;
  for (let i = 0; i < playerRows.length; i += CHUNK) {
    await prisma.playerAttributes.createMany({ data: playerRows.slice(i, i + CHUNK) });
  }
  console.log(`Generated attributes for ${playerRows.length} players`);

  const teams = await prisma.team.findMany({ select: { id: true } });
  const teamRows = teams.map(({ id }) => {
    const rand = seededRandom(id * 7919); // distinct seed space from players
    return {
      teamId: id,
      pressingIntensity: rangedInt(rand, [30, 90]),
      possessionStyle: rangedInt(rand, [25, 85]),
      defensiveLine: rangedInt(rand, [30, 80]),
    };
  });
  await prisma.teamTacticalProfile.deleteMany({});
  await prisma.teamTacticalProfile.createMany({ data: teamRows });
  console.log(`Generated tactical profiles for ${teamRows.length} teams`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
