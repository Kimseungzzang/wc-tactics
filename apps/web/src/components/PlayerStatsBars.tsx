import type { PlayerStatsResponse } from '@/lib/types';

const ATTRIBUTE_LABEL: Record<string, string> = {
  pace: '속도',
  shooting: '슈팅',
  passing: '패스',
  defending: '수비',
  physical: '피지컬',
  stamina: '체력',
};

export function PlayerStatsBars({
  loading,
  stats,
}: {
  loading: boolean;
  stats: PlayerStatsResponse | null;
}) {
  return (
    <div className="mt-1 mb-1 rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px]">
      {loading && <p className="text-neutral-500">불러오는 중...</p>}
      {!loading && stats?.attributes && (
        <div className="space-y-1">
          {Object.entries(stats.attributes).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-neutral-500">{ATTRIBUTE_LABEL[key] ?? key}</span>
              <div className="h-1.5 flex-1 rounded-full bg-neutral-800">
                <div
                  className="h-1.5 rounded-full bg-[var(--hud-accent)]"
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-neutral-400">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
