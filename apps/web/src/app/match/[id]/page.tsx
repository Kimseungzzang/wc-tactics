import Link from 'next/link';
import { getCampaign, getMatchDetail, getSnapshot } from '@/lib/api';
import { MatchBoard } from '@/components/MatchBoard';

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    campaignId?: string;
    pressingIntensity?: string;
    possessionStyle?: string;
    defensiveLine?: string;
  }>;
}) {
  const { id } = await params;
  const { campaignId, pressingIntensity, possessionStyle, defensiveLine } = await searchParams;
  const matchId = Number(id);
  // Set only when the manager adjusted the tactical dial on the lineup
  // screen before kickoff - carried here via query params rather than
  // persisted server-side, same as any other proposedChange.
  const initialTacticalDial =
    pressingIntensity != null && possessionStyle != null && defensiveLine != null
      ? {
          pressingIntensity: Number(pressingIntensity),
          possessionStyle: Number(possessionStyle),
          defensiveLine: Number(defensiveLine),
        }
      : undefined;

  const [match, snapshot, campaign] = await Promise.all([
    getMatchDetail(matchId),
    getSnapshot(matchId, 0),
    campaignId ? getCampaign(campaignId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-neutral-950 text-neutral-100">
      <div className="border-b border-neutral-800 px-6 py-3 text-sm">
        <Link href={campaign ? `/campaign/${campaign.id}` : '/'} className="text-emerald-400 hover:underline">
          {campaign ? `← ${campaign.teamName} 커리어` : '← 경기 목록'}
        </Link>
        <span className="ml-3 text-neutral-500">
          {match.competitionStage} · {match.matchWeek}주차
        </span>
      </div>
      <MatchBoard
        match={match}
        initialSnapshot={snapshot}
        campaignId={campaign?.id}
        campaignTeamId={campaign?.teamId}
        initialTacticalDial={initialTacticalDial}
      />
    </div>
  );
}
