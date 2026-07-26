'use client';

import { useState } from 'react';
import { generateWhatIfStream } from '@/lib/api';
import type { MatchDetail, MatchFrame, ProposedChange, WhatIfMoment } from '@/lib/types';

interface WhatIfPanelProps {
  match: MatchDetail;
  minute: number;
  teamId: number;
  proposedChange?: ProposedChange;
  /** True for a mock (campaign-generated) match with no real ground truth -
   * the whole match is generated from kickoff, not a "continuation". Only
   * changes copy, not behavior (the backend already treats minute=0 with
   * no proposedChange as a from-scratch simulation). */
  isFreshMatch?: boolean;
  /** Fired once per streamed chunk - `isFirst` tells the caller whether to
   * start a fresh scenario or append to the one already in progress;
   * `done` tells it no more chunks are coming for this scenario. */
  onChunk: (chunk: {
    summary: string;
    moments: WhatIfMoment[];
    frames: MatchFrame[];
    rollbackMinute: number;
    isFirst: boolean;
    done: boolean;
  }) => void;
}

const MOMENT_LABEL: Record<string, string> = {
  BUILD_UP: '빌드업',
  CHANCE: '찬스',
  SHOT: '슈팅',
  TURNOVER: '볼 탈취',
  CLEARANCE: '클리어링',
};

export function WhatIfPanel({
  match,
  minute,
  teamId,
  proposedChange,
  isFreshMatch,
  onChunk,
}: WhatIfPanelProps) {
  const [state, setState] = useState<{
    loading: boolean;
    summary: string | null;
    moments: WhatIfMoment[];
    error: string | null;
  }>({ loading: false, summary: null, moments: [], error: null });

  const handleGenerate = async () => {
    setState({ loading: true, summary: null, moments: [], error: null });
    let isFirst = true;
    const allMoments: WhatIfMoment[] = [];
    const summaries: string[] = [];
    try {
      await generateWhatIfStream(match.id, { minute, teamId, proposedChange }, (chunk) => {
        allMoments.push(...chunk.moments);
        if (chunk.summary) summaries.push(chunk.summary);
        setState({
          loading: !chunk.done,
          summary: summaries.join(' '),
          moments: [...allMoments],
          error: null,
        });
        if (chunk.frames.length > 0 || chunk.done) {
          onChunk({
            summary: chunk.summary,
            moments: chunk.moments,
            frames: chunk.frames,
            rollbackMinute: minute,
            isFirst,
            done: chunk.done,
          });
          isFirst = false;
        }
      });
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
    <div className="hud-card rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-hud text-sm font-bold text-neutral-200">
            {isFreshMatch ? 'AI 경기 시뮬레이션' : 'AI "이렇게 했다면?" 시뮬레이션'}
          </h3>
          <p className="text-xs text-neutral-500">
            {isFreshMatch
              ? '실제 재생 데이터가 없는 경기입니다. 킥오프부터 AI가 경기 전체를 생성합니다.'
              : `${minute}' 시점에 적용한 변경 이후를 AI가 다시 생성해 같은 피치에서 이어서 재생합니다.`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={state.loading}
          className="hud-btn shrink-0 rounded bg-[var(--hud-accent-strong)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {state.loading
            ? 'AI 시뮬레이션 중...'
            : isFreshMatch
              ? 'AI 시뮬레이션 시작'
              : '이후 전개 재생성'}
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
                  <span className="mr-2 font-mono text-neutral-500">
                    {m.atMinute != null
                      ? `${m.atMinute}'${String(m.atSecond ?? 0).padStart(2, '0')}`
                      : `+${m.offsetSeconds}s`}
                  </span>
                  <span className="font-hud mr-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-bold text-[var(--hud-accent)]">
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
