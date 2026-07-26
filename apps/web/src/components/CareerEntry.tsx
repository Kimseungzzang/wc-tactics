'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign, getCampaign, getCampaignDraw, loginManager } from '@/lib/api';
import type { CampaignDetail, FullDrawGroup, TeamRef } from '@/lib/types';
import { GroupDrawReveal } from './GroupDrawReveal';

interface CareerEntryProps {
  teams: TeamRef[];
}

export function CareerEntry({ teams }: CareerEntryProps) {
  const router = useRouter();

  const [resumeCampaign, setResumeCampaign] = useState<CampaignDetail | null>(null);
  const [pendingTeam, setPendingTeam] = useState<TeamRef | null>(null);
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a fresh campaign is created, so the draw reveal shows before
  // navigating away rather than jumping straight to the dashboard.
  const [drawnCampaign, setDrawnCampaign] = useState<CampaignDetail | null>(null);
  const [fullDraw, setFullDraw] = useState<FullDrawGroup[] | null>(null);

  // Wipes locally-cached identity (managerId/nickname/campaignId) - used
  // whenever the backend says one of them no longer exists (e.g. the dev
  // DB was reset, or a manager/campaign was deleted server-side), so a
  // stale browser doesn't get stuck unable to start a new career.
  const clearStaleIdentity = () => {
    localStorage.removeItem('managerId');
    localStorage.removeItem('nickname');
    localStorage.removeItem('campaignId');
  };

  useEffect(() => {
    const campaignId = localStorage.getItem('campaignId');
    if (!campaignId) return;
    getCampaign(campaignId)
      .then(setResumeCampaign)
      .catch(() => clearStaleIdentity());
  }, []);

  const startCampaign = async (team: TeamRef, nicknameValue: string) => {
    setSubmitting(true);
    setError(null);
    try {
      let managerId = localStorage.getItem('managerId');
      if (!managerId || localStorage.getItem('nickname') !== nicknameValue) {
        const login = await loginManager(nicknameValue);
        managerId = login.managerId;
        localStorage.setItem('managerId', managerId);
        localStorage.setItem('nickname', login.nickname);
      }
      const campaign = await createCampaign(managerId, team.id);
      localStorage.setItem('campaignId', campaign.id);
      // Only a genuinely fresh campaign (nothing played yet) gets the draw
      // reveal - re-selecting an already-in-progress campaign's team just
      // resumes it, same as before.
      if (campaign.fixtures.length === 0 && campaign.groupStandings) {
        const draw = await getCampaignDraw(campaign.id);
        setPendingTeam(null);
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
        setPendingTeam(team);
        setError('감독 정보를 새로 만들어야 합니다. 닉네임을 다시 입력해주세요.');
        setSubmitting(false);
        return;
      }
      setError(message);
      setSubmitting(false);
    }
  };

  const handleTeamClick = (team: TeamRef) => {
    const storedNickname = localStorage.getItem('nickname');
    if (storedNickname) {
      startCampaign(team, storedNickname);
    } else {
      setPendingTeam(team);
      setError(null);
    }
  };

  return (
    <section className="border-b border-neutral-800 px-6 py-8 sm:px-10">
      {resumeCampaign && (
        <button
          type="button"
          onClick={() => router.push(`/campaign/${resumeCampaign.id}`)}
          className="hud-card hud-card-interactive mb-6 block w-full rounded-lg border-2 border-[var(--hud-accent-strong)] bg-emerald-950/40 p-4 text-left"
        >
          <p className="font-hud text-xs font-bold tracking-[0.15em] text-[var(--hud-accent)] uppercase">
            이어하기
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-100">
            {resumeCampaign.managerNickname} 감독 · {resumeCampaign.teamName}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {resumeCampaign.record.wins}승 {resumeCampaign.record.draws}무{' '}
            {resumeCampaign.record.losses}패
            {resumeCampaign.nextMatch
              ? ` · 다음 상대: ${resumeCampaign.nextMatch.opponentName}`
              : ' · 커리어 종료'}
          </p>
        </button>
      )}

      <h2 className="font-hud text-lg font-bold tracking-wide text-neutral-100">
        감독할 팀을 고르세요
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        2026 월드컵 참가국 중 하나를 선택하면 조 추첨부터 시작해 대회 전체를 이끕니다.
      </p>

      {!pendingTeam && error && (
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

      {drawnCampaign && fullDraw && (
        <GroupDrawReveal
          myTeamId={drawnCampaign.teamId}
          groups={fullDraw}
          onContinue={() => router.push(`/campaign/${drawnCampaign.id}`)}
        />
      )}

      {pendingTeam && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="text-sm font-semibold text-neutral-100">감독 이름을 알려주세요</h3>
            <p className="mt-1 text-xs text-neutral-500">{pendingTeam.name} 감독으로 시작합니다.</p>
            <input
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임"
              className="mt-3 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nickname.trim()) startCampaign(pendingTeam, nickname.trim());
              }}
            />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingTeam(null);
                  setError(null);
                }}
                className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!nickname.trim() || submitting}
                onClick={() => startCampaign(pendingTeam, nickname.trim())}
                className="hud-btn rounded bg-[var(--hud-accent-strong)] px-4 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {submitting ? '시작하는 중...' : '시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
