'use client';

import type { TacticalProfile } from '@/lib/types';

const NEUTRAL: TacticalProfile = { pressingIntensity: 50, possessionStyle: 50, defensiveLine: 50 };

const DIALS: {
  key: keyof TacticalProfile;
  label: string;
  description: string;
  low: string;
  high: string;
}[] = [
  {
    key: 'pressingIntensity',
    label: '압박 강도',
    description: '상대가 공을 잡았을 때 얼마나 적극적으로 달려들어 압박할지.',
    low: '리트릿',
    high: '하이프레스',
  },
  {
    key: 'defensiveLine',
    label: '수비 라인',
    description: '수비진이 얼마나 높은 지점에서 라인을 형성할지 - 높을수록 오프사이드를 노리지만 뒷공간이 열린다.',
    low: '로우블록',
    high: '하이라인',
  },
  {
    key: 'possessionStyle',
    label: '점유 성향',
    description: '볼을 쥐고 짧은 패스로 쌓아갈지, 빠르게 전방으로 찔러 넣을지.',
    low: '다이렉트',
    high: '점유·빌드업',
  },
];

function tacticalIdentity(t: TacticalProfile): string {
  const pressLabel = t.pressingIntensity >= 65 ? '하이프레스' : t.pressingIntensity <= 35 ? '리트릿 수비' : '중간 압박';
  const lineLabel = t.defensiveLine >= 65 ? '하이라인' : t.defensiveLine <= 35 ? '로우블록' : '미드블록';
  const possessionLabel =
    t.possessionStyle >= 65 ? '점유·빌드업' : t.possessionStyle <= 35 ? '다이렉트' : '밸런스';
  return `${pressLabel} · ${lineLabel} · ${possessionLabel}`;
}

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
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="text-xs font-medium text-neutral-400">세부 전술 조정</label>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--hud-accent)]">{tacticalIdentity(effective)}</p>
        </div>
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
      <div className="space-y-4 rounded border border-neutral-700 bg-neutral-950 px-3 py-3">
        {DIALS.map((d) => {
          const baselineValue = baseline?.[d.key];
          return (
            <div key={d.key}>
              <div className="mb-0.5 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-neutral-300">{d.label}</span>
                <span className="font-mono text-neutral-400">{effective[d.key]}</span>
              </div>
              <p className="mb-1.5 text-[10px] leading-snug text-neutral-600">{d.description}</p>
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={effective[d.key]}
                  onChange={(e) => setDial(d.key, Number(e.target.value))}
                  className="w-full accent-[var(--hud-accent)]"
                />
                {baselineValue != null && (
                  <span
                    className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-neutral-500"
                    style={{ left: `${baselineValue}%` }}
                    title={`팀 기본값: ${baselineValue}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-[9px] text-neutral-600">
                <span>{d.low}</span>
                <span>{d.high}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
