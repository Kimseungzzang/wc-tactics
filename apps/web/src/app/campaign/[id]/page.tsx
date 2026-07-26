import Link from 'next/link';
import { getCampaign } from '@/lib/api';
import type { CampaignDetail, CampaignFixture, GroupStandingRow } from '@/lib/types';
import { OtherGroupsModal } from '@/components/OtherGroupsModal';
import { STAGE_LABELS, OUTCOME_STYLE, OUTCOME_LABEL } from '@/lib/campaignDisplay';

function managerRank(wins: number): { title: string; icon: string } {
  if (wins >= 7) return { title: '전설의 감독', icon: '👑' };
  if (wins >= 5) return { title: '베테랑 감독', icon: '🏆' };
  if (wins >= 3) return { title: '실전 감독', icon: '🎖️' };
  if (wins >= 1) return { title: '초보 감독', icon: '⭐' };
  return { title: '신입 감독', icon: '🆕' };
}

function StageTracker({ campaign }: { campaign: CampaignDetail }) {
  const champion = !campaign.nextMatch && !campaign.eliminated;
  const currentStageKey =
    campaign.nextMatch?.stage ?? campaign.fixtures[campaign.fixtures.length - 1]?.stage ?? 'Group Stage';
  const currentIndex = STAGE_LABELS.findIndex(([key]) => key === currentStageKey);
  if (currentIndex === -1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STAGE_LABELS.map(([key, label], i) => {
        const reached = champion ? i <= currentIndex : i < currentIndex;
        let cls = 'border-neutral-800 bg-neutral-900 text-neutral-600';
        if (reached) {
          cls = 'border-emerald-800 bg-emerald-950/40 text-emerald-400';
        } else if (i === currentIndex) {
          cls = campaign.eliminated
            ? 'border-red-800 bg-red-950/40 text-red-300'
            : 'border-[var(--hud-accent)] bg-emerald-900/40 text-emerald-100 ring-1 ring-[var(--hud-accent)]';
        }
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`font-hud rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}>
              {label}
              {champion && i === currentIndex && ' 🏆'}
            </span>
            {i < STAGE_LABELS.length - 1 && <span className="text-neutral-700">›</span>}
          </div>
        );
      })}
    </div>
  );
}

function FixtureRow({ fixture, teamName }: { fixture: CampaignFixture; teamName: string }) {
  return (
    <li className="hud-card flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-neutral-500">{fixture.stage}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-neutral-100">
          {teamName} vs {fixture.opponentName}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hud-score text-sm text-neutral-300">
          {fixture.result.myScore} - {fixture.result.opponentScore}
        </span>
        <span
          className={`font-hud rounded px-2 py-1 text-xs font-bold ${OUTCOME_STYLE[fixture.result.outcome]}`}
        >
          {OUTCOME_LABEL[fixture.result.outcome]}
        </span>
      </div>
    </li>
  );
}

function GroupStandingsTable({
  standings,
  myTeamId,
}: {
  standings: GroupStandingRow[];
  myTeamId: number;
}) {
  return (
    <div className="hud-card overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="font-hud border-b border-neutral-800 text-xs font-bold tracking-wide text-neutral-500 uppercase">
            <th className="px-4 py-2 font-medium">#</th>
            <th className="px-4 py-2 font-medium">팀</th>
            <th className="px-3 py-2 text-center font-medium">경기</th>
            <th className="px-3 py-2 text-center font-medium">승</th>
            <th className="px-3 py-2 text-center font-medium">무</th>
            <th className="px-3 py-2 text-center font-medium">패</th>
            <th className="px-3 py-2 text-center font-medium">득실</th>
            <th className="px-4 py-2 text-center font-medium">승점</th>
          </tr>
        </thead>
        <tbody className="hud-score">
          {standings.map((row, i) => (
            <tr
              key={row.teamId}
              className={`border-b border-neutral-800/60 last:border-0 ${
                row.teamId === myTeamId ? 'bg-emerald-950/30' : ''
              }`}
            >
              <td className="px-4 py-2 text-neutral-500">{i + 1}</td>
              <td className="px-4 py-2 font-sans font-medium text-neutral-100">
                {row.teamName}
                {row.teamId === myTeamId && (
                  <span className="font-hud ml-1.5 font-sans text-xs text-[var(--hud-accent)]">(내 팀)</span>
                )}
              </td>
              <td className="px-3 py-2 text-center text-neutral-300">{row.played}</td>
              <td className="px-3 py-2 text-center text-neutral-300">{row.wins}</td>
              <td className="px-3 py-2 text-center text-neutral-300">{row.draws}</td>
              <td className="px-3 py-2 text-center text-neutral-300">{row.losses}</td>
              <td className="px-3 py-2 text-center text-neutral-300">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="px-4 py-2 text-center font-bold text-[var(--hud-accent)]">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  return (
    <div className="flex-1 bg-neutral-950 text-neutral-100">
      <header className="border-b-2 border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 px-6 py-10 sm:px-10">
        <Link href="/" className="text-sm text-[var(--hud-accent)] hover:underline">
          ← 팀 다시 고르기
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="font-hud text-sm font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
            {campaign.managerNickname} 감독의 커리어
          </p>
          <span className="hud-card rounded-full border border-amber-700 bg-amber-950/40 px-2.5 py-0.5 text-xs font-bold text-amber-300">
            {managerRank(campaign.record.wins).icon} {managerRank(campaign.record.wins).title}
          </span>
        </div>
        <h1 className="font-hud mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          {campaign.teamName}
        </h1>
        <p className="hud-score mt-3 text-lg text-neutral-300">
          {campaign.record.wins}승 {campaign.record.draws}무 {campaign.record.losses}패
        </p>
        <div className="mt-4">
          <StageTracker campaign={campaign} />
        </div>
      </header>

      <main className="px-6 py-8 sm:px-10">
        {campaign.nextMatch ? (
          <section className="hud-card mb-10 rounded-xl border-2 border-[var(--hud-accent-strong)] bg-emerald-950/30 p-5">
            <p className="font-hud text-xs font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
              다음 경기
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              {campaign.teamName} vs {campaign.nextMatch.opponentName}
            </p>
            <p className="mt-1 text-sm text-neutral-400">{campaign.nextMatch.stage}</p>
            <Link
              href={`/campaign/${campaign.id}/lineup?matchId=${campaign.nextMatch.matchId}`}
              className="hud-btn mt-4 inline-block rounded bg-[var(--hud-accent-strong)] px-5 py-2.5 text-sm text-white"
            >
              라인업 선택하고 시작
            </Link>
          </section>
        ) : (
          <section className="mb-10 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
              커리어 종료
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              {campaign.eliminated
                ? `${campaign.teamName}, 여기까지 왔습니다.`
                : `${campaign.teamName} 우승! 커리어를 완주했습니다.`}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              최종 전적 {campaign.record.wins}승 {campaign.record.draws}무 {campaign.record.losses}패
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              새 커리어 시작하기
            </Link>
          </section>
        )}

        {campaign.groupStandings && (
          <section className="mb-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-neutral-200">조 순위표</h2>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/campaign/${campaign.id}/rankings`}
                  className="hud-card hud-card-interactive rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-[var(--hud-accent)] hover:text-[var(--hud-accent)]"
                >
                  감독 랭킹 보기
                </Link>
                <Link
                  href={`/campaign/${campaign.id}/schedule`}
                  className="hud-card hud-card-interactive rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-[var(--hud-accent)] hover:text-[var(--hud-accent)]"
                >
                  경기 일정 보기
                </Link>
                <OtherGroupsModal campaignId={campaign.id} myTeamId={campaign.teamId} />
              </div>
            </div>
            <GroupStandingsTable standings={campaign.groupStandings} myTeamId={campaign.teamId} />
          </section>
        )}

        <h2 className="mb-3 text-lg font-semibold text-neutral-200">지나온 경기</h2>
        {campaign.fixtures.length === 0 ? (
          <p className="text-sm text-neutral-500">아직 치른 경기가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {campaign.fixtures.map((fixture) => (
              <FixtureRow key={fixture.matchId} fixture={fixture} teamName={campaign.teamName} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
