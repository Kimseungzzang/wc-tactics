import Link from 'next/link';
import { getMatchDetail, getPositions, getSnapshot } from '@/lib/api';
import { MatchBoard } from '@/components/MatchBoard';

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const matchId = Number(id);

  const [match, positions, snapshot] = await Promise.all([
    getMatchDetail(matchId),
    getPositions(),
    getSnapshot(matchId, 0),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-neutral-950 text-neutral-100">
      <div className="border-b border-neutral-800 px-6 py-3 text-sm">
        <Link href="/" className="text-emerald-400 hover:underline">
          ← 경기 목록
        </Link>
        <span className="ml-3 text-neutral-500">
          {match.matchDate} · {match.competitionStage} · {match.stadiumName}
        </span>
      </div>
      <MatchBoard match={match} positions={positions} initialSnapshot={snapshot} />
    </div>
  );
}
