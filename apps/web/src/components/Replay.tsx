'use client';

import { useState } from 'react';
import { getFrames } from '@/lib/api';
import type { MatchDetail, MatchFrame } from '@/lib/types';
import { FramePlayer } from './FramePlayer';

interface ReplayProps {
  match: MatchDetail;
}

export function Replay({ match }: ReplayProps) {
  const [frames, setFrames] = useState<MatchFrame[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadFrames() {
    setLoading(true);
    const f = await getFrames(match.id);
    setFrames(f);
    setLoading(false);
  }

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

      {frames && <FramePlayer frames={frames} match={match} />}
    </div>
  );
}
