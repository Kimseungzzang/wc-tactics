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

export type Confederation =
  'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

// Standard Korean names for all 48 real entrants - unlike player names
// (see transliterate-name.ts), country names have one settled, widely-
// used Korean form, so these are hand-written rather than auto-
// transliterated. group-draw.ts's HOST_GROUP_INDEX keys on these same
// three host names (멕시코/캐나다/미국), so keep them in sync if either
// changes.
export const KOREAN_TEAM_NAME_BY_CODE: Record<string, string> = {
  USA: '미국',
  MEX: '멕시코',
  CAN: '캐나다',
  ESP: '스페인',
  ARG: '아르헨티나',
  FRA: '프랑스',
  ENG: '잉글랜드',
  BRA: '브라질',
  POR: '포르투갈',
  NED: '네덜란드',
  BEL: '벨기에',
  GER: '독일',
  CRO: '크로아티아',
  MAR: '모로코',
  COL: '콜롬비아',
  URU: '우루과이',
  SUI: '스위스',
  JPN: '일본',
  SEN: '세네갈',
  IRN: '이란',
  KOR: '대한민국',
  ECU: '에콰도르',
  AUT: '오스트리아',
  AUS: '호주',
  NOR: '노르웨이',
  PAN: '파나마',
  EGY: '이집트',
  ALG: '알제리',
  SCO: '스코틀랜드',
  PAR: '파라과이',
  TUN: '튀니지',
  CIV: '코트디부아르',
  UZB: '우즈베키스탄',
  QAT: '카타르',
  KSA: '사우디아라비아',
  RSA: '남아프리카공화국',
  JOR: '요르단',
  CPV: '카보베르데',
  GHA: '가나',
  CUW: '퀴라소',
  HAI: '아이티',
  NZL: '뉴질랜드',
  BIH: '보스니아 헤르체고비나',
  CZE: '체코',
  COD: '콩고민주공화국',
  IRQ: '이라크',
  SWE: '스웨덴',
  TUR: '튀르키예',
};

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

// Real FIFA Men's World Ranking position each team held around its pot
// assignment (Wikipedia "2026 FIFA World Cup seeding", November 2025
// snapshot; the six playoff-winner Pot 4 slots - BIH/CZE/COD/IRQ/SWE/TUR -
// weren't seeded until later, so theirs is their nearest available
// ranking instead, per ESPN's FIFA Men's Top 50, June 2026). Lower is
// better (1 = best). This is deliberately finer-grained than `pot`
// (1-4 buckets) - within the same pot, e.g. two Pot 1 teams meeting in a
// knockout round, the pot alone can't tell them apart, but their real
// ranking gap still can (see buildStrengthMap in campaigns.service.ts).
export const FIFA_RANK_BY_CODE: Record<string, number> = {
  ESP: 1,
  ARG: 2,
  FRA: 3,
  ENG: 4,
  BRA: 5,
  POR: 6,
  NED: 7,
  BEL: 8,
  GER: 9,
  CRO: 10,
  MAR: 11,
  COL: 13,
  USA: 14,
  MEX: 15,
  URU: 16,
  SUI: 17,
  JPN: 18,
  SEN: 19,
  IRN: 20,
  TUR: 22,
  KOR: 22,
  ECU: 23,
  AUT: 24,
  AUS: 26,
  CAN: 27,
  NOR: 29,
  PAN: 30,
  EGY: 34,
  ALG: 35,
  SCO: 36,
  SWE: 38,
  PAR: 39,
  TUN: 40,
  CZE: 40,
  CIV: 42,
  COD: 46,
  UZB: 50,
  QAT: 51,
  IRQ: 57,
  KSA: 60,
  RSA: 61,
  BIH: 64,
  JOR: 66,
  CPV: 68,
  GHA: 72,
  CUW: 82,
  HAI: 84,
  NZL: 86,
};

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

export const CONFEDERATION_BY_CODE: Record<string, Confederation> =
  Object.fromEntries(
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
