'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getFrames } from '@/lib/api';
import type { MatchDetail, MatchFrame } from '@/lib/types';
import { Pitch, type PitchToken } from './Pitch';

interface ReplayProps {
  match: MatchDetail;
}

export function Replay({ match }: ReplayProps) {
  const [frames, setFrames] = useState<MatchFrame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playerInfo = useMemo(() => {
    const map = new Map<number, { name: string; jerseyNumber: number }>();
    for (const list of Object.values(match.squads)) {
      for (const s of list) map.set(s.playerId, { name: s.name, jerseyNumber: s.jerseyNumber });
    }
    return map;
  }, [match.squads]);

  async function loadFrames() {
    setLoading(true);
    const f = await getFrames(match.id);
    setFrames(f);
    setIdx(0);
    setLoading(false);
  }

  useEffect(() => {
    if (!playing || !frames) return;
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

  const current = frames?.[idx];

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

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">
            실제 경기 흐름 재생 (프로토타입)
          </h3>
          <p className="text-xs text-neutral-500">
            공의 실제 좌표는 StatsBomb 데이터, 나머지 선수 움직임은 포메이션 기반으로
            구성한 시각화입니다.
          </p>
        </div>
        {!frames && (
          <button
            type="button"
            onClick={loadFrames}
            disabled={loading}
            className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? '불러오는 중...' : '재생 데이터 불러오기'}
          </button>
        )}
      </div>

      {frames && current && (
        <>
          <Pitch tokens={tokens} smooth smoothMs={1000 / speed} />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              {playing ? '일시정지' : '재생'}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={idx}
              onChange={(e) => {
                setPlaying(false);
                setIdx(Number(e.target.value));
              }}
              className="flex-1 accent-emerald-500"
            />
            <span className="w-16 shrink-0 text-right font-mono text-xs text-neutral-400">
              {current.minute}&apos;{String(current.second).padStart(2, '0')}
            </span>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
            >
              <option value={1}>1x</option>
              <option value={4}>4x</option>
              <option value={10}>10x</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
