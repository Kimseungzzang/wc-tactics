import { getTeams } from '@/lib/api';
import { CareerEntry } from '@/components/CareerEntry';

export default async function HomePage() {
  const teams = await getTeams();

  return (
    <div className="flex-1 bg-neutral-950 text-neutral-100">
      <header className="border-b-2 border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 px-6 py-10 sm:px-10">
        <p className="font-hud text-sm font-bold tracking-[0.2em] text-[var(--hud-accent)] uppercase">
          2026 World Cup
        </p>
        <h1 className="font-hud mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          감독석
        </h1>
        <p className="mt-3 max-w-xl text-neutral-400">
          팀 하나를 맡아 2026 월드컵 조 추첨부터 결승까지 직접 지휘하세요.
          실제 선수 명단과 능력치를 근거로 AI가 경기를 만들어주고, 언제든
          개입해 흐름을 바꿀 수 있습니다.
        </p>
      </header>

      <CareerEntry teams={teams} />
    </div>
  );
}
