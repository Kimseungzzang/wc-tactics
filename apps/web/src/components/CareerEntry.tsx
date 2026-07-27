'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign, getCampaignDraw, getManagerCampaigns, loginManager } from '@/lib/api';
import type { CampaignDetail, CampaignSummary, FullDrawGroup, TeamRef } from '@/lib/types';
import { GroupDrawReveal } from './GroupDrawReveal';

interface CareerEntryProps {
  teams: TeamRef[];
}

type Step = 'nickname' | 'teams';

export function CareerEntry({ teams }: CareerEntryProps) {
  const router = useRouter();

  // Every campaign this manager has going, not just the last one touched -
  // a manager can run several teams' careers in parallel (localStorage
  // only ever remembers one "current" campaign, which used to mean a
  // second campaign for the same manager had no way back onto the
  // screen).
  const [myCampaigns, setMyCampaigns] = useState<CampaignSummary[]>([]);
  const [step, setStep] = useState<Step>('nickname');
  const [managerId, setManagerId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a fresh campaign is created, so the draw reveal shows before
  // navigating away rather than jumping straight to the dashboard.
  const [drawnCampaign, setDrawnCampaign] = useState<CampaignDetail | null>(null);
  const [fullDraw, setFullDraw] = useState<FullDrawGroup[] | null>(null);

  // Wipes locally-cached identity (managerId/nickname) - used whenever the
  // backend says one of them no longer exists (e.g. the dev DB was reset,
  // or a manager was deleted server-side), so a stale browser doesn't get
  // stuck unable to start a new career.
  const clearStaleIdentity = () => {
    localStorage.removeItem('managerId');
    localStorage.removeItem('nickname');
  };

  useEffect(() => {
    const storedManagerId = localStorage.getItem('managerId');
    const storedNickname = localStorage.getItem('nickname');
    if (storedManagerId && storedNickname) {
      // localStorage isn't available during SSR, so this identity can only
      // be read once mounted on the client - a lazy useState initializer
      // would desync from the server-rendered markup and trigger a
      // hydration mismatch instead.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManagerId(storedManagerId);
      setNickname(storedNickname);
      setStep('teams');
    }
  }, []);

  useEffect(() => {
    if (!managerId) return;
    getManagerCampaigns(managerId)
      .then(setMyCampaigns)
      .catch(() => clearStaleIdentity());
  }, [managerId]);

  const submitNickname = async () => {
    const value = nickname.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const login = await loginManager(value);
      localStorage.setItem('managerId', login.managerId);
      localStorage.setItem('nickname', login.nickname);
      setManagerId(login.managerId);
      setNickname(login.nickname);
      setStep('teams');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchManager = () => {
    clearStaleIdentity();
    setManagerId(null);
    setNickname('');
    setError(null);
    setStep('nickname');
  };

  const handleTeamClick = async (team: TeamRef) => {
    if (!managerId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const campaign = await createCampaign(managerId, team.id);
      // Only a genuinely fresh campaign (nothing played yet) gets the draw
      // reveal - re-selecting an already-in-progress campaign's team just
      // resumes it, same as before.
      if (campaign.fixtures.length === 0 && campaign.groupStandings) {
        const draw = await getCampaignDraw(campaign.id);
        setFullDraw(draw);
        setDrawnCampaign(campaign);
        setSubmitting(false);
        return;
      }
      router.push(`/campaign/${campaign.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('404')) {
        // The cached managerId points at a manager that no longer exists
        // server-side - clear it and fall back to asking for the nickname
        // again instead of failing silently forever.
        clearStaleIdentity();
        setManagerId(null);
        setStep('nickname');
        setError('감독 정보를 새로 만들어야 합니다. 닉네임을 다시 입력해주세요.');
        setSubmitting(false);
        return;
      }
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <section className="border-b border-neutral-800 px-6 py-8 sm:px-10">
      {myCampaigns.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="font-hud text-xs font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
            이어하기 ({myCampaigns.length})
          </p>
          {myCampaigns.map((c) => (
            <button
              key={c.campaignId}
              type="button"
              onClick={() => router.push(`/campaign/${c.campaignId}`)}
              className="hud-card hud-card-interactive block w-full rounded-lg border-2 border-[var(--hud-accent-strong)] bg-emerald-950/40 p-4 text-left"
            >
              <p className="text-lg font-semibold text-neutral-100">{c.teamName}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {c.record.wins}승 {c.record.draws}무 {c.record.losses}패
              </p>
            </button>
          ))}
        </div>
      )}

      {step === 'nickname' && (
        <div className="mx-auto max-w-sm">
          <h2 className="font-hud text-lg font-bold tracking-wide text-neutral-100">
            감독 이름을 알려주세요
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            닉네임으로 커리어를 식별합니다 - 비밀번호는 없습니다.
          </p>
          <input
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임"
            className="mt-4 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNickname();
            }}
          />
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <button
            type="button"
            disabled={!nickname.trim() || submitting}
            onClick={submitNickname}
            className="hud-btn mt-3 w-full rounded bg-[var(--hud-accent-strong)] px-4 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {submitting ? '확인하는 중...' : '다음'}
          </button>
        </div>
      )}

      {step === 'teams' && (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-hud text-lg font-bold tracking-wide text-neutral-100">
                {nickname} 감독, 팀을 고르세요
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                2026 월드컵 참가국 중 하나를 선택하면 조 추첨부터 시작해 대회 전체를 이끕니다.
              </p>
            </div>
            <button
              type="button"
              onClick={switchManager}
              className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-300"
            >
              다른 감독으로 시작
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => handleTeamClick(team)}
                disabled={submitting}
                className="hud-card hud-card-interactive rounded border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm font-semibold text-neutral-200 hover:border-[var(--hud-accent)] hover:text-[var(--hud-accent)] disabled:opacity-50"
              >
                {team.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {drawnCampaign && fullDraw && (
        <GroupDrawReveal
          myTeamId={drawnCampaign.teamId}
          groups={fullDraw}
          onContinue={() => router.push(`/campaign/${drawnCampaign.id}`)}
        />
      )}
    </section>
  );
}
