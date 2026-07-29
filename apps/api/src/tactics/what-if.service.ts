import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import { RecommendTacticsDto } from './dto/recommend-tactics.dto';
import { buildMatchSimContext } from '../lib/match-sim-context';
import {
  simulateTeamShape,
  type SimBallEvent,
  type SimSnapshotPlayer,
  type TacticalDial,
} from '../lib/team-shape-simulator';
import type { WhatIfCheckpoint, WhatIfMoment } from './what-if-scenario.type';

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
 * so the LLM only has to decide who/what/when/outcome - never raw x/y.
 * Each moment's acting player is given a real start->end run (previous ball
 * spot -> newly resolved spot) rather than a bare point, so the moment's
 * playerId in team-shape-simulator.ts is grounded exactly like a real
 * MatchBallEvent's Carry - one player visibly moves the ball, not just the
 * ball dot in isolation. */
const ZONE_Y: Record<WhatIfMoment['zone'], number> = {
  left: 16,
  center: 40,
  right: 64,
};

/**
 * Maps each moment straight to a pitch position using the zone/progress
 * the model itself provided alongside the commentary - not a generic
 * per-type heuristic. Since the same JSON object that wrote the
 * commentary also chose zone/progress, the ball's movement is
 * structurally tied to what the text describes (a "왼쪽 측면" moment
 * really does end up on the left, a "페널티 박스" chance really is deep),
 * rather than the two being generated independently and only loosely
 * correlated by moment type.
 */
function momentsToBallEvents(
  moments: WhatIfMoment[],
  rollbackT: number,
  rollbackMinute: number,
  rollbackPeriod: number,
  startX: number,
  startY: number,
  attackDirection: (teamId: number, period: number) => 1 | -1,
): SimBallEvent[] {
  const events: SimBallEvent[] = [];
  let lastX = startX;
  let lastY = startY;

  moments.forEach((m, idx) => {
    const dir = attackDirection(m.teamId, rollbackPeriod);
    // Gemini's output is instructed to always include these, but it's an
    // external model response, not a type-checked contract - fall back to
    // a neutral position rather than propagating NaN if either is missing.
    const p = clamp(
      (Number.isFinite(m.progress) ? m.progress : 50) / 100,
      0,
      1,
    );
    const endX = dir === 1 ? p * PITCH_LENGTH : PITCH_LENGTH - p * PITCH_LENGTH;
    const zoneY = ZONE_Y[m.zone] ?? ZONE_Y.center;
    // Attacking toward the low-X end visually mirrors the pitch, so the
    // zone's absolute Y also flips to keep "left"/"right" meaning the
    // same side of the goal regardless of which half the team defends.
    const endY = clamp(
      dir === 1 ? zoneY : PITCH_WIDTH - zoneY,
      6,
      PITCH_WIDTH - 6,
    );
    const offsetSeconds = Math.max(0, m.offsetSeconds);
    const contStart = rollbackT + offsetSeconds;
    const duration = m.type === 'SHOT' ? 1.5 : 4;

    events.push({
      id: `whatif-${idx}`,
      teamId: m.teamId,
      type: 'Carry',
      period: rollbackPeriod,
      minute: rollbackMinute + Math.floor(offsetSeconds / 60),
      second: Math.floor(offsetSeconds % 60),
      duration,
      x: lastX,
      y: lastY,
      endX,
      endY,
      contStart,
      contEnd: contStart + duration,
      playerId: m.playerId,
      recipientId: null,
    });

    lastX = endX;
    lastY = endY;
  });

  return events;
}

export interface WhatIfChunk {
  chunkIndex: number;
  summary: string;
  moments: WhatIfMoment[];
  frames: ReturnType<typeof simulateTeamShape>['frames'];
  done: boolean;
  /** Set when this chunk paused on a free-kick decision instead of
   * resolving it - the stream ends here (so `done` is also true) even
   * though the match itself isn't over; the client resumes by calling
   * generateStream again with proposedChange.checkpointChoice set. */
  checkpoint?: WhatIfCheckpoint | null;
}

// A WhatIfMoment's type is a phase-of-play label, not a ball-touch type -
// mapped onto MatchBallEvent's touch vocabulary so the existing client-
// side stats aggregation (computeBallEventStats, unchanged) keeps working
// unmodified: BUILD_UP/CHANCE read as puse touches, SHOT stays a Shot,
// TURNOVER/CLEARANCE both read as a Carry by the team that just won the ball:
// BUILD_UP/CHANCE read as possession touches, SHOT stays a Shot.
const MOMENT_TYPE_TO_BALL_EVENT_TYPE: Record<WhatIfMoment['type'], string> = {
  BUILD_UP: 'Pass',
  CHANCE: 'Carry',
  SHOT: 'Shot',
  TURNOVER: 'Carry',
  CLEARANCE: 'Carry',
};

