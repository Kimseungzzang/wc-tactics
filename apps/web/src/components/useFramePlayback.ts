'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchDetail, MatchFrame } from '@/lib/types';
import type { PitchToken } from './Pitch';

const TICK_MS = 100;
/** CSS transition duration for token movement - matches the render tick, not `speed`. */
export const PLAYBACK_TRANSITION_MS = 150;
export const SPEED_OPTIONS = [1, 5, 15, 30, 60] as const;
// Gaps between frames larger than this (halftime, etc.) are skipped instantly
// rather than sitting frozen while match-time ticks through them - mirrors
// the same threshold the backend simulator uses when generating frames.
const MAX_GAP_SECONDS = 20;

/** Index of the last frame with frame.t <= t (frames are sorted ascending by t). */
function findFrameIndex(frames: MatchFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Drives pitch playback in real match-time: `speed` is a true multiplier of
 * match seconds per wall-clock second (1x = real time), not a frame-index
 * stepper - frames are NOT evenly spaced in match-time (they're denser
 * around events), so stepping by a fixed frame count per tick would make
 * "speed" meaningless relative to the actual match clock.
 */
export function useFramePlayback(frames: MatchFrame[], match: MatchDetail, autoPlay = false) {
  const firstT = frames[0]?.t ?? 0;
  const lastT = frames[frames.length - 1]?.t ?? 0;

  const [t, setT] = useState(firstT);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(15);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset playback position when a new frames array arrives (e.g. a fresh
  // AI what-if scenario) - adjusted during render per React's guidance,
  // rather than in an effect, since it's purely derived from a prop change.
  const [prevFrames, setPrevFrames] = useState(frames);
  if (frames !== prevFrames) {
    setPrevFrames(frames);
    setT(firstT);
  }

  const playerInfo = useMemo(() => {
    const map = new Map<number, { name: string; jerseyNumber: number }>();
    for (const list of Object.values(match.squads)) {
      for (const s of list) map.set(s.playerId, { name: s.name, jerseyNumber: s.jerseyNumber });
    }
    return map;
  }, [match.squads]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    timerRef.current = setInterval(() => {
      setT((current) => {
        let next = current + (TICK_MS / 1000) * speed;
        const idx = findFrameIndex(frames, next);
        const nextFrame = frames[idx + 1];
        if (nextFrame && nextFrame.t - frames[idx].t > MAX_GAP_SECONDS && next < nextFrame.t) {
          next = nextFrame.t;
        }
        if (next >= lastT) {
          setPlaying(false);
          return lastT;
        }
        return next;
      });
    }, TICK_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, frames, speed, lastT]);

  const idx = useMemo(() => findFrameIndex(frames, t), [frames, t]);
  const current = frames[idx];

  const tokens: PitchToken[] = useMemo(() => {
    if (!current) return [];
    const list: PitchToken[] = current.players.map((p) => {
      const info = playerInfo.get(p.playerId);
      return {
        key: `p-${p.playerId}`,
        playerId: p.playerId,
        name: info?.name.split(' ').slice(-1)[0] ?? '',
        jerseyNumber: info?.jerseyNumber ?? 0,
        x: p.x,
        y: p.y,
        side: p.teamId === match.homeTeam.id ? 'home' : 'away',
        draggable: false,
      };
    });
    list.push({
      key: 'ball',
      playerId: -1,
      name: '',
      jerseyNumber: 0,
      x: current.ballX,
      y: current.ballY,
      side: 'home',
      draggable: false,
      kind: 'ball',
    });
    return list;
  }, [current, playerInfo, match.homeTeam.id]);

  return { t, setT, firstT, lastT, playing, setPlaying, speed, setSpeed, current, tokens };
}
