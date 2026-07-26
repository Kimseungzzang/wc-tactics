'use client';

import { useState } from 'react';
import { getAllGroupStandings } from '@/lib/api';
import type { GroupStandingsBlock } from '@/lib/types';

interface OtherGroupsModalProps {
  campaignId: string;
  myTeamId: number;
}

/** "다른 조 순위" trigger + modal - lets the manager check how every other
 * group is doing (as of the current matchday - see
 * campaigns.service.ts's ensureGroupMatchdaySimulated) without leaving
 * the dashboard. Fetched lazily on first open, cached for the rest of
 * this page view. */
export function OtherGroupsModal({ campaignId, myTeamId }: OtherGroupsModalProps) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<GroupStandingsBlock[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    if (blocks || loading) return;
    setLoading(true);
    try {
      setBlocks(await getAllGroupStandings(campaignId));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="hud-card hud-card-interactive rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-[var(--hud-accent)] hover:text-[var(--hud-accent)]"
      >
        다른 조 순위 보기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="hud-card flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-neutral-800 bg-neutral-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-hud text-sm font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
                전체 조 순위
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
              >
                닫기 ✕
              </button>
            </div>

            <div className="overflow-y-auto">
              {loading && <p className="text-sm text-neutral-500">불러오는 중...</p>}
              {blocks && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {blocks.map((block) => (
                    <div
                      key={block.letter}
                      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
                    >
                      <div className="border-b border-neutral-800 bg-neutral-900/80 px-3 py-1.5">
                        <span className="font-hud text-xs font-bold tracking-[0.1em] text-neutral-300 uppercase">
                          Group {block.letter}
                        </span>
                      </div>
                      <table className="w-full text-left text-xs">
                        <tbody>
                          {block.standings.map((row, i) => (
                            <tr
                              key={row.teamId}
                              className={`border-b border-neutral-800/60 last:border-0 ${
                                row.teamId === myTeamId ? 'bg-emerald-950/40' : ''
                              }`}
                            >
                              <td className="px-2 py-1.5 text-neutral-500">{i + 1}</td>
                              <td className="truncate px-2 py-1.5 font-medium text-neutral-100">
                                {row.teamName}
                              </td>
                              <td className="px-2 py-1.5 text-center text-neutral-400">
                                {row.played}경기
                              </td>
                              <td className="hud-score px-2 py-1.5 text-right font-bold text-[var(--hud-accent)]">
                                {row.points}점
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
