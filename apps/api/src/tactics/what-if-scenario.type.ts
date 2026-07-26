export type WhatIfMomentType =
  'BUILD_UP' | 'CHANCE' | 'SHOT' | 'TURNOVER' | 'CLEARANCE';
export type WhatIfOutcome =
  'Complete' | 'Goal' | 'Saved' | 'Blocked' | 'OffTarget' | 'Won' | 'Lost';

export type WhatIfZone = 'left' | 'center' | 'right';

export interface WhatIfMoment {
  offsetSeconds: number;
  teamId: number;
  playerId: number;
  playerName: string;
  type: WhatIfMomentType;
  outcome: WhatIfOutcome;
  commentary: string;
  /** Pitch width position (bird's-eye, fixed regardless of attack
   * direction) and how far the ball has advanced toward the goal being
   * attacked this moment (0 = own half, 100 = goal line) - both provided
   * by the model itself so the pitch position is derived from the same
   * judgment that wrote the commentary, instead of a generic type-based
   * heuristic that could contradict what the text describes. */
  zone: WhatIfZone;
  progress: number;
  /** Absolute match clock this moment resolves to, filled in by
   * WhatIfService (offsetSeconds alone is only meaningful within its own
   * chunk, since each streamed chunk restarts offsetSeconds at 0). */
  atMinute?: number;
  atSecond?: number;
}

export interface WhatIfScenario {
  summary: string;
  moments: WhatIfMoment[];
}
