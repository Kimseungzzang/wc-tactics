/**
 * Real 2026 FIFA World Cup draw seeding (Wikipedia "2026 FIFA World Cup
 * seeding" / FIFA.com "Procedures and pots", December 2025 draw) and each
 * team's real confederation. Keyed by the same 3-letter codes
 * wikipedia-2026-data.ts's CODE_TO_NAME uses, so seed-wikipedia-2026.ts
 * can look pot/confederation up alongside the team name it already
 * resolves.
 *
 * Pot 4's six playoff slots (4 UEFA path winners, 2 inter-confederation
 * playoff winners) are filled in with the actual teams that won those
 * playoffs, not placeholders - the draw itself already happened in real
 * life, we're just replaying it as constrained-random instead of once.
 */

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

export const POT_1 = [
  'USA',
  'MEX',
  'CAN',
  'ESP',
  'ARG',
  'FRA',
  'ENG',
  'BRA',
  'POR',
  'NED',
  'BEL',
  'GER',
] as const;

export const POT_2 = [
  'CRO',
  'MAR',
  'COL',
  'URU',
  'SUI',
  'JPN',
  'SEN',
  'IRN',
  'KOR',
  'ECU',
  'AUT',
  'AUS',
] as const;

export const POT_3 = [
  'NOR',
  'PAN',
  'EGY',
  'ALG',
  'SCO',
  'PAR',
  'TUN',
  'CIV',
  'UZB',
  'QAT',
  'KSA',
  'RSA',
] as const;

export const POT_4 = [
  'JOR',
  'CPV',
  'GHA',
  'CUW',
  'HAI',
  'NZL',
  'BIH',
  'CZE',
  'COD',
  'IRQ',
  'SWE',
  'TUR',
] as const;

export const POT_BY_CODE: Record<string, 1 | 2 | 3 | 4> = Object.fromEntries([
  ...POT_1.map((c) => [c, 1] as const),
  ...POT_2.map((c) => [c, 2] as const),
  ...POT_3.map((c) => [c, 3] as const),
  ...POT_4.map((c) => [c, 4] as const),
]);

const CONFEDERATION_GROUPS: Record<Confederation, string[]> = {
  UEFA: [
    'ESP',
    'FRA',
    'ENG',
    'POR',
    'NED',
    'BEL',
    'GER',
    'CRO',
    'SUI',
    'AUT',
    'NOR',
    'SCO',
    'BIH',
    'CZE',
    'SWE',
    'TUR',
  ],
  CONMEBOL: ['ARG', 'BRA', 'URU', 'COL', 'ECU', 'PAR'],
  CONCACAF: ['USA', 'MEX', 'CAN', 'PAN', 'CUW', 'HAI'],
  CAF: ['MAR', 'SEN', 'TUN', 'EGY', 'ALG', 'CIV', 'RSA', 'GHA', 'CPV', 'COD'],
  AFC: ['JPN', 'KOR', 'IRN', 'KSA', 'QAT', 'AUS', 'UZB', 'JOR', 'IRQ'],
  OFC: ['NZL'],
};

export const CONFEDERATION_BY_CODE: Record<string, Confederation> = Object.fromEntries(
  Object.entries(CONFEDERATION_GROUPS).flatMap(([confederation, codes]) =>
    codes.map((code) => [code, confederation as Confederation]),
  ),
);

// The three co-hosts' fixed group draw positions (group letter + slot 1)
// from the real December 2025 draw.
export const HOST_POSITIONS: Record<string, { group: string; slot: 1 }> = {
  MEX: { group: 'A', slot: 1 },
  CAN: { group: 'B', slot: 1 },
  USA: { group: 'D', slot: 1 },
};
