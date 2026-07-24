export interface RecommendedSubstitution {
  outPlayerId: number;
  outName: string;
  inPlayerId: number;
  inName: string;
  reason: string;
}

export interface TacticsRecommendation {
  recommendedFormation: string | null;
  substitutions: RecommendedSubstitution[];
  reasoning: string;
  verdictOnUserChange: string | null;
}
