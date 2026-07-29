export interface TeamRef {
  id: number;
  name: string;
}

export interface SquadEntry {
  playerId: number;
  name: string;
  jerseyNumber: number;
  position: string;
}

/** The manager's own most recently submitted starting XI anywhere in this
 * campaign, if any - used to pre-fill the lineup screen for their next
 * match instead of starting from a blank pitch every time. */
export interface PreviousLineup {
  formation: string;
  goalkeeperPlayerId: number;
  outfieldPlayerIds: number[];
}

/** 0-100 dials, 50 = neutral baseline. Mirrors the backend TeamTacticalProfile
 * / TacticalDial shape - see team-shape-simulator.ts on the API side for
 * what each value actually does to player positioning and pressing. */
export interface TacticalProfile {
  pressingIntensity: number;
  possessionStyle: number;
  defensiveLine: number;
}

export interface TeamMatchStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  passes: number;
  passesCompleted: number;
  passAccuracy: number;
  saves: number;
  xg: number;
}

export interface MatchStats {
  home: TeamMatchStats;
  away: TeamMatchStats;
}

/** Lightweight per-event projection used to compute (and live-update) the
 * stats panel client-side - see lib/matchStats.ts. */
export interface MatchBallEventLite {
  id: string;
  teamId: number;
  type: string;
  outcome: string | null;
  minute: number;
  second: number;
  playerId: number | null;
  playerName: string | null;
}

/** A narrated moment from the match's AI-generated ball-event stream - the
 * AI writes `commentary` itself (see what-if.service.ts), this isn't a
 * template pick. `isGoal` drives the goal flash/banner in MatchBoard. */
export interface MatchHighlight {
  id: string;
  teamId: number;
  minute: number;
  second: number;
  playerName: string | null;
  isGoal: boolean;
  commentary: string;
}

export interface MatchDetail {
  id: number;
  competitionStage: string;
  matchWeek: number;
  played: boolean;
  homeTeam: TeamRef & { tacticalProfile: TacticalProfile | null };
  awayTeam: TeamRef & { tacticalProfile: TacticalProfile | null };
  homeScore: number;
  awayScore: number;
  ballEvents: MatchBallEventLite[];
  highlights: MatchHighlight[];
  squads: Record<string, SquadEntry[]>;
}

export interface SnapshotPlayer {
  playerId: number;
  name: string;
  jerseyNumber: number;
  positionId: number;
  positionName: string;
}

export interface TeamSnapshot {
  teamId: number;
  teamName: string;
  formation: string;
  lineup: SnapshotPlayer[];
}

export interface MatchSnapshotResponse {
  matchId: number;
  minute: number;
  home: TeamSnapshot | null;
  away: TeamSnapshot | null;
}

export interface PositionCoordinate {
  id: number;
  name: string;
  x: number;
  y: number;
}

export interface ProposedSubstitution {
  outPlayerId: number;
  inPlayerId: number;
}

/** Resumes a paused free-kick/penalty checkpoint with the user's chosen
 * kicker - only set on the follow-up request that continues the same
 * scenario from where WhatIfChunk.checkpoint paused it. */
export interface CheckpointChoice {
  kind: 'FREE_KICK' | 'PENALTY';
  playerId: number;
  playerName: string;
}

export interface ProposedChange {
  formation?: string;
  substitutions?: ProposedSubstitution[];
  tacticalDial?: TacticalProfile;
  checkpointChoice?: CheckpointChoice;
}

export interface RecommendTacticsRequest {
  minute: number;
  teamId: number;
  proposedChange?: ProposedChange;
}

export interface RecommendedSubstitution {
  outPlayerId: number;
  outName: string;
  inPlayerId: number;
  inName: string;
  reason: string;
}

export interface MatchFramePlayer {
  playerId: number;
  teamId: number;
  x: number;
  y: number;
}

export interface MatchFrame {
  t: number;
  period: number;
  minute: number;
  second: number;
  ballX: number;
  ballY: number;
  players: MatchFramePlayer[];
}

export interface TacticsRecommendation {
  recommendedFormation: string | null;
  substitutions: RecommendedSubstitution[];
  reasoning: string;
  verdictOnUserChange: string | null;
}

export type WhatIfMomentType = 'BUILD_UP' | 'CHANCE' | 'SHOT' | 'TURNOVER' | 'CLEARANCE';
export type WhatIfOutcome =
  | 'Complete'
  | 'Goal'
  | 'Saved'
  | 'Blocked'
  | 'OffTarget'
  | 'Won'
  | 'Lost';

export type WhatIfZone = 'left' | 'center' | 'right';

export interface WhatIfMoment {
  offsetSeconds: number;
  teamId: number;
  playerId: number;
  playerName: string;
  type: WhatIfMomentType;
  outcome: WhatIfOutcome;
  commentary: string;
  /** Pitch position the model chose for this moment - the backend derives
   * the ball's actual coordinates from these (not from `type`), so the
   * pitch stays consistent with what `commentary` describes. */
  zone: WhatIfZone;
  progress: number;
  /** Absolute match clock this moment resolves to (offsetSeconds resets to
   * 0 at the start of every streamed chunk, so it alone isn't enough). */
  atMinute?: number;
  atSecond?: number;
}

