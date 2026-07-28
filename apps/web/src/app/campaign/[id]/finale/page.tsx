import Link from 'next/link';
import { getCampaign, simulateRestOfTournament } from '@/lib/api';
import type { FinalStandingRow, TournamentAwards } from '@/lib/types';
import { FINAL_STAGE_LABEL } from '@/lib/campaignDisplay';

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function AwardCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hud-card rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="font-hud text-xs font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

function AwardsPanel({ awards }: { awards: TournamentAwards }) {
  return (
    <div className="mb-10 grid gap-4 sm:grid-cols-3">
      <AwardCard icon="⚽" title="득점왕">
        {awards.topScorers.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">기록 없음</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {awards.topScorers.map((s, i) => (
              <li key={s.playerId} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-neutral-100">
                  {RANK_MEDAL[i + 1] ?? `${i + 1}.`} {s.name}
                  <span className="ml-1.5 text-xs text-neutral-500">{s.teamName}</span>
                </span>
                <span className="hud-score shrink-0 text-sm font-bold text-[var(--hud-accent)]">
                  {s.goals}골
                </span>
              </li>
            ))}
          </ul>
        )}
      </AwardCard>

      <AwardCard icon="🧤" title="골든 글러브">
        {awards.goldenGlove ? (
          <div className="mt-3">
            <p className="text-sm font-medium text-neutral-100">{awards.goldenGlove.name}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{awards.goldenGlove.teamName}</p>
            <p className="hud-score mt-2 text-sm font-bold text-[var(--hud-accent)]">
              실점 {awards.goldenGlove.goalsAgainst}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">기록 없음</p>
        )}
      </AwardCard>

      <AwardCard icon="🏅" title="골든볼 (MVP)">
        {awards.goldenBall ? (
          <div className="mt-3">
            <p className="text-sm font-medium text-neutral-100">{awards.goldenBall.name}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{awards.goldenBall.teamName}</p>
            <p className="hud-score mt-2 text-sm font-bold text-[var(--hud-accent)]">
              {awards.goldenBall.goals}골
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">기록 없음</p>
        )}
      </AwardCard>
    </div>
  );
}

function StandingsTable({
  standings,
  myTeamId,
}: {
  standings: FinalStandingRow[];
  myTeamId: number;
}) {
  return (
    <div className="hud-card overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead>
          <tr className="font-hud border-b border-neutral-800 text-xs font-bold tracking-wide text-neutral-500 uppercase">
            <th className="px-4 py-2 font-medium">#</th>
            <th className="px-4 py-2 font-medium">팀</th>
            <th className="px-3 py-2 text-center font-medium">도달 라운드</th>
            <th className="px-3 py-2 text-center font-medium">전적</th>
            <th className="px-3 py-2 text-center font-medium">득실</th>
          </tr>
        </thead>
        <tbody className="hud-score">
          {standings.map((row) => (
            <tr
              key={row.teamId}
              className={`border-b border-neutral-800/60 last:border-0 ${
                row.teamId === myTeamId ? 'bg-emerald-950/30' : ''
              }`}
            >
              <td className="px-4 py-2 text-neutral-500">
                {RANK_MEDAL[row.rank] ?? row.rank}
              </td>
              <td className="px-4 py-2 font-sans font-medium text-neutral-100">
                {row.teamName}
                {row.teamId === myTeamId && (
                  <span className="font-hud ml-1.5 font-sans text-xs text-[var(--hud-accent)]">
                    (내 팀)
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-center text-neutral-300">
                {FINAL_STAGE_LABEL[row.stageReached] ?? row.stageReached}
              </td>
              <td className="px-3 py-2 text-center text-neutral-300">
                {row.wins}승 {row.draws}무 {row.losses}패
              </td>
              <td className="px-3 py-2 text-center text-neutral-300">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function FinalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  let result: Awaited<ReturnType<typeof simulateRestOfTournament>> | null = null;
  let errorMessage: string | null = null;
  try {
    result = await simulateRestOfTournament(id);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex-1 bg-neutral-950 text-neutral-100">
      <header className="border-b-2 border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 px-6 py-10 sm:px-10">
        <Link
          href={`/campaign/${campaign.id}`}
          className="text-sm text-[var(--hud-accent)] hover:underline"
        >
          ← 대시보드로
        </Link>
        <p className="font-hud mt-4 text-sm font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
          2026 월드컵 최종 결과
        </p>
        <h1 className="font-hud mt-2 text-3xl font-bold sm:text-4xl">
          {campaign.teamName}의 대회, 끝까지 시뮬레이션했습니다
        </h1>
      </header>

      <main className="px-6 py-8 sm:px-10">
        {errorMessage ? (
          <p className="text-sm text-red-400">
            아직 전체 대회 결과를 볼 수 없습니다: {errorMessage}
          </p>
        ) : (
          result && (
            <>
              <AwardsPanel awards={result.awards} />
              <h2 className="mb-3 text-lg font-semibold text-neutral-200">최종 순위 (1-48)</h2>
              <StandingsTable standings={result.standings} myTeamId={campaign.teamId} />
            </>
          )
        )}
      </main>
    </div>
  );
}