// A real match runs ~90-120 minutes; asking Gemini for the whole remaining
// game in one response risks truncated/invalid JSON (already observed with
// far shorter outputs) and a very long time-to-first-frame. Instead each
// call only covers one ~8 minute chunk, and chunks are generated/streamed
// one at a time until the real match's last recorded minute is reached.
//
// The prompt deliberately tells Gemini not to force-fill a full 8 minutes
// of moments ("실제 경기의 1/3 수준 밀도면 충분하니 억지로 채우지 말고"),
// so real chunks routinely land well short of 480 real-game seconds
// (observed as low as ~4-5 minutes/chunk on average) - at 12 chunks that
// can under-run 90 minutes by a wide margin and cut the match off early
// (the loop force-stops once chunkIndex hits MAX_CHUNKS-1 regardless of
// curMinute). Generous headroom here is nearly free: the loop already
// exits the moment curMinute reaches targetEndMinute, so a normally-paced
// match never spends the extra chunks - this only matters for slow-paced
// ones that would otherwise truncate.
const MAX_CHUNKS = 30;

@Injectable()
export class WhatIfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  async *generateStream(
    matchId: number,
    dto: RecommendTacticsDto,
  ): AsyncGenerator<WhatIfChunk> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
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
    let curT = 0;
    let curX = 60;
    let curY = 40;
    for (const e of ctx.ballEvents) {
      if (e.minute <= dto.minute) {
        rollbackPeriod = e.period;
        curT = e.contStart;
        curX = e.endX ?? e.x;
        curY = e.endY ?? e.y;
      }
    }
    // Every match is now AI-generated from a single synthetic kickoff
    // anchor (see campaigns.service.ts's submitLineup) - there's no real
    // longer history to derive a duration from, so this is always just
    // "play to full time" rather than the last persisted event's minute
    // (which, once mid-chunk persistence is in play, would just be
    // "how far the match has gotten so far", not the target at all).
    const targetEndMinute = 90;

    const managedLineupBase = ctx.getLineupAt(dto.teamId, dto.minute, 59);
    const opponentLineup = ctx.getLineupAt(opponentTeamId, dto.minute, 59);
    const managedLineup = applySubstitutions(
      managedLineupBase,
      dto.proposedChange?.substitutions,
    );
    const lineups = new Map<number, SimSnapshotPlayer[]>([
      [dto.teamId, managedLineup],
      [opponentTeamId, opponentLineup],
    ]);

    // The managed team's dial can be overridden live by the user
    // (proposedChange.tacticalDial); the opponent always plays its
    // generated baseline profile. Falls back to neutral (50/50/50) for a
    // team with no seeded profile, matching the simulator's own default.
    const profiles = await this.prisma.teamTacticalProfile.findMany({
      where: { teamId: { in: ctx.teamIds } },
    });
    const profileByTeam = new Map(profiles.map((p) => [p.teamId, p]));
    const NEUTRAL: TacticalDial = {
      pressingIntensity: 50,
      possessionStyle: 50,
      defensiveLine: 50,
    };
    function baselineDial(teamId: number): TacticalDial {
      const p = profileByTeam.get(teamId);
      return p
        ? {
            pressingIntensity: p.pressingIntensity,
            possessionStyle: p.possessionStyle,
            defensiveLine: p.defensiveLine,
          }
        : NEUTRAL;
    }
    const managedDial = dto.proposedChange?.tacticalDial;
    function getTacticalDial(teamId: number): TacticalDial {
      if (teamId === dto.teamId && managedDial) return managedDial;
      return baselineDial(teamId);
    }

    // A rollback/intervention regenerates everything from this minute
    // onward - clear whatever "old future" was already persisted from a
    // previous generation so the two timelines don't end up mixed
    // together in the same match's ball-event log. The synthetic kickoff
    // anchor is never touched (it's always at minute 0 and has no
    // commentary, so it's excluded from the narrated log anyway).
    await this.prisma.matchBallEvent.deleteMany({
      where: {
        matchId,
        minute: { gte: dto.minute },
        NOT: { id: { startsWith: 'kickoff-' } },
      },
    });

    let curMinute = dto.minute;
    const priorSummaries: string[] = [];
    // A resumed checkpoint's proposedChange.checkpointChoice must only
    // steer the FIRST chunk of this call ("resolve this exact free kick
    // next") - reusing `dto` unmodified every loop iteration would keep
    // re-injecting that instruction into every later chunk too, making
    // Gemini repeat the same player's free kick over and over instead of
    // moving the match on.
    let effectiveProposedChange = dto.proposedChange;
    // Observed in practice: right after resolving a checkpoint, Gemini
    // tends to hand the manager's team ANOTHER foul in the very next
    // chunk (sometimes several chunks in a row) - narratively plausible
    // once, exhausting as a UX pattern when it repeats every ~5 real
    // minutes. Not honoring a checkpoint for a couple of chunks right
    // after a resume forces real match-time breathing room between them,
    // regardless of what the model itself proposes.
    let checkpointCooldownChunks = dto.proposedChange?.checkpointChoice ? 2 : 0;

    for (let chunkIndex = 0; chunkIndex < MAX_CHUNKS; chunkIndex++) {
      const chunkDto = { ...dto, minute: curMinute, proposedChange: effectiveProposedChange };
      const checkpointEligible = checkpointCooldownChunks <= 0;
      if (checkpointCooldownChunks > 0) checkpointCooldownChunks -= 1;
      // Gemini occasionally returns an empty moment list for no real reason
      // (not a genuine "match is effectively over" signal - we're nowhere
      // near targetEndMinute when it happens) - retry a couple of times
      // before treating the scenario as finished, so a single flaky reply
      // doesn't cut a what-if 30 minutes short of full time.
      let scenario = await this.gemini.generateWhatIfScenario(
        matchId,
        opponentTeamId,
        chunkDto,
        priorSummaries,
      );
      let retries = 0;
      while (scenario.moments.length === 0 && retries < 2) {
        retries += 1;
        scenario = await this.gemini.generateWhatIfScenario(
          matchId,
          opponentTeamId,
          chunkDto,
          priorSummaries,
        );
      }
      if (effectiveProposedChange?.checkpointChoice) {
        effectiveProposedChange = { ...effectiveProposedChange, checkpointChoice: undefined };
      }

      const ballEvents = momentsToBallEvents(
        scenario.moments,
        curT,
        curMinute,
        rollbackPeriod,
        curX,
        curY,
        ctx.attackDirection,
      );

      if (ballEvents.length === 0) {
        yield {
          chunkIndex,
          summary: scenario.summary,
          moments: [],
          frames: [],
          done: true,
        };
        return;
      }

      const { frames } = simulateTeamShape({
        ballEvents,
        teamIds: ctx.teamIds,
        getLineup: (teamId) => lineups.get(teamId) ?? [],
        attackDirection: ctx.attackDirection,
        getTacticalDial,
      });

      // ballEvents has exactly one entry per moment, in the same order -
      // zip them back together so each moment carries the absolute match
      // clock it resolves to (offsetSeconds alone resets to 0 every chunk).
      const resolvedMoments = scenario.moments.map((m, i) => ({
        ...m,
        atMinute: ballEvents[i]?.minute ?? curMinute,
        atSecond: ballEvents[i]?.second ?? 0,
      }));

      // Persist every moment of this chunk as a MatchBallEvent row, with
      // the AI's own commentary attached - so matches.service.ts's
      // detail() (live stats panel, narrated log) reflects exactly what's
      // been generated so far, and re-opening an in-progress match picks
      // up where it left off instead of losing everything already played.
      // Ids use a random suffix (not just chunkIndex/i) because chunkIndex
      // resets to 0 on every fresh generateStream() call - a checkpoint
      // resume (or any rollback whose target minute doesn't retroactively
      // cover an earlier, still-persisted call's low chunk indices) would
      // otherwise regenerate an id an earlier call already used and hit
      // MatchBallEvent's unique constraint.
      await this.prisma.matchBallEvent.createMany({
        data: resolvedMoments.map((m, i) => {
          const be = ballEvents[i];
          return {
            id: `whatif-${matchId}-${chunkIndex}-${i}-${randomUUID()}`,
            matchId,
            teamId: m.teamId,
            type: MOMENT_TYPE_TO_BALL_EVENT_TYPE[m.type],
            period: rollbackPeriod,
            minute: m.atMinute,
            second: m.atSecond,
            duration: be.duration,
            playerId: m.playerId,
            playerName: m.playerName,
            x: be.x,
            y: be.y,
            endX: be.endX,
            endY: be.endY,
            outcome: m.outcome,
            commentary: m.commentary,
          };
        }),
      });

      const lastEvent = ballEvents[ballEvents.length - 1];
      curT = lastEvent.contEnd;
      curMinute = lastEvent.minute;
      curX = lastEvent.endX ?? lastEvent.x;
      curY = lastEvent.endY ?? lastEvent.y;
      priorSummaries.push(scenario.summary);

      // A free-kick checkpoint pauses the whole stream here (not just this
      // chunk) - resuming with a chosen kicker is a fresh generateStream
      // call (with proposedChange.checkpointChoice set), not another loop
      // iteration, so this has to return rather than keep going. Only
      // trusted for the manager's own team (dto.teamId) - the prompt
      // already says not to pause for the opponent's set pieces (the user
      // has no business picking an opponent player), but that's a natural-
      // language instruction, not an enforced constraint, so a checkpoint
      // for any other team is just discarded here rather than surfaced.
      if (scenario.checkpoint && scenario.checkpoint.teamId === dto.teamId && checkpointEligible) {
        yield {
          chunkIndex,
          summary: scenario.summary,
          moments: resolvedMoments,
          frames,
          done: true,
          checkpoint: { ...scenario.checkpoint, atMinute: curMinute, atSecond: lastEvent.second },
        };
        return;
      }

      const reachedEnd =
        curMinute >= targetEndMinute || chunkIndex === MAX_CHUNKS - 1;
      yield {
        chunkIndex,
        summary: scenario.summary,
        moments: resolvedMoments,
        frames,
        done: reachedEnd,
      };
      if (reachedEnd) return;
    }
  }
}
