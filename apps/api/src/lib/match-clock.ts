/**
 * StatsBomb's minute/second clock resets at the nominal start of each
 * period (0:00, 45:00, 90:00, 105:00, 120:00) rather than continuing from
 * the previous period's actual end - so period 1 stoppage time (e.g.
 * 46:15) numerically overlaps period 2's opening minutes (45:00 onward).
 * Sorting or comparing raw (minute, second) pairs across periods is
 * therefore unsafe. This builds a true continuous "seconds since kickoff"
 * clock from each period's actual end time.
 */
const NOMINAL_PERIOD_START_MINUTE: Record<number, number> = {
  1: 0,
  2: 45,
  3: 90,
  4: 105,
  5: 120,
};

function periodBaseSeconds(period: number): number {
  const minute = NOMINAL_PERIOD_START_MINUTE[period] ?? (period - 1) * 45;
  return minute * 60;
}

export interface PeriodEnd {
  period: number;
  minute: number;
  second: number;
}

export function buildMatchClock(
  periodEnds: PeriodEnd[],
): (period: number, minute: number, second: number) => number {
  const cumulativeOffset = new Map<number, number>();
  // MatchEvent stores one HALF_END row per team, both with identical
  // timestamps - dedupe by period so each period's offset is computed once.
  const uniqueByPeriod = new Map<number, PeriodEnd>();
  for (const end of periodEnds) uniqueByPeriod.set(end.period, end);
  const sortedPeriods = [...uniqueByPeriod.values()].sort((a, b) => a.period - b.period);
  let running = 0;
  for (const end of sortedPeriods) {
    cumulativeOffset.set(end.period, running);
    const endRaw = end.minute * 60 + end.second;
    running += endRaw - periodBaseSeconds(end.period);
  }

  return (period: number, minute: number, second: number): number => {
    const raw = minute * 60 + second;
    const offset = cumulativeOffset.get(period) ?? 0;
    return offset + (raw - periodBaseSeconds(period));
  };
}
