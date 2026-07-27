import type { MatchStats } from '@/lib/types';
import type { PartialTeamStats, PlayerMatchStats } from '@/lib/matchStats';

interface StatRow {
  label: string;
  home: number;
  away: number;
  format: (n: number) => string;
}

const intFmt = (n: number) => String(n);
const pctFmt = (n: number) => `${n}%`;
const decimalFmt = (n: number) => n.toFixed(2);

function Bar({ home, away }: { home: number; away: number }) {
  const total = home + away || 1;
  const homePct = (home / total) * 100;
  return (
    <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-neutral-800">
      <div className="bg-sky-500" style={{ width: `${homePct}%` }} />
      <div className="bg-rose-500" style={{ width: `${100 - homePct}%` }} />
    </div>
  );
}

interface MatchStatsPanelProps {
  stats: MatchStats;
  homeTeamName: string;
  awayTeamName: string;
}

/** Full post-match (or running) stats panel - every number here is
 * counted from the underlying ball-event stream server-side
 * (computeMatchStats), never a separately-invented figure. */
export function MatchStatsPanel({ stats, homeTeamName, awayTeamName }: MatchStatsPanelProps) {
  const rows: StatRow[] = [
    { label: '볼 점유율', home: stats.home.possession, away: stats.away.possession, format: pctFmt },
    { label: '슈팅', home: stats.home.shots, away: stats.away.shots, format: intFmt },
    { label: '유효슈팅', home: stats.home.shotsOnTarget, away: stats.away.shotsOnTarget, format: intFmt },
    { label: '코너킥', home: stats.home.corners, away: stats.away.corners, format: intFmt },
    { label: '패스 성공', home: stats.home.passesCompleted, away: stats.away.passesCompleted, format: intFmt },
    { label: '패스 성공률', home: stats.home.passAccuracy, away: stats.away.passAccuracy, format: pctFmt },
    { label: '선방', home: stats.home.saves, away: stats.away.saves, format: intFmt },
    { label: '기대득점 (xG)', home: stats.home.xg, away: stats.away.xg, format: decimalFmt },
  ];

  return (
    <div className="hud-card rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-hud truncate text-xs font-bold text-sky-400 uppercase">{homeTeamName}</span>
        <span className="font-hud shrink-0 text-[11px] font-bold tracking-[0.1em] text-neutral-500 uppercase">
          경기 스탯
        </span>
        <span className="font-hud truncate text-right text-xs font-bold text-rose-400 uppercase">
          {awayTeamName}
        </span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="hud-score text-sm text-neutral-100">{r.format(r.home)}</span>
              <span className="text-neutral-500">{r.label}</span>
              <span className="hud-score text-sm text-neutral-100">{r.format(r.away)}</span>
            </div>
            <Bar home={r.home} away={r.away} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface MomentStatsPanelProps {
  stats: { home: PartialTeamStats; away: PartialTeamStats };
  homeTeamName: string;
  awayTeamName: string;
}

/** Lighter supplementary panel for an active AI what-if scenario - counted
 * from the same moments the commentary log shows, from the rollback point
 * onward. Kept separate from the real full-match panel above (rather than
 * merged into one falsely-precise number) and explicitly tagged "구성". */
export function MomentStatsPanel({ stats, homeTeamName, awayTeamName }: MomentStatsPanelProps) {
  return (
    <div className="hud-card rounded-lg border border-dashed border-amber-800 bg-amber-950/10 p-3">
      <p className="font-hud mb-2 text-xs font-bold tracking-wide text-amber-300">
        AI 생성 구간 스탯
        <span className="ml-1.5 rounded bg-neutral-800 px-1 py-0.5 text-[9px] font-semibold text-neutral-400">
          구성
        </span>
      </p>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div>
          <div className="hud-score text-neutral-100">
            {stats.home.shots} - {stats.away.shots}
          </div>
          <div className="mt-0.5 text-neutral-500">슈팅</div>
        </div>
        <div>
          <div className="hud-score text-neutral-100">
            {stats.home.shotsOnTarget} - {stats.away.shotsOnTarget}
          </div>
          <div className="mt-0.5 text-neutral-500">유효슈팅</div>
        </div>
        <div>
          <div className="hud-score text-neutral-100">
            {stats.home.xg.toFixed(2)} - {stats.away.xg.toFixed(2)}
          </div>
          <div className="mt-0.5 text-neutral-500">xG</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-neutral-600">
        {homeTeamName} · {awayTeamName} — 개입 시점부터 지금까지 AI가 생성한 구간만 집계.
      </p>
    </div>
  );
}

interface PlayerStatsTableProps {
  players: PlayerMatchStats[];
  homeTeamId: number;
}

/** Per-player breakdown - only players who took at least one shot show up
 * (a 0/0/0 row for every player who merely touched the ball isn't useful
 * here), sorted by goals then shots. No assists column: the underlying
 * events don't record who passed to whom (see computePlayerStats), so
 * there's nothing real to count. */
export function PlayerStatsTable({ players, homeTeamId }: PlayerStatsTableProps) {
  const sorted = players
    .filter((p) => p.shots > 0)
    .sort((a, b) => b.goals - a.goals || b.shots - a.shots || b.touches - a.touches);
  if (sorted.length === 0) return null;

  return (
    <div className="hud-card rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="font-hud mb-2 text-[11px] font-bold tracking-[0.1em] text-neutral-500 uppercase">
        선수 개인 기록
      </p>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] text-neutral-600">
              <th className="pb-1 font-normal">선수</th>
              <th className="pb-1 text-center font-normal">골</th>
              <th className="pb-1 text-center font-normal">슈팅</th>
              <th className="pb-1 text-center font-normal">유효</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.playerId} className="border-t border-neutral-800/60">
                <td className="py-1 pr-2">
                  <span
                    className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                      p.teamId === homeTeamId ? 'bg-sky-500' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-neutral-200">{p.playerName}</span>
                </td>
                <td className="hud-score py-1 text-center text-neutral-100">{p.goals}</td>
                <td className="py-1 text-center text-neutral-400">{p.shots}</td>
                <td className="py-1 text-center text-neutral-400">{p.shotsOnTarget}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-neutral-600">슈팅에 관여한 선수만 표시됩니다.</p>
    </div>
  );
}
