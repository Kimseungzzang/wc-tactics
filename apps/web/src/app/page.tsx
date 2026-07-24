import Link from 'next/link';
import { getMatches } from '@/lib/api';
import type { MatchSummary } from '@/lib/types';

function groupByStage(matches: MatchSummary[]): [string, MatchSummary[]][] {
  const groups = new Map<string, MatchSummary[]>();
  for (const m of matches) {
    const key = m.competitionStage ?? '기타';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  return [...groups.entries()];
}

export default async function HomePage() {
  const matches = await getMatches();
  const groups = groupByStage(matches);

  return (
    <div className="flex-1 bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-10 sm:px-10">
        <p className="text-sm font-medium tracking-widest text-emerald-400 uppercase">
          2022 Qatar World Cup
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">감독석</h1>
        <p className="mt-3 max-w-xl text-neutral-400">
          실제 경기 데이터를 기반으로 경기 흐름을 되돌려 &ldquo;그때 이렇게
          했다면&rdquo;을 직접 시험해보세요. 경기를 선택하면 감독석으로
          이동합니다.
        </p>
      </header>

      <main className="px-6 py-8 sm:px-10">
        {groups.map(([stage, stageMatches]) => (
          <section key={stage} className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-neutral-200">
              {stage}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stageMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/match/${m.id}`}
                  className="group rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition hover:border-emerald-500 hover:bg-neutral-800"
                >
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>{m.matchDate}</span>
                    <span>{m.stadiumName}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm font-medium">
                    <span className="truncate">{m.homeTeam.name}</span>
                    <span className="mx-2 shrink-0 rounded bg-neutral-800 px-2 py-1 font-mono text-emerald-400 group-hover:bg-neutral-700">
                      {m.homeScore} - {m.awayScore}
                    </span>
                    <span className="truncate text-right">
                      {m.awayTeam.name}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
