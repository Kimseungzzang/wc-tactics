/**
 * Pure (no DB) helpers for a campaign's group draw, group-stage schedule,
 * and the lightweight "background match" score simulator - see
 * campaigns.service.ts for how these get called and persisted.
 *
 * The draw honors the real 2026 pot/confederation constraints (see
 * scripts/team-pot-data.ts) but is randomized fresh per campaign, rather
 * than replaying the one real December 2025 draw every time.
 */

export interface DrawTeam {
  id: number;
  name: string;
  pot: 1 | 2 | 3 | 4;
  confederation: string;
}

const GROUP_COUNT = 12;
export const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('');

// The three co-hosts' fixed group draw positions from the real December
// 2025 draw (Mexico=A1, Canada=B1, United States=D1). Keyed by Team.name,
// which is the Korean localization (team-pot-data.ts's
// KOREAN_TEAM_NAME_BY_CODE) - keep these two in sync.
const HOST_GROUP_INDEX: Record<string, number> = {
  멕시코: 0,
  캐나다: 1,
  미국: 3,
};

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Real rule: no two teams from the same confederation in a group, except
// UEFA (1-2 per group allowed).
function canPlace(team: DrawTeam, group: DrawTeam[]): boolean {
  const sameConfed = group.filter(
    (t) => t.confederation === team.confederation,
  ).length;
  return team.confederation === 'UEFA' ? sameConfed < 2 : sameConfed < 1;
}

/** Greedily assigns every team in `potTeams` into one of `openGroupIdxs`,
 * respecting the confederation constraint against what's already in each
 * group. Both the team pool and group visit order are pre-shuffled by the
 * caller's `rand`, so which team lands in which group varies draw to draw
 * even though the constraint-satisfying search itself is deterministic
 * first-fit. Returns false (leaving `groups` partially mutated) if some
 * team can't be placed - the caller discards the whole attempt and retries
 * with a fresh shuffle rather than trying to backtrack mid-pot. */
function tryPlacePot(
  groups: DrawTeam[][],
  potTeams: DrawTeam[],
  openGroupIdxs: number[],
  rand: () => number,
): boolean {
  const pool = shuffle(potTeams, rand);
  const groupOrder = shuffle(openGroupIdxs, rand);
  for (const groupIdx of groupOrder) {
    const idx = pool.findIndex((t) => canPlace(t, groups[groupIdx]));
    if (idx === -1) return false;
    const [team] = pool.splice(idx, 1);
    groups[groupIdx].push(team);
  }
  return pool.length === 0;
}

/**
 * Draws 12 groups of 4 from exactly 48 teams (12 per pot 1-4), honoring
 * host pre-placement and the confederation constraint. Retries the whole
 * draw (fresh shuffle) up to `maxAttempts` times if a particular shuffle
 * paints itself into a corner - with these real pot sizes (UEFA 16 is the
 * only confederation that ever gets close to the per-group cap) a valid
 * assignment is found within the first few attempts essentially always.
 */
export function drawGroups(
  teams: DrawTeam[],
  rand: () => number = Math.random,
  maxAttempts = 300,
): DrawTeam[][] {
  const byPot: Record<1 | 2 | 3 | 4, DrawTeam[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
  };
  for (const t of teams) byPot[t.pot].push(t);
  for (const pot of [1, 2, 3, 4] as const) {
    if (byPot[pot].length !== GROUP_COUNT) {
      throw new Error(
        `drawGroups requires exactly ${GROUP_COUNT} teams in pot ${pot}, got ${byPot[pot].length}`,
      );
    }
  }
  const hostTeams = byPot[1].filter((t) => t.name in HOST_GROUP_INDEX);
  if (hostTeams.length !== 3) {
    throw new Error(
      `Expected exactly 3 host teams in pot 1, found ${hostTeams.length}`,
    );
  }
  const allGroupIdxs = Array.from({ length: GROUP_COUNT }, (_, i) => i);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const groups: DrawTeam[][] = Array.from({ length: GROUP_COUNT }, () => []);
    for (const t of hostTeams) groups[HOST_GROUP_INDEX[t.name]].push(t);

    const pot1Rest = byPot[1].filter((t) => !(t.name in HOST_GROUP_INDEX));
    const openForPot1 = allGroupIdxs.filter((i) => groups[i].length === 0);

    const placed =
      tryPlacePot(groups, pot1Rest, openForPot1, rand) &&
      tryPlacePot(groups, byPot[2], allGroupIdxs, rand) &&
      tryPlacePot(groups, byPot[3], allGroupIdxs, rand) &&
      tryPlacePot(groups, byPot[4], allGroupIdxs, rand);

    if (placed) return groups;
  }
  throw new Error(
    `Could not find a valid group draw after ${maxAttempts} attempts`,
  );
}

