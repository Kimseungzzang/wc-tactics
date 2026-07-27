import type { MatchBallEventLite, MatchStats, TeamMatchStats, WhatIfMoment } from './types';

export interface PartialTeamStats {
  shots: number;
  shotsOnTarget: number;
  xg: number;
}

export interface PlayerMatchStats {
  playerId: number;
  playerName: string;
  teamId: number;
  goals: number;
  shots: number;
  shotsOnTarget: number;
  touches: number;
}

// Mirrors what-if.service.ts's MOMENT_TYPE_TO_BALL_EVENT_TYPE exactly - a
// WhatIfMoment's type is a phase-of-play label, not a ball-touch type, so
// it has to be mapped onto the same touch vocabulary the backend persists
// (and computeBallEventStats already counts by) before it can feed the
// same stats function as real ball events.
const MOMENT_TYPE_TO_BALL_EVENT_TYPE: Record<WhatIfMoment['type'], string> = {
  BUILD_UP: 'Pass',
  CHANCE: 'Carry',
  SHOT: 'Shot',
  TURNOVER: 'Carry',
  CLEARANCE: 'Carry',
};

/**
 * Converts live AI-generated moments (client-side `whatIf` state, updated
 * per streamed chunk) into the same shape the server-persisted ball
 * events use, so the main stats panel can read from whichever source
 * actually has the current match's content instead of always trusting
 * the page's initial `match.ballEvents` snapshot - which, for a match
 * that's still being generated, never has more than the synthetic
 * kickoff anchor no matter how far playback/generation has actually
 * gotten (see MatchBoard's `effectiveBallEvents`).
 */
