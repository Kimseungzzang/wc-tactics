import type { BracketMatchRow, BracketStageBlock } from './types';

/** The match in `prevStageMatches` whose winner is `teamId` - a team
 * appears in exactly one match per stage, and every match a later stage
 * could reference is guaranteed fully played by the time that later stage
 * exists (see campaigns.service.ts's ensureKnockoutRound/resolveNextMatch),
 * so `winnerTeamId` is never null here in practice. */
export function feederMatch(
  teamId: number,
  prevStageMatches: BracketMatchRow[],
): BracketMatchRow | undefined {
  return prevStageMatches.find((m) => m.winnerTeamId === teamId);
}

/**
 * Each knockout stage's pairing is a fresh random shuffle of that stage's
 * qualifiers (see ensureKnockoutRound's doc comment) - there's no
 * persisted "winner of match A feeds slot X of match B" tree, so a
 * bracket's display order has to be reconstructed after the fact. It's
 * still a proper binary tree though: every match has exactly 2 feeder
 * matches in the previous stage, and every previous-stage match feeds
 * exactly 1 match in the next stage. Walking backward from the last
 * stage and interleaving each match's two feeders next to each other
 * guarantees every stage boundary ends up with adjacent, non-crossing
 * feeder pairs - which is what lets computeBracketGeometry lay everything
 * out from array indices alone, with no DOM measurement.
 */
export function reorderStagesForDisplay(
  stages: BracketStageBlock[],
): BracketStageBlock[] {
  if (stages.length <= 1) return stages;

  const reordered = stages.map((s) => s.matches);
  for (let i = stages.length - 1; i > 0; i--) {
    const current = reordered[i];
    const prev = reordered[i - 1];
    const nextPrev: BracketMatchRow[] = [];
    for (const m of current) {
      const homeFeeder = feederMatch(m.homeTeamId, prev);
      const awayFeeder = feederMatch(m.awayTeamId, prev);
      if (homeFeeder) nextPrev.push(homeFeeder);
      if (awayFeeder) nextPrev.push(awayFeeder);
    }
    // Fall back to the original order if anything couldn't be matched
    // (shouldn't happen given the invariants above, but fail safe rather
    // than silently dropping a match from the display).
    reordered[i - 1] = nextPrev.length === prev.length ? nextPrev : prev;
  }

  return stages.map((s, i) => ({ stage: s.stage, matches: reordered[i] }));
}

export interface BracketMatchGeometry {
  match: BracketMatchRow;
  stageIndex: number;
  yCenter: number;
  cardTop: number;
}

export interface BracketGeometry {
  columns: BracketMatchGeometry[][];
  totalHeight: number;
  cardHeight: number;
}

/**
 * Standard binary-tournament-tree layout math: stage 0 (the earliest
 * generated stage, e.g. Round of 32) match i is centered at
 * `rowUnitPx * (i + 0.5)`; stage c's match i is centered at
 * `rowUnitPx * 2^c * (i + 0.5)`. Since reorderStagesForDisplay guarantees
 * match i's two children in stage c+1 are always at indices 2i/2i+1 of
 * stage c... no, the other direction: this depends only on array indices,
 * not on measuring anything - it's why this whole component can be a
 * plain server component with no client-side layout pass.
 */
export function computeBracketGeometry(
  reorderedStages: BracketStageBlock[],
  rowUnitPx: number,
  cardHeight: number,
): BracketGeometry {
  const leafCount = reorderedStages[0]?.matches.length ?? 0;
  const totalHeight = leafCount * rowUnitPx;

  const columns = reorderedStages.map((stage, stageIndex) =>
    stage.matches.map((match, i) => {
      const span = rowUnitPx * 2 ** stageIndex;
      const yCenter = span * (i + 0.5);
      return { match, stageIndex, yCenter, cardTop: yCenter - cardHeight / 2 };
    }),
  );

  return { columns, totalHeight, cardHeight };
}
