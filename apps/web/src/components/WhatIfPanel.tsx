'use client';

import { useState } from 'react';
import { generateWhatIf } from '@/lib/api';
import type { MatchDetail, MatchFrame, ProposedChange, WhatIfMoment } from '@/lib/types';

interface WhatIfPanelProps {
  match: MatchDetail;
  minute: number;
  teamId: number;
  proposedChange?: ProposedChange;
  onResult: (result: {
    summary: string;
    moments: WhatIfMoment[];
    frames: MatchFrame[];
    rollbackMinute: number;
  }) => void;
}

const MOMENT_LABEL: Record<string, string> = {
  BUILD_UP: '빌드업',
  CHANCE: '찬스',
  SHOT: '슈팅',
  TURNOVER: '볼 탈취',
  CLEARANCE: '클리어링',
};

export function WhatIfPanel({ match, minute, teamId, proposedChange, onResult }: WhatIfPanelProps) {
  const [state, setState] = useState<{
    loading: boolean;
    summary: string | null;
    moments: WhatIfMoment[];
    error: string | null;
  }>({ loading: false, summary: null, moments: [], error: null });

  const handleGenerate = async () => {
    setState({ loading: true, summary: null, moments: [], error: null });
    try {
      const data = await generateWhatIf(match.id, { minute, teamId, proposedChange });
      setState({ loading: false, summary: data.summary, moments: data.moments, error: null });
      onResult({ ...data, rollbackMinute: minute });
    } catch (err) {
      setState({
        loading: false,
        summary: null,
        moments: [],
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
            {minute}&apos; 시점에 적용한 변경 이후를 AI가 다시 생성해 같은 피치에서
            이어서 재생합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={state.loading}
          className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {state.loading ? 'AI 시뮬레이션 중...' : '이후 전개 재생성'}
        </button>
      </div>

      {state.error && (
        <div className="rounded border border-red-900 bg-red-950 p-3 text-xs text-red-300">
          {state.error}
        </div>
      )}

      {state.summary && (
        <>
          <p className="mb-3 text-sm leading-relaxed text-neutral-200">{state.summary}</p>
          {state.moments.length > 0 && (
            <ul className="space-y-1.5">
              {state.moments.map((m, i) => (
                <li
                  key={i}
                  className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs"
                >
                  <span className="mr-2 font-mono text-neutral-500">+{m.offsetSeconds}s</span>
                  <span className="mr-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    {MOMENT_LABEL[m.type] ?? m.type}
                  </span>
                  <span className="text-neutral-300">{m.commentary}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