export function momentsToLiteEvents(moments: WhatIfMoment[]): MatchBallEventLite[] {
  return moments.map((m, i) => ({
    id: `live-${i}-${m.atMinute ?? 0}-${m.atSecond ?? 0}-${m.offsetSeconds}`,
    teamId: m.teamId,
    type: MOMENT_TYPE_TO_BALL_EVENT_TYPE[m.type],
    outcome: m.outcome,
    minute: m.atMinute ?? 0,
    second: m.atSecond ?? 0,
    playerId: m.playerId,
    playerName: m.playerName,
  }));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Stats panel numbers, derived entirely by counting/aggregating the raw
 * ball-event list rather than a separately-invented figure - and
 * recomputed here (not once on the server) so the panel can show either
 * the full match or "as of the current minute", live, as the clock ticks.
 * Passing accuracy and xG have no per-event tracking of their own (this
 * project never models a failed pass or a shot's true quality), so both
 * are deterministic pseudo-random values seeded off the event/team id -
 * stable across reloads, explicitly "구성" like everything else in this
 * data layer.
 */
export function computeBallEventStats(
  events: MatchBallEventLite[],
  homeTeamId: number,
  awayTeamId: number,
  upToMinute?: number,
): MatchStats | null {
  const visible =
    upToMinute == null ? events : events.filter((e) => e.minute <= upToMinute);
  if (visible.length === 0) return null;

  const countFor = (teamId: number, type: string, outcomes?: string[]): number =>
    visible.filter(
      (e) =>
        e.teamId === teamId &&
        e.type === type &&
        (!outcomes || outcomes.includes(e.outcome ?? '')),
    ).length;

  const totalPossessionTouches =
    [homeTeamId, awayTeamId].reduce(
      (sum, id) => sum + countFor(id, 'Pass') + countFor(id, 'Carry'),
      0,
    ) || 1;

  const statsFor = (teamId: number, opponentId: number): TeamMatchStats => {
    const passes = countFor(teamId, 'Pass');
    const passAccuracy = 74 + (hashString(`${teamId}-acc`) % 18);
    const xg = visible
      .filter((e) => e.teamId === teamId && e.type === 'Shot')
      .reduce((sum, e) => {
        const base = e.outcome === 'Goal' ? 0.35 : 0.08;
        const roll = (hashString(e.id) % 100) / 100;
        return sum + base + roll * 0.25;
      }, 0);

    return {
      possession: Math.round(
        ((countFor(teamId, 'Pass') + countFor(teamId, 'Carry')) / totalPossessionTouches) * 100,
      ),
      shots: countFor(teamId, 'Shot'),
      shotsOnTarget: countFor(teamId, 'Shot', ['Goal', 'Saved']),
      corners: countFor(teamId, 'Corner'),
      passes,
      passesCompleted: Math.round(passes * (passAccuracy / 100)),
      passAccuracy,
      saves: countFor(opponentId, 'Shot', ['Saved']),
      xg: Math.round(xg * 100) / 100,
    };
  };

  return {
    home: statsFor(homeTeamId, awayTeamId),
    away: statsFor(awayTeamId, homeTeamId),
  };
}

/** Same counting principle, applied to an AI what-if scenario's generated
 * moments instead of stored ball events - the "AI 생성 구간" stats panel
 * is derived from the same moments the commentary log already shows, not
 * a separate model call that could disagree with the narrative. Filters
 * to moments the clock has actually reached, same as the ball-event
 * version, so it doesn't count moments generated ahead of playback. */
export function computeMomentStats(
  moments: WhatIfMoment[],
  homeTeamId: number,
  awayTeamId: number,
  rollbackMinute: number,
  upToT?: number,
): { home: PartialTeamStats; away: PartialTeamStats } {
  const visible =
    upToT == null
      ? moments
      : moments.filter((m) => {
          const atMinute = m.atMinute ?? rollbackMinute + Math.floor(m.offsetSeconds / 60);
          const atSecond = m.atSecond ?? m.offsetSeconds % 60;
          return atMinute * 60 + atSecond <= upToT;
        });

  const statsFor = (teamId: number): PartialTeamStats => {
    const shotMoments = visible.filter((m) => m.teamId === teamId && m.type === 'SHOT');
    const xg = shotMoments.reduce((sum, m, i) => {
      const base = m.outcome === 'Goal' ? 0.35 : 0.08;
      const roll = (hashString(`${teamId}-${i}-${m.offsetSeconds}`) % 100) / 100;
      return sum + base + roll * 0.25;
    }, 0);
    return {
      shots: shotMoments.length,
      shotsOnTarget: shotMoments.filter((m) => m.outcome === 'Goal' || m.outcome === 'Saved').length,
      xg: Math.round(xg * 100) / 100,
    };
  };
  return { home: statsFor(homeTeamId), away: statsFor(awayTeamId) };
}

/**
 * Per-player breakdown, counted the same way as the team panel above -
 * goals/shots/shots-on-target from Shot events, touches from every event
 * the player was directly involved in. No assist tracking: a WhatIfMoment
 * only records who acted, not who they passed to (recipientId is always
 * null on AI-generated events), so an assist figure would have nothing
 * real to count from.
 */
export function computePlayerStats(
  events: MatchBallEventLite[],
  upToMinute?: number,
): PlayerMatchStats[] {
  const visible =
    upToMinute == null ? events : events.filter((e) => e.minute <= upToMinute);

  const byPlayer = new Map<number, PlayerMatchStats>();
  for (const e of visible) {
    if (e.playerId == null || e.playerName == null) continue;
    let stats = byPlayer.get(e.playerId);
    if (!stats) {
      stats = {
        playerId: e.playerId,
        playerName: e.playerName,
        teamId: e.teamId,
        goals: 0,
        shots: 0,
        shotsOnTarget: 0,
        touches: 0,
      };
      byPlayer.set(e.playerId, stats);
    }
    stats.touches += 1;
    if (e.type === 'Shot') {
      stats.shots += 1;
      if (e.outcome === 'Goal' || e.outcome === 'Saved') stats.shotsOnTarget += 1;
      if (e.outcome === 'Goal') stats.goals += 1;
    }
  }
  return [...byPlayer.values()];
}
