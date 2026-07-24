'use client';

import type { MatchTimelineEntry } from '@/lib/types';

interface TimelineProps {
  minute: number;
  maxMinute: number;
  events: MatchTimelineEntry[];
  onChange: (minute: number) => void;
}

function iconFor(type: MatchTimelineEntry['type']): string {
  switch (type) {
    case 'GOAL':
    case 'OWN_GOAL':
      return '⚽';
    case 'CARD':
      return '🟨';
    case 'SUBSTITUTION':
      return '🔄';
    default:
      return '';
  }
}

export function Timeline({ minute, maxMinute, events, onChange }: TimelineProps) {
  const markers = events.filter((e) => iconFor(e.type) !== '');

  return (
    <div className="w-full">
      <div className="relative h-5">
        {markers.map((e) => (
          <span
            key={e.id}
            title={`${e.minute}' ${e.type}`}
            className="absolute text-sm"
            style={{
              left: `${(e.minute / maxMinute) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {iconFor(e.type)}
          </span>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={maxMinute}
        value={minute}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
      <div className="text-right font-mono text-sm text-neutral-400">
        {minute}&apos;
      </div>
    </div>
  );
}
