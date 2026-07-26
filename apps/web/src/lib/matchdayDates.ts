/**
 * Real matches no longer carry a real date (every match is now campaign-
 * generated - see the backend's Match model). Since the game's flow is
 * meant to read as calendar-driven ("오늘 날짜의 다른 조 결과" etc.), this
 * assigns a fixed, presentational date to each matchWeek - mirroring the
 * real 2026 World Cup's actual calendar (opening June 11, final July 19).
 * Purely a display convention: nothing server-side depends on these.
 */
export const MATCHDAY_DATES: Record<number, string> = {
  1: '2026-06-11',
  2: '2026-06-15',
  3: '2026-06-19',
  4: '2026-06-28', // Round of 32
  5: '2026-07-02', // Round of 16
  6: '2026-07-06', // Quarter-finals
  7: '2026-07-10', // Semi-finals
  8: '2026-07-19', // Final
};

export function matchdayDate(matchWeek: number): string {
  return MATCHDAY_DATES[matchWeek] ?? '미정';
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

export function formatMatchdayDate(matchWeek: number): string {
  const iso = MATCHDAY_DATES[matchWeek];
  if (!iso) return '날짜 미정';
  const d = new Date(`${iso}T00:00:00`);
  return `${iso} (${WEEKDAY_LABEL[d.getDay()]})`;
}
