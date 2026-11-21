import React, { useEffect, useMemo, useState } from 'react';
import { Award, Crown, Edit3, Gem, Heart, Home, RotateCcw, ShieldCheck, Sparkles, Trophy, Zap } from 'lucide-react';
import { DEFAULT_TEAM_CARDS, DIFFICULTY_META, PLAYER_TITLES, PlayResult, SongItem, TeamCard } from '../types/game';
import { AnimatedBackdrop } from './AnimatedBackdrop';
import { AvatarFace, AvatarView, MIKU_AVATARS, MikuAvatar } from './Avatars';

interface ResultsScreenProps {
  song: SongItem;
  result: PlayResult;
  avatar?: AvatarView;
  frameId?: string;
  activeTitleId?: string;
  teamCards?: TeamCard[];
  onRetry: () => void;
  onOpenEditor: () => void;
  onBackToMenu: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  song,
  result,
  avatar,
  frameId,
  activeTitleId,
  teamCards,
  onRetry,
  onOpenEditor,
  onBackToMenu,
}) => {
  const [animProgress, setAnimProgress] = useState(0);
  const [stampReady, setStampReady] = useState(false);

  useEffect(() => {
    let raf = 0;
    const duration = 850;
    const t0 = performance.now();
    setAnimProgress(0);
    setStampReady(false);

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimProgress(eased);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setStampReady(true);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [result]);

  const accuracy =
    result.totalNotes > 0
      ? ((result.counts.PERFECT * 1 +
          result.counts.GREAT * 0.7 +
          result.counts.GOOD * 0.5 +
          result.counts.BAD * 0.1) /
          result.totalNotes) *
        100
      : 100;

  const avgMsOffset = useMemo(() => {
    const pts = (result.hitTimeline ?? []).filter((p) => p.judgment !== 'MISS');
    if (pts.length === 0) return null;
    const sum = pts.reduce((acc, p) => acc + p.ms, 0);
    return Math.round(sum / pts.length);
  }, [result.hitTimeline]);

  const timelineSampled = useMemo(() => {
    const pts = result.hitTimeline ?? [];
    if (pts.length <= 90) return pts;
    const step = pts.length / 90;
    const out = [];
    for (let i = 0; i < 90; i++) {
      out.push(pts[Math.floor(i * step)]);
    }
    return out;
  }, [result.hitTimeline]);

  const cards = teamCards && teamCards.length > 0 ? teamCards : DEFAULT_TEAM_CARDS;

  const grade = !result.cleared
    ? 'D'
    : result.allPerfect
    ? 'S+'
    : accuracy >= 92
    ? 'S'
    : accuracy >= 82
    ? 'A'
    : accuracy >= 70
    ? 'B'
    : 'C';

  const statusBadge = result.allPerfect
    ? {
        text: 'ALL PERFECT!!',
        cls: 'from-amber-300 via-pink-400 to-cyan-300 text-slate-950 shadow-amber-400/30',
      }
    : result.fullCombo
    ? {
        text: 'FULL COMBO!',
        cls: 'from-pink-500 to-cyan-400 text-white shadow-pink-500/30',
      }
    : result.cleared
    ? {
        text: 'LIVE CLEAR',
        cls: 'from-cyan-400 to-teal-400 text-slate-950 shadow-cyan-400/30',
      }
    : {
        text: 'LIVE FAILED',
        cls: 'from-rose-600 to-slate-700 text-white shadow-rose-500/20',
      };

  const diffMeta = DIFFICULTY_META[result.difficulty];
  const maxRowCount = Math.max(1, result.totalNotes);
  const activeTitle = PLAYER_TITLES.find((t) => t.id === activeTitleId) ?? PLAYER_TITLES[0];
  const isCelebration = result.allPerfect || result.fullCombo;

  return (
    <div className="relative w-full h-full sekai-bg flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Живой фон сцены за результатами */}
      <AnimatedBackdrop quality="high" variant="stage" />
      {song.coverDataUrl && (
        <div
          className="hidden md:block pointer-events-none fixed inset-0 opacity-[0.28] blur-3xl scale-125"
          style={{
            backgroundImage: `url(${song.coverDataUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {/* Aurora bloom behind the result card */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 50% 32%, rgba(56,189,248,0.16) 0%, transparent 62%), radial-gradient(ellipse 45% 40% at 22% 72%, rgba(57,197,187,0.13) 0%, transparent 64%), radial-gradient(ellipse 45% 40% at 80% 68%, rgba(255,79,147,0.14) 0%, transparent 64%)',
        }}
      />
      <div className="pointer-events-none fixed inset-0 sekai-grid-overlay" />

      {/* Festive FC / AP prism confetti burst */}
      {isCelebration && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-[5]">
          {Array.from({ length: 26 }).map((_, i) => (
            <span
              key={i}
              className="absolute w-2.5 h-2.5 rounded-sm animate-pulse"
              style={{
                left: `${(i * 19 + 7) % 94}%`,
                top: `${(i * 23 + 11) % 86}%`,
                transform: `rotate(${(i * 37) % 360}deg)`,
                background:
                  i % 3 === 0 ? '#39C5BB' : i % 3 === 1 ? '#ff4f93' : '#fde047',
                opacity: 0.72,
                boxShadow: '0 0 12px currentColor',
              }}
            />
          ))}
          {/* Radiating light rays from the centre */}
          <div
            className="absolute left-1/2 top-1/2 w-[140vmax] h-[140vmax] -translate-x-1/2 -translate-y-1/2 opacity-[0.13]"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.9) 0deg 4deg, transparent 4deg 14deg)',
              maskImage: 'radial-gradient(circle, #000 8%, transparent 48%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 8%, transparent 48%)',
            }}
          />
        </div>
      )}

      <div
        className={`relative z-10 w-full max-w-2xl my-auto rounded-3xl sekai-glass border overflow-hidden animate-pop-in ${
          result.allPerfect
            ? 'border-amber-300/75 shadow-[0_0_70px_rgba(250,204,21,0.38)]'
            : result.fullCombo
            ? 'border-pink-400/70 shadow-[0_0_58px_rgba(255,79,147,0.34)]'
            : 'border-cyan-400/35 shadow-[0_0_42px_rgba(56,189,248,0.24)]'
        }`}
      >
        {/* Holographic top accent bar */}
        <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] via-55% to-[#ff4f93]" />
        {/* Banner */}
        <div className="pjsk-banner-band p-5 sm:p-6 [@media(max-height:540px)]:p-3.5 bg-gradient-to-r from-[#1a214a]/92 to-[#141939]/92 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {song.coverDataUrl && (
              <div className="relative shrink-0">
                <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-[#39C5BB]/40 via-[#38bdf8]/25 to-[#ff4f93]/40 blur-lg opacity-80" />
                <img
                  src={song.coverDataUrl}
                  alt={song.title}
                  className="relative w-16 h-16 rounded-2xl object-cover border-2 border-white/30 shadow-xl"
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-[10px] font-black tracking-widest text-cyan-200 uppercase">
                  RESULT · SOLO LIVE
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wide"
                  style={{
                    color: diffMeta.color,
                    background: diffMeta.bg,
                    border: `1px solid ${diffMeta.border}`,
                  }}
                >
                  {diffMeta.label}
                </span>
                {!result.autoPlayUsed &&
                  !result.practiceLoopUsed &&
                  result.score > 0 &&
                  result.score >= (song.highScores?.[result.difficulty]?.score ?? 0) && (
                    <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-400 to-pink-500 text-slate-950 text-[10px] font-black tracking-wide shadow">
                      ★ NEW RECORD!
                    </span>
                  )}
                {result.autoPlayUsed && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[10px] font-extrabold">
                    AUTO LIVE
                  </span>
                )}
                {result.practiceLoopUsed && (
                  <span className="px-2 py-0.5 rounded-md bg-cyan-400/20 border border-cyan-400/40 text-cyan-200 text-[10px] font-extrabold">
                    LOOP A–B
                  </span>
                )}
              </div>
              <h1
                className="text-xl font-black text-white truncate"
                style={{ textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}
              >
                {song.title}
              </h1>
              <p className="text-xs text-slate-400 truncate">{song.artist}</p>
              {avatar && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <AvatarFace view={avatar} frameId={frameId} className="w-7 h-7" />
                  <span className="text-[11px] font-bold text-cyan-200/90">
                    {avatar.name}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black text-white bg-gradient-to-r ${activeTitle.gradient}`}
                  >
                    {activeTitle.label}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div
            className={`sekai-slant px-6 py-2.5 rounded-xl bg-gradient-to-r ${statusBadge.cls} font-black tracking-wider text-sm shadow-xl relative overflow-hidden`}
            style={{ boxShadow: '0 12px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5)' }}
          >
            <span className="sekai-unslant flex items-center gap-1.5 relative z-10">
              {result.allPerfect || result.fullCombo ? (
                <Sparkles className="w-4 h-4" />
              ) : (
                <Award className="w-4 h-4" />
              )}
              {statusBadge.text}
            </span>
          </div>
        </div>

        {/* Crystal Rewards & Completed Missions Banner */}
        {((result.earnedCrystals ?? 0) > 0 || (result.newlyCompletedMissions?.length ?? 0) > 0) && (
          <div className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-cyan-500/15 via-sky-500/15 to-pink-500/15 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
            {(result.earnedCrystals ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-black text-cyan-200">
                <Gem className="w-4 h-4 text-cyan-300" />
                Награда за Live: +{result.earnedCrystals} кристаллов
              </div>
            )}
            {result.newlyCompletedMissions && result.newlyCompletedMissions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {result.newlyCompletedMissions.map((mTitle, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/50 text-amber-200 text-[11px] font-extrabold flex items-center gap-1"
                  >
                    <Trophy className="w-3 h-3" /> Миссия: {mTitle}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Score + Breakdown */}
        <div className="p-5 sm:p-6 [@media(max-height:540px)]:p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 [@media(max-height:540px)]:gap-3">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950/80 to-slate-900/60 border border-white/15 flex items-center justify-between shadow-inner relative overflow-hidden">
              {/* Diagonal prism sheen inside the score card */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  background:
                    'linear-gradient(115deg, transparent 30%, #ffffff 46%, transparent 60%)',
                }}
              />
              <div className="relative">
                <div className="text-[11px] text-slate-400 uppercase font-extrabold tracking-widest">
                  Итоговый счёт
                </div>
                <div
                  className="text-3xl font-black font-mono text-white tracking-wider mt-0.5 tabular-nums"
                  style={{ textShadow: '0 0 22px rgba(56,189,248,0.55)' }}
                >
                  {String(Math.round(result.score * animProgress)).padStart(7, '0')}
                </div>
                <div className="text-xs text-cyan-300 mt-1 font-semibold">
                  Точность:{' '}
                  <span className="font-black tabular-nums">
                    {(accuracy * animProgress).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div
                className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400/30 via-sky-400/20 to-pink-500/30 border border-cyan-300/60 flex items-center justify-center shadow-[0_0_30px_rgba(57,197,187,0.42)] ${
                  stampReady ? 'pjsk-stamp-pop' : 'opacity-20 scale-75'
                }`}
              >
                {/* Rotating prism ring behind the grade */}
                {stampReady && (
                  <span
                    className="absolute inset-[-3px] rounded-2xl opacity-70"
                    style={{
                      background:
                        'conic-gradient(from 0deg, #39C5BB, #38bdf8, #a855f7, #ff4f93, #39C5BB)',
                      WebkitMask:
                        'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                      padding: '2px',
                      animation: 'spin 6s linear infinite',
                    }}
                  />
                )}
                <span className="relative text-3xl font-black bg-gradient-to-b from-white to-cyan-300 bg-clip-text text-transparent">
                  {grade}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 shadow-inner">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Макс. комбо</div>
                <div
                  className="text-2xl font-black text-cyan-300 font-mono mt-0.5 tabular-nums"
                  style={{ textShadow: '0 0 16px rgba(34,211,238,0.5)' }}
                >
                  {Math.round(result.maxCombo * animProgress)}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 shadow-inner">
                <div className="text-[11px] text-slate-400 font-bold uppercase">FAST / LATE</div>
                <div className="text-base font-extrabold font-mono mt-1 tabular-nums">
                  <span className="text-sky-400">{Math.round(result.fastCount * animProgress)}</span>
                  <span className="text-slate-600 mx-1.5">/</span>
                  <span className="text-rose-400">{Math.round(result.lateCount * animProgress)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Judgment Table with animated mini bars */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950/70 to-slate-900/50 border border-white/10 space-y-3 shadow-inner">
            {[
              { label: 'PERFECT', val: result.counts.PERFECT, color: 'text-cyan-300', bar: 'linear-gradient(90deg,#22d3ee,#67e8f9)' },
              { label: 'GREAT', val: result.counts.GREAT, color: 'text-pink-400', bar: 'linear-gradient(90deg,#ff4f93,#f472b6)' },
              { label: 'GOOD', val: result.counts.GOOD, color: 'text-emerald-400', bar: 'linear-gradient(90deg,#10b981,#6ee7b7)' },
              { label: 'BAD', val: result.counts.BAD, color: 'text-amber-400', bar: 'linear-gradient(90deg,#f59e0b,#fcd34d)' },
              { label: 'MISS', val: result.counts.MISS, color: 'text-slate-400', bar: 'linear-gradient(90deg,#64748b,#94a3b8)' },
            ].map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-black tracking-wider ${row.color}`}>{row.label}</span>
                  <span className="font-mono font-bold text-white text-sm tabular-nums">
                    {Math.round(row.val * animProgress)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden border border-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-[width] duration-75"
                    style={{
                      width: `${Math.round(((row.val * animProgress) / maxRowCount) * 100)}%`,
                      background: row.bar,
                      boxShadow: '0 0 10px rgba(56,189,248,0.35)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hit Accuracy Timeline + 5-Card Team Showcase */}
        <div className="px-5 sm:px-6 pb-4 space-y-3 [@media(max-height:540px)]:hidden">
          {timelineSampled.length > 0 && (
            <div className="p-3 rounded-2xl bg-gradient-to-br from-slate-950/70 to-slate-900/50 border border-white/10 shadow-inner">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                <span>График точности (0% → 100% песни)</span>
                {avgMsOffset !== null && (
                  <span
                    className={
                      Math.abs(avgMsOffset) <= 8
                        ? 'text-cyan-300'
                        : avgMsOffset < 0
                        ? 'text-sky-300'
                        : 'text-orange-300'
                    }
                  >
                    Среднее смещение: {avgMsOffset > 0 ? `+${avgMsOffset}` : avgMsOffset} мс{' '}
                    {Math.abs(avgMsOffset) <= 8 ? '(В бит!)' : avgMsOffset < 0 ? '(FAST)' : '(LATE)'}
                  </span>
                )}
              </div>
              <div className="relative h-16 rounded-lg bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-white/10 overflow-hidden">
                {/* Tolerance zone bands */}
                <div
                  className="absolute inset-x-0"
                  style={{
                    top: '38%',
                    height: '24%',
                    background: 'rgba(57,197,187,0.09)',
                    borderTop: '1px dashed rgba(103,232,249,0.28)',
                    borderBottom: '1px dashed rgba(103,232,249,0.28)',
                  }}
                />
                {/* Centre line */}
                <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
                {/* ±50ms guides */}
                <div className="absolute inset-x-0 top-[22%] h-px bg-white/[0.07]" />
                <div className="absolute inset-x-0 top-[78%] h-px bg-white/[0.07]" />
                {/* Vertical beat grid */}
                {Array.from({ length: 11 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-px bg-white/[0.05]"
                    style={{ left: `${i * 10}%` }}
                  />
                ))}
                {/* Accuracy scatter */}
                {timelineSampled.map((pt, idx) => {
                  const clampedMs = Math.max(-130, Math.min(130, pt.ms));
                  const topPct = 50 + (clampedMs / 145) * 40;
                  const isPerfect = pt.judgment === 'PERFECT';
                  const dotColor =
                    pt.judgment === 'MISS'
                      ? '#f43f5e'
                      : isPerfect
                      ? '#39C5BB'
                      : pt.ms < 0
                      ? '#38bdf8'
                      : '#fb923c';
                  return (
                    <span
                      key={idx}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${Math.max(1.5, Math.min(98.5, pt.progress * 100))}%`,
                        top: `${pt.judgment === 'MISS' ? 90 : topPct}%`,
                        width: isPerfect ? 5 : 4,
                        height: isPerfect ? 5 : 4,
                        backgroundColor: dotColor,
                        boxShadow: isPerfect
                          ? '0 0 8px rgba(57,197,187,0.9)'
                          : '0 0 5px rgba(0,0,0,0.5)',
                      }}
                    />
                  );
                })}
                {/* Legend */}
                <div className="absolute bottom-1 right-2 flex items-center gap-2.5 text-[8px] font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#39C5BB]" /> PERFECT
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f43f5e]" /> MISS
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 5-Card Team Showcase */}
          <div className="grid grid-cols-5 gap-2">
            {cards.slice(0, 5).map((card, idx) => {
              const avatarDef = MIKU_AVATARS.find((a) => a.id === card.avatarId) ?? MIKU_AVATARS[0];
              return (
                <div
                  key={card.id}
                  className={`pjsk-holo-sheen rounded-xl p-1.5 bg-slate-950/70 border flex flex-col items-center text-center gap-1 ${
                    idx === 0 ? 'border-amber-300/70 shadow-[0_0_16px_rgba(251,191,36,0.22)]' : 'border-white/15'
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/25 bg-white">
                    {card.customImageDataUrl ? (
                      <img src={card.customImageDataUrl} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <MikuAvatar def={avatarDef} className="w-full h-full" />
                    )}
                    {idx === 0 && (
                      <span className="absolute top-0.5 left-0.5 px-1 rounded bg-amber-400 text-slate-950 text-[8px] font-black flex items-center">
                        <Crown className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] font-black text-white truncate w-full">{card.name}</div>
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-cyan-200/90">
                    {card.skillType === 'score_up' && <><Zap className="w-2.5 h-2.5 text-amber-300" />+30%</>}
                    {card.skillType === 'perfect_lock' && <><ShieldCheck className="w-2.5 h-2.5 text-cyan-300" />LOCK</>}
                    {card.skillType === 'healer' && <><Heart className="w-2.5 h-2.5 text-pink-300" />HEAL</>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 sm:px-6 [@media(max-height:540px)]:px-4 py-3.5 sm:py-4 [@media(max-height:540px)]:py-2.5 bg-[#141939]/90 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <button
            onClick={onBackToMenu}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-bold flex items-center gap-2 transition"
          >
            <Home className="w-4 h-4" /> К выбору песни
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenEditor}
              className="px-4 py-2.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/40 text-pink-200 text-sm font-bold flex items-center gap-2 transition"
            >
              <Edit3 className="w-4 h-4" /> Редактор
            </button>
            <button
              onClick={onRetry}
              className="sekai-slant sekai-btn-live px-6 py-2.5 rounded-xl text-slate-950 text-sm font-black transition"
            >
              <span className="sekai-unslant flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Сыграть снова
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
