'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateWhatIfStream,
  getCampaignBracket,
  getSnapshot,
  recommendTactics,
  recordCampaignResult,
} from '@/lib/api';
import type {
  BracketMatchRow,
  MatchDetail,
  MatchSnapshotResponse,
  SnapshotPlayer,
  TacticalProfile,
  TacticsRecommendation,
  WhatIfCheckpoint,
  WhatIfMoment,
} from '@/lib/types';
import { WhatIfPanel } from './WhatIfPanel';
import { SetPieceCheckpoint } from './SetPieceCheckpoint';
import { SquadPanel } from './SquadPanel';
import { CommentaryFeed, type CommentaryEntry } from './CommentaryFeed';
import { MatchStatsPanel, MomentStatsPanel, PlayerStatsTable } from './MatchStatsPanel';
import { useMatchClock, CLOCK_SPEED_OPTIONS } from './useMatchClock';
import { playGoalSound, playHighlightSound, vibrateGoal } from '@/lib/sound';
import { CampaignOutcomeReveal, type CampaignOutcomeKind } from './CampaignOutcomeReveal';
import { TournamentFormationReveal } from './TournamentFormationReveal';
import { PenaltyShootout } from './PenaltyShootout';
import { STAGE_LABELS } from '@/lib/campaignDisplay';
import {
  computeBallEventStats,
  computeMomentStats,
  computePlayerStats,
  momentsToLiteEvents,
} from '@/lib/matchStats';

interface MatchBoardProps {
  match: MatchDetail;
  initialSnapshot: MatchSnapshotResponse;
  /** Present when entered via a campaign's "다음 경기" link - locks
   * managedTeamId to campaignTeamId and enables result recording. */
  campaignId?: string;
  campaignTeamId?: number;
  /** Set when the manager adjusted the tactical dial on the lineup
   * screen before kickoff (see LineupSelect) - seeds the dial with that
   * choice instead of always starting at the team's neutral baseline. */
  initialTacticalDial?: TacticalProfile;
}

/** Caps the commentary log so an extremely long AI-generated match can't
 * grow the DOM/state unboundedly - oldest lines drop off first. */
const MAX_LOG_ENTRIES = 300;

/** Real-match substitution limit (2026 World Cup rules: 5 per team in
 * normal time). Extra-time matches get a 6th window, but this app doesn't
 * model extra time, so 5 is the hard cap. */
const MAX_SUBSTITUTIONS = 5;

