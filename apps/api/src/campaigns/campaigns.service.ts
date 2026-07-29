import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assignFormationLineup,
  defaultStartingXi,
  DEFAULT_MOCK_FORMATION,
  FORMATION_POSITION_IDS,
} from '../lib/formation-lineup';
import {
  breakKnockoutTie,
  drawGroups,
  GROUP_LETTERS,
  groupRoundRobinFixtures,
  pickGoalScorers,
  seededRandom,
  shuffle,
  simulateBackgroundScore,
  type DrawTeam,
  type GoalScorerCandidate,
} from './group-draw';

// Only the "win to keep going" chain - the 3rd Place Final is a
// consolation match and isn't part of tournament advancement.
const STAGE_ORDER = [
  'Group Stage',
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Final',
];

type Outcome = 'WIN' | 'DRAW' | 'LOSS';

interface StandingMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  played: boolean;
}

interface MatchLike {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
}

function outcomeFor(teamId: number, match: MatchLike): Outcome {
  const isHome = match.homeTeamId === teamId;
  const forScore = isHome ? match.homeScore : match.awayScore;
  const againstScore = isHome ? match.awayScore : match.homeScore;
  if (forScore > againstScore) return 'WIN';
  if (forScore < againstScore) return 'LOSS';
  return 'DRAW';
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Shuffles teamIds into consecutive pairs, retrying the whole shuffle
 * (like group-draw.ts's drawGroups) whenever a pair would put two teams
 * from the same original group stage group against each other again -
 * real World Cup brackets are seeded specifically to avoid an immediate
 * Round of 32 rematch of group-stage opponents, which a plain shuffle
 * doesn't guarantee. Falls back to the last (unconstrained) shuffle if
 * every attempt fails, rather than never generating a bracket at all.
 */
function pairAvoidingSameGroup(
  teamIds: number[],
  groupOf: Map<number, number>,
  rand: () => number,
  maxAttempts = 200,
): [number, number][] {
  let lastShuffled = teamIds;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(teamIds, rand);
    lastShuffled = shuffled;
    const pairs: [number, number][] = [];
    let ok = true;
    for (let i = 0; i < shuffled.length; i += 2) {
      if (groupOf.get(shuffled[i]) === groupOf.get(shuffled[i + 1])) {
        ok = false;
        break;
      }
      pairs.push([shuffled[i], shuffled[i + 1]]);
    }
    if (ok) return pairs;
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < lastShuffled.length; i += 2)
    pairs.push([lastShuffled[i], lastShuffled[i + 1]]);
  return pairs;
}

function computeStandingsForGroupTeams(
  matches: StandingMatch[],
  groupTeamIds: number[],
  teamNameById: Map<number, string>,
): GroupStandingRow[] {
  const rows = new Map<number, GroupStandingRow>(
    groupTeamIds.map((id) => [
      id,
      {
        teamId: id,
        teamName: teamNameById.get(id) ?? '알 수 없는 팀',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      },
    ]),
  );

  for (const m of matches) {
    if (!m.played) continue;
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (m.homeScore < m.awayScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows.values())
    row.goalDifference = row.goalsFor - row.goalsAgainst;

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor,
  );
}

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async login(nickname: string) {
    const trimmed = nickname.trim();
    if (!trimmed) throw new BadRequestException('nickname is required');
    const manager = await this.prisma.manager.upsert({
      where: { nickname: trimmed },
      update: {},
      create: { nickname: trimmed },
    });
    return { managerId: manager.id, nickname: manager.nickname };
  }

  async listManagerCampaigns(managerId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { managerId },
      include: { team: true },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      campaigns.map(async (c) => {
        const record = await this.computeRecord(c.id, c.teamId);
        return {
          campaignId: c.id,
          teamId: c.teamId,
          teamName: c.team.name,
          record,
        };
      }),
    );
  }

  async createCampaign(managerId: string, teamId: number) {
    const manager = await this.prisma.manager.findUnique({
      where: { id: managerId },
    });
    if (!manager)
      throw new NotFoundException(`Manager not found: id=${managerId}`);
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException(`Team not found: id=${teamId}`);

    let campaign = await this.prisma.campaign.findUnique({
      where: { managerId_teamId: { managerId, teamId } },
    });
    if (!campaign) {
      campaign = await this.prisma.campaign.create({
        data: { managerId, teamId },
      });
      await this.generateGroupStage(campaign.id);
    }
    return this.getCampaign(campaign.id);
  }

  async getCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { team: true, manager: true },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const playedMatches = await this.prisma.match.findMany({
      where: {
        campaignId,
        played: true,
        OR: [{ homeTeamId: campaign.teamId }, { awayTeamId: campaign.teamId }],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { id: 'asc' },
    });

    const fixtures = playedMatches.map((m) => {
      const isHome = m.homeTeamId === campaign.teamId;
      const opponent = isHome ? m.awayTeam : m.homeTeam;
      return {
        matchId: m.id,
        opponentName: opponent.name,
        stage: m.competitionStage,
        matchWeek: m.matchWeek,
        result: {
          myScore: isHome ? m.homeScore : m.awayScore,
          opponentScore: isHome ? m.awayScore : m.homeScore,
          outcome: outcomeFor(campaign.teamId, m),
          penalty:
            m.homePenalty != null && m.awayPenalty != null
              ? {
                  myScore: isHome ? m.homePenalty : m.awayPenalty,
                  opponentScore: isHome ? m.awayPenalty : m.homePenalty,
                }
              : null,
        },
      };
    });

    const record = this.recordFromOutcomes(
      fixtures.map((f) => f.result.outcome),
    );
    // Must run before getGroupStandings: resolving the next match is what
    // simulates the current matchday's background games (see
    // ensureGroupMatchdaySimulated) - the standings table should already
    // reflect "today's" results across the group by the time it's read.
    const { match: nextMatch, eliminated } = await this.resolveNextMatch(
      campaign.teamId,
      campaignId,
    );
    const groupStandings = await this.getGroupStandings(
      campaign.teamId,
      campaignId,
    );

    let nextMatchInfo: {
      matchId: number;
      opponentName: string;
      stage: string;
      matchWeek: number;
    } | null = null;
    if (nextMatch) {
      const opponentTeamId =
        nextMatch.homeTeamId === campaign.teamId
          ? nextMatch.awayTeamId
          : nextMatch.homeTeamId;
      const opponent = await this.prisma.team.findUnique({
        where: { id: opponentTeamId },
      });
      nextMatchInfo = {
        matchId: nextMatch.id,
        opponentName: opponent?.name ?? '알 수 없는 팀',
        stage: nextMatch.competitionStage,
        matchWeek: nextMatch.matchWeek,
      };
    }

    return {
      id: campaign.id,
      teamId: campaign.teamId,
      teamName: campaign.team.name,
      managerNickname: campaign.manager.nickname,
      fixtures,
      nextMatch: nextMatchInfo,
      record,
      eliminated,
      groupStandings,
    };
  }

  /** All 12 groups (letters assigned fresh for display, not persisted -
   * see computeGroupPartition's doc comment) with real team names, for
   * the post-draw reveal screen. */
  async getFullDraw(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const groups = await this.computeGroupPartition(campaignId);
    const teams = await this.prisma.team.findMany({
      where: { id: { in: groups.flat() } },
    });
    const teamById = new Map(teams.map((t) => [t.id, t]));

    return groups.map((teamIds, i) => ({
      letter: GROUP_LETTERS[i],
      teams: teamIds.map((id) => ({
        id,
        name: teamById.get(id)?.name ?? '알 수 없는 팀',
      })),
    }));
  }

  /** Standings for all 12 groups at once (not just the manager's own) -
   * for the "다른 조 순위" modal. Reuses the same per-group computation
   * getGroupStandings uses internally. */
  async getAllGroupStandings(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const groups = await this.computeGroupPartition(campaignId);
    const allTeamIds = groups.flat();
    const [matches, teams] = await Promise.all([
      this.prisma.match.findMany({
        where: { campaignId, competitionStage: 'Group Stage' },
      }),
      this.prisma.team.findMany({ where: { id: { in: allTeamIds } } }),
    ]);
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

    return groups.map((groupTeamIds, i) => ({
      letter: GROUP_LETTERS[i],
      standings: computeStandingsForGroupTeams(
        matches,
        groupTeamIds,
        teamNameById,
      ),
    }));
  }

  /**
   * Every match on the manager's own team's calendar, in chronological
   * (matchWeek) order, played or not - for the date-based schedule view.
   * Frontend maps `matchWeek` to a real calendar date (see
   * lib/matchdayDates.ts) since matches no longer carry a real date.
   */
  async getSchedule(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const matches = await this.prisma.match.findMany({
      where: {
        campaignId,
        OR: [{ homeTeamId: campaign.teamId }, { awayTeamId: campaign.teamId }],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ matchWeek: 'asc' }, { id: 'asc' }],
    });

    return matches.map((m) => {
      const isHome = m.homeTeamId === campaign.teamId;
      const opponent = isHome ? m.awayTeam : m.homeTeam;
      return {
        matchId: m.id,
        matchWeek: m.matchWeek,
        stage: m.competitionStage,
        opponentName: opponent.name,
        played: m.played,
        result: m.played
          ? {
              myScore: isHome ? m.homeScore : m.awayScore,
              opponentScore: isHome ? m.awayScore : m.homeScore,
              outcome: outcomeFor(campaign.teamId, m),
              penalty:
                m.homePenalty != null && m.awayPenalty != null
                  ? {
                      myScore: isHome ? m.homePenalty : m.awayPenalty,
                      opponentScore: isHome ? m.awayPenalty : m.homePenalty,
                    }
                  : null,
            }
          : null,
      };
    });
  }

  /**
   * Every knockout-stage match generated so far (see ensureKnockoutRound),
   * grouped by stage in STAGE_ORDER order - for the persistent tournament
   * bracket view. Only stages that already have at least one match are
   * included, so this naturally stops at whatever round the manager's own
   * campaign has reached (a team eliminated in the Round of 16 never
   * causes the Quarter-finals to be generated - see resolveNextMatch).
   * Group Stage is deliberately excluded (that's still shown via
   * getGroupStandings/getAllGroupStandings).
   */
  async getKnockoutBracket(campaignId: string): Promise<BracketStageBlock[]> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const matches = await this.prisma.match.findMany({
      where: { campaignId, competitionStage: { not: 'Group Stage' } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { id: 'asc' },
    });

    const byStage = new Map<string, typeof matches>();
    for (const m of matches) {
      if (!byStage.has(m.competitionStage)) byStage.set(m.competitionStage, []);
      byStage.get(m.competitionStage)!.push(m);
    }

    return STAGE_ORDER.filter((stage) => byStage.has(stage)).map((stage) => ({
      stage,
      matches: byStage.get(stage)!.map((m) => ({
        id: m.id,
        matchWeek: m.matchWeek,
        homeTeamId: m.homeTeamId,
        homeTeamName: m.homeTeam.name,
        awayTeamId: m.awayTeamId,
        awayTeamName: m.awayTeam.name,
        played: m.played,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homePenalty: m.homePenalty,
        awayPenalty: m.awayPenalty,
        winnerTeamId: !m.played
          ? null
          : m.homeScore > m.awayScore
            ? m.homeTeamId
            : m.awayScore > m.homeScore
              ? m.awayTeamId
              : null,
      })),
    }));
  }

  /**
   * Leaderboard for every manager who ever started a career with this
   * team - comparing across different teams wouldn't be meaningful
   * (team strength varies too much), so rankings only ever compare
   * managers who picked the same team. Sorted by furthest stage reached
   * (a played match at that stage is enough - still in progress or
   * already eliminated there both count the same), then goal difference,
   * then wins. Deliberately side-effect-free (unlike getCampaign, this
   * never triggers ensureGroupMatchdaySimulated/ensureKnockoutRound) -
   * a leaderboard view shouldn't mutate other managers' campaigns.
   */
  async getTeamRankings(teamId: number) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException(`Team not found: id=${teamId}`);

    const campaigns = await this.prisma.campaign.findMany({
      where: { teamId },
      include: { manager: true },
    });

    const rows = await Promise.all(
      campaigns.map(async (c) => {
        const matches = await this.prisma.match.findMany({
          where: {
            campaignId: c.id,
            played: true,
            OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
          },
        });
        let wins = 0;
        let draws = 0;
        let losses = 0;
        let goalsFor = 0;
        let goalsAgainst = 0;
        let maxStageIndex = -1;
        for (const m of matches) {
          const isHome = m.homeTeamId === teamId;
          const forScore = isHome ? m.homeScore : m.awayScore;
          const againstScore = isHome ? m.awayScore : m.homeScore;
          goalsFor += forScore;
          goalsAgainst += againstScore;
          if (forScore > againstScore) wins += 1;
          else if (forScore < againstScore) losses += 1;
          else draws += 1;
          const stageIndex = STAGE_ORDER.indexOf(m.competitionStage);
          if (stageIndex > maxStageIndex) maxStageIndex = stageIndex;
        }
        return {
          campaignId: c.id,
          managerNickname: c.manager.nickname,
          wins,
          draws,
          losses,
          goalDifference: goalsFor - goalsAgainst,
          maxStage: maxStageIndex >= 0 ? STAGE_ORDER[maxStageIndex] : null,
          maxStageIndex,
        };
      }),
    );

    rows.sort(
      (a, b) =>
        b.maxStageIndex - a.maxStageIndex ||
        b.goalDifference - a.goalDifference ||
        b.wins - a.wins,
    );

    return rows.map((r, i) => ({
      rank: i + 1,
      campaignId: r.campaignId,
      managerNickname: r.managerNickname,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalDifference: r.goalDifference,
      maxStage: r.maxStage,
    }));
  }

  async recordResult(campaignId: string, dto: RecordResultInput) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
    });
    if (!match || match.campaignId !== campaignId) {
      throw new NotFoundException(
        `Match not found in this campaign: id=${dto.matchId}`,
      );
    }
    if (
      match.homeTeamId !== campaign.teamId &&
      match.awayTeamId !== campaign.teamId
    ) {
      throw new BadRequestException(
        'This match does not involve the campaign team',
      );
    }

    const { match: expected } = await this.resolveNextMatch(
      campaign.teamId,
      campaignId,
    );
    if (!expected || expected.id !== dto.matchId) {
      throw new BadRequestException(
        "This is not the campaign's current next match",
      );
    }

    let { homeScore, awayScore } = dto;
    let homePenalty: number | null = null;
    let awayPenalty: number | null = null;
    if (match.competitionStage !== 'Group Stage' && homeScore === awayScore) {
      if (dto.shootoutHomeScore != null && dto.shootoutAwayScore != null) {
        homePenalty = dto.shootoutHomeScore;
        awayPenalty = dto.shootoutAwayScore;
        [homeScore, awayScore] =
          homePenalty > awayPenalty
            ? [homeScore + 1, awayScore]
            : [homeScore, awayScore + 1];
      } else {
        // The frontend's PenaltyShootout flow always supplies a shootout
        // score for a knockout draw - this is just a safety net in case it
        // somehow didn't.
        [homeScore, awayScore] = breakKnockoutTie(
          homeScore,
          awayScore,
          Math.random,
        );
      }
    }

    await this.prisma.match.update({
      where: { id: dto.matchId },
      data: { played: true, homeScore, awayScore, homePenalty, awayPenalty },
    });

    return this.getCampaign(campaignId);
  }

  /**
   * Lets the campaign's manager pick a formation + starting XI before
   * kickoff of one of their own matches - every match now goes through
   * this (there's no "real" lineup source anymore). Also auto-assigns the
   * opponent's default XI and seeds the single synthetic kickoff
   * MatchBallEvent the AI what-if generator needs to resume from, the
   * first time either is missing for this match.
   */
  async submitLineup(campaignId: string, dto: SubmitLineupInput) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
    });
    if (!match || match.campaignId !== campaignId) {
      throw new NotFoundException(
        `Match not found in this campaign: id=${dto.matchId}`,
      );
    }
    if (
      match.homeTeamId !== campaign.teamId &&
      match.awayTeamId !== campaign.teamId
    ) {
      throw new BadRequestException(
        'This match does not involve the campaign team',
      );
    }

    const { match: expected } = await this.resolveNextMatch(
      campaign.teamId,
      campaignId,
    );
    if (!expected || expected.id !== dto.matchId) {
      throw new BadRequestException(
        "This is not the campaign's current next match",
      );
    }

    const chosenIds = [dto.goalkeeperPlayerId, ...dto.outfieldPlayerIds];
    if (new Set(chosenIds).size !== 11) {
      throw new BadRequestException('Starting XI must be 11 distinct players');
    }

    const mySquad = await this.prisma.player.findMany({
      where: { teamId: campaign.teamId, id: { in: chosenIds } },
    });
    if (mySquad.length !== 11) {
      throw new BadRequestException(
        'One or more chosen players are not on this squad',
      );
    }
    const squadById = new Map(mySquad.map((p) => [p.id, p]));

    const orderedPlayers = chosenIds.map((playerId) => {
      const p = squadById.get(playerId)!;
      return { playerId, name: p.name, jerseyNumber: p.jerseyNumber };
    });
    const lineup = assignFormationLineup(orderedPlayers, dto.formation);

    await this.prisma.matchSnapshot.deleteMany({
      where: { matchId: dto.matchId, teamId: campaign.teamId },
    });
    await this.prisma.matchSnapshot.create({
      data: {
        matchId: dto.matchId,
        teamId: campaign.teamId,
        minute: 0,
        second: 0,
        formation: dto.formation,
        lineup: JSON.stringify(lineup),
      },
    });

    const opponentTeamId =
      match.homeTeamId === campaign.teamId
        ? match.awayTeamId
        : match.homeTeamId;
    const existingOpponentSnapshot = await this.prisma.matchSnapshot.findFirst({
      where: { matchId: dto.matchId, teamId: opponentTeamId },
    });
    if (!existingOpponentSnapshot) {
      const opponentRoster = await this.prisma.player.findMany({
        where: { teamId: opponentTeamId },
      });
      const opponentXi = defaultStartingXi(opponentRoster);
      const opponentLineup = assignFormationLineup(
        opponentXi.map((p) => ({
          playerId: p.id,
          name: p.name,
          jerseyNumber: p.jerseyNumber,
        })),
        DEFAULT_MOCK_FORMATION,
      );
      await this.prisma.matchSnapshot.create({
        data: {
          matchId: dto.matchId,
          teamId: opponentTeamId,
          minute: 0,
          second: 0,
          formation: DEFAULT_MOCK_FORMATION,
          lineup: JSON.stringify(opponentLineup),
        },
      });
    }

    const existingKickoff = await this.prisma.matchBallEvent.findFirst({
      where: { matchId: dto.matchId },
    });
    if (!existingKickoff) {
      const kickoffPlayer = orderedPlayers[0];
      await this.prisma.matchBallEvent.create({
        data: {
          id: `kickoff-${dto.matchId}`,
          matchId: dto.matchId,
          teamId: campaign.teamId,
          type: 'Pass',
          period: 1,
          minute: 0,
          second: 0,
          duration: 1,
          playerId: kickoffPlayer.playerId,
          playerName: kickoffPlayer.name,
          x: 60,
          y: 40,
        },
      });
    }

    return { matchId: dto.matchId, formation: dto.formation };
  }

  /**
   * The manager's own most recently *submitted* (minute=0, i.e. pre-
   * kickoff, not an in-match substitution) lineup anywhere in this
   * campaign - used to pre-fill the lineup screen for their next match
   * instead of starting from a blank pitch every time. Reconstructs
   * {formation, goalkeeperPlayerId, outfieldPlayerIds} from the persisted
   * positionId-tagged lineup by matching each player's positionId back
   * against that formation's own slot order (FORMATION_POSITION_IDS), so
   * the same players land in the same slots they were in last time.
   */
  async getPreviousLineup(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const snapshot = await this.prisma.matchSnapshot.findFirst({
      where: { teamId: campaign.teamId, minute: 0, match: { campaignId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) return null;

    const lineup = JSON.parse(snapshot.lineup) as {
      playerId: number;
      positionId: number;
    }[];
    const slotOrder = FORMATION_POSITION_IDS[snapshot.formation];
    if (!slotOrder) return null;

    const playerIdByPositionId = new Map(
      lineup.map((p) => [p.positionId, p.playerId]),
    );
    const goalkeeperPlayerId = playerIdByPositionId.get(slotOrder[0]);
    const outfieldPlayerIds = slotOrder
      .slice(1)
      .map((positionId) => playerIdByPositionId.get(positionId));
    if (
      goalkeeperPlayerId == null ||
      outfieldPlayerIds.some((id) => id == null) ||
      outfieldPlayerIds.length !== 10
    ) {
      // A stored lineup that doesn't cleanly map back onto its own
      // formation's slots (shouldn't happen, but this is reconstructed
      // from persisted JSON rather than type-checked at read time) - fail
      // safe to "nothing to prefill" rather than send a broken lineup.
      return null;
    }

    return {
      formation: snapshot.formation,
      goalkeeperPlayerId,
      outfieldPlayerIds: outfieldPlayerIds as number[],
    };
  }

  private recordFromOutcomes(outcomes: Outcome[]) {
    return {
      wins: outcomes.filter((o) => o === 'WIN').length,
      draws: outcomes.filter((o) => o === 'DRAW').length,
      losses: outcomes.filter((o) => o === 'LOSS').length,
    };
  }

  private async computeRecord(campaignId: string, teamId: number) {
    const matches = await this.prisma.match.findMany({
      where: {
        campaignId,
        played: true,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
    });
    return this.recordFromOutcomes(matches.map((m) => outcomeFor(teamId, m)));
  }

  /** Team "overall" strength - used only by the background (non-campaign-
   * team) match score simulator. Computed once per call across all 48
   * teams rather than per-match; cheap enough (1248 player rows) to just
   * recompute whenever a new round needs it.
   *
   * Base is the unweighted mean of every real-roster player's 6
   * constructed attributes - but since each player's stats are just a
   * random draw within their position group's range (see
   * generate-attributes.ts), averaging ~26 of them per team pulls every
   * team toward roughly the same number regardless of how good the real
   * national team actually is. The bonus below corrects for that with
   * the one real signal available here - each team's actual FIFA World
   * Ranking position around the real December 2025 draw (see
   * team-pot-data.ts's FIFA_RANK_BY_CODE) - so e.g. Spain (rank 1) is
   * meaningfully favoured over New Zealand (rank 86) on top of whatever
   * the random attribute draw gave them. Deliberately rank-based rather
   * than the coarser 4-bucket `pot`: two Pot 1 sides meeting in a
   * knockout round would get an identical pot bonus and be told apart by
   * attribute-draw noise alone, when their real rankings can still
   * separate them (e.g. Brazil #5 vs Belgium #8). */
  private async buildStrengthMap(): Promise<Map<number, number>> {
    const [attrs, teams] = await Promise.all([
      this.prisma.playerAttributes.findMany({
        include: { player: { select: { teamId: true } } },
      }),
      this.prisma.team.findMany({ select: { id: true, fifaRank: true } }),
    ]);
    const sumByTeam = new Map<number, number>();
    const countByTeam = new Map<number, number>();
    for (const a of attrs) {
      const teamId = a.player.teamId;
      const total =
        a.pace + a.shooting + a.passing + a.defending + a.physical + a.stamina;
      sumByTeam.set(teamId, (sumByTeam.get(teamId) ?? 0) + total);
      countByTeam.set(teamId, (countByTeam.get(teamId) ?? 0) + 6);
    }
    // Linear from rank 1 (+20) down to rank 90+ (-20) - 90 is a
    // deliberate small buffer past the worst real rank in our 48 teams
    // (86, New Zealand) so the very last team isn't clamped to the
    // extreme.
    const BEST_RANK = 1;
    const WORST_RANK = 90;
    const rankBonus = (rank: number): number => {
      const clamped = Math.min(Math.max(rank, BEST_RANK), WORST_RANK);
      const t = (clamped - BEST_RANK) / (WORST_RANK - BEST_RANK);
      return 20 - t * 40;
    };
    const strength = new Map<number, number>();
    for (const team of teams) {
      const attributeAvg =
        (sumByTeam.get(team.id) ?? 0) / (countByTeam.get(team.id) ?? 1);
      strength.set(team.id, attributeAvg + rankBonus(team.fifaRank));
    }
    return strength;
  }

  /**
   * Draws all 12 groups (real pot/confederation constraints, seeded by
   * this campaign's own id so it's reproducible but different from every
   * other campaign) and creates the full 72-match group-stage schedule,
   * all unplayed - background matches get simulated lazily, matchday by
   * matchday, in lockstep with the manager's own progression (see
   * ensureGroupMatchdaySimulated), not all at once up front.
   */
  private async generateGroupStage(campaignId: string) {
    const teams = await this.prisma.team.findMany({
      select: { id: true, name: true, pot: true, confederation: true },
    });
    const groups = drawGroups(
      teams as DrawTeam[],
      seededRandom(hashString(campaignId)),
    );

    const rows = groups.flatMap((group) =>
      groupRoundRobinFixtures(group).map((f) => ({
        campaignId,
        competitionStage: 'Group Stage',
        matchWeek: f.matchWeek,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        played: false,
        homeScore: 0,
        awayScore: 0,
      })),
    );

    await this.prisma.match.createMany({ data: rows });
  }

  /**
   * Simulates every background (not-the-manager's-team) match at one
   * Group Stage matchday, across all 12 groups at once, the first time
   * that matchday is reached - so "how the rest of the world's matchday
   * went" stays in lockstep with the manager's own progression instead of
   * the whole group stage being decided before the manager has played
   * their first match. Idempotent (only touches still-unplayed rows).
   */
  private async ensureGroupMatchdaySimulated(
    campaignId: string,
    matchWeek: number,
    myTeamId: number,
  ) {
    const pending = await this.prisma.match.findMany({
      where: {
        campaignId,
        competitionStage: 'Group Stage',
        matchWeek,
        played: false,
        NOT: { OR: [{ homeTeamId: myTeamId }, { awayTeamId: myTeamId }] },
      },
    });
    if (pending.length === 0) return;

    const strengthByTeam = await this.buildStrengthMap();
    const rand = seededRandom(
      hashString(`${campaignId}-matchday-${matchWeek}`),
    );
    const involvedTeamIds = [
      ...new Set(pending.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
    ];
    const rosterByTeam = await this.getRosterForGoals(involvedTeamIds);

    // Sequential (not Promise.all) so `rand` is consumed in a fixed,
    // reproducible order across score generation AND goal-scorer picks -
    // matchday sizes are small (<=24 matches) so this costs nothing.
    for (const m of pending) {
      const [homeScore, awayScore] = simulateBackgroundScore(
        strengthByTeam.get(m.homeTeamId) ?? 50,
        strengthByTeam.get(m.awayTeamId) ?? 50,
        rand,
      );
      await this.prisma.match.update({
        where: { id: m.id },
        data: { played: true, homeScore, awayScore },
      });
      await this.createBackgroundGoalEvents(
        m.id,
        m.homeTeamId,
        m.awayTeamId,
        homeScore,
        awayScore,
        rosterByTeam,
        rand,
      );
    }
  }

  /** Bulk-fetches roster + shooting attribute for pickGoalScorers, grouped
   * by team - shared by both background-match paths (group matchday sim
   * and knockout round generation). */
  private async getRosterForGoals(
    teamIds: number[],
  ): Promise<Map<number, GoalScorerCandidate[]>> {
    const players = await this.prisma.player.findMany({
      where: { teamId: { in: teamIds } },
      include: { attributes: true },
    });
    const map = new Map<number, GoalScorerCandidate[]>();
    for (const p of players) {
      if (!map.has(p.teamId)) map.set(p.teamId, []);
      map.get(p.teamId)!.push({
        playerId: p.id,
        name: p.name,
        position: p.position,
        shooting: p.attributes?.shooting ?? 50,
      });
    }
    return map;
  }

  /** Picks and persists goal-scorer MatchBallEvent rows for a background
   * (not-the-campaign's-team) match's final score - see group-draw.ts's
   * pickGoalScorers doc comment for why/how. A no-op for a 0-0 scoreline. */
  private async createBackgroundGoalEvents(
    matchId: number,
    homeTeamId: number,
    awayTeamId: number,
    homeScore: number,
    awayScore: number,
    rosterByTeam: Map<number, GoalScorerCandidate[]>,
    rand: () => number,
  ) {
    const homeScorers = pickGoalScorers(
      rosterByTeam.get(homeTeamId) ?? [],
      homeScore,
      rand,
    );
    const awayScorers = pickGoalScorers(
      rosterByTeam.get(awayTeamId) ?? [],
      awayScore,
      rand,
    );
    const events = [
      ...this.buildGoalEvents(matchId, homeTeamId, homeScorers, rand),
      ...this.buildGoalEvents(matchId, awayTeamId, awayScorers, rand),
    ];
    if (events.length > 0) {
      await this.prisma.matchBallEvent.createMany({ data: events });
    }
  }

  /** Constructs (does not persist) synthetic Shot/Goal MatchBallEvent rows
   * for a background match's goal scorers - minute/second are randomized
   * (no real match was simulated to derive them from), x/y are a fixed
   * "near goal" placeholder since the pitch visualization was removed and
   * nothing renders these coordinates anymore. */
  private buildGoalEvents(
    matchId: number,
    teamId: number,
    scorers: { playerId: number; name: string }[],
    rand: () => number,
  ) {
    return scorers.map((s) => {
      const minute = 1 + Math.floor(rand() * 90);
      return {
        id: `bg-goal-${matchId}-${randomUUID()}`,
        matchId,
        teamId,
        type: 'Shot',
        period: minute <= 45 ? 1 : 2,
        minute,
        second: Math.floor(rand() * 60),
        duration: 1,
        playerId: s.playerId,
        playerName: s.name,
        x: 105,
        y: 40,
        outcome: 'Goal',
      };
    });
  }

  /** Partitions this campaign's 72 group-stage matches back into the 12
   * groups of 4 by connected-component (each team's 3 group opponents are
   * exactly its group-mates) - no groupLetter column is persisted, this
   * is cheap enough to recompute from the fixtures themselves. */
  private async computeGroupPartition(campaignId: string): Promise<number[][]> {
    const matches = await this.prisma.match.findMany({
      where: { campaignId, competitionStage: 'Group Stage' },
      select: { homeTeamId: true, awayTeamId: true },
    });
    const adjacency = new Map<number, Set<number>>();
    const addEdge = (a: number, b: number) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a)!.add(b);
    };
    for (const m of matches) {
      addEdge(m.homeTeamId, m.awayTeamId);
      addEdge(m.awayTeamId, m.homeTeamId);
    }

    const visited = new Set<number>();
    const groups: number[][] = [];
    for (const teamId of adjacency.keys()) {
      if (visited.has(teamId)) continue;
      const group: number[] = [];
      const queue = [teamId];
      visited.add(teamId);
      while (queue.length > 0) {
        const t = queue.shift()!;
        group.push(t);
        for (const n of adjacency.get(t) ?? []) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      groups.push(group);
    }
    return groups;
  }

  private async getGroupStandings(
    teamId: number,
    campaignId: string,
  ): Promise<GroupStandingRow[] | null> {
    const groups = await this.computeGroupPartition(campaignId);
    const myGroup = groups.find((g) => g.includes(teamId));
    if (!myGroup) return null;

    const [matches, teams] = await Promise.all([
      this.prisma.match.findMany({
        where: {
          campaignId,
          competitionStage: 'Group Stage',
          homeTeamId: { in: myGroup },
          awayTeamId: { in: myGroup },
        },
      }),
      this.prisma.team.findMany({ where: { id: { in: myGroup } } }),
    ]);
    return computeStandingsForGroupTeams(
      matches,
      myGroup,
      new Map(teams.map((t) => [t.id, t.name])),
    );
  }

  /** Real 2026 advancement rule: top 2 of each of the 12 groups, plus the
   * 8 best third-placed teams across all groups (compared by points, then
   * goal difference, then goals for) - not just "top 2 in your own
   * group", so a strong 3rd-place finish can still advance. */
  private async computeRound32Qualifiers(
    campaignId: string,
  ): Promise<{ qualifiers: number[] }> {
    const groups = await this.computeGroupPartition(campaignId);
    const allTeamIds = groups.flat();
    const [matches, teams] = await Promise.all([
      this.prisma.match.findMany({
        where: { campaignId, competitionStage: 'Group Stage' },
      }),
      this.prisma.team.findMany({ where: { id: { in: allTeamIds } } }),
    ]);
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

    const winners: number[] = [];
    const runnersUp: number[] = [];
    const thirds: GroupStandingRow[] = [];
    for (const groupTeamIds of groups) {
      const rows = computeStandingsForGroupTeams(
        matches,
        groupTeamIds,
        teamNameById,
      );
      winners.push(rows[0].teamId);
      runnersUp.push(rows[1].teamId);
      thirds.push(rows[2]);
    }
    thirds.sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor,
    );
    const bestThirds = thirds.slice(0, 8).map((r) => r.teamId);

    return { qualifiers: [...winners, ...runnersUp, ...bestThirds] };
  }

  /**
   * Creates every match of a knockout stage at once the first time the
   * campaign reaches it (idempotent - a no-op if any match for this stage
   * already exists). Pairing is a fresh random shuffle of that stage's
   * qualifiers each round, not a persisted bracket tree - a simplification
   * (a real bracket keeps the same half-tree across rounds) that's fine
   * for a generated/simulated tournament rather than a real fixed draw.
   */
  private async ensureKnockoutRound(campaignId: string, stage: string) {
    const existing = await this.prisma.match.findFirst({
      where: { campaignId, competitionStage: stage },
    });
    if (existing) return;

    const campaign = await this.prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    const myTeamId = campaign.teamId;

    let qualifiers: number[];
    if (stage === 'Round of 32') {
      qualifiers = (await this.computeRound32Qualifiers(campaignId)).qualifiers;
    } else {
      const prevStage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) - 1];
      const prevMatches = await this.prisma.match.findMany({
        where: { campaignId, competitionStage: prevStage },
      });
      qualifiers = prevMatches.map((m) =>
        m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId,
      );
    }

    const rand = seededRandom(hashString(`${campaignId}-${stage}`));
    let pairs: [number, number][];
    if (stage === 'Round of 32') {
      // Only this round risks an immediate rematch of a real group-stage
      // opponent - every later round's pool is already a mix of teams
      // that came from different original groups via this same pairing.
      const groups = await this.computeGroupPartition(campaignId);
      const groupOf = new Map<number, number>();
      groups.forEach((teamIds, i) =>
        teamIds.forEach((id) => groupOf.set(id, i)),
      );
      pairs = pairAvoidingSameGroup(qualifiers, groupOf, rand);
    } else {
      const shuffled = shuffle(qualifiers, rand);
      pairs = [];
      for (let i = 0; i < shuffled.length; i += 2)
        pairs.push([shuffled[i], shuffled[i + 1]]);
    }

    const strengthByTeam = await this.buildStrengthMap();
    const matchWeek = STAGE_ORDER.indexOf(stage) + 4;
    const rows = pairs.map(([homeTeamId, awayTeamId]) => {
      if (homeTeamId === myTeamId || awayTeamId === myTeamId) {
        return {
          campaignId,
          competitionStage: stage,
          matchWeek,
          homeTeamId,
          awayTeamId,
          played: false,
          homeScore: 0,
          awayScore: 0,
        };
      }
      let [homeScore, awayScore] = simulateBackgroundScore(
        strengthByTeam.get(homeTeamId) ?? 50,
        strengthByTeam.get(awayTeamId) ?? 50,
        rand,
      );
      [homeScore, awayScore] = breakKnockoutTie(homeScore, awayScore, rand);
      return {
        campaignId,
        competitionStage: stage,
        matchWeek,
        homeTeamId,
        awayTeamId,
        played: true,
        homeScore,
        awayScore,
      };
    });

    // Individual creates (not createMany) so each row's real DB id comes
    // back immediately - needed to attach that match's goal-scorer events
    // below (createMany doesn't return generated ids on SQLite).
    const created = await Promise.all(
      rows.map((row) => this.prisma.match.create({ data: row })),
    );

    const involvedTeamIds = [
      ...new Set(created.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
    ];
    const rosterByTeam = await this.getRosterForGoals(involvedTeamIds);
    for (const m of created) {
      if (!m.played) continue; // the campaign's own match - real events come from the lineup/what-if flow instead
      await this.createBackgroundGoalEvents(
        m.id,
        m.homeTeamId,
        m.awayTeamId,
        m.homeScore,
        m.awayScore,
        rosterByTeam,
        rand,
      );
    }
  }

  /**
   * Figures out the campaign's current "next match to play" - walking the
   * fixed group-stage schedule first (already fully generated at campaign
   * creation), then the win-to-advance knockout chain (generating that
   * whole round's bracket the first time it's reached).
   */
  private async resolveNextMatch(
    teamId: number,
    campaignId: string,
  ): Promise<{ match: MatchRow | null; eliminated: boolean }> {
    const groupFixtures = await this.prisma.match.findMany({
      where: {
        campaignId,
        competitionStage: 'Group Stage',
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      orderBy: { matchWeek: 'asc' },
    });

    const nextGroupFixture = groupFixtures.find((m) => !m.played);
    if (nextGroupFixture) {
      await this.ensureGroupMatchdaySimulated(
        campaignId,
        nextGroupFixture.matchWeek,
        teamId,
      );
      return { match: nextGroupFixture, eliminated: false };
    }

    if (groupFixtures.length > 0) {
      const { qualifiers } = await this.computeRound32Qualifiers(campaignId);
      if (!qualifiers.includes(teamId))
        return { match: null, eliminated: true };
    }

    let stage = 'Group Stage';
    while (true) {
      const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
      if (!nextStage) return { match: null, eliminated: false }; // won the Final

      await this.ensureKnockoutRound(campaignId, nextStage);
      const match = await this.prisma.match.findFirst({
        where: {
          campaignId,
          competitionStage: nextStage,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
      });
      if (!match) return { match: null, eliminated: false };

      if (!match.played) return { match, eliminated: false };
      if (outcomeFor(teamId, match) !== 'WIN')
        return { match: null, eliminated: true };
      stage = nextStage;
    }
  }

  /**
   * "탈락하면 나머지 경기 결과 보기" - once the manager's own campaign has
   * no more matches to play (eliminated at any stage, or crowned
   * champion), plays out every remaining knockout stage in the background
   * (idempotent per stage - already-generated ones no-op) so the full
   * 48-team final standings and tournament-wide player awards can be
   * computed. Refuses to run early: generating later rounds off of an
   * unplayed earlier-round match (the manager's own still-pending game)
   * would corrupt the bracket, since winners are read straight from
   * homeScore/awayScore.
   */
  async simulateRestOfTournament(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign)
      throw new NotFoundException(`Campaign not found: id=${campaignId}`);

    const { match } = await this.resolveNextMatch(campaign.teamId, campaignId);
    if (match) {
      throw new BadRequestException(
        '아직 진행할 경기가 남아있어 대회 전체 결과를 미리 볼 수 없습니다',
      );
    }

    for (const stage of STAGE_ORDER) {
      if (stage === 'Group Stage') continue;
      await this.ensureKnockoutRound(campaignId, stage);
    }

    return {
      standings: await this.getFinalStandings(campaignId),
      awards: await this.getTournamentAwards(campaignId),
    };
  }

  /**
   * Full 1-48 final ranking, real-World-Cup style: Champion, Runner-up,
   * then Semi-final/Quarter-final/Round of 16/Round of 32 losers as
   * 4/8/16/16-team bands, then every group-stage-only team. There's no
   * simulated 3rd Place Final (see STAGE_ORDER's comment), so the two
   * Semi-final losers share a band rather than getting distinct 3rd/4th
   * places - broken by goal difference like every other band. Requires
   * the Final to have been played (throws otherwise); callers that want
   * this before the manager's own campaign is fully resolved should call
   * simulateRestOfTournament first.
   */
  private async getFinalStandings(
    campaignId: string,
  ): Promise<FinalStandingRow[]> {
    const [allMatches, teams] = await Promise.all([
      this.prisma.match.findMany({ where: { campaignId, played: true } }),
      this.prisma.team.findMany({
        select: { id: true, name: true, fifaRank: true },
      }),
    ]);
    const finalMatch = allMatches.find((m) => m.competitionStage === 'Final');
    if (!finalMatch) {
      throw new BadRequestException('토너먼트가 아직 끝나지 않았습니다');
    }

    interface Agg {
      teamId: number;
      teamName: string;
      fifaRank: number;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
    }
    const statsByTeam = new Map<number, Agg>(
      teams.map((t) => [
        t.id,
        {
          teamId: t.id,
          teamName: t.name,
          fifaRank: t.fifaRank,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
        },
      ]),
    );
    for (const m of allMatches) {
      const home = statsByTeam.get(m.homeTeamId);
      const away = statsByTeam.get(m.awayTeamId);
      if (!home || !away) continue;
      home.played += 1;
      away.played += 1;
      home.goalsFor += m.homeScore;
      home.goalsAgainst += m.awayScore;
      away.goalsFor += m.awayScore;
      away.goalsAgainst += m.homeScore;
      if (m.homeScore > m.awayScore) {
        home.wins += 1;
        away.losses += 1;
      } else if (m.homeScore < m.awayScore) {
        away.wins += 1;
        home.losses += 1;
      } else {
        home.draws += 1;
        away.draws += 1;
      }
    }

    // Walk knockout stages from the Final down, remembering only the
    // FIRST (i.e. furthest/latest) stage each team is seen in - a team
    // that reached the Final also appears in every earlier round's
    // matches, but those earlier appearances shouldn't overwrite it.
    const KNOCKOUT_DESC = [
      'Final',
      'Semi-finals',
      'Quarter-finals',
      'Round of 16',
      'Round of 32',
    ];
    const assigned = new Map<number, { stage: string; isWinner: boolean }>();
    for (const stage of KNOCKOUT_DESC) {
      for (const m of allMatches.filter((x) => x.competitionStage === stage)) {
        for (const teamId of [m.homeTeamId, m.awayTeamId]) {
          if (assigned.has(teamId)) continue;
          assigned.set(teamId, {
            stage,
            isWinner: outcomeFor(teamId, m) === 'WIN',
          });
        }
      }
    }

    const bucketOf = (teamId: number): number => {
      const info = assigned.get(teamId);
      if (!info) return 6; // never left the group stage
      if (info.stage === 'Final') return info.isWinner ? 0 : 1;
      if (info.stage === 'Semi-finals') return 2;
      if (info.stage === 'Quarter-finals') return 3;
      if (info.stage === 'Round of 16') return 4;
      return 5; // Round of 32
    };
    const STAGE_REACHED_BY_BUCKET = [
      'Champion',
      'RunnerUp',
      'Semi-finals',
      'Quarter-finals',
      'Round of 16',
      'Round of 32',
      'Group Stage',
    ];

    const rows = [...statsByTeam.values()].sort((a, b) => {
      const bucketDiff = bucketOf(a.teamId) - bucketOf(b.teamId);
      if (bucketDiff !== 0) return bucketDiff;
      const gdA = a.goalsFor - a.goalsAgainst;
      const gdB = b.goalsFor - b.goalsAgainst;
      if (gdA !== gdB) return gdB - gdA;
      if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
      return a.fifaRank - b.fifaRank;
    });

    return rows.map((r, i) => ({
      rank: i + 1,
      teamId: r.teamId,
      teamName: r.teamName,
      stageReached: STAGE_REACHED_BY_BUCKET[bucketOf(r.teamId)],
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDifference: r.goalsFor - r.goalsAgainst,
    }));
  }

  /**
   * Constructed tournament-wide awards from the goal-scorer events
   * persisted for every match (the campaign's own AI-generated ones and
   * every background match's pickGoalScorers attribution alike):
   *  - Golden/Silver/Bronze Boot: most tournament goals, ties broken by
   *    the scorer's team's final standing.
   *  - Golden Glove: the presumed starting goalkeeper (lowest jersey
   *    number on the roster) of the best defensive record among teams
   *    that reached at least the Round of 16.
   *  - Golden Ball: the top scorer between the two Final teams (Champion
   *    + Runner-up) - a simplification of the real award (which factors
   *    in far more than goals), but keeps the "best player on the best
   *    team" spirit without inventing an opaque rating system. There's no
   *    Young Player Award - the real roster data has no birth date field.
   */
  private async getTournamentAwards(
    campaignId: string,
  ): Promise<TournamentAwards> {
    const standings = await this.getFinalStandings(campaignId);
    const rankByTeam = new Map(standings.map((s) => [s.teamId, s.rank]));
    const teamNameById = new Map(standings.map((s) => [s.teamId, s.teamName]));

    const matches = await this.prisma.match.findMany({
      where: { campaignId, played: true },
      select: { id: true },
    });
    const goalEvents = await this.prisma.matchBallEvent.findMany({
      where: { matchId: { in: matches.map((m) => m.id) }, outcome: 'Goal' },
    });

    const goalsByPlayer = new Map<number, TournamentAwardPlayer>();
    for (const e of goalEvents) {
      if (e.playerId == null) continue;
      const row = goalsByPlayer.get(e.playerId) ?? {
        playerId: e.playerId,
        name: e.playerName ?? '이름 미상',
        teamId: e.teamId,
        teamName: teamNameById.get(e.teamId) ?? '알 수 없는 팀',
        goals: 0,
      };
      row.goals += 1;
      goalsByPlayer.set(e.playerId, row);
    }

    const scorers = [...goalsByPlayer.values()].sort(
      (a, b) =>
        b.goals - a.goals ||
        (rankByTeam.get(a.teamId) ?? 999) - (rankByTeam.get(b.teamId) ?? 999),
    );
    const topScorers = scorers.slice(0, 3);

    const defenseCandidates = standings.filter((s) => s.rank <= 16);
    const bestDefense = [...defenseCandidates].sort(
      (a, b) => a.goalsAgainst - b.goalsAgainst || a.rank - b.rank,
    )[0];
    let goldenGlove: TournamentAwards['goldenGlove'] = null;
    if (bestDefense) {
      const gk = await this.prisma.player.findFirst({
        where: { teamId: bestDefense.teamId, position: 'GK' },
        orderBy: { jerseyNumber: 'asc' },
      });
      if (gk) {
        goldenGlove = {
          playerId: gk.id,
          name: gk.name,
          teamId: bestDefense.teamId,
          teamName: bestDefense.teamName,
          goalsAgainst: bestDefense.goalsAgainst,
        };
      }
    }

    const finalistTeamIds = new Set(
      standings.filter((s) => s.rank <= 2).map((s) => s.teamId),
    );
    const goldenBall =
      scorers.find((s) => finalistTeamIds.has(s.teamId)) ?? null;

    return { topScorers, goldenGlove, goldenBall };
  }
}

interface MatchRow {
  id: number;
  campaignId: string;
  competitionStage: string;
  matchWeek: number;
  homeTeamId: number;
  awayTeamId: number;
  played: boolean;
  homeScore: number;
  awayScore: number;
}

interface RecordResultInput {
  matchId: number;
  homeScore: number;
  awayScore: number;
  shootoutHomeScore?: number;
  shootoutAwayScore?: number;
}

interface SubmitLineupInput {
  matchId: number;
  formation: string;
  goalkeeperPlayerId: number;
  outfieldPlayerIds: number[];
}

export interface FinalStandingRow {
  rank: number;
  teamId: number;
  teamName: string;
  // 'Champion' | 'RunnerUp' | 'Semi-finals' | 'Quarter-finals' |
  // 'Round of 16' | 'Round of 32' | 'Group Stage' (the stage the team was
  // eliminated at, or 'Champion'/'RunnerUp' for the Final's two teams).
  stageReached: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface TournamentAwardPlayer {
  playerId: number;
  name: string;
  teamId: number;
  teamName: string;
  goals: number;
}

export interface TournamentAwards {
  topScorers: TournamentAwardPlayer[];
  goldenGlove: {
    playerId: number;
    name: string;
    teamId: number;
    teamName: string;
    goalsAgainst: number;
  } | null;
  goldenBall: TournamentAwardPlayer | null;
}

export interface GroupStandingRow {
  teamId: number;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface BracketMatchRow {
  id: number;
  matchWeek: number;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  homePenalty: number | null;
  awayPenalty: number | null;
  winnerTeamId: number | null;
}

export interface BracketStageBlock {
  stage: string;
  matches: BracketMatchRow[];
}
