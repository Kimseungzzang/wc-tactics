'use client';

import type { TacticalProfile } from '@/lib/types';

const NEUTRAL: TacticalProfile = { pressingIntensity: 50, possessionStyle: 50, defensiveLine: 50 };

const DIALS: {
  key: keyof TacticalProfile;
  label: string;
  low: string;
  high: string;
}[] = [
  { key: 'pressingIntensity', label: '압박 강도', low: '리트릿', high: '하이프레스' },
  { key: 'defensiveLine', label: '수비 라인', low: '로우블록', high: '하이라인' },
  { key: 'possessionStyle', label: '점유 성향', low: '다이렉트', high: '점유·빌드업' },
];

interface TacticalDialPanelProps {
  baseline: TacticalProfile | null;
  value: TacticalProfile | undefined;
  onChange: (next: TacticalProfile) => void;
  onReset: () => void;
}

export function TacticalDialPanel({ baseline, value, onChange, onReset }: TacticalDialPanelProps) {
  const effective = value ?? baseline ?? NEUTRAL;
  const isOverridden = value != null;

  const setDial = (key: keyof TacticalProfile, num: number) => {
    onChange({ ...effective, [key]: num });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-neutral-400">세부 전술 조정</label>
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-neutral-500 underline hover:text-neutral-300"
          >
            기본값으로
          </button>
        )}
      </div>
      <div className="space-y-2.5 rounded border border-neutral-700 bg-neutral-950 px-2.5 py-2.5">
        {DIALS.map((d) => (
          <div key={d.key}>
            <div className="mb-0.5 flex items-center justify-between text-[10px] text-neutral-500">
              <span>{d.label}</span>
              <span className="font-mono text-neutral-400">{effective[d.key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={effective[d.key]}
              onChange={(e) => setDial(d.key, Number(e.target.value))}
              className="w-full accent-[var(--hud-accent)]"
            />
            <div className="flex justify-between text-[9px] text-neutral-600">
              <span>{d.low}</span>
              <span>{d.high}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
