/** Mirrors apps/api/src/lib/formation-lineup.ts's FORMATION_POSITION_IDS -
 * slot 0 is always the goalkeeper, slots 1-10 receive the outfield picks
 * in selection order (see campaigns.service.ts submitLineup: chosenIds =
 * [goalkeeperPlayerId, ...outfieldPlayerIds]), so the pitch board here
 * renders the exact same slot assignment the backend will apply. */
export const FORMATIONS = [
  '4-3-3',
  '4-4-2',
  '4-2-3-1',
  '3-4-3',
  '3-5-2',
  '5-3-2',
  '4-1-4-1',
  '4-4-1-1',
] as const;

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

// Mirrors apps/api/src/positions/position-coordinates.ts (x/y as % of
// pitch length/width, attacking left-to-right) plus a short label for
// on-card display.
export interface FormationSlotCoordinate {
  id: number;
  abbrev: string;
  x: number;
  y: number;
}

export const POSITION_COORDINATES: FormationSlotCoordinate[] = [
  { id: 1, abbrev: 'GK', x: 5, y: 50 },
  { id: 2, abbrev: 'RB', x: 20, y: 85 },
  { id: 3, abbrev: 'RCB', x: 18, y: 65 },
  { id: 4, abbrev: 'CB', x: 15, y: 50 },
  { id: 5, abbrev: 'LCB', x: 18, y: 35 },
  { id: 6, abbrev: 'LB', x: 20, y: 15 },
  { id: 7, abbrev: 'RWB', x: 30, y: 90 },
  { id: 8, abbrev: 'LWB', x: 30, y: 10 },
  { id: 9, abbrev: 'RDM', x: 35, y: 65 },
  { id: 10, abbrev: 'CDM', x: 33, y: 50 },
  { id: 11, abbrev: 'LDM', x: 35, y: 35 },
  { id: 12, abbrev: 'RM', x: 50, y: 85 },
  { id: 13, abbrev: 'RCM', x: 48, y: 62 },
  { id: 14, abbrev: 'CM', x: 45, y: 50 },
  { id: 15, abbrev: 'LCM', x: 48, y: 38 },
  { id: 16, abbrev: 'LM', x: 50, y: 15 },
  { id: 17, abbrev: 'RW', x: 75, y: 85 },
  { id: 18, abbrev: 'RAM', x: 60, y: 62 },
  { id: 19, abbrev: 'CAM', x: 58, y: 50 },
  { id: 20, abbrev: 'LAM', x: 60, y: 38 },
  { id: 21, abbrev: 'LW', x: 75, y: 15 },
  { id: 22, abbrev: 'RCF', x: 85, y: 62 },
  { id: 23, abbrev: 'CF', x: 88, y: 50 },
  { id: 24, abbrev: 'LCF', x: 85, y: 38 },
  { id: 25, abbrev: 'SS', x: 80, y: 50 },
];

export const POSITION_BY_ID = new Map(
  POSITION_COORDINATES.map((p) => [p.id, p]),
);
