/**
 * Seeds the local SQLite DB with real 2026 FIFA World Cup team/player data
 * sourced from Wikipedia (CC BY-SA 4.0 - commercially usable with
 * attribution). See wikipedia-2026-data.ts for the parsing/extraction
 * logic and team-pot-data.ts for the real draw-seeding pots/confederations.
 *
 * Career mode now generates its own group draw, schedule, and results per
 * campaign (see the draw/schedule services) rather than replaying a fixed
 * real 2026 bracket, so this script only seeds what's genuinely real and
 * shared across every campaign: the 48 teams (name/pot/confederation) and
 * their full rosters (name/jerseyNumber/real position). No Match/squad
 * rows are seeded here anymore - matches only exist once a campaign
 * generates them.
 *
 * Run with: pnpm seed:2026
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client-factory';
import { CODE_TO_NAME, fetchAllSquads } from './wikipedia-2026-data';
import { CONFEDERATION_BY_CODE, POT_BY_CODE } from './team-pot-data';

const prisma = createPrismaClient();

async function main() {
  console.log('Fetching Wikipedia squad data...');
  const squadsByCode = await fetchAllSquads();
  // fetchAllSquads already filters the document's section headers down to
  // real team codes (via NAME_TO_CODE), so its keys are exactly the 48
  // participating teams - no need to also fetch the 12 group-stage docs
  // just to re-derive the same code list.
  const codeOrder = Object.keys(squadsByCode);

  if (codeOrder.length !== 48) {
    throw new Error(`Expected 48 teams from squads doc, got ${codeOrder.length}`);
  }
  const missingPot = codeOrder.filter((c) => !POT_BY_CODE[c]);
  if (missingPot.length > 0) {
    throw new Error(`No pot/confederation data found for: ${missingPot.join(', ')}`);
  }

  console.log(`Seeding ${codeOrder.length} teams...`);
  const teamIdByCode = new Map<string, number>();
  let nextTeamId = 1;
  for (const code of codeOrder) {
    const id = nextTeamId++;
    teamIdByCode.set(code, id);
    await prisma.team.upsert({
      where: { id },
      create: {
        id,
        name: CODE_TO_NAME[code],
        pot: POT_BY_CODE[code],
        confederation: CONFEDERATION_BY_CODE[code],
      },
      update: {
        name: CODE_TO_NAME[code],
        pot: POT_BY_CODE[code],
        confederation: CONFEDERATION_BY_CODE[code],
      },
    });
  }

  console.log('Seeding players...');
  let nextPlayerId = 1;
  let playerCount = 0;
  for (const code of codeOrder) {
    const teamId = teamIdByCode.get(code)!;
    for (const p of squadsByCode[code].players) {
      const id = nextPlayerId++;
      playerCount++;
      await prisma.player.upsert({
        where: { id },
        create: {
          id,
          name: p.name,
          teamId,
          jerseyNumber: p.jerseyNumber,
          position: p.position,
        },
        update: {
          name: p.name,
          teamId,
          jerseyNumber: p.jerseyNumber,
          position: p.position,
        },
      });
    }
  }

  console.log(`Done: ${teamIdByCode.size} teams, ${playerCount} players.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
