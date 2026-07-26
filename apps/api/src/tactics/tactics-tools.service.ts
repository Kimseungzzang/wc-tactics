import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTeamSnapshotAtMinute } from '../matches/snapshot.util';

/**
 * Pure data-lookup functions exposed to Gemini as callable tools for the
 * "AI 전술 추천"/what-if features. Gemini decides which of these to call
 * (and how many times) before returning a final recommendation - see
 * GeminiService.
 */
@Injectable()
export class TacticsToolsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Score so far, counted from this match's own MatchBallEvent stream
   * (Shot rows with outcome=Goal) - there's no separate real event log
   * anymore, every match (including its goals) is AI-generated. */
  async getMatchState(matchId: number, minute: number) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException(`Match not found: id=${matchId}`);

    const goalsSoFar = await this.prisma.matchBallEvent.findMany({
      where: {
        matchId,
        type: 'Shot',
        outcome: 'Goal',
        minute: { lte: minute },
      },
    });
    const goalsHome = goalsSoFar.filter(
      (e) => e.teamId === match.homeTeamId,
    ).length;
    const goalsAway = goalsSoFar.filter(
      (e) => e.teamId === match.awayTeamId,
    ).length;

    return {
      matchId,
      minute,
      homeTeam: { id: match.homeTeamId, name: match.homeTeam.name },
      awayTeam: { id: match.awayTeamId, name: match.awayTeam.name },
      scoreAtMinute: { home: goalsHome, away: goalsAway },
    };
  }

  async getLineupAtMinute(matchId: number, minute: number) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException(`Match not found: id=${matchId}`);

    const [home, away] = await Promise.all([
      getTeamSnapshotAtMinute(this.prisma, matchId, match.homeTeamId, minute),
      getTeamSnapshotAtMinute(this.prisma, matchId, match.awayTeamId, minute),
    ]);

    return {
      matchId,
      minute,
      home: home && {
        teamId: match.homeTeamId,
        teamName: match.homeTeam.name,
        ...home,
      },
      away: away && {
        teamId: match.awayTeamId,
        teamName: match.awayTeam.name,
        ...away,
      },
    };
  }

  /** Bench = the team's full real roster minus whoever's in the lineup
   * snapshot at this minute. There's no per-match squad selection or
   * substitution-event log anymore (every team's roster is fixed, and
   * in-match subs are just a new snapshot), so this doesn't try to
   * exclude a player who already came off earlier in the same match. */
  async getBenchPlayers(matchId: number, teamId: number, minute: number) {
    const [roster, snapshot] = await Promise.all([
      this.prisma.player.findMany({ where: { teamId } }),
      getTeamSnapshotAtMinute(this.prisma, matchId, teamId, minute),
    ]);
    const onPitchIds = new Set((snapshot?.lineup ?? []).map((p) => p.playerId));

    return roster
      .filter((p) => !onPitchIds.has(p.id))
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        jerseyNumber: p.jerseyNumber,
      }));
  }

  /** How this opponent has done so far in THIS campaign's tournament
   * (not a global real-world record - every campaign is its own random
   * draw/schedule, so a team's history only means something within one
   * campaign). matchId identifies which campaign to scope to. */
  async getOpponentTendencies(teamId: number, matchId: number) {
    const [team, currentMatch] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId } }),
      this.prisma.match.findUnique({ where: { id: matchId } }),
    ]);
    if (!team) throw new NotFoundException(`Team not found: id=${teamId}`);
    if (!currentMatch)
      throw new NotFoundException(`Match not found: id=${matchId}`);

    const matches = await this.prisma.match.findMany({
      where: {
        campaignId: currentMatch.campaignId,
        played: true,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
    });

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    for (const m of matches) {
      const isHome = m.homeTeamId === teamId;
      const forScore = isHome ? m.homeScore : m.awayScore;
      const againstScore = isHome ? m.awayScore : m.homeScore;
      goalsFor += forScore;
      goalsAgainst += againstScore;
      if (forScore > againstScore) wins += 1;
      else if (forScore < againstScore) losses += 1;
      else draws += 1;
    }

    return {
      teamId,
      teamName: team.name,
      matchesPlayedThisTournament: matches.length,
      record: { wins, draws, losses },
      goalsFor,
      goalsAgainst,
    };
  }

  async getPlayerAttributes(playerId: number) {
    const [player, attributes] = await Promise.all([
      this.prisma.player.findUnique({ where: { id: playerId } }),
      this.prisma.playerAttributes.findUnique({ where: { playerId } }),
    ]);
    if (!player)
      throw new NotFoundException(`Player not found: id=${playerId}`);
    if (!attributes) {
      return { playerId, name: player.name, attributes: null };
    }
    return {
      playerId,
      name: player.name,
      pace: attributes.pace,
      shooting: attributes.shooting,
      passing: attributes.passing,
      defending: attributes.defending,
      physical: attributes.physical,
      stamina: attributes.stamina,
    };
  }

  async getTeamTacticalProfile(teamId: number) {
    const [team, profile] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId } }),
      this.prisma.teamTacticalProfile.findUnique({ where: { teamId } }),
    ]);
    if (!team) throw new NotFoundException(`Team not found: id=${teamId}`);
    if (!profile) {
      return { teamId, teamName: team.name, profile: null };
    }
    return {
      teamId,
      teamName: team.name,
      pressingIntensity: profile.pressingIntensity,
      possessionStyle: profile.possessionStyle,
      defensiveLine: profile.defensiveLine,
    };
  }
}
