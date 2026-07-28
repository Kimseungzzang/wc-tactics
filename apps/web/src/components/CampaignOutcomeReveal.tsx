'use client';

export type CampaignOutcomeKind =
  | { kind: 'eliminated'; stageLabel: string }
  | { kind: 'advanced'; stageLabel: string }
  | { kind: 'champion' };

interface CampaignOutcomeRevealProps {
  outcome: CampaignOutcomeKind;
  teamName: string;
  record: { wins: number; draws: number; losses: number };
  onContinue: () => void;
}

/** Full-screen reveal shown right after recording a result, whenever the
 * real 2026 World Cup advancement rule (see computeRound32Qualifiers /
 * resolveNextMatch in campaigns.service.ts) actually changes the
 * campaign's status - eliminated, advanced to a new knockout stage, or
 * won the Final. A same-stage group-stage continuation isn't dramatic
 * enough to warrant this, so MatchBoard only renders it for these three
 * cases. */
export function CampaignOutcomeReveal({
  outcome,
  teamName,
  record,
  onContinue,
}: CampaignOutcomeRevealProps) {
  const isEliminated = outcome.kind === 'eliminated';
  const isChampion = outcome.kind === 'champion';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      <div
        className={`animate-outcome-glow-pulse pointer-events-none absolute h-[70vh] w-[70vh] rounded-full blur-3xl ${
          isEliminated ? 'bg-red-600/30' : 'bg-[var(--hud-accent)]/30'
        }`}
      />
      <div className="animate-outcome-pop relative px-6 text-center">
        <p
          className={`font-hud text-xs font-bold tracking-[0.4em] uppercase ${
            isEliminated ? 'text-red-500' : 'text-[var(--hud-accent)]'
          }`}
        >
          {isEliminated ? 'Game Over' : isChampion ? 'Champion' : 'Advance'}
        </p>

        <h1
          className={`font-hud mt-4 text-6xl font-bold tracking-tight sm:text-7xl ${
            isEliminated ? 'text-red-400' : 'text-[var(--hud-accent)]'
          } ${isChampion ? 'sm:text-8xl' : ''}`}
        >
          {isEliminated ? '탈락' : isChampion ? '우승!' : `${outcome.stageLabel} 진출!`}
        </h1>

        <p className="mt-4 max-w-md text-lg text-neutral-300">
          {isEliminated && `${teamName}, ${outcome.stageLabel}에서 대회 여정을 마쳤습니다.`}
          {outcome.kind === 'advanced' && `${teamName}, ${outcome.stageLabel}에 진출했습니다.`}
          {isChampion && `${teamName}, 2026 월드컵 정상에 올랐습니다.`}
        </p>

        <p className="hud-score mt-6 text-sm text-neutral-500">
          최종 전적 {record.wins}승 {record.draws}무 {record.losses}패
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="hud-btn mt-8 rounded bg-[var(--hud-accent-strong)] px-8 py-3 text-sm text-white"
        >
          대시보드로
        </button>
      </div>
    </div>
  );
}
