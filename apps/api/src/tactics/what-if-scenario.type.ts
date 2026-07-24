export type WhatIfMomentType = 'BUILD_UP' | 'CHANCE' | 'SHOT' | 'TURNOVER' | 'CLEARANCE';
export type WhatIfOutcome =
  | 'Complete'
  | 'Goal'
  | 'Saved'
  | 'Blocked'
  | 'OffTarget'
  | 'Won'
  | 'Lost';

export interface WhatIfMoment {
  offsetSeconds: number;
  teamId: number;
  playerId: number;
  playerName: string;
  type: WhatIfMomentType;
  outcome: WhatIfOutcome;
  commentary: string;
}

export interface WhatIfScenario {
  summary: string;
  moments: WhatIfMoment[];
}
