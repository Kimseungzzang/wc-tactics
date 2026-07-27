import { POSITION_COORDINATES } from '../positions/position-coordinates';

/**
 * Fixed position-id layout per formation - every match is now campaign-
 * generated (no real per-match lineup source exists), so this is the only
 * way a chosen/auto-assigned starting XI gets positioned. Mirrors the
 * formation list SquadPanel offers the user.
 */
export const FORMATION_POSITION_IDS: Record<string, number[]> = {
  '4-3-3': [1, 2, 3, 5, 6, 10, 13, 15, 17, 23, 21],
  '4-4-2': [1, 2, 3, 5, 6, 12, 13, 15, 16, 22, 24],
  '4-2-3-1': [1, 2, 3, 5, 6, 9, 11, 18, 19, 20, 23],
  '3-4-3': [1, 3, 4, 5, 12, 13, 15, 16, 17, 23, 21],
  '3-5-2': [1, 3, 4, 5, 7, 13, 10, 15, 8, 22, 24],
  '5-3-2': [1, 7, 3, 4, 5, 8, 9, 14, 11, 22, 24],
  '4-1-4-1': [1, 2, 3, 5, 6, 10, 12, 13, 15, 16, 23],
  '4-4-1-1': [1, 2, 3, 5, 6, 12, 13, 15, 16, 25, 23],
};

export const DEFAULT_MOCK_FORMATION = '4-3-3';

const POSITION_BY_ID = new Map(POSITION_COORDINATES.map((p) => [p.id, p]));

export interface FormationLineupPlayer {
  playerId: number;
  name: string;
  jerseyNumber: number;
}

/**
 * Assigns each of exactly 11 players a positionId/positionName for the
 * given formation. Assignment order is arbitrary (not role-aware - the
 * caller's player order doesn't need to already be GK-first etc.), which
 * is fine since this only feeds a mock match's initial visual layout and
 * simulation home positions, not a real tactical assignment.
 */
export function assignFormationLineup(
  players: FormationLineupPlayer[],
  formation: string = DEFAULT_MOCK_FORMATION,
) {
  const positionIds =
    FORMATION_POSITION_IDS[formation] ??
    FORMATION_POSITION_IDS[DEFAULT_MOCK_FORMATION];
  return players.slice(0, 11).map((p, i) => {
    const positionId = positionIds[i];
    const position = POSITION_BY_ID.get(positionId);
    return {
      playerId: p.playerId,
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      positionId,
      positionName: position?.name ?? 'Unknown',
    };
  });
}

/**
 * Picks a plausible starting XI (1 GK + a roughly 4-3-3-shaped outfield
 * mix, lowest jersey numbers first within each position group) from a
 * team's real roster - used to auto-assign the opponent's lineup and any
 * background match that never gets an interactive lineup choice. Real
 * players, constructed selection (Wikipedia has no per-match lineup data).
 */
export function defaultStartingXi<
  T extends { id: number; jerseyNumber: number; position: string },
>(roster: T[]): T[] {
  const byPos = (pos: string) =>
    roster
      .filter((p) => p.position === pos)
      .sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const gk = byPos('GK').slice(0, 1);
  const df = byPos('DF').slice(0, 4);
  const mf = byPos('MF').slice(0, 3);
  const fw = byPos('FW').slice(0, 3);
  const xi = [...gk, ...df, ...mf, ...fw];
  if (xi.length === 11) return xi;
  const chosenIds = new Set(xi.map((p) => p.id));
  const rest = roster
    .filter((p) => !chosenIds.has(p.id))
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  return [...xi, ...rest].slice(0, 11);
}
