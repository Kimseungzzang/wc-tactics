'use client';

import { useState } from 'react';
import { generateWhatIf } from '@/lib/api';
import type { MatchDetail, ProposedChange, WhatIfScenarioResponse } from '@/lib/types';
import { FramePlayer } from './FramePlayer';

interface WhatIfPanelProps {
  match: MatchDetail;
  minute: number;
  teamId: number;
  proposedChange?: ProposedChange;
}

const MOMENT_LABEL: Record<string, string> = {
  BUILD_UP: '빌드업',
  CHANCE: '찬스',
  SHOT: '슈팅',
  TURNOVER: '볼 탈취',
  CLEARANCE: '클리어링',
};

export function WhatIfPanel({ match, minute, teamId, proposedChange }: WhatIfPanelProps) {
  const [state, setState] = useState<{
    loading: boolean;
    data: WhatIfScenarioResponse | null;
    error: string | null;
  }>({ loading: false, data: null, error: null });

  const handleGenerate = async () => {
    setState({ loading: true, data: null, error: null });
    try {
      const data = await generateWhatIf(match.id, { minute, teamId, proposedChange });
      setState({ loading: false, data, error: null });
    } catch (err) {
      setState({
        loading: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">
            AI &ldquo;이렇게 했다면?&rdquo; 시뮬레이션
          </h3>
          <p className="text-xs text-neutral-500">
            {minute}&apos; 시점 이후 전개를 AI가 예측하고, 그 흐름을 피치 위에서
            재생합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={state.loading}
          className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {state.loading ? 'AI 시뮬레이션 중...' : '이후 전개 시뮬레이션'}
        </button>
      </div>

      {state.error && (
        <div className="rounded border border-red-900 bg-red-950 p-3 text-xs text-red-300">
          {state.error}
        </div>
      )}

      {state.data && (
        <>
          <p className="mb-3 text-sm leading-relaxed text-neutral-200">
            {state.data.summary}
          </p>

          {state.data.moments.length > 0 && (
            <ul className="mb-4 space-y-1.5">
              {state.data.moments.map((m, i) => (
                <li
                  key={i}
                  className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs"
                >
                  <span className="mr-2 font-mono text-neutral-500">
                    +{m.offsetSeconds}s
                  </span>
                  <span className="mr-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    {MOMENT_LABEL[m.type] ?? m.type}
                  </span>
                  <span className="text-neutral-300">{m.commentary}</span>
                </li>
              ))}
            </ul>
          )}

          {state.data.frames.length > 0 ? (
            <FramePlayer frames={state.data.frames} match={match} autoPlay />
          ) : (
            <p className="text-xs text-neutral-500">재생할 프레임이 없습니다.</p>
          )}
        </>
      )}
    </div>
  );
}
