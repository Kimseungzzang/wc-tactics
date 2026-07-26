import type { CampaignOutcome } from './types';

// Mirrors campaigns.service.ts's STAGE_ORDER (the "win to keep going"
// chain) - kept in Korean display order here since this is purely
// presentational.
export const STAGE_LABELS: [string, string][] = [
  ['Group Stage', '조별리그'],
  ['Round of 32', '32강'],
  ['Round of 16', '16강'],
  ['Quarter-finals', '8강'],
  ['Semi-finals', '4강'],
  ['Final', '결승'],
];

export const OUTCOME_STYLE: Record<CampaignOutcome, string> = {
  WIN: 'bg-emerald-900/50 text-emerald-300',
  DRAW: 'bg-neutral-800 text-neutral-300',
  LOSS: 'bg-red-900/50 text-red-300',
};

export const OUTCOME_LABEL: Record<CampaignOutcome, string> = {
  WIN: '승',
  DRAW: '무',
  LOSS: '패',
};
