import type {
  CampaignDetail,
  CampaignSummary,
  FullDrawGroup,
  GroupStandingsBlock,
  MatchDetail,
  MatchSnapshotResponse,
  PlayerStatsResponse,
  PositionCoordinate,
  RecommendTacticsRequest,
  ScheduleEntry,
  TacticsRecommendation,
  TeamRankingRow,
  TeamRef,
  WhatIfChunk,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status} on ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getTeams(): Promise<TeamRef[]> {
  return apiFetch<TeamRef[]>('/teams');
}

export function getMatchDetail(id: number): Promise<MatchDetail> {
  return apiFetch<MatchDetail>(`/matches/${id}`);
}

export function getSnapshot(
  id: number,
  minute: number,
): Promise<MatchSnapshotResponse> {
  return apiFetch<MatchSnapshotResponse>(
    `/matches/${id}/snapshot?minute=${minute}`,
  );
}

export function getPositions(): Promise<PositionCoordinate[]> {
  return apiFetch<PositionCoordinate[]>('/positions');
}

/**
 * Reads a fetch response body as newline-delimited JSON, calling `onLine`
 * once per parsed line as it arrives (rather than waiting for the whole
 * body). Shared by both streaming endpoints (what-if generation and match
 * frames), which both send `{ ..., done: boolean, error?: string }` lines.
 */
async function streamNdjson<T extends { done: boolean; error?: string }>(
  path: string,
  init: RequestInit | undefined,
  onLine: (line: T) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { ...init, cache: 'no-store' });
  if (!res.ok || !res.body) {
    const text = res.body ? '' : await res.text().catch(() => '');
    throw new Error(`API error ${res.status} on ${path}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (raw: string) => {
    if (!raw.trim()) return;
    const line = JSON.parse(raw) as T;
    if (line.error) throw new Error(line.error);
    onLine(line);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx = buffer.indexOf('\n');
    while (newlineIdx >= 0) {
      handle(buffer.slice(0, newlineIdx));
      buffer = buffer.slice(newlineIdx + 1);
      newlineIdx = buffer.indexOf('\n');
    }
  }
  handle(buffer);
}

export function recommendTactics(
  matchId: number,
  body: RecommendTacticsRequest,
): Promise<TacticsRecommendation> {
  return apiFetch<TacticsRecommendation>(
    `/matches/${matchId}/tactics/recommend`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function getPlayer(playerId: number): Promise<PlayerStatsResponse> {
  return apiFetch<PlayerStatsResponse>(`/players/${playerId}`);
}

/**
 * Consumes the what-if endpoint as newline-delimited JSON: the backend
 * generates the scenario in ~8 minute chunks (one Gemini call each) and
 * streams each chunk as soon as it's ready, so `onChunk` fires repeatedly
 * instead of waiting for the whole rest-of-match scenario in one payload.
 */
export function generateWhatIfStream(
  matchId: number,
  body: RecommendTacticsRequest,
  onChunk: (chunk: WhatIfChunk) => void,
): Promise<void> {
  return streamNdjson<WhatIfChunk>(
    `/matches/${matchId}/tactics/what-if`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    onChunk,
  );
}

export function loginManager(nickname: string): Promise<{ managerId: string; nickname: string }> {
  return apiFetch(`/managers/login`, { method: 'POST', body: JSON.stringify({ nickname }) });
}

export function getManagerCampaigns(managerId: string): Promise<CampaignSummary[]> {
  return apiFetch<CampaignSummary[]>(`/managers/${managerId}/campaigns`);
}

export function createCampaign(managerId: string, teamId: number): Promise<CampaignDetail> {
  return apiFetch<CampaignDetail>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ managerId, teamId }),
  });
}

export function getCampaign(campaignId: string): Promise<CampaignDetail> {
  return apiFetch<CampaignDetail>(`/campaigns/${campaignId}`);
}

export function getCampaignDraw(campaignId: string): Promise<FullDrawGroup[]> {
  return apiFetch<FullDrawGroup[]>(`/campaigns/${campaignId}/draw`);
}

export function getAllGroupStandings(campaignId: string): Promise<GroupStandingsBlock[]> {
  return apiFetch<GroupStandingsBlock[]>(`/campaigns/${campaignId}/standings`);
}

export function getCampaignSchedule(campaignId: string): Promise<ScheduleEntry[]> {
  return apiFetch<ScheduleEntry[]>(`/campaigns/${campaignId}/schedule`);
}

export function getTeamRankings(teamId: number): Promise<TeamRankingRow[]> {
  return apiFetch<TeamRankingRow[]>(`/campaigns/rankings/${teamId}`);
}

export function recordCampaignResult(
  campaignId: string,
  body: { matchId: number; homeScore: number; awayScore: number },
): Promise<CampaignDetail> {
  return apiFetch<CampaignDetail>(`/campaigns/${campaignId}/results`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function submitCampaignLineup(
  campaignId: string,
  body: {
    matchId: number;
    formation: string;
    goalkeeperPlayerId: number;
    outfieldPlayerIds: number[];
  },
): Promise<{ matchId: number; formation: string }> {
  return apiFetch(`/campaigns/${campaignId}/lineup`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
