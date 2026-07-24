import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTeamSnapshotAtMinute } from './snapshot.util';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const matches = await this.prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ matchDate: 'asc' }, { id: 'asc' }],
    });
    return matches.map((m) => ({
      id: m.id,
      matchDate: m.matchDate,
      kickOff: m.kickOff,
      competitionStage: m.competitionStage,
      matchWeek: m.matchWeek,
      stadiumName: m.stadiumName,
      homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
      awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }));
  }

  async detail(matchId: number) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      throw new NotFoundException(`Match not found: id=${matchId}`);
    }

    const [events, squad] = await Promise.all([
      this.prisma.matchEvent.findMany({
        where: { matchId },
        orderBy: [{ minute: 'asc' }, { second: 'asc' }],
      }),
      this.prisma.matchSquad.findMany({
        where: { matchId },
        include: { player: true },
      }),
    ]);

    return {
      id: match.id,
      matchDate: match.matchDate,
      kickOff: match.kickOff,
      stadiumName: match.stadiumName,
      competitionStage: match.competitionStage,
      matchWeek: match.matchWeek,
      refereeName: match.refereeName,
      homeTeam: {
        id: match.homeTeam.id,
        name: match.homeTeam.name,
        managerName: match.homeManagerName,
      },
      awayTeam: {
        id: match.awayTeam.id,
        name: match.awayTeam.name,
        managerName: match.awayManagerName,
      },
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      timeline: events.map((e) => ({
        id: e.id,
        type: e.type,
        teamId: e.teamId,
        period: e.period,
        minute: e.minute,
        second: e.second,
        detail: JSON.parse(e.payload) as Record<string, unknown>,
      })),
      squads: {
        [match.homeTeamId]: squad
          .filter((s) => s.teamId === match.homeTeamId)
          .map((s) => ({
            playerId: s.playerId,
            name: s.player.name,
            jerseyNumber: s.jerseyNumber,
            isStarter: s.isStarter,
          })),
        [match.awayTeamId]: squad
          .filter((s) => s.teamId === match.awayTeamId)
          .map((s) => ({
            playerId: s.playerId,
            name: s.player.name,
            jerseyNumber: s.jerseyNumber,
            isStarter: s.isStarter,
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

  async frames(matchId: number) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) {
      throw new NotFoundException(`Match not found: id=${matchId}`);
    }

    const frames = await this.prisma.matchFrame.findMany({
      where: { matchId },
      orderBy: { t: 'asc' },
    });
    return frames.map((f) => ({
      t: f.t,
      period: f.period,
      minute: f.minute,
      second: f.second,
      ballX: f.ballX,
      ballY: f.ballY,
      players: JSON.parse(f.players) as {
        playerId: number;
        teamId: number;
        x: number;
        y: number;
      }[],
    }));
  }
}
