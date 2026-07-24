import type {
  MatchDetail,
  MatchFrame,
  MatchSnapshotResponse,
  MatchSummary,
  PositionCoordinate,
  RecommendTacticsRequest,
  TacticsRecommendation,
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

export function getMatches(): Promise<MatchSummary[]> {
  return apiFetch<MatchSummary[]>('/matches');
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

export function getFrames(matchId: number): Promise<MatchFrame[]> {
  return apiFetch<MatchFrame[]>(`/matches/${matchId}/frames`);
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
