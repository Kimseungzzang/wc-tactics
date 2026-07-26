/**
 * Real 2026 FIFA World Cup team/squad data extraction from Wikipedia
 * wikitext. Pure parsing logic, no DB access - kept separate from
 * seed-wikipedia-2026.ts so it can be sanity-checked in isolation.
 *
 * Wikipedia is CC BY-SA 4.0 - factual data (rosters) isn't copyrightable
 * and is safe for commercial use with attribution, unlike StatsBomb Open
 * Data which explicitly forbids commercial use.
 */
import { fetchWikitext } from './wikipedia-fetch';

// FIFA 3-letter codes -> display names, for all 48 participating teams.
// Static because Wikipedia's squads page references teams by full name in
// its section headers, and the code is needed to join against
// team-pot-data.ts's pot/confederation lookups.
export const CODE_TO_NAME: Record<string, string> = {
  MEX: 'Mexico',
  RSA: 'South Africa',
  KOR: 'South Korea',
  CZE: 'Czech Republic',
  CAN: 'Canada',
  BIH: 'Bosnia and Herzegovina',
  QAT: 'Qatar',
  SUI: 'Switzerland',
  BRA: 'Brazil',
  MAR: 'Morocco',
  HAI: 'Haiti',
  SCO: 'Scotland',
  USA: 'United States',
  PAR: 'Paraguay',
  AUS: 'Australia',
  TUR: 'Turkey',
  GER: 'Germany',
  CUW: 'Curaçao',
  CIV: 'Ivory Coast',
  ECU: 'Ecuador',
  NED: 'Netherlands',
  JPN: 'Japan',
  SWE: 'Sweden',
  TUN: 'Tunisia',
  BEL: 'Belgium',
  EGY: 'Egypt',
  IRN: 'Iran',
  NZL: 'New Zealand',
  ESP: 'Spain',
  CPV: 'Cape Verde',
  KSA: 'Saudi Arabia',
  URU: 'Uruguay',
  FRA: 'France',
  SEN: 'Senegal',
  IRQ: 'Iraq',
  NOR: 'Norway',
  ARG: 'Argentina',
  ALG: 'Algeria',
  AUT: 'Austria',
  JOR: 'Jordan',
  POR: 'Portugal',
  COD: 'DR Congo',
  UZB: 'Uzbekistan',
  COL: 'Colombia',
  ENG: 'England',
  CRO: 'Croatia',
  GHA: 'Ghana',
  PAN: 'Panama',
};
export const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_TO_NAME).map(([code, name]) => [name, code]),
);

export interface ParsedTeamSquad {
  code: string;
  coach: string | null;
  players: { jerseyNumber: number; position: string; name: string }[];
}

function cleanWikilinkName(raw: string): string {
  // "[[Jorge Gutiérrez (footballer)|Jorge Gutiérrez]]" -> "Jorge Gutiérrez"
  // "[[Matěj Kovář]]" -> "Matěj Kovář"
  const m = raw.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!m) return raw.trim();
  return (m[2] ?? m[1]).trim();
}

/** Parses a team's full 26-player roster + coach from the shared squads
 * page (organized as ==Group X== / ===Team Name=== / one
 * `{{nat fs g player|...}}` line per player). */
export async function fetchAllSquads(): Promise<
  Record<string, ParsedTeamSquad>
> {
  const wikitext = await fetchWikitext('2026_FIFA_World_Cup_squads');
  const headerRe = /\n===([^=]+)===\n/g;
  const headers = [...wikitext.matchAll(headerRe)];

  const squads: Record<string, ParsedTeamSquad> = {};
  for (let i = 0; i < headers.length; i++) {
    const name = headers[i][1].trim();
    const code = NAME_TO_CODE[name];
    if (!code) continue; // trailing analysis sections (Age, Player representation...) aren't teams

    const bodyStart = headers[i].index + headers[i][0].length;
    const bodyEnd =
      i + 1 < headers.length ? headers[i + 1].index : wikitext.length;
    const body = wikitext.slice(bodyStart, bodyEnd);

    const coachMatch = body.match(/Coach:\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    const coach = coachMatch ? (coachMatch[2] ?? coachMatch[1]) : null;

    const players = [
      ...body.matchAll(
        /\{\{nat fs g player\|no=(\d+)\|pos=(\w+)\|name=(\[\[[^\]]+\]\])/g,
      ),
    ].map((m) => ({
      jerseyNumber: Number(m[1]),
      position: m[2],
      name: cleanWikilinkName(m[3]),
    }));
    squads[code] = { code, coach, players };
  }
  return squads;
}
