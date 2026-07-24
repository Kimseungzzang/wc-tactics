export interface TeamRef {
  id: number;
  name: string;
}

export interface MatchSummary {
  id: number;
  matchDate: string;
  kickOff: string;
  competitionStage: string | null;
  matchWeek: number | null;
  stadiumName: string | null;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  homeScore: number;
  awayScore: number;
}

export type MatchEventType =
  | 'STARTING_XI'
  | 'TACTICAL_SHIFT'
  | 'SUBSTITUTION'
  | 'GOAL'
  | 'OWN_GOAL'
  | 'CARD'
  | 'HALF_END';

export interface MatchTimelineEntry {
  id: string;
  type: MatchEventType;
  teamId: number | null;
  period: number;
  minute: number;
  second: number;
  detail: Record<string, unknown>;
}

export interface SquadEntry {
  playerId: number;
  name: string;
  jerseyNumber: number;
  isStarter: boolean;
}

export interface MatchDetail {
  id: number;
  matchDate: string;
  kickOff: string;
  stadiumName: string | null;
  competitionStage: string | null;
  matchWeek: number | null;
  refereeName: string | null;
  homeTeam: TeamRef & { managerName: string | null };
  awayTeam: TeamRef & { managerName: string | null };
  homeScore: number;
  awayScore: number;
  timeline: MatchTimelineEntry[];
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

export interface ProposedChange {
  formation?: string;
  substitutions?: ProposedSubstitution[];
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

export interface WhatIfMoment {
  offsetSeconds: number;
  teamId: number;
  playerId: number;
  playerName: string;
  type: WhatIfMomentType;
  outcome: WhatIfOutcome;
  commentary: string;
}

export interface PlayerAttributesBlock {
  pace: number;
  shooting: number;
  passing: number;
  defending: number;
  physical: number;
  stamina: number;
}

export interface PlayerStatsResponse {
  playerId: number;
  name: string;
  tournamentAppearances: number;
  starts: number;
  goals: number;
  yellowCards: number;
  redCards: number;
  timesBroughtOnAsSub: number;
  timesSubbedOff: number;
  attributes: PlayerAttributesBlock | null;
}

export interface WhatIfScenarioResponse {
  summary: string;
  moments: WhatIfMoment[];
  frames: MatchFrame[];
}
