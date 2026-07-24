import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTeamSnapshotAtMinute } from '../matches/snapshot.util';

/**
 * Pure data-lookup functions exposed to Gemini as callable tools for the
 * "AI 전술 추천" feature. Gemini decides which of these to call (and how
 * many times) before returning a final recommendation - see GeminiService.
 */
@Injectable()
export class TacticsToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMatchState(matchId: number, minute: number) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException(`Match not found: id=${matchId}`);

    const eventsSoFar = await this.prisma.matchEvent.findMany({
      where: { matchId, minute: { lte: minute } },
    });

    const isGoal = (type: string) => type === 'GOAL' || type === 'OWN_GOAL';
    const goalsHome = eventsSoFar.filter(
      (e) => isGoal(e.type) && e.teamId === match.homeTeamId,
    ).length;
    const goalsAway = eventsSoFar.filter(
      (e) => isGoal(e.type) && e.teamId === match.awayTeamId,
    ).length;
    const cardsSoFar = eventsSoFar
      .filter((e) => e.type === 'CARD')
      .map((e) => ({
        teamId: e.teamId,
        minute: e.minute,
        ...(JSON.parse(e.payload) as Record<string, unknown>),
      }));

    return {
      matchId,
      minute,
      homeTeam: { id: match.homeTeamId, name: match.homeTeam.name },
      awayTeam: { id: match.awayTeamId, name: match.awayTeam.name },
      scoreAtMinute: { home: goalsHome, away: goalsAway },
      finalScore: { home: match.homeScore, away: match.awayScore },
      cardsSoFar,
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

  async getPlayerStats(playerId: number) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) {
      throw new NotFoundException(`Player not found: id=${playerId}`);
    }

    const squadRows = await this.prisma.matchSquad.findMany({
      where: { playerId },
    });
    const matchIds = squadRows.map((s) => s.matchId);
    const events = await this.prisma.matchEvent.findMany({
      where: { matchId: { in: matchIds } },
    });

    let goals = 0;
    let yellowCards = 0;
    let redCards = 0;
    let timesBroughtOnAsSub = 0;
    let timesSubbedOff = 0;
    for (const e of events) {
      const payload = JSON.parse(e.payload) as Record<string, unknown>;
      if ((e.type === 'GOAL' || e.type === 'OWN_GOAL') && payload.playerId === playerId) {
        goals += 1;
      }
      if (e.type === 'CARD' && payload.playerId === playerId) {
        if (payload.cardType === 'Yellow Card') yellowCards += 1;
        else redCards += 1;
      }
      if (e.type === 'SUBSTITUTION') {
        if (payload.inPlayerId === playerId) timesBroughtOnAsSub += 1;
        if (payload.outPlayerId === playerId) timesSubbedOff += 1;
      }
    }

    return {
      playerId,
      name: player.name,
      tournamentAppearances: squadRows.length,
      starts: squadRows.filter((s) => s.isStarter).length,
      goals,
      yellowCards,
      redCards,
      timesBroughtOnAsSub,
      timesSubbedOff,
    };
  }

  async getBenchPlayers(matchId: number, teamId: number, minute: number) {
    const squad = await this.prisma.matchSquad.findMany({
      where: { matchId, teamId },
      include: { player: true },
    });
    const snapshot = await getTeamSnapshotAtMinute(
      this.prisma,
      matchId,
      teamId,
      minute,
    );
    const onPitchIds = new Set((snapshot?.lineup ?? []).map((p) => p.playerId));

    const subsSoFar = await this.prisma.matchEvent.findMany({
      where: { matchId, teamId, type: 'SUBSTITUTION', minute: { lte: minute } },
    });
    const alreadyRemovedIds = new Set(
      subsSoFar.map(
        (e) => (JSON.parse(e.payload) as { outPlayerId: number }).outPlayerId,
      ),
    );

    return squad
      .filter(
        (s) => !onPitchIds.has(s.playerId) && !alreadyRemovedIds.has(s.playerId),
      )
      .map((s) => ({
        playerId: s.playerId,
        name: s.player.name,
        jerseyNumber: s.jerseyNumber,
      }));
  }

  async getOpponentTendencies(teamId: number) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException(`Team not found: id=${teamId}`);

    const matches = await this.prisma.match.findMany({
      where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    });
    const matchIds = matches.map((m) => m.id);

    const formationEvents = await this.prisma.matchEvent.findMany({
      where: {
        matchId: { in: matchIds },
        teamId,
        type: { in: ['STARTING_XI', 'TACTICAL_SHIFT'] },
      },
    });
    const formationCounts = new Map<string, number>();
    for (const e of formationEvents) {
      const { formation } = JSON.parse(e.payload) as { formation: string };
      formationCounts.set(formation, (formationCounts.get(formation) ?? 0) + 1);
    }

    let goalsFor = 0;
    let goalsAgainst = 0;
    for (const m of matches) {
      const isHome = m.homeTeamId === teamId;
      goalsFor += isHome ? m.homeScore : m.awayScore;
      goalsAgainst += isHome ? m.awayScore : m.homeScore;
    }

    return {
      teamId,
      teamName: team.name,
      matchesPlayed: matches.length,
      goalsFor,
      goalsAgainst,
      formationsUsed: Object.fromEntries(formationCounts),
    };
  }
}
