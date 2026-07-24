'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchDetail, MatchFrame } from '@/lib/types';
import type { PitchToken } from './Pitch';

export function useFramePlayback(frames: MatchFrame[], match: MatchDetail, autoPlay = false) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(4);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset playback position when a new frames array arrives (e.g. a fresh
  // AI what-if scenario) - adjusted during render per React's guidance,
  // rather than in an effect, since it's purely derived from a prop change.
  const [prevFrames, setPrevFrames] = useState(frames);
  if (frames !== prevFrames) {
    setPrevFrames(frames);
    setIdx(0);
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
      setIdx((i) => {
        if (i + 1 >= frames.length) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1000 / speed);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, frames, speed]);

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

  return { idx, setIdx, playing, setPlaying, speed, setSpeed, current, tokens };
}
