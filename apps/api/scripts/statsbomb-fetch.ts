import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const RAW_BASE =
  'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const CACHE_DIR = join(__dirname, '..', '.cache', 'statsbomb');

async function readCache<T>(cachePath: string): Promise<T | null> {
  try {
    const raw = await readFile(cachePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data));
}

async function fetchJson<T>(relativePath: string): Promise<T> {
  const cachePath = join(CACHE_DIR, relativePath);
  const cached = await readCache<T>(cachePath);
  if (cached) return cached;

  const url = `${RAW_BASE}/${relativePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as T;
  await writeCache(cachePath, data);
  return data;
}

export function fetchMatches<T>(
  competitionId: number,
  seasonId: number,
): Promise<T> {
  return fetchJson<T>(`matches/${competitionId}/${seasonId}.json`);
}

export function fetchLineups<T>(matchId: number): Promise<T> {
  return fetchJson<T>(`lineups/${matchId}.json`);
}

export function fetchEvents<T>(matchId: number): Promise<T> {
  return fetchJson<T>(`events/${matchId}.json`);
}
