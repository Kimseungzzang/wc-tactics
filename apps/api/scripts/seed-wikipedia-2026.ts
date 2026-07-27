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
import { fetchAllSquads } from './wikipedia-2026-data';
import {
  CONFEDERATION_BY_CODE,
  FIFA_RANK_BY_CODE,
  KOREAN_TEAM_NAME_BY_CODE,
  POT_BY_CODE,
} from './team-pot-data';
import { transliterateName } from './transliterate-name';

// South Korea's squad is the one roster where the Wikipedia Latin name is
// itself just a romanization of a real Hangul name - the generic
// transliterator (tuned for reading foreign names, not reversing Korean
// romanization) mangles these, so they're hand-mapped instead. Not every
// KOR squad member is guaranteed to appear here across future re-seeds if
// the roster changes; anyone missing falls back to the generic
// transliterator like every other team.
const KOREAN_PLAYER_NAME_OVERRIDES: Record<string, string> = {
  'Kim Seung-gyu': '김승규',
  'Lee Han-beom': '이한범',
  'Lee Gi-hyuk': '이기혁',
  'Kim Min-jae': '김민재',
  'Kim Tae-hyeon': '김태현',
  'Hwang In-beom': '황인범',
  'Son Heung-min': '손흥민',
  'Paik Seung-ho': '백승호',
  'Cho Gue-sung': '조규성',
  'Lee Jae-sung': '이재성',
  'Hwang Hee-chan': '황희찬',
  'Song Bum-keun': '송범근',
  'Lee Tae-seok': '이태석',
  'Cho Wi-je': '조위제',
  'Kim Moon-hwan': '김문환',
  'Park Jin-seob': '박진섭',
  'Bae Jun-ho': '배준호',
  'Oh Hyeon-gyu': '오현규',
  'Lee Kang-in': '이강인',
  'Yang Hyun-jun': '양현준',
  'Jo Hyeon-woo': '조현우',
  'Seol Young-woo': '설영우',
  'Jens Castrop': '옌스 카스트롭',
  'Kim Jin-gyu': '김진규',
  'Eom Ji-sung': '엄지성',
  'Lee Dong-gyeong': '이동경',
};

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
    throw new Error(
      `Expected 48 teams from squads doc, got ${codeOrder.length}`,
    );
  }
  const missingPot = codeOrder.filter((c) => !POT_BY_CODE[c]);
  if (missingPot.length > 0) {
    throw new Error(
      `No pot/confederation data found for: ${missingPot.join(', ')}`,
    );
  }
  const missingRank = codeOrder.filter((c) => !FIFA_RANK_BY_CODE[c]);
  if (missingRank.length > 0) {
    throw new Error(
      `No FIFA ranking data found for: ${missingRank.join(', ')}`,
    );
  }
  const missingKoreanName = codeOrder.filter(
    (c) => !KOREAN_TEAM_NAME_BY_CODE[c],
  );
  if (missingKoreanName.length > 0) {
    throw new Error(
      `No Korean team name found for: ${missingKoreanName.join(', ')}`,
    );
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
        name: KOREAN_TEAM_NAME_BY_CODE[code],
        pot: POT_BY_CODE[code],
        confederation: CONFEDERATION_BY_CODE[code],
        fifaRank: FIFA_RANK_BY_CODE[code],
      },
      update: {
        name: KOREAN_TEAM_NAME_BY_CODE[code],
        pot: POT_BY_CODE[code],
        confederation: CONFEDERATION_BY_CODE[code],
        fifaRank: FIFA_RANK_BY_CODE[code],
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
      const koreanName =
        KOREAN_PLAYER_NAME_OVERRIDES[p.name] ?? transliterateName(p.name);
      await prisma.player.upsert({
        where: { id },
        create: {
          id,
          name: koreanName,
          teamId,
          jerseyNumber: p.jerseyNumber,
          position: p.position,
        },
        update: {
          name: koreanName,
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
