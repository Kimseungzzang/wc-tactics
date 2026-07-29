import Link from 'next/link';
import { getCampaign, getCampaignSchedule } from '@/lib/api';
import { STAGE_LABELS, OUTCOME_STYLE, OUTCOME_LABEL } from '@/lib/campaignDisplay';
import { formatMatchdayDate } from '@/lib/matchdayDates';

const STAGE_LABEL_MAP = new Map(STAGE_LABELS);

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, schedule] = await Promise.all([getCampaign(id), getCampaignSchedule(id)]);

  return (
    <div className="flex-1 bg-neutral-950 text-neutral-100">
      <header className="border-b-2 border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 px-6 py-10 sm:px-10">
        <Link href={`/campaign/${campaign.id}`} className="text-sm text-[var(--hud-accent)] hover:underline">
          ← 대시보드로
        </Link>
        <p className="font-hud mt-4 text-sm font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
          경기 일정
        </p>
        <h1 className="font-hud mt-2 text-3xl font-bold sm:text-4xl">{campaign.teamName}</h1>
        <p className="mt-3 max-w-xl text-neutral-400">
          아직 열리지 않은 라운드(대진이 아직 정해지지 않은 단계)는 목록에 나타나지 않습니다.
        </p>
      </header>

      <main className="px-6 py-8 sm:px-10">
        <ol className="relative space-y-4 border-l-2 border-neutral-800 pl-6">
          {schedule.map((entry) => (
            <li key={entry.matchId} className="relative">
              <span
                className={`absolute top-1.5 -left-[31px] h-3 w-3 rounded-full border-2 ${
                  entry.played
                    ? 'border-[var(--hud-accent)] bg-[var(--hud-accent)]'
                    : 'border-neutral-700 bg-neutral-950'
                }`}
              />
              <div className="hud-card flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-hud text-xs font-bold tracking-wide text-neutral-500 uppercase">
                    {formatMatchdayDate(entry.matchWeek)} ·{' '}
                    {STAGE_LABEL_MAP.get(entry.stage) ?? entry.stage}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-neutral-100">
                    {campaign.teamName} vs {entry.opponentName}
                  </p>
                </div>
                {entry.result ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hud-score text-sm text-neutral-300">
                      {entry.result.myScore} - {entry.result.opponentScore}
                      {entry.result.penalty && (
                        <span className="ml-1 text-xs text-neutral-500">
                          (PK {entry.result.penalty.myScore}:{entry.result.penalty.opponentScore})
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-hud rounded px-2 py-1 text-xs font-bold ${OUTCOME_STYLE[entry.result.outcome]}`}
                    >
                      {OUTCOME_LABEL[entry.result.outcome]}
                    </span>
                  </div>
                ) : (
                  <span className="font-hud shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs font-bold text-neutral-400 uppercase">
                    예정
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
