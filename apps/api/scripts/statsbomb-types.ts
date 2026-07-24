// Narrow types covering only the StatsBomb Open Data fields the seed script reads.
// Source: https://github.com/statsbomb/open-data (competition_id=43, season_id=106 = 2022 World Cup)

export interface SbTeamRef {
  home_team_id?: number;
  home_team_name?: string;
  away_team_id?: number;
  away_team_name?: string;
  managers?: { name: string }[];
}

export interface SbMatch {
  match_id: number;
  match_date: string;
  kick_off: string;
  home_team: SbTeamRef;
  away_team: SbTeamRef;
  home_score: number;
  away_score: number;
  competition_stage?: { name: string };
  match_week?: number;
  stadium?: { name: string };
  referee?: { name: string };
}

export interface SbLineupPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number;
}

export interface SbLineupTeam {
  team_id: number;
  team_name: string;
  lineup: SbLineupPlayer[];
}

export interface SbEventTeam {
  id: number;
  name: string;
}

export interface SbEventPlayer {
  id: number;
  name: string;
}

export interface SbTacticsLineupEntry {
  player: SbEventPlayer;
  position: { id: number; name: string };
  jersey_number: number;
}

export interface SbEvent {
  id: string;
  index: number;
  period: number;
  minute: number;
  second: number;
  duration?: number;
  location?: [number, number];
  type: { id: number; name: string };
  team?: SbEventTeam;
  player?: SbEventPlayer;
  related_events?: string[];
  tactics?: {
    formation: number;
    lineup: SbTacticsLineupEntry[];
  };
  substitution?: {
    replacement: SbEventPlayer;
  };
  position?: { id: number; name: string };
  pass?: {
    recipient?: SbEventPlayer;
    end_location?: [number, number];
    outcome?: { name: string };
  };
  carry?: {
    end_location: [number, number];
  };
  dribble?: {
    outcome?: { name: string };
  };
  duel?: {
    type?: { name: string };
    outcome?: { name: string };
  };
  interception?: {
    outcome?: { name: string };
  };
  shot?: {
    statsbomb_xg?: number;
    end_location?: [number, number, number?];
    outcome?: { name: string };
  };
  foul_committed?: {
    card?: { name: string };
  };
}