export interface PlayerAttributesBlock {
  pace: number;
  shooting: number;
  passing: number;
  defending: number;
  physical: number;
  stamina: number;
}

/** No more tournament-wide appearances/goals/cards record - every campaign
 * is its own random draw/schedule, so a team's/player's history only means
 * something within one campaign (see TacticsToolsService.getOpponentTendencies
 * on the API side for the equivalent, campaign-scoped idea for teams). */
export interface PlayerStatsResponse {
  playerId: number;
  name: string;
  attributes: PlayerAttributesBlock | null;
}

/** A generated chunk can pause on a direct free-kick/penalty chance
 * instead of resolving it - see WhatIfService.generateStream on the API
 * side. The client resumes by calling generateWhatIfStream again with
 * proposedChange.checkpointChoice set to the picked kicker. */
export interface WhatIfCheckpoint {
  kind: 'FREE_KICK' | 'PENALTY';
  teamId: number;
  description: string;
  eligiblePlayers: { playerId: number; name: string }[];
  atMinute: number;
  atSecond: number;
}

export interface WhatIfChunk {
  chunkIndex: number;
  summary: string;
  moments: WhatIfMoment[];
  frames: MatchFrame[];
  done: boolean;
  checkpoint?: WhatIfCheckpoint | null;
  error?: string;
}

export type CampaignOutcome = 'WIN' | 'DRAW' | 'LOSS';

export interface CampaignRecord {
  wins: number;
  draws: number;
  losses: number;
}

/** Only present when a knockout-stage draw was resolved by the interactive
 * PenaltyShootout flow (see campaigns.service.ts's recordResult) - the real
 * shootout tally, shown alongside the (already tie-broken) match score. */
export interface PenaltyResult {
  myScore: number;
  opponentScore: number;
}

export interface CampaignFixture {
  matchId: number;
  opponentName: string;
  stage: string;
  matchWeek: number;
  result: {
    myScore: number;
    opponentScore: number;
    outcome: CampaignOutcome;
    penalty: PenaltyResult | null;
  };
}

export interface CampaignNextMatch {
  matchId: number;
  opponentName: string;
  stage: string;
  matchWeek: number;
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

export interface CampaignDetail {
  id: string;
  teamId: number;
  teamName: string;
  managerNickname: string;
  fixtures: CampaignFixture[];
  nextMatch: CampaignNextMatch | null;
  record: CampaignRecord;
  eliminated: boolean;
  groupStandings: GroupStandingRow[] | null;
}

export interface CampaignSummary {
  campaignId: string;
  teamId: number;
  teamName: string;
  record: CampaignRecord;
}

/** One of the 12 groups from the campaign's real-pot-constrained random
 * draw (see campaigns.service.ts's getFullDraw) - for the post-draw
 * reveal screen, which shows all 12 at once, not just the manager's own. */
export interface FullDrawGroup {
  letter: string;
  teams: TeamRef[];
}

/** One of the 12 groups' full standings table - for the "다른 조 순위" modal. */
export interface GroupStandingsBlock {
  letter: string;
  standings: GroupStandingRow[];
}

/** One row of a team's leaderboard - every manager who ever started a
 * career with this specific team, ranked by furthest stage reached, then
 * goal difference, then wins (see campaigns.service.ts's
 * getTeamRankings). Comparing across different teams isn't meaningful
 * (team strength varies too much), so this is always scoped to one team. */
export interface TeamRankingRow {
  rank: number;
  campaignId: string;
  managerNickname: string;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  maxStage: string | null;
}

/** One entry on the manager's own team's date-based schedule - played or
 * not (see campaigns.service.ts's getSchedule). `matchWeek` maps to a
 * real calendar date via lib/matchdayDates.ts. */
export interface ScheduleEntry {
  matchId: number;
  matchWeek: number;
  stage: string;
  opponentName: string;
  played: boolean;
  result: {
    myScore: number;
    opponentScore: number;
    outcome: CampaignOutcome;
    penalty: PenaltyResult | null;
  } | null;
}

/** One row of the full 1-48 final tournament ranking, computed once the
 * manager's own campaign has no matches left to play (eliminated or
 * champion) - see campaigns.service.ts's getFinalStandings/
 * simulateRestOfTournament. `stageReached` is 'Champion'/'RunnerUp' for
 * the Final's two teams, otherwise the stage the team was eliminated at
 * (or 'Group Stage' for a team that never left it). */
export interface FinalStandingRow {
  rank: number;
  teamId: number;
  teamName: string;
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

/** Constructed end-of-tournament awards (see campaigns.service.ts's
 * getTournamentAwards doc comment for exactly how each is derived and why
 * there's no Young Player Award - the real roster data has no birth date). */
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

export interface SimulateRestResponse {
  standings: FinalStandingRow[];
  awards: TournamentAwards;
}

/** One knockout-stage match (see campaigns.service.ts's getKnockoutBracket) -
 * `winnerTeamId` is null only for the manager's own not-yet-played match;
 * every background match in a generated stage is simulated immediately, so
 * it's always decided by the time a later stage could reference it. */
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

/** One knockout stage's full set of matches, in STAGE_ORDER order - only
 * stages ensureKnockoutRound has already generated are present. */
export interface BracketStageBlock {
  stage: string;
  matches: BracketMatchRow[];
}
