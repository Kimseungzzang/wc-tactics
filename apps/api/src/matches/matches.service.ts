import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTeamSnapshotAtMinute } from './snapshot.util';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async detail(matchId: number) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      throw new NotFoundException(`Match not found: id=${matchId}`);
    }

    const [roster, tacticalProfiles, highlights, ballEventsLite] =
      await Promise.all([
        this.prisma.player.findMany({
          where: { teamId: { in: [match.homeTeamId, match.awayTeamId] } },
        }),
        this.prisma.teamTacticalProfile.findMany({
          where: { teamId: { in: [match.homeTeamId, match.awayTeamId] } },
        }),
        // Every persisted ball event that came from an AI-generated moment
        // carries the AI's own commentary line (see what-if.service.ts) -
        // the single synthetic kickoff anchor event is the only row with no
        // commentary, so filtering on it gives exactly the narrated log.
        this.prisma.matchBallEvent.findMany({
          where: { matchId, commentary: { not: null } },
          orderBy: [{ minute: 'asc' }, { second: 'asc' }],
        }),
        // Lightweight projection of every ball event, for the stats panel -
        // computed client-side (see matchStats.ts) from this raw list so it
        // can be re-aggregated live as the clock advances (or truncated to
        // "up to the current minute"), rather than the server sending one
        // fixed full-match total.
        this.prisma.matchBallEvent.findMany({
          where: { matchId },
          select: {
            id: true,
            teamId: true,
            type: true,
            outcome: true,
            minute: true,
            second: true,
            playerId: true,
            playerName: true,
          },
          orderBy: [{ minute: 'asc' }, { second: 'asc' }],
        }),
      ]);

    const profileByTeam = new Map(tacticalProfiles.map((p) => [p.teamId, p]));
    const tacticalProfileOf = (teamId: number) => {
      const p = profileByTeam.get(teamId);
      return p
        ? {
            pressingIntensity: p.pressingIntensity,
            possessionStyle: p.possessionStyle,
            defensiveLine: p.defensiveLine,
          }
        : null;
    };

    return {
      id: match.id,
      competitionStage: match.competitionStage,
      matchWeek: match.matchWeek,
      played: match.played,
      homeTeam: {
        id: match.homeTeam.id,
        name: match.homeTeam.name,
        tacticalProfile: tacticalProfileOf(match.homeTeamId),
      },
      awayTeam: {
        id: match.awayTeam.id,
        name: match.awayTeam.name,
        tacticalProfile: tacticalProfileOf(match.awayTeamId),
      },
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      ballEvents: ballEventsLite,
      highlights: highlights.map((e) => ({
        id: e.id,
        teamId: e.teamId,
        minute: e.minute,
        second: e.second,
        playerName: e.playerName,
        isGoal: e.type === 'Shot' && e.outcome === 'Goal',
        commentary: e.commentary!,
      })),
      squads: {
        [match.homeTeamId]: roster
          .filter((p) => p.teamId === match.homeTeamId)
          .map((p) => ({
            playerId: p.id,
            name: p.name,
            jerseyNumber: p.jerseyNumber,
            position: p.position,
          })),
        [match.awayTeamId]: roster
          .filter((p) => p.teamId === match.awayTeamId)
          .map((p) => ({
            playerId: p.id,
            name: p.name,
            jerseyNumber: p.jerseyNumber,
            position: p.position,
          })),
      },
    };
  }

  async snapshotAtMinute(matchId: number, minute: number) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      throw new NotFoundException(`Match not found: id=${matchId}`);
    }

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
}