export function MatchBoard({
  match,
  initialSnapshot,
  campaignId,
  campaignTeamId,
  initialTacticalDial,
}: MatchBoardProps) {
  const router = useRouter();
  const jerseyByPlayer = useMemo(() => {
    const map = new Map<number, number>();
    for (const list of Object.values(match.squads)) {
      for (const s of list) map.set(s.playerId, s.jerseyNumber);
    }
    return map;
  }, [match.squads]);
  const nameByPlayer = useMemo(() => {
    const map = new Map<number, string>();
    for (const list of Object.values(match.squads)) {
      for (const s of list) map.set(s.playerId, s.name);
    }
    return map;
  }, [match.squads]);

  const [managedTeamId, setManagedTeamId] = useState(campaignTeamId ?? match.homeTeam.id);
  const [snapshot, setSnapshot] = useState<MatchSnapshotResponse>(initialSnapshot);
  const [lineupOverride, setLineupOverride] = useState<SnapshotPlayer[] | null>(null);
  const [manualSubstitutions, setManualSubstitutions] = useState<
    { outPlayerId: number; inPlayerId: number }[]
  >([]);
  const [selectedFormation, setSelectedFormation] = useState<string | undefined>(undefined);
  const [tacticalDial, setTacticalDial] = useState<TacticalProfile | undefined>(initialTacticalDial);
  const [ai, setAi] = useState<{
    loading: boolean;
    result: TacticsRecommendation | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });
  const [whatIf, setWhatIf] = useState<{
    summary: string;
    moments: WhatIfMoment[];
    rollbackMinute: number;
  } | null>(null);
  const [whatIfStreaming, setWhatIfStreaming] = useState(false);
  // A free-kick checkpoint pauses the AI stream (see WhatIfService); kept
  // separate from `whatIf` itself so the reveal card can keep showing the
  // ORIGINAL checkpoint while the resume call is in flight and after its
  // first (resolving) moment arrives, instead of disappearing the instant
  // new data comes back (that new chunk's own `checkpoint` is always null
  // per the prompt's "don't make a new one this turn" rule anyway).
  const [activeCheckpoint, setActiveCheckpoint] = useState<WhatIfCheckpoint | null>(null);
  const [checkpointResolving, setCheckpointResolving] = useState(false);
  const [checkpointResolvedMoment, setCheckpointResolvedMoment] = useState<WhatIfMoment | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [showEntrance, setShowEntrance] = useState(true);

  const [prevMatchId, setPrevMatchId] = useState(match.id);
  if (match.id !== prevMatchId) {
    setPrevMatchId(match.id);
    setShowEntrance(true);
  }

  useEffect(() => {
    if (!showEntrance) return;
    const timer = setTimeout(() => setShowEntrance(false), 650);
    return () => clearTimeout(timer);
  }, [showEntrance]);

  // Once the user diverges (applies a substitution/formation change, or an
  // AI regeneration is active), stop syncing the persisted-so-far snapshot
  // - the squad panel reflects the roster at the moment of divergence.
  const diverged =
    manualSubstitutions.length > 0 || !!selectedFormation || !!tacticalDial || !!whatIf;
  // Every match gets its single synthetic kickoff MatchBallEvent the
  // moment the manager submits a lineup (see campaigns.service.ts), so by
  // the time MatchBoard renders this should always be true - false only
  // means the lineup step was somehow skipped.
  const hasKickoff = match.ballEvents.length > 0;

  // A match's clock runs at least to full time (90'); if it's been
  // generated further already (revisiting an in-progress/finished match),
  // to whatever's been persisted. A what-if regeneration's clock instead
  // runs from the rollback point to however far the AI has generated so
  // far this session, extending live as chunks stream in.
  const persistedDurationSeconds = useMemo(() => {
    const minutes = [90, ...match.highlights.map((h) => h.minute)];
    return Math.max(...minutes) * 60;
  }, [match.highlights]);

  const whatIfLastT = useMemo(() => {
    if (!whatIf) return 0;
    const last = whatIf.moments[whatIf.moments.length - 1];
    if (!last) return whatIf.rollbackMinute * 60 + 1;
    const atMinute = last.atMinute ?? whatIf.rollbackMinute + Math.floor(last.offsetSeconds / 60);
    const atSecond = last.atSecond ?? last.offsetSeconds % 60;
    return atMinute * 60 + atSecond;
  }, [whatIf]);

  const clock = useMatchClock(
    whatIf ? whatIf.rollbackMinute * 60 : 0,
    whatIf ? whatIfLastT : persistedDurationSeconds,
    whatIf ? `whatif-${whatIf.rollbackMinute}-${match.id}` : `base-${match.id}`,
    whatIf ? whatIfStreaming : false,
  );
  const currentMinute = clock.current.minute;

  useEffect(() => {
    if (diverged) return;
    let cancelled = false;
    getSnapshot(match.id, currentMinute).then((snap) => {
      if (!cancelled) setSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [currentMinute, diverged, match.id]);

  const managedSnapshot =
    snapshot.home?.teamId === managedTeamId ? snapshot.home : snapshot.away;
  const managedTeamName =
    managedTeamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  const managedTeamProfile =
    managedTeamId === match.homeTeam.id
      ? match.homeTeam.tacticalProfile
      : match.awayTeam.tacticalProfile;
  const managedLineup = lineupOverride ?? managedSnapshot?.lineup ?? [];
  const substitutedInPlayerIds = useMemo(
    () => new Set(manualSubstitutions.map((s) => s.inPlayerId)),
    [manualSubstitutions],
  );
  // There's no discrete substitution-event log anymore (see
  // tactics-tools.service.ts) - only this session's own choices count
  // against the cap.
  const totalSubstitutionsUsed = manualSubstitutions.length;

  const handleRecommend = async () => {
    setAi({ loading: true, result: null, error: null });
    try {
      const result = await recommendTactics(match.id, {
        minute: currentMinute,
        teamId: managedTeamId,
        proposedChange,
      });
      setAi({ loading: false, result, error: null });
    } catch (err) {
      setAi({
        loading: false,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const applySubstitution = (outPlayerId: number, inPlayerId: number) => {
    const base = lineupOverride ?? managedSnapshot?.lineup ?? [];
    const outEntry = base.find((p) => p.playerId === outPlayerId);
    if (!outEntry) return;

    // `outPlayerId` may actually be a player who came ON in an earlier
    // substitution (re-subbing a substitute) - chain back to the ORIGINAL
    // outgoing player so this updates that same slot instead of silently
    // consuming a second one.
    const chained = manualSubstitutions.find((s) => s.inPlayerId === outPlayerId);
    const effectiveOutId = chained ? chained.outPlayerId : outPlayerId;

    const isNewSlot = !manualSubstitutions.some((s) => s.outPlayerId === effectiveOutId);
    if (isNewSlot && totalSubstitutionsUsed >= MAX_SUBSTITUTIONS) return;

    const inName = nameByPlayer.get(inPlayerId) ?? `#${inPlayerId}`;
    const inJersey = jerseyByPlayer.get(inPlayerId) ?? 0;
    const next = base.map((p) =>
      p.playerId === outPlayerId
        ? { ...p, playerId: inPlayerId, name: inName, jerseyNumber: inJersey }
        : p,
    );
    setLineupOverride(next);
    setManualSubstitutions((prev) => [
      ...prev.filter((s) => s.outPlayerId !== effectiveOutId),
      { outPlayerId: effectiveOutId, inPlayerId },
    ]);
  };

  const resetChanges = () => {
    setLineupOverride(null);
    setManualSubstitutions([]);
    setSelectedFormation(undefined);
    setTacticalDial(initialTacticalDial);
    setWhatIf(null);
    setWhatIfStreaming(false);
    setAi({ loading: false, result: null, error: null });
  };

  const proposedChange =
    manualSubstitutions.length > 0 || selectedFormation || tacticalDial
      ? {
          formation: selectedFormation,
          substitutions: manualSubstitutions.length > 0 ? manualSubstitutions : undefined,
          tacticalDial,
        }
      : undefined;

  // A brand new match (nothing generated yet) has no other way to get a
  // score - AI generation from kickoff is mandatory, not optional.
  const isFreshMatch = match.highlights.length === 0 && !whatIf;

  // Campaign result recording - a match is "complete" once the clock has
  // run to the end and nothing is still streaming in (and there's no
  // free-kick checkpoint waiting on the user - the stream having ended
  // there doesn't mean the match itself is over).
  const matchComplete =
    !!campaignId &&
    hasKickoff &&
    clock.t >= clock.lastT &&
    !clock.playing &&
    !(whatIf && whatIfStreaming) &&
    !activeCheckpoint;

  const [resultState, setResultState] = useState<{
    submitting: boolean;
    recorded: boolean;
    error: string | null;
  }>({ submitting: false, recorded: false, error: null });
  const [outcomeReveal, setOutcomeReveal] = useState<{
    outcome: CampaignOutcomeKind;
    record: { wins: number; draws: number; losses: number };
  } | null>(null);
  const [formationReveal, setFormationReveal] = useState<{
    matches: BracketMatchRow[];
  } | null>(null);
  const [prevMatchIdForResult, setPrevMatchIdForResult] = useState(match.id);
  if (match.id !== prevMatchIdForResult) {
    setPrevMatchIdForResult(match.id);
    setResultState({ submitting: false, recorded: false, error: null });
  }

  const stageLabelOf = (stage: string) =>
    STAGE_LABELS.find(([key]) => key === stage)?.[1] ?? stage;

  const computeFinalScore = (): { homeScore: number; awayScore: number } => {
    const rollbackMinute = whatIf?.rollbackMinute ?? Infinity;
    const goalsBeforeRollback = match.highlights.filter(
      (h) => h.isGoal && h.minute <= rollbackMinute,
    );
    let homeScore = goalsBeforeRollback.filter((h) => h.teamId === match.homeTeam.id).length;
    let awayScore = goalsBeforeRollback.filter((h) => h.teamId === match.awayTeam.id).length;
    if (whatIf) {
      for (const m of whatIf.moments) {
        if (m.outcome !== 'Goal') continue;
        if (m.teamId === match.homeTeam.id) homeScore += 1;
        else if (m.teamId === match.awayTeam.id) awayScore += 1;
      }
    }
    return { homeScore, awayScore };
  };

  const handleRecordResult = async (shootout?: { myScore: number; opponentScore: number }) => {
    if (!campaignId) return;
    setResultState({ submitting: true, recorded: false, error: null });
    try {
      const { homeScore, awayScore } = computeFinalScore();
      const managedIsHome = managedTeamId === match.homeTeam.id;
      const updated = await recordCampaignResult(campaignId, {
        matchId: match.id,
        homeScore,
        awayScore,
        ...(shootout && {
          shootoutHomeScore: managedIsHome ? shootout.myScore : shootout.opponentScore,
          shootoutAwayScore: managedIsHome ? shootout.opponentScore : shootout.myScore,
        }),
      });
      setResultState({ submitting: false, recorded: true, error: null });

      // Real 2026 World Cup advancement rule (see resolveNextMatch in
      // campaigns.service.ts): eliminated, moved into a new knockout
      // stage, or won the Final all change the campaign's status enough
      // to warrant the reveal screen - staying in the group stage for
      // the next matchday doesn't, so that case just navigates straight
      // through like before.
      if (updated.eliminated) {
        setOutcomeReveal({
          outcome: { kind: 'eliminated', stageLabel: stageLabelOf(match.competitionStage) },
          record: updated.record,
        });
      } else if (
        match.competitionStage === 'Group Stage' &&
        updated.nextMatch?.stage === 'Round of 32'
      ) {
        // ensureKnockoutRound('Round of 32') has already run server-side
        // as part of recordCampaignResult's response, so the full 16-match
        // bracket already exists - no polling/loading state needed.
        const bracket = await getCampaignBracket(campaignId);
        setFormationReveal({ matches: bracket[0]?.matches ?? [] });
      } else if (!updated.nextMatch) {
        setOutcomeReveal({ outcome: { kind: 'champion' }, record: updated.record });
      } else if (updated.nextMatch.stage !== match.competitionStage) {
        setOutcomeReveal({
          outcome: { kind: 'advanced', stageLabel: stageLabelOf(updated.nextMatch.stage) },
          record: updated.record,
        });
      } else {
        router.push(`/campaign/${campaignId}`);
      }
    } catch (err) {
      setResultState({
        submitting: false,
        recorded: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Resumes a paused free-kick checkpoint - a fresh generateWhatIfStream
  // call rooted at the checkpoint's own minute (not a further rollback),
  // with the chosen kicker threaded through proposedChange.checkpointChoice
  // so the prompt resolves that exact free kick as the next chunk's first
  // moment (see gemini.service.ts). Goes straight through the API client
  // rather than WhatIfPanel, since WhatIfPanel's onChunk always treats its
  // own first chunk as a new scenario (isFirst -> replaces whatIf.moments),
  // and this needs to APPEND onto the paused scenario instead.
  const handleCheckpointChoice = async (kicker: { playerId: number; name: string }) => {
    if (!activeCheckpoint) return;
    setCheckpointResolving(true);
    setCheckpointError(null);
    let capturedFirstMoment = false;
    try {
      await generateWhatIfStream(
        match.id,
        {
          minute: activeCheckpoint.atMinute,
          teamId: managedTeamId,
          proposedChange: {
            ...proposedChange,
            checkpointChoice: {
              kind: activeCheckpoint.kind,
              playerId: kicker.playerId,
              playerName: kicker.name,
            },
          },
        },
        (chunk) => {
          if (!capturedFirstMoment && chunk.moments.length > 0) {
            capturedFirstMoment = true;
            setCheckpointResolvedMoment(chunk.moments[0]);
          }
          setWhatIf((prev) =>
            prev ? { ...prev, summary: chunk.summary, moments: [...prev.moments, ...chunk.moments] } : prev,
          );
          setWhatIfStreaming(!chunk.done);
          // Play can immediately run into ANOTHER checkpoint before the
          // user has even dismissed this one's reveal card - without this,
          // that second pause was silently dropped: activeCheckpoint got
          // cleared on dismiss with nothing new to replace it, so the
          // stream just sat there "done" and the clock caught up to it and
          // declared the match over (the real cause of matches ending
          // early around 15', wherever their first/second checkpoint
          // happened to land).
          if (chunk.checkpoint) {
            setActiveCheckpoint(chunk.checkpoint);
            setCheckpointResolvedMoment(null);
          }
        },
      );
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointResolving(false);
    }
  };

  const handleCheckpointDismiss = () => {
    setActiveCheckpoint(null);
    setCheckpointResolvedMoment(null);
    setCheckpointError(null);
    clock.setPlaying(true);
  };

  // Unified list of "banner-worthy" events for whichever source is active
  // right now (persisted highlights vs a live AI regeneration), each
  // resolved to a single minute:second key so crossing it can be detected
  // regardless of playback speed.
  const bannerSource: CommentaryEntry[] = useMemo(() => {
    if (whatIf) {
      return whatIf.moments.map((m, i) => {
        const mMinute = m.atMinute ?? whatIf.rollbackMinute + Math.floor(m.offsetSeconds / 60);
        const mSecond = m.atSecond ?? m.offsetSeconds % 60;
        return {
          id: `wm-${whatIf.rollbackMinute}-${i}-${mMinute}-${mSecond}`,
          key: mMinute * 60 + mSecond,
          icon: m.type === 'SHOT' && m.outcome === 'Goal' ? '⚽' : '▶️',
          text: m.commentary,
          isGoal: m.type === 'SHOT' && m.outcome === 'Goal',
        };
      });
    }
    return match.highlights
      .map((h) => ({
        id: h.id,
        key: h.minute * 60 + h.second,
        icon: h.isGoal ? '⚽' : '▶️',
        text: h.commentary,
        isGoal: h.isGoal,
      }))
      .sort((a, b) => a.key - b.key);
  }, [whatIf, match.highlights]);

  const [commentaryLog, setCommentaryLog] = useState<CommentaryEntry[]>([]);
  const lastBannerKeyRef = useRef(-1);
  const shownBannerIdsRef = useRef<Set<string>>(new Set());

  // Sound/haptics default OFF (autoplay-audio etiquette) - user opts in per
  // session via the speaker toggle near the score.
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [goalFlash, setGoalFlash] = useState<string | null>(null);
  const goalFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new scenario (or the initial persisted log) starts its own
  // commentary log from scratch. Keyed off the first source event's id BY
  // VALUE, not `bannerSource`'s array identity: a streamed chunk arriving
  // mid-playback rebuilds `bannerSource` (new array, new moment objects)
  // every time, but the first entry's id stays the same value across
  // chunks of the SAME scenario - only a genuinely new scenario changes it.
  const firstBannerSourceId = bannerSource[0]?.id ?? null;
  const prevFirstBannerSourceIdRef = useRef(firstBannerSourceId);
  const fullTimeAnnouncedRef = useRef(false);
  useEffect(() => {
    if (prevFirstBannerSourceIdRef.current === firstBannerSourceId) return;
    prevFirstBannerSourceIdRef.current = firstBannerSourceId;
    lastBannerKeyRef.current = -1;
    shownBannerIdsRef.current = new Set();
    fullTimeAnnouncedRef.current = false;
    setCommentaryLog([]);
  }, [firstBannerSourceId]);

  useEffect(() => {
    const cur = clock.current;
    const curKey = cur.minute * 60 + cur.second;
    const lastKey = lastBannerKeyRef.current;
    if (curKey < lastKey) {
      // Scrubbed backward - just move the watermark, don't re-emit.
      lastBannerKeyRef.current = curKey;
      return;
    }
    const crossed = bannerSource.filter(
      (b) => b.key > lastKey && b.key <= curKey && !shownBannerIdsRef.current.has(b.id),
    );
    lastBannerKeyRef.current = curKey;
    if (crossed.length === 0) return;
    for (const b of crossed) shownBannerIdsRef.current.add(b.id);
    setCommentaryLog((prev) => [...prev, ...crossed].slice(-MAX_LOG_ENTRIES));

    const goal = crossed.find((b) => b.isGoal);
    if (goal) {
      if (goalFlashTimeoutRef.current) clearTimeout(goalFlashTimeoutRef.current);
      setGoalFlash(goal.text);
      goalFlashTimeoutRef.current = setTimeout(() => setGoalFlash(null), 1800);
      if (soundEnabled) {
        playGoalSound();
        vibrateGoal();
      }
    } else if (soundEnabled && crossed.length > 0) {
      playHighlightSound();
    }
  }, [clock, bannerSource, soundEnabled]);

  useEffect(() => {
    return () => {
      if (goalFlashTimeoutRef.current) clearTimeout(goalFlashTimeoutRef.current);
    };
  }, []);

  const goalsSoFar = match.highlights.filter((h) => h.isGoal && h.minute <= currentMinute);
  const scoreAtMinute = {
    home: goalsSoFar.filter((h) => h.teamId === match.homeTeam.id).length,
    away: goalsSoFar.filter((h) => h.teamId === match.awayTeam.id).length,
  };

  // match.ballEvents is a one-time snapshot from when the page loaded -
  // for a match still being generated, that's just the synthetic kickoff
  // anchor no matter how far generation/playback has actually gotten
  // since. Once whatIf exists, splice in its live-accumulated moments
  // (converted to the same shape) for everything from the rollback point
  // onward, keeping only the real pre-rollback history from the snapshot.
  const effectiveBallEvents = useMemo(() => {
    if (!whatIf) return match.ballEvents;
    return [
      ...match.ballEvents.filter((e) => e.minute < whatIf.rollbackMinute),
      ...momentsToLiteEvents(whatIf.moments),
    ];
  }, [match.ballEvents, whatIf]);

  // Both live-recomputed off the current clock position - the stats panel
  // updates as playback advances instead of showing one fixed final total.
  const liveStats = useMemo(
    () => computeBallEventStats(effectiveBallEvents, match.homeTeam.id, match.awayTeam.id, currentMinute),
    [effectiveBallEvents, match.homeTeam.id, match.awayTeam.id, currentMinute],
  );
  const playerStats = useMemo(
    () => computePlayerStats(effectiveBallEvents, currentMinute),
    [effectiveBallEvents, currentMinute],
  );
  const momentStats = useMemo(() => {
    if (!whatIf) return null;
    return computeMomentStats(
      whatIf.moments,
      match.homeTeam.id,
      match.awayTeam.id,
      whatIf.rollbackMinute,
      clock.t,
    );
  }, [whatIf, match.homeTeam.id, match.awayTeam.id, clock.t]);

  // Entering a genuinely fresh match now auto-generates from kickoff (see
  // WhatIfPanel) instead of waiting on a button press - once its first
  // chunk lands, start playback automatically too, so the whole "enter ->
  // wait -> watch" flow needs no clicks. Captured once on mount (not
  // re-evaluated every render) since `isFreshMatch` itself flips false the
  // moment `whatIf` gets its first chunk.
  const wasFreshOnMountRef = useRef(isFreshMatch);
  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (wasFreshOnMountRef.current && whatIf && !autoPlayedRef.current) {
      autoPlayedRef.current = true;
      clock.setPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatIf]);

  // The AI is never asked to narrate a final whistle - generation just
  // stops once the clock passes 90' (see what-if.service.ts), so without
  // this the commentary log would abruptly end mid-broadcast with no
  // "match over" line at all. Appended once per match/scenario as a
  // synthetic (non-AI) entry, not fetched from bannerSource, so it
  // doesn't need a real event key to cross - reset alongside commentaryLog
  // whenever a rollback starts a new scenario (see the effect above).
  useEffect(() => {
    if (!matchComplete || fullTimeAnnouncedRef.current) return;
    fullTimeAnnouncedRef.current = true;
    const { homeScore, awayScore } = computeFinalScore();
    // Timestamp is wherever playback actually stopped, not a sentinel -
    // this is also displayed (MM'SS), not just an ordering key.
    const stopKey = clock.current.minute * 60 + clock.current.second;
    setCommentaryLog((prev) => [
      ...prev,
      {
        id: `fulltime-${match.id}`,
        key: stopKey,
        icon: '🏁',
        text: `주심이 길게 휘슬을 불며 경기 종료를 알립니다. 최종 스코어 ${match.homeTeam.name} ${homeScore} - ${awayScore} ${match.awayTeam.name}.`,
      },
    ].slice(-MAX_LOG_ENTRIES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchComplete]);

  return (
    <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[280px_1fr_340px]">
      {showEntrance && (
        <div className="animate-tunnel-zoom-out pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black">
          <div className="text-center">
            <p className="font-hud text-xs font-bold tracking-[0.3em] text-[var(--hud-accent)] uppercase">
              감독석 입장
            </p>
            <p className="font-hud mt-3 text-3xl font-bold text-white sm:text-4xl">
              {match.homeTeam.name} <span className="text-[var(--hud-accent)]">VS</span>{' '}
              {match.awayTeam.name}
            </p>
          </div>
        </div>
      )}

      {isFreshMatch && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-[var(--hud-accent)]" />
            <p className="font-hud mt-5 text-sm font-bold tracking-[0.2em] text-[var(--hud-accent)] uppercase">
              AI 경기 생성 중
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              {match.homeTeam.name} vs {match.awayTeam.name}의 실제 능력치·전술 성향을 근거로
              킥오프부터 경기를 만들고 있습니다.
            </p>
          </div>
        </div>
      )}

      {goalFlash && (
        <div className="animate-goal-flash-bg pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-emerald-400/20">
          <div className="animate-goal-flash-pop text-center">
            <p className="font-hud text-6xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-7xl">
              GOAL!
            </p>
            <p className="mt-1 text-sm font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              {goalFlash}
            </p>
          </div>
        </div>
      )}

      {outcomeReveal && (
        <CampaignOutcomeReveal
          outcome={outcomeReveal.outcome}
          teamName={managedTeamName}
          record={outcomeReveal.record}
          onContinue={() => router.push(`/campaign/${campaignId}`)}
          onViewFinalStandings={
            outcomeReveal.outcome.kind !== 'advanced'
              ? () => router.push(`/campaign/${campaignId}/finale`)
              : undefined
          }
        />
      )}

      {formationReveal && (
        <TournamentFormationReveal
          myTeamId={managedTeamId}
          matches={formationReveal.matches}
          onContinue={() => router.push(`/campaign/${campaignId}`)}
        />
      )}

      {activeCheckpoint && (
        <SetPieceCheckpoint
          // Forces a fresh component instance (fresh internal chosenKicker
          // state) whenever a genuinely new checkpoint replaces the old one
          // mid-resolve - otherwise the picker/suspense/reveal state
          // machine below stays stuck showing the PREVIOUS checkpoint's
          // "키킹 준비 중" spinner forever, since the component itself
          // never unmounts (activeCheckpoint stays truthy across the
          // handoff from one checkpoint to the next).
          key={`${activeCheckpoint.kind}-${activeCheckpoint.atMinute}-${activeCheckpoint.atSecond}`}
          checkpoint={activeCheckpoint}
          resolving={checkpointResolving}
          resolvedMoment={checkpointResolvedMoment}
          error={checkpointError}
          onChoose={handleCheckpointChoice}
          onDismiss={handleCheckpointDismiss}
        />
      )}

      <SquadPanel
        match={match}
        managedTeamId={managedTeamId}
        managedTeamName={managedTeamName}
        currentLineup={managedLineup}
        currentFormation={managedSnapshot?.formation}
        selectedFormation={selectedFormation}
        onFormationChange={setSelectedFormation}
        onSubstitute={applySubstitution}
        substitutionsUsed={totalSubstitutionsUsed}
        maxSubstitutions={MAX_SUBSTITUTIONS}
        substitutedInPlayerIds={substitutedInPlayerIds}
        tacticalBaseline={managedTeamProfile}
        tacticalDial={tacticalDial}
        onTacticalDialChange={setTacticalDial}
        onTacticalDialReset={() => setTacticalDial(undefined)}
      />

      <div className="flex flex-col">
        <div className="hud-card mb-4 flex items-center justify-between rounded-lg border-2 border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4">
          <TeamHeader
            name={match.homeTeam.name}
            formation={snapshot.home?.formation}
            active={managedTeamId === match.homeTeam.id}
            onManage={campaignId ? undefined : () => setManagedTeamId(match.homeTeam.id)}
          />
          <div className="px-4 text-center">
            <div className="hud-score text-4xl text-[var(--hud-accent)]">
              {scoreAtMinute.home} - {scoreAtMinute.away}
            </div>
            <div className="text-xs text-neutral-500">
              {currentMinute}&apos;{String(clock.current.second).padStart(2, '0')}
              {whatIf
                ? whatIfStreaming
                  ? ' · AI 시뮬레이션 재생 중 (계속 생성됨)'
                  : ' · AI 시뮬레이션 재생 중'
                : ' · 중계 재생 중'}
            </div>
          </div>
          <TeamHeader
            name={match.awayTeam.name}
            formation={snapshot.away?.formation}
            active={managedTeamId === match.awayTeam.id}
            onManage={campaignId ? undefined : () => setManagedTeamId(match.awayTeam.id)}
            alignRight
          />
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? '효과음 끄기' : '효과음 켜기'}
            className={`ml-2 shrink-0 rounded p-1.5 text-sm transition ${
              soundEnabled
                ? 'bg-emerald-900/50 text-emerald-300'
                : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
            }`}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>

        {!hasKickoff ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center text-sm text-neutral-500">
            <p>이 경기는 아직 라인업이 선택되지 않았습니다.</p>
            <p className="text-xs text-neutral-600">대시보드에서 라인업을 먼저 선택해주세요.</p>
          </div>
        ) : (
          <>
            <div className="hud-card rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => clock.setPlaying((p) => !p)}
                  className="hud-btn shrink-0 rounded bg-[var(--hud-accent-strong)] px-4 py-1.5 text-xs text-white"
                >
                  {clock.playing ? '일시정지' : '재생'}
                </button>
                <input
                  type="range"
                  min={clock.firstT}
                  max={clock.lastT}
                  value={clock.t}
                  onChange={(e) => {
                    clock.setPlaying(false);
                    clock.setT(Number(e.target.value));
                  }}
                  className="flex-1 accent-[var(--hud-accent)]"
                />
                <select
                  value={clock.speed}
                  onChange={(e) => clock.setSpeed(Number(e.target.value))}
                  className="font-hud shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs font-bold text-neutral-200"
                >
                  {CLOCK_SPEED_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                실시간 텍스트 중계입니다. 양 팀의 실제 선수 능력치·전술 성향을 근거로 AI가 만든
                경기입니다.
                {whatIf &&
                  ' 지금은 왼쪽에서 적용한 변경 이후를 AI가 다시 생성한 시나리오를 중계 중입니다.'}
              </p>
            </div>

            <div className="mt-4 flex-1">
              <CommentaryFeed entries={commentaryLog} tall />
            </div>
          </>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        {liveStats && (
          <MatchStatsPanel
            stats={liveStats}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
          />
        )}

        {momentStats && (
          <MomentStatsPanel
            stats={momentStats}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
          />
        )}

        <PlayerStatsTable players={playerStats} homeTeamId={match.homeTeam.id} />

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-200">
            감독 모드: {managedTeamName}
          </h3>
          <p className="mb-3 text-xs text-neutral-500">
            왼쪽 스쿼드에서 교체하거나 전술을 바꾸면, 그 순간부터 AI가 다시 만든 흐름으로
            중계됩니다.
          </p>
          <button
            type="button"
            onClick={resetChanges}
            className="mb-2 w-full rounded border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            변경 초기화
          </button>
          <button
            type="button"
            onClick={handleRecommend}
            disabled={ai.loading}
            className="hud-btn w-full rounded bg-[var(--hud-accent-strong)] px-3 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {ai.loading ? 'AI 분석 중...' : 'AI 전술 추천 받기'}
          </button>
        </div>

        {ai.error && (
          <div className="rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-300">
            {ai.error}
          </div>
        )}

        {ai.result && (
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-4">
            <h4 className="text-sm font-semibold text-emerald-300">
              추천 포메이션: {ai.result.recommendedFormation ?? '현행 유지'}
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-300">
              {ai.result.reasoning}
            </p>
            {ai.result.substitutions.length > 0 && (
              <ul className="mt-3 space-y-2">
                {ai.result.substitutions.map((s, i) => (
                  <li
                    key={i}
                    className="rounded border border-neutral-700 bg-neutral-900 p-2 text-xs"
                  >
                    <div className="font-medium text-neutral-100">
                      {s.outName} ➜ {s.inName}
                    </div>
                    <div className="mt-1 text-neutral-400">{s.reason}</div>
                    <button
                      type="button"
                      onClick={() => applySubstitution(s.outPlayerId, s.inPlayerId)}
                      className="mt-2 rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
                    >
                      적용
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {proposedChange || isFreshMatch ? (
          <WhatIfPanel
            match={match}
            minute={currentMinute}
            teamId={managedTeamId}
            proposedChange={proposedChange}
            isFreshMatch={isFreshMatch}
            onChunk={(chunk) => {
              setWhatIf((prev) =>
                !prev || chunk.isFirst
                  ? {
                      summary: chunk.summary,
                      moments: chunk.moments,
                      rollbackMinute: chunk.rollbackMinute,
                    }
                  : {
                      ...prev,
                      summary: chunk.summary,
                      moments: [...prev.moments, ...chunk.moments],
                    },
              );
              setWhatIfStreaming(!chunk.done);
              // A rollback/regeneration button press always starts a fresh
              // scenario (chunk.isFirst) - clear any leftover checkpoint
              // state from a previous run rather than let it linger.
              if (chunk.isFirst) {
                setCheckpointResolvedMoment(null);
                setCheckpointError(null);
              }
              if (chunk.checkpoint) setActiveCheckpoint(chunk.checkpoint);
            }}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-800 p-4 text-xs text-neutral-500">
            왼쪽 스쿼드에서 선수 교체·포메이션·세부 전술(압박/수비라인/점유)을 변경하면,
            그 이후 전개를 AI가 재생성해서 중계로 이어갑니다.
          </div>
        )}

        {matchComplete && !resultState.recorded && (() => {
          const { homeScore, awayScore } = computeFinalScore();
          const isKnockoutDraw = match.competitionStage !== 'Group Stage' && homeScore === awayScore;

          if (isKnockoutDraw) {
            const opponentSnapshot =
              snapshot.home?.teamId === managedTeamId ? snapshot.away : snapshot.home;
            const opponentTeamName =
              managedTeamId === match.homeTeam.id ? match.awayTeam.name : match.homeTeam.name;
            return (
              <PenaltyShootout
                myTeamName={managedTeamName}
                opponentTeamName={opponentTeamName}
                myLineup={managedLineup.map((p) => ({ playerId: p.playerId, name: p.name }))}
                opponentLineup={(opponentSnapshot?.lineup ?? []).map((p) => ({
                  playerId: p.playerId,
                  name: p.name,
                }))}
                submitting={resultState.submitting}
                error={resultState.error}
                onComplete={(myScore, opponentScore) =>
                  handleRecordResult({ myScore, opponentScore })
                }
              />
            );
          }

          return (
            <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-4">
              <h3 className="text-sm font-semibold text-emerald-300">경기 종료</h3>
              <p className="mt-1 text-xs text-neutral-400">
                {`최종 스코어 ${match.homeTeam.name} ${homeScore} - ${awayScore} ${match.awayTeam.name}`}
              </p>
              {resultState.error && (
                <p className="mt-2 text-xs text-red-400">{resultState.error}</p>
              )}
              <button
                type="button"
                onClick={() => handleRecordResult()}
                disabled={resultState.submitting}
                className="hud-btn mt-3 w-full rounded bg-[var(--hud-accent-strong)] px-3 py-2.5 text-sm text-white disabled:opacity-50"
              >
                {resultState.submitting ? '기록하는 중...' : '결과 기록하고 다음 경기로'}
              </button>
            </div>
          );
        })()}
      </aside>
    </div>
  );
}

function TeamHeader({
  name,
  formation,
  active,
  onManage,
  alignRight,
}: {
  name: string;
  formation?: string;
  active: boolean;
  onManage?: () => void;
  alignRight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onManage}
      disabled={!onManage}
      className={`flex flex-col rounded px-2 py-1 ${alignRight ? 'items-end text-right' : 'items-start'} ${
        active ? 'bg-emerald-900/40 ring-1 ring-emerald-600' : ''
      } ${!onManage ? 'cursor-default' : ''}`}
    >
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-xs text-neutral-500">{formation ?? '-'}</span>
    </button>
  );
}
