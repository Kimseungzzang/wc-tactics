/**
 * Seeds the local SQLite DB with FIFA World Cup 2022 data
 * (StatsBomb Open Data: competition_id=43, season_id=106).
 *
 * Run with: pnpm seed
 *
 * Only timeline-relevant events are persisted (Starting XI, Tactical Shift,
 * Substitution, Goal, Own Goal, Card, Half End) rather than the full
 * StatsBomb event stream (~3000 events/match), since the app only needs
 * "who was on the pitch and in what formation at minute N" plus markers
 * for the match timeline UI.
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client-factory';
import { fetchEvents, fetchLineups, fetchMatches } from './statsbomb-fetch';
import type {
  SbEvent,
  SbLineupTeam,
  SbMatch,
  SbTacticsLineupEntry,
} from './statsbomb-types';

const COMPETITION_ID = 43;
const SEASON_ID = 106; // 2022 World Cup

interface SnapshotPlayer {
  playerId: number;
  name: string;
  jerseyNumber: number;
  positionId: number;
  positionName: string;
}

function formatFormation(code: number): string {
  return code.toString().split('').join('-');
}

function toSnapshotPlayers(
  lineup: SbTacticsLineupEntry[],
): SnapshotPlayer[] {
  return lineup.map((l) => ({
    playerId: l.player.id,
    name: l.player.name,
    jerseyNumber: l.jersey_number,
    positionId: l.position.id,
    positionName: l.position.name,
  }));
}

const prisma = createPrismaClient();
const seenTeamIds = new Set<number>();
const seenPlayerIds = new Set<number>();

async function upsertTeam(id: number, name: string): Promise<void> {
  if (seenTeamIds.has(id)) return;
  seenTeamIds.add(id);
  await prisma.team.upsert({
    where: { id },
    create: { id, name },
    update: { name },
  });
}

async function upsertPlayer(id: number, name: string): Promise<void> {
  if (seenPlayerIds.has(id)) return;
  seenPlayerIds.add(id);
  await prisma.player.upsert({
    where: { id },
    create: { id, name },
    update: { name },
  });
}

async function seedMatch(sbMatch: SbMatch): Promise<void> {
  const matchId = sbMatch.match_id;

  const alreadySeeded = await prisma.match.findUnique({
    where: { id: matchId },
  });
  if (alreadySeeded) {
    console.log(`match ${matchId} already seeded, skipping`);
    return;
  }

  const homeTeamId = sbMatch.home_team.home_team_id!;
  const awayTeamId = sbMatch.away_team.away_team_id!;

  await upsertTeam(homeTeamId, sbMatch.home_team.home_team_name!);
  await upsertTeam(awayTeamId, sbMatch.away_team.away_team_name!);

  await prisma.match.upsert({
    where: { id: matchId },
    create: {
      id: matchId,
      matchDate: sbMatch.match_date,
      kickOff: sbMatch.kick_off,
      stadiumName: sbMatch.stadium?.name,
      competitionStage: sbMatch.competition_stage?.name,
      matchWeek: sbMatch.match_week,
      homeManagerName: sbMatch.home_team.managers?.[0]?.name,
      awayManagerName: sbMatch.away_team.managers?.[0]?.name,
      refereeName: sbMatch.referee?.name,
      homeTeamId,
      awayTeamId,
      homeScore: sbMatch.home_score,
      awayScore: sbMatch.away_score,
    },
    update: {},
  });

  const [lineups, events] = await Promise.all([
    fetchLineups<SbLineupTeam[]>(matchId),
    fetchEvents<SbEvent[]>(matchId),
  ]);

  const jerseyByPlayer = new Map<number, number>();
  for (const team of lineups) {
    for (const p of team.lineup) {
      jerseyByPlayer.set(p.player_id, p.jersey_number);
    }
  }

  const startingXiEvents = events.filter((e) => e.type.name === 'Starting XI');
  const starterIdsByTeam = new Map<number, Set<number>>();
  for (const e of startingXiEvents) {
    if (!e.team || !e.tactics) continue;
    starterIdsByTeam.set(
      e.team.id,
      new Set(e.tactics.lineup.map((l) => l.player.id)),
    );
  }

  const squadRows: {
    id: string;
    matchId: number;
    teamId: number;
    playerId: number;
    jerseyNumber: number;
    isStarter: boolean;
  }[] = [];
  for (const team of lineups) {
    for (const p of team.lineup) {
      await upsertPlayer(p.player_id, p.player_name);
      squadRows.push({
        id: `${matchId}-${p.player_id}`,
        matchId,
        teamId: team.team_id,
        playerId: p.player_id,
        jerseyNumber: p.jersey_number,
        isStarter: starterIdsByTeam.get(team.team_id)?.has(p.player_id) ?? false,
      });
    }
  }
  if (squadRows.length > 0) {
    await prisma.matchSquad.createMany({ data: squadRows });
  }

  const eventById = new Map(events.map((e) => [e.id, e]));
  const runningSnapshot = new Map<
    number,
    { formation: string; lineup: SnapshotPlayer[] }
  >();

  const matchEventRows: {
    id: string;
    matchId: number;
    teamId: number | null;
    type:
      | 'STARTING_XI'
      | 'TACTICAL_SHIFT'
      | 'SUBSTITUTION'
      | 'GOAL'
      | 'OWN_GOAL'
      | 'CARD'
      | 'HALF_END';
    period: number;
    minute: number;
    second: number;
    payload: string;
  }[] = [];
  const snapshotRows: {
    id: string;
    matchId: number;
    teamId: number;
    minute: number;
    second: number;
    formation: string;
    lineup: string;
  }[] = [];

  const sorted = [...events].sort((a, b) => a.index - b.index);

  for (const e of sorted) {
    switch (e.type.name) {
      case 'Starting XI':
      case 'Tactical Shift': {
        if (!e.team || !e.tactics) break;
        const formation = formatFormation(e.tactics.formation);
        const lineup = toSnapshotPlayers(e.tactics.lineup);
        runningSnapshot.set(e.team.id, { formation, lineup });
        matchEventRows.push({
          id: e.id,
          matchId,
          teamId: e.team.id,
          type: e.type.name === 'Starting XI' ? 'STARTING_XI' : 'TACTICAL_SHIFT',
          period: e.period,
          minute: e.minute,
          second: e.second,
          payload: JSON.stringify({ formation, lineup }),
        });
        snapshotRows.push({
          id: `${e.id}-snap`,
          matchId,
          teamId: e.team.id,
          minute: e.minute,
          second: e.second,
          formation,
          lineup: JSON.stringify(lineup),
        });
        break;
      }
      case 'Substitution': {
        if (!e.team || !e.player || !e.substitution) break;
        const outPlayer = e.player;
        const inPlayer = e.substitution.replacement;
        matchEventRows.push({
          id: e.id,
          matchId,
          teamId: e.team.id,
          type: 'SUBSTITUTION',
          period: e.period,
          minute: e.minute,
          second: e.second,
          payload: JSON.stringify({
            outPlayerId: outPlayer.id,
            outName: outPlayer.name,
            inPlayerId: inPlayer.id,
            inName: inPlayer.name,
            positionId: e.position?.id,
            positionName: e.position?.name,
          }),
        });

        const current = runningSnapshot.get(e.team.id);
        if (current) {
          const newLineup = current.lineup.map((pl) =>
            pl.playerId === outPlayer.id
              ? {
                  ...pl,
                  playerId: inPlayer.id,
                  name: inPlayer.name,
                  jerseyNumber: jerseyByPlayer.get(inPlayer.id) ?? 0,
                }
              : pl,
          );
          runningSnapshot.set(e.team.id, {
            formation: current.formation,
            lineup: newLineup,
          });
          snapshotRows.push({
            id: `${e.id}-snap`,
            matchId,
            teamId: e.team.id,
            minute: e.minute,
            second: e.second,
            formation: current.formation,
            lineup: JSON.stringify(newLineup),
          });
        }
        break;
      }
      case 'Shot': {
        if (e.shot?.outcome?.name === 'Goal' && e.team && e.player) {
          matchEventRows.push({
            id: e.id,
            matchId,
            teamId: e.team.id,
            type: 'GOAL',
            period: e.period,
            minute: e.minute,
            second: e.second,
            payload: JSON.stringify({
              playerId: e.player.id,
              name: e.player.name,
              xg: e.shot.statsbomb_xg,
            }),
          });
        }
        break;
      }
      case 'Own Goal For': {
        if (!e.team) break;
        const relatedId = e.related_events?.[0];
        const related = relatedId ? eventById.get(relatedId) : undefined;
        matchEventRows.push({
          id: e.id,
          matchId,
          teamId: e.team.id,
          type: 'OWN_GOAL',
          period: e.period,
          minute: e.minute,
          second: e.second,
          payload: JSON.stringify({
            playerId: related?.player?.id,
            name: related?.player?.name,
          }),
        });
        break;
      }
      case 'Foul Committed': {
        if (e.foul_committed?.card && e.team && e.player) {
          matchEventRows.push({
            id: e.id,
            matchId,
            teamId: e.team.id,
            type: 'CARD',
            period: e.period,
            minute: e.minute,
            second: e.second,
            payload: JSON.stringify({
              playerId: e.player.id,
              name: e.player.name,
              cardType: e.foul_committed.card.name,
            }),
          });
        }
        break;
      }
      case 'Half End': {
        matchEventRows.push({
          id: e.id,
          matchId,
          teamId: e.team?.id ?? null,
          type: 'HALF_END',
          period: e.period,
          minute: e.minute,
          second: e.second,
          payload: '{}',
        });
        break;
      }
      default:
        break;
    }
  }

  if (matchEventRows.length > 0) {
    await prisma.matchEvent.createMany({ data: matchEventRows });
  }
  if (snapshotRows.length > 0) {
    await prisma.matchSnapshot.createMany({ data: snapshotRows });
  }
}

async function main(): Promise<void> {
  const matches = await fetchMatches<SbMatch[]>(COMPETITION_ID, SEASON_ID);
  console.log(`Fetched ${matches.length} matches for WC ${SEASON_ID}`);

  let done = 0;
  for (const sbMatch of matches) {
    try {
      await seedMatch(sbMatch);
      done += 1;
      console.log(
        `[${done}/${matches.length}] seeded match ${sbMatch.match_id}: ` +
          `${sbMatch.home_team.home_team_name} ${sbMatch.home_score}-${sbMatch.away_score} ${sbMatch.away_team.away_team_name}`,
      );
    } catch (err) {
      console.error(`Failed to seed match ${sbMatch.match_id}:`, err);
    }
  }

  const [teamCount, playerCount, matchCount, eventCount, snapshotCount] =
    await Promise.all([
      prisma.team.count(),
      prisma.player.count(),
      prisma.match.count(),
      prisma.matchEvent.count(),
      prisma.matchSnapshot.count(),
    ]);
  console.log({ teamCount, playerCount, matchCount, eventCount, snapshotCount });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
