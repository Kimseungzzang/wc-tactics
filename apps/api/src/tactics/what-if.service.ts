import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import { RecommendTacticsDto } from './dto/recommend-tactics.dto';
import { buildMatchSimContext } from '../lib/match-sim-context';
import {
  simulateTeamShape,
  type SimBallEvent,
  type SimSnapshotPlayer,
} from '../lib/team-shape-simulator';
import type { WhatIfMoment } from './what-if-scenario.type';

const PITCH_LENGTH = 120;
const PITCH_WIDTH = 80;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function applySubstitutions(
  lineup: SimSnapshotPlayer[],
  substitutions: { outPlayerId: number; inPlayerId: number }[] | undefined,
): SimSnapshotPlayer[] {
  if (!substitutions || substitutions.length === 0) return lineup;
  let next = lineup;
  for (const sub of substitutions) {
    next = next.map((p) =>
      p.playerId === sub.outPlayerId ? { ...p, playerId: sub.inPlayerId } : p,
    );
  }
  return next;
}

/** Deterministically maps AI-generated high-level moments to pitch coordinates,
 * so the LLM only has to decide who/what/when/outcome - never raw x/y. */
function momentsToBallEvents(
  moments: WhatIfMoment[],
  rollbackT: number,
  rollbackMinute: number,
  rollbackPeriod: number,
  attackDirection: (teamId: number, period: number) => 1 | -1,
): SimBallEvent[] {
  const progress = new Map<number, number>();
  const events: SimBallEvent[] = [];

  moments.forEach((m, idx) => {
    const dir = attackDirection(m.teamId, rollbackPeriod);
    let p = progress.get(m.teamId) ?? 0.5;
    switch (m.type) {
      case 'BUILD_UP':
        p = clamp(p + 0.15, 0, 0.75);
        break;
      case 'CHANCE':
        p = clamp(p + 0.12, 0, 0.9);
        break;
      case 'SHOT':
        p = 0.92;
        break;
      case 'CLEARANCE':
        p = 0.25;
        break;
      case 'TURNOVER':
        p = 0.3;
        break;
    }
    progress.set(m.teamId, p);

    const x = dir === 1 ? p * PITCH_LENGTH : PITCH_LENGTH - p * PITCH_LENGTH;
    const y = clamp(40 + 14 * Math.sin((idx + 1) * 1.7), 8, PITCH_WIDTH - 8);
    const offsetSeconds = Math.max(0, m.offsetSeconds);
    const contStart = rollbackT + offsetSeconds;
    const duration = m.type === 'SHOT' ? 1.5 : 4;

    events.push({
      id: `whatif-${idx}`,
      teamId: m.teamId,
      period: rollbackPeriod,
      minute: rollbackMinute + Math.floor(offsetSeconds / 60),
      second: Math.floor(offsetSeconds % 60),
      duration,
      x,
      y,
      endX: null,
      endY: null,
      contStart,
      contEnd: contStart + duration,
    });
  });

  return events;
}

@Injectable()
export class WhatIfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  async generate(matchId: number, dto: RecommendTacticsDto) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException(`Match not found: id=${matchId}`);

    const opponentTeamId =
      dto.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

    const ctx = await buildMatchSimContext(this.prisma, matchId);
    if (ctx.ballEvents.length === 0) {
      throw new NotFoundException(
        `No ball-event data for match ${matchId} yet - real match replay must be seeded first`,
      );
    }

    // Find the chronologically-latest real event at or before the rollback
    // minute (scanning in true chronological order, since raw minute
    // overlaps across periods - see match-clock.ts).
    let rollbackPeriod = 1;
    let rollbackT = 0;
    for (const e of ctx.ballEvents) {
      if (e.minute <= dto.minute) {
        rollbackPeriod = e.period;
        rollbackT = e.contStart;
      }
    }

    const managedLineupBase = ctx.getLineupAt(dto.teamId, dto.minute, 59);
    const opponentLineup = ctx.getLineupAt(opponentTeamId, dto.minute, 59);
    const managedLineup = applySubstitutions(
      managedLineupBase,
      dto.proposedChange?.substitutions,
    );

    const scenario = await this.gemini.generateWhatIfScenario(matchId, opponentTeamId, dto);

    const ballEvents = momentsToBallEvents(
      scenario.moments,
      rollbackT,
      dto.minute,
      rollbackPeriod,
      ctx.attackDirection,
    );

    if (ballEvents.length === 0) {
      return { summary: scenario.summary, moments: scenario.moments, frames: [] };
    }

    const lineups = new Map<number, SimSnapshotPlayer[]>([
      [dto.teamId, managedLineup],
      [opponentTeamId, opponentLineup],
    ]);

    const { frames } = simulateTeamShape({
      ballEvents,
      teamIds: ctx.teamIds,
      getLineup: (teamId) => lineups.get(teamId) ?? [],
      attackDirection: ctx.attackDirection,
    });

    return { summary: scenario.summary, moments: scenario.moments, frames };
  }
}
