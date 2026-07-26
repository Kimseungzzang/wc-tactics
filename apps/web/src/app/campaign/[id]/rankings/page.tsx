import Link from 'next/link';
import { getCampaign, getTeamRankings } from '@/lib/api';
import { STAGE_LABELS } from '@/lib/campaignDisplay';

const STAGE_LABEL_MAP = new Map(STAGE_LABELS);

export default async function RankingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  const rankings = await getTeamRankings(campaign.teamId);
  const myRank = rankings.find((r) => r.campaignId === campaign.id);

  return (
    <div className="flex-1 bg-neutral-950 text-neutral-100">
      <header className="border-b-2 border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 px-6 py-10 sm:px-10">
        <Link href={`/campaign/${campaign.id}`} className="text-sm text-[var(--hud-accent)] hover:underline">
          ← 대시보드로
        </Link>
        <p className="font-hud mt-4 text-sm font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
          감독 랭킹
        </p>
        <h1 className="font-hud mt-2 text-3xl font-bold sm:text-4xl">{campaign.teamName}</h1>
        <p className="mt-3 max-w-xl text-neutral-400">
          {campaign.teamName}을(를) 고른 감독들만 비교합니다 — 최고 도달 단계 → 골득실 → 승수 순으로 순위가
          매겨집니다.
        </p>
        {myRank && (
          <p className="hud-score mt-4 text-xl text-[var(--hud-accent)]">
            내 순위: {myRank.rank}위 / 총 {rankings.length}명
          </p>
        )}
      </header>

      <main className="px-6 py-8 sm:px-10">
        <div className="hud-card overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="font-hud border-b border-neutral-800 text-xs font-bold tracking-wide text-neutral-500 uppercase">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">감독</th>
                <th className="px-3 py-2 text-center font-medium">전적</th>
                <th className="px-3 py-2 text-center font-medium">골득실</th>
                <th className="px-4 py-2 text-center font-medium">최고 도달 단계</th>
              </tr>
            </thead>
            <tbody className="hud-score">
              {rankings.map((r) => (
                <tr
                  key={r.campaignId}
                  className={`border-b border-neutral-800/60 last:border-0 ${
                    r.campaignId === campaign.id ? 'bg-emerald-950/30' : ''
                  }`}
                >
                  <td className="px-4 py-2 text-neutral-500">{r.rank}</td>
                  <td className="px-4 py-2 font-sans font-medium text-neutral-100">
                    {r.managerNickname}
                    {r.campaignId === campaign.id && (
                      <span className="font-hud ml-1.5 font-sans text-xs text-[var(--hud-accent)]">(나)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-neutral-300">
                    {r.wins}승 {r.draws}무 {r.losses}패
                  </td>
                  <td className="px-3 py-2 text-center text-neutral-300">
                    {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                  </td>
                  <td className="px-4 py-2 text-center font-bold text-[var(--hud-accent)]">
                    {r.maxStage ? (STAGE_LABEL_MAP.get(r.maxStage) ?? r.maxStage) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
