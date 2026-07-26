'use client';

import { useEffect, useState } from 'react';

const TICK_MS = 200;
export const CLOCK_SPEED_OPTIONS = [1, 5, 15, 30, 60] as const;

/**
 * Drives the match-time clock for the text-only commentary view: a plain
 * linear ticker from `firstT` to `lastT` (continuous seconds), no frame
 * array to look up - there's no pitch animation to pace against anymore,
 * just the minute:second the commentary log and score should be revealed
 * up to. `moreComing` mirrors the old frame hook's meaning: hold at
 * `lastT` instead of pausing while an AI what-if scenario is still
 * streaming in more chunks (which extends `lastT` on its own).
 *
 * `resetKey` (not `firstT` itself) decides when to snap `t` back to
 * `firstT` - a new match's `firstT` can coincidentally equal the old one
 * (both 0 for two non-diverged real matches), which would otherwise leave
 * `t` stuck mid-match from the previous page. Pass something that changes
 * on every genuine "start over" (e.g. `real-${match.id}` /
 * `whatif-${rollbackMinute}`).
 */
export function useMatchClock(
  firstT: number,
  lastT: number,
  resetKey: string,
  moreComing = false,
) {
  const [t, setT] = useState(firstT);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(15);

  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setT(firstT);
    setPlaying(false);
  }

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setT((cur) => {
        const next = cur + (TICK_MS / 1000) * speed;
        if (next >= lastT) {
          if (!moreComing) setPlaying(false);
          return lastT;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, speed, lastT, moreComing]);

  return {
    t,
    setT,
    firstT,
    lastT,
    playing,
    setPlaying,
    speed,
    setSpeed,
    current: { minute: Math.floor(t / 60), second: Math.floor(t % 60) },
  };
}
