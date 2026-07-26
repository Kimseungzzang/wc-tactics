'use client';

import { useEffect, useRef } from 'react';

export interface CommentaryEntry {
  id: string;
  /** minute*60+second */
  key: number;
  icon: string;
  text: string;
  /** True for narrated-but-constructed moments (non-goal shots/corners
   * from the mock ball-event stream) - tagged distinctly from real
   * recorded events so the real/mock boundary stays visible in the UI. */
  constructed?: boolean;
  /** True for a scored goal (real GOAL/OWN_GOAL, or an AI what-if SHOT
   * moment with outcome "Goal") - drives the full-pitch celebration
   * overlay in MatchBoard. */
  isGoal?: boolean;
}

interface CommentaryFeedProps {
  entries: CommentaryEntry[];
  /** Fills its container's height instead of capping at a small sidebar
   * height - used now that the feed is the main content, not a side
   * panel. */
  tall?: boolean;
}

/**
 * Text-commentary style log (like a broadcast text feed) instead of a
 * transient overlay banner - every crossed event stays in the scrollback,
 * auto-scrolling to the newest line unless the user has dragged up to read
 * history, in which case it stops yanking them back down.
 */
export function CommentaryFeed({ entries, tall }: CommentaryFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  return (
    <div className={`hud-card flex flex-col rounded-lg border border-neutral-800 bg-neutral-900 ${tall ? 'h-full' : ''}`}>
      <div className="border-b-2 border-neutral-800 bg-neutral-900/60 px-4 py-2.5">
        <h3 className="font-hud text-xs font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
          실시간 중계
        </h3>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`overflow-y-auto px-4 py-2 ${tall ? 'flex-1' : 'max-h-64'}`}
      >
        {entries.length === 0 ? (
          <p className="py-2 text-xs text-neutral-600">아직 중계할 이벤트가 없습니다.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-neutral-300">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-neutral-500">
                  {Math.floor(e.key / 60)}&apos;{String(e.key % 60).padStart(2, '0')}
                </span>
                <span className="shrink-0">{e.icon}</span>
                <span className="leading-snug">
                  {e.text}
                  {e.constructed && (
                    <span className="ml-1.5 rounded bg-neutral-800 px-1 py-0.5 text-[9px] font-semibold text-neutral-500">
                      구성
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
