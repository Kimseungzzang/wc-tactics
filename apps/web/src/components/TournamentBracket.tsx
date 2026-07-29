import type { BracketMatchRow, BracketStageBlock } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/campaignDisplay';
import {
  computeBracketGeometry,
  feederMatch,
  reorderStagesForDisplay,
} from '@/lib/bracketLayout';

const ROW_UNIT_PX = 72;
const CARD_HEIGHT_PX = 56;
const COLUMN_WIDTH_PX = 208;
const GUTTER_WIDTH_PX = 40;

function stageLabelOf(stage: string): string {
  return STAGE_LABELS.find(([key]) => key === stage)?.[1] ?? stage;
}

function MatchCard({ match, myTeamId }: { match: BracketMatchRow; myTeamId: number }) {
  const involvesMe = match.homeTeamId === myTeamId || match.awayTeamId === myTeamId;
  const rows: { teamId: number; name: string; score: number; penalty: number | null }[] = [
    {
      teamId: match.homeTeamId,
      name: match.homeTeamName,
      score: match.homeScore,
      penalty: match.homePenalty,
    },
    {
      teamId: match.awayTeamId,
      name: match.awayTeamName,
      score: match.awayScore,
      penalty: match.awayPenalty,
    },
  ];

  return (
    <div
      className={`hud-card absolute flex w-full flex-col justify-center overflow-hidden rounded-lg border bg-neutral-900 px-3 py-1.5 text-xs ${
        involvesMe ? 'border-[var(--hud-accent)] bg-emerald-950/30 ring-1 ring-[var(--hud-accent)]' : 'border-neutral-800'
      }`}
      style={{ height: CARD_HEIGHT_PX, width: COLUMN_WIDTH_PX }}
    >
      {rows.map((row) => {
        const isMe = row.teamId === myTeamId;
        const isWinner = match.winnerTeamId === row.teamId;
        const isLoser = match.winnerTeamId != null && !isWinner;
        return (
          <div key={row.teamId} className="flex items-center justify-between gap-2 py-0.5">
            <span
              className={`truncate font-medium ${
                isLoser ? 'text-neutral-500' : isMe ? 'text-[var(--hud-accent)]' : 'text-neutral-100'
              } ${isWinner ? 'font-bold' : ''}`}
            >
              {row.name}
            </span>
            <span className="hud-score shrink-0 text-neutral-300">
              {match.played
                ? `${row.score}${row.penalty != null ? ` (${row.penalty})` : ''}`
                : match.homeTeamId === myTeamId || match.awayTeamId === myTeamId
                  ? '예정'
                  : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TournamentBracket({
  stages,
  myTeamId,
}: {
  stages: BracketStageBlock[];
  myTeamId: number;
}) {
  const reordered = reorderStagesForDisplay(stages);
  const geometry = computeBracketGeometry(reordered, ROW_UNIT_PX, CARD_HEIGHT_PX);

  return (
    <div className="hud-card overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start" style={{ minHeight: geometry.totalHeight }}>
        {geometry.columns.map((column, stageIndex) => {
          const stage = reordered[stageIndex].stage;
          const prevColumn = stageIndex > 0 ? geometry.columns[stageIndex - 1] : null;
          const prevMatches = prevColumn?.map((c) => c.match) ?? [];

          return (
            <div key={stage} className="flex items-start">
              {stageIndex > 0 && (
                <svg
                  width={GUTTER_WIDTH_PX}
                  height={geometry.totalHeight}
                  className="shrink-0"
                  style={{ height: geometry.totalHeight }}
                >
                  {column.flatMap(({ match, yCenter: y2 }) =>
                    [match.homeTeamId, match.awayTeamId].map((teamId) => {
                      const feeder = feederMatch(teamId, prevMatches);
                      if (!feeder) return null;
                      const feederGeom = prevColumn!.find((c) => c.match.id === feeder.id)!;
                      const y1 = feederGeom.yCenter;
                      const emerald = feeder.homeTeamId === myTeamId || feeder.awayTeamId === myTeamId;
                      const mid = GUTTER_WIDTH_PX / 2;
                      return (
                        <path
                          key={`${feeder.id}-${match.id}-${teamId}`}
                          d={`M 0 ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${GUTTER_WIDTH_PX} ${y2}`}
                          fill="none"
                          stroke={emerald ? 'var(--hud-accent)' : '#525252'}
                          strokeWidth={emerald ? 2 : 1.5}
                        />
                      );
                    }),
                  )}
                </svg>
              )}
              <div className="shrink-0" style={{ width: COLUMN_WIDTH_PX }}>
                <p className="font-hud mb-3 text-center text-xs font-bold tracking-[0.15em] text-neutral-400 uppercase">
                  {stageLabelOf(stage)}
                </p>
                <div className="relative" style={{ height: geometry.totalHeight }}>
                  {column.map(({ match, cardTop }) => (
                    <div key={match.id} className="absolute w-full" style={{ top: cardTop }}>
                      <MatchCard match={match} myTeamId={myTeamId} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