export interface FixtureSlot {
  homeTeamId: number;
  awayTeamId: number;
  matchWeek: number;
}

/** Standard 4-team round-robin: every team plays every other exactly once
 * across 3 matchdays, never twice on the same matchday. */
export function groupRoundRobinFixtures(group: DrawTeam[]): FixtureSlot[] {
  const [a, b, c, d] = group;
  return [
    { homeTeamId: a.id, awayTeamId: b.id, matchWeek: 1 },
    { homeTeamId: c.id, awayTeamId: d.id, matchWeek: 1 },
    { homeTeamId: a.id, awayTeamId: c.id, matchWeek: 2 },
    { homeTeamId: d.id, awayTeamId: b.id, matchWeek: 2 },
    { homeTeamId: a.id, awayTeamId: d.id, matchWeek: 3 },
    { homeTeamId: b.id, awayTeamId: c.id, matchWeek: 3 },
  ];
}

/** Knuth's algorithm - cheap, dependency-free Poisson sample. */
function poissonSample(lambda: number, rand: () => number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rand();
  } while (p > l);
  return k - 1;
}

/**
 * The lightweight "other matches" result generator - no Gemini call, no
 * event-by-event narration, just a final score derived from each team's
 * overall strength (0-99ish, averaged PlayerAttributes) and a Poisson
 * random draw around an expected-goals baseline shifted by the strength
 * gap. Used for every match that doesn't involve the campaign's own team.
 */
export function simulateBackgroundScore(
  homeStrength: number,
  awayStrength: number,
  rand: () => number = Math.random,
): [number, number] {
  const diff = homeStrength - awayStrength; // real-world spread is roughly -30..30
  const homeExpected = Math.max(0.2, 1.35 + diff / 35);
  const awayExpected = Math.max(0.2, 1.15 - diff / 35);
  return [poissonSample(homeExpected, rand), poissonSample(awayExpected, rand)];
}

/** Knockout matches can't end level - a background-simulated pair that
 * ties gets resolved as if by shootout (coin flip, +1 to the winner);
 * the campaign's own knockout match gets the same treatment in
 * campaigns.service.ts's recordResult if the AI-generated scenario itself
 * ends level. No shootout is actually simulated - this is a labeled
 * simplification, same spirit as everything else in this data layer. */
export function breakKnockoutTie(
  homeScore: number,
  awayScore: number,
  rand: () => number,
): [number, number] {
  if (homeScore !== awayScore) return [homeScore, awayScore];
  return rand() < 0.5 ? [homeScore + 1, awayScore] : [homeScore, awayScore + 1];
}

export interface GoalScorerCandidate {
  playerId: number;
  name: string;
  position: string;
  shooting: number;
}

// Forwards score far more than defenders in real football; goalkeepers are
// excluded entirely (weight 0) rather than given a token near-zero chance.
const POSITION_GOAL_WEIGHT: Record<string, number> = {
  FW: 5,
  MF: 2,
  DF: 0.6,
  GK: 0,
};

/**
 * Weighted-random pick of which roster players scored a background match's
 * goals - no full match is simulated, just a plausible attribution so
 * tournament-wide awards (Golden Boot etc.) have real per-player data for
 * every match, not only the campaign's own AI-generated ones. Weight is
 * position group x (shooting attribute + 10), sampled independently with
 * replacement for each goal (the same player can score more than once).
 */
export function pickGoalScorers(
  roster: GoalScorerCandidate[],
  goalCount: number,
  rand: () => number,
): { playerId: number; name: string }[] {
  const pool = roster.filter(
    (p) => (POSITION_GOAL_WEIGHT[p.position] ?? 0) > 0,
  );
  if (pool.length === 0 || goalCount <= 0) return [];

  const weights = pool.map(
    (p) => (POSITION_GOAL_WEIGHT[p.position] ?? 0) * (p.shooting + 10),
  );
  const total = weights.reduce((a, b) => a + b, 0);

  const scorers: { playerId: number; name: string }[] = [];
  for (let i = 0; i < goalCount; i++) {
    let r = rand() * total;
    let chosen = pool[pool.length - 1];
    for (let j = 0; j < pool.length; j++) {
      r -= weights[j];
      if (r <= 0) {
        chosen = pool[j];
        break;
      }
    }
    scorers.push({ playerId: chosen.playerId, name: chosen.name });
  }
  return scorers;
}

/** Deterministic PRNG (mulberry32), seeded by an integer - lets the draw
 * and background scores for a campaign be reproducible from its own id
 * derivative rather than relying on global Math.random. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
