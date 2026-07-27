import Link from 'next/link';
import { getCampaign, getMatchDetail, getPreviousLineup } from '@/lib/api';
import { LineupSelect } from '@/components/LineupSelect';

export default async function LineupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ matchId?: string }>;
}) {
  const { id } = await params;
  const { matchId } = await searchParams;
  const [campaign, match, previousLineup] = await Promise.all([
    getCampaign(id),
    getMatchDetail(Number(matchId)),
    getPreviousLineup(id),
  ]);

  const squad = match.squads[campaign.teamId] ?? [];
  const isHome = campaign.teamId === match.homeTeam.id;
  const opponentName = isHome ? match.awayTeam.name : match.homeTeam.name;
  const tacticalBaseline = isHome ? match.homeTeam.tacticalProfile : match.awayTeam.tacticalProfile;

  return (
    <div className="flex-1 bg-neutral-950 text-neutral-100">
      <header className="border-b-2 border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 px-6 py-10 sm:px-10">
        <Link href={`/campaign/${campaign.id}`} className="text-sm text-[var(--hud-accent)] hover:underline">
          ← 대시보드로
        </Link>
        <p className="font-hud mt-4 text-sm font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
          라인업 선택
        </p>
        <h1 className="font-hud mt-2 text-3xl font-bold sm:text-4xl">
          {campaign.teamName} vs {opponentName}
        </h1>
        <p className="mt-3 max-w-xl text-neutral-400">
          포메이션과 선발 라인업을 직접 구성하면, 이 구성과 양 팀의 실제 선수 능력치·전술 성향을
          근거로 AI가 킥오프부터 경기 전체를 생성합니다.
        </p>
      </header>

      <main className="px-6 py-8 sm:px-10">
        <LineupSelect
          campaignId={campaign.id}
          matchId={match.id}
          squad={squad}
          tacticalBaseline={tacticalBaseline}
          previousLineup={previousLineup}
        />
      </main>
    </div>
  );
}
