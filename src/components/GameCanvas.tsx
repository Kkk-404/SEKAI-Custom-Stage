import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Pause, Play, RotateCcw, Settings, LogOut, Sparkles, Film, Zap, ShieldCheck, Heart, Repeat } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { loadSongBgMedia } from '../storage/db';
import {
  triggerAccentHaptic,
  triggerFinishHaptic,
  triggerMilestoneHaptic,
  triggerTapHaptic,
} from '../utils/haptics';
import { formatKeyLabel } from '../utils/keys';
import { sanitizeChartNotes } from '../utils/chartSanitizer';
import { AvatarView, MIKU_AVATARS, MikuAvatar } from './Avatars';
import {
  Chart,
  ChartNote,
  DEFAULT_TEAM_CARDS,
  DIFFICULTY_META,
  Difficulty,
  FlickDirection,
  GameSettings,
  HitOffsetPoint,
  JudgmentType,
  NoteSkin,
  PlayResult,
  PracticeLoopConfig,
  SEKAI_THEMES,
  SlideEase,
  SlideNote,
  SlidePoint,
  SongItem,
  TeamCard,
  beatToTimeSec,
} from '../types/game';

interface GameCanvasProps {
  song: SongItem;
  difficulty: Difficulty;
  audioBuffer: AudioBuffer;
  settings: GameSettings;
  avatar: AvatarView;
  teamCards?: TeamCard[];
  startFromSec?: number;
  practiceLoop?: PracticeLoopConfig;
  onOpenSettings: () => void;
  onFinish: (result: PlayResult) => void;
  onExit: () => void;
}

interface RuntimeSingleNote {
  kind: 'tap' | 'flick' | 'trace';
  id: string;
  time: number; // seconds
  lane: number;
  width: number;
  critical: boolean;
  direction?: FlickDirection;
  judged: boolean;
  judgment?: JudgmentType;
}

interface RuntimeSlideTick {
  time: number;
  lane: number;
  width: number;
  judged: boolean;
  isVisibleDiamond: boolean;
}

interface RuntimeSlideNote {
  kind: 'slide';
  id: string;
  critical: boolean;
  points: Array<SlidePoint & { time: number }>;
  ticks: RuntimeSlideTick[];
  endFlick: FlickDirection | null;
  startJudged: boolean;
  endJudged: boolean;
  endFlickSatisfied?: boolean;
  activeHold: boolean;
  lastHeldTime: number;
  holdGlowPhase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface LaneFlash {
  lane: number;
  width: number;
  color: string;
  alpha: number;
  beam?: boolean;
  critical?: boolean;
}

interface FloatingJudgment {
  text: JudgmentType;
  subText?: string; // FAST / LATE
  critical?: boolean;
  timeLeft: number;
  maxTime: number;
}

const JUDGMENT_WINDOWS: Array<{ type: JudgmentType; maxMs: number; weight: number; hpDelta: number }> = [
  { type: 'PERFECT', maxMs: 42, weight: 1.0, hpDelta: 5 },
  { type: 'GREAT', maxMs: 82, weight: 0.7, hpDelta: 2 },
  { type: 'GOOD', maxMs: 110, weight: 0.5, hpDelta: -15 },
  { type: 'BAD', maxMs: 132, weight: 0.1, hpDelta: -45 },
];

const MISS_WINDOW_SEC = 0.145;

function easeValue(t: number, ease: SlideEase): number {
  const c = Math.max(0, Math.min(1, t));
  if (ease === 'in') return c * c;
  if (ease === 'out') return 1 - (1 - c) * (1 - c);
  if (ease === 'sine') return 0.5 - 0.5 * Math.cos(Math.PI * c);
  return c;
}

function mirrorLane(lane: number, width: number, mirror: boolean): number {
  return mirror ? 12 - lane - width : lane;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  song,
  difficulty,
  audioBuffer,
  settings,
  avatar,
  teamCards = DEFAULT_TEAM_CARDS,
  startFromSec = 0,
  practiceLoop,
  onOpenSettings,
  onFinish,
  onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [bgMedia, setBgMedia] = useState<{ kind: 'video' | 'image'; url: string } | null>(null);
  const bgMediaRef = useRef<{ kind: 'video' | 'image'; url: string } | null>(null);
  bgMediaRef.current = bgMedia;

  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const resumeCountdownRef = useRef<number | null>(null);
  resumeCountdownRef.current = resumeCountdown;
  const countdownTimerRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  const teamCardsRef = useRef(teamCards);
  teamCardsRef.current = teamCards;

  const [practiceRate, setPracticeRate] = useState<number>(1.0);
  const practiceRateRef = useRef<number>(1.0);
  practiceRateRef.current = practiceRate;

  const startResumeCountdown = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsPaused(false);
    setResumeCountdown(3);
    let step = 3;
    countdownTimerRef.current = window.setInterval(() => {
      step -= 1;
      if (step <= 0) {
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setResumeCountdown(null);
      } else {
        setResumeCountdown(step);
      }
    }, 550);
  };

  const togglePauseRef = useRef<() => void>(() => {});
  togglePauseRef.current = () => {
    if (resumeCountdownRef.current !== null) {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setResumeCountdown(null);
      setIsPaused(true);
      return;
    }
    if (isPausedRef.current) {
      startResumeCountdown();
    } else {
      setIsPaused(true);
    }
  };

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  const [activeCutin, setActiveCutin] = useState<{ card: TeamCard; id: number } | null>(null);
  const [feverState, setFeverState] = useState<'none' | 'fever' | 'super'>('none');
  const [finishBanner, setFinishBanner] = useState<'AP' | 'FC' | 'CLEAR' | null>(null);
  const [milestoneBanner, setMilestoneBanner] = useState<{ combo: number; id: number } | null>(null);
  const [loopCount, setLoopCount] = useState<number>(1);

  const practiceLoopRef = useRef(practiceLoop);
  practiceLoopRef.current = practiceLoop;
  const effectiveStartSec =
    practiceLoop?.enabled && practiceLoop.endSec > practiceLoop.startSec + 3
      ? Math.max(0, practiceLoop.startSec)
      : startFromSec;

  const [restartToken, setRestartToken] = useState(0);

  // Audio playback refs
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioStartCtxTimeRef = useRef<number>(0);
  const songOffsetAtStartRef = useRef<number>(effectiveStartSec);
  const pausedAtSongTimeRef = useRef<number>(effectiveStartSec);

  // Load 2DMV video/image clip from IndexedDB if configured on this song
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setBgMedia(null);

    if (song.bgKind) {
      loadSongBgMedia(song.id).then((stored) => {
        if (!active || !stored) return;
        const blob = new Blob([stored.data], {
          type: stored.mimeType || (stored.kind === 'video' ? 'video/mp4' : 'image/png'),
        });
        createdUrl = URL.createObjectURL(blob);
        setBgMedia({ kind: stored.kind, url: createdUrl });
      });
    }

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [song.id, song.bgKind]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Auto-pause when app is minimized/backgrounded, request Screen WakeLock, & handle Android Back
  useEffect(() => {
    const pauseSafely = () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setResumeCountdown(null);
      setIsPaused(true);
    };

    const onVisChange = () => {
      if (document.hidden) pauseSafely();
    };
    const onPageHide = () => pauseSafely();
    const onBlur = () => {
      if (!Capacitor.isNativePlatform()) pauseSafely();
    };

    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('blur', onBlur);

    let wakeSentinel: { release?: () => Promise<void> } | null = null;
    const navAny = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release?: () => Promise<void> }> };
    };
    if (navAny.wakeLock?.request) {
      navAny.wakeLock
        .request('screen')
        .then((s) => {
          wakeSentinel = s;
        })
        .catch(() => {});
    }

    let removeAppState: (() => void) | undefined;
    let removeBackBtn: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) pauseSafely();
      }).then((h) => {
        removeAppState = () => h.remove();
      });
      CapApp.addListener('backButton', () => {
        togglePauseRef.current();
      }).then((h) => {
        removeBackBtn = () => h.remove();
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('blur', onBlur);
      wakeSentinel?.release?.().catch(() => {});
      removeAppState?.();
      removeBackBtn?.();
    };
  }, []);

  useEffect(() => {
    soundEngine.setVolumes(settings.musicVolume, settings.seVolume);
  }, [settings.musicVolume, settings.seVolume]);

  useEffect(() => {
    soundEngine.setSoundPack(settings.soundPack ?? 'crystal');
  }, [settings.soundPack]);

  useEffect(() => {
    const chart: Chart | undefined = song.charts[difficulty];
    if (!chart) return;

    const ctxAudio = soundEngine.getContext();
    soundEngine.setVolumes(settingsRef.current.musicVolume, settingsRef.current.seVolume);
    soundEngine.setSoundPack(settingsRef.current.soundPack ?? 'crystal');

    const loopCfg = practiceLoopRef.current;
    const isLoopActive = Boolean(loopCfg?.enabled && loopCfg.endSec > loopCfg.startSec + 3);
    const runStartSec = isLoopActive ? Math.max(0, loopCfg!.startSec) : startFromSec;
    const runEndSec = isLoopActive ? Math.min(audioBuffer.duration, loopCfg!.endSec) : Infinity;

    // Prepare runtime notes
    const singles: RuntimeSingleNote[] = [];
    const slides: RuntimeSlideNote[] = [];
    const sameBeatPairs = new Map<number, Array<{ lane: number; width: number }>>();

    const mirror = settingsRef.current.mirrorChart;
    const cleanNotes = sanitizeChartNotes(chart.notes);

    for (const n of cleanNotes) {
      if (n.type === 'tap' || n.type === 'flick' || n.type === 'trace') {
        const t = beatToTimeSec(n.beat, song.bpm, song.offsetMs, song.bpmChanges);
        if (t < runStartSec - 0.1 || t > runEndSec) continue;
        const lane = mirrorLane(n.lane, n.width, mirror);
        singles.push({
          kind: n.type,
          id: n.id,
          time: t,
          lane,
          width: n.width,
          critical: n.critical,
          direction:
            n.type === 'flick'
              ? mirror && n.direction === 'left'
                ? 'right'
                : mirror && n.direction === 'right'
                ? 'left'
                : n.direction
              : undefined,
          judged: false,
        });
        if (n.type !== 'trace') {
          const key = Math.round(t * 1000);
          const arr = sameBeatPairs.get(key) ?? [];
          arr.push({ lane, width: n.width });
          sameBeatPairs.set(key, arr);
        }
      } else if (n.type === 'slide' && n.points.length >= 2) {
        const pts = n.points
          .map((p) => ({
            ...p,
            lane: mirrorLane(p.lane, p.width, mirror),
            time: beatToTimeSec(p.beat, song.bpm, song.offsetMs, song.bpmChanges),
          }))
          .sort((a, b) => a.time - b.time);

        if (pts[pts.length - 1].time < runStartSec || pts[0].time > runEndSec) continue;

        // Generate ticks at explicit 'tick' points + every 0.5 beat inside slide
        const ticks: RuntimeSlideTick[] = [];
        const startBeat = pts[0].beat;
        const endBeat = pts[pts.length - 1].beat;

        for (let i = 1; i < pts.length - 1; i++) {
          if (pts[i].kind === 'tick') {
            ticks.push({
              time: pts[i].time,
              lane: pts[i].lane,
              width: pts[i].width,
              judged: false,
              isVisibleDiamond: true,
            });
          }
        }

        for (let b = Math.floor(startBeat * 2 + 1) / 2; b < endBeat - 0.05; b += 0.5) {
          const tt = beatToTimeSec(b, song.bpm, song.offsetMs, song.bpmChanges);
          const alreadyNear = ticks.some((tk) => Math.abs(tk.time - tt) < 0.04);
          if (!alreadyNear) {
            // Interpolate lane/width at tt
            let lane = pts[0].lane;
            let width = pts[0].width;
            for (let i = 0; i < pts.length - 1; i++) {
              if (tt >= pts[i].time && tt <= pts[i + 1].time) {
                const segDur = Math.max(0.0001, pts[i + 1].time - pts[i].time);
                const f = easeValue((tt - pts[i].time) / segDur, pts[i].ease);
                lane = pts[i].lane + (pts[i + 1].lane - pts[i].lane) * f;
                width = pts[i].width + (pts[i + 1].width - pts[i].width) * f;
                break;
              }
            }
            ticks.push({
              time: tt,
              lane,
              width,
              judged: false,
              isVisibleDiamond: false,
            });
          }
        }

        ticks.sort((a, b) => a.time - b.time);

        const endFlick = n.endFlick
          ? mirror && n.endFlick === 'left'
            ? 'right'
            : mirror && n.endFlick === 'right'
            ? 'left'
            : n.endFlick
          : null;

        slides.push({
          kind: 'slide',
          id: n.id,
          critical: n.critical,
          points: pts,
          ticks,
          endFlick,
          startJudged: false,
          endJudged: false,
          activeHold: false,
          lastHeldTime: -1,
          holdGlowPhase: 0,
        });

        const key = Math.round(pts[0].time * 1000);
        const arr = sameBeatPairs.get(key) ?? [];
        arr.push({ lane: pts[0].lane, width: pts[0].width });
        sameBeatPairs.set(key, arr);
      }
    }

    singles.sort((a, b) => a.time - b.time);
    slides.sort((a, b) => a.points[0].time - b.points[0].time);

    // Count total judgable events
    let totalJudgments = singles.length;
    let maxWeightUnits = 0;
    for (const s of singles) maxWeightUnits += s.critical ? 2 : 1;
    for (const sl of slides) {
      totalJudgments += 2 + sl.ticks.length;
      maxWeightUnits += (2 + sl.ticks.length) * (sl.critical ? 2 : 1);
    }
    const maxScore = 1000000;

    // Gameplay state
    let combo = 0;
    let maxCombo = 0;
    let score = 0;
    let hp = 1000;
    let fastCount = 0;
    let lateCount = 0;
    const hitTimeline: HitOffsetPoint[] = [];
    const counts: Record<JudgmentType, number> = {
      PERFECT: 0,
      GREAT: 0,
      GOOD: 0,
      BAD: 0,
      MISS: 0,
    };
    let finished = false;
    let comboPop = 0;

    // Team Skills & Fever state
    let scoreBoostUntil = -1;
    let perfectLockUntil = -1;
    let healFlashUntil = -1;
    let feverBroken = false;
    let lastFeverUi: 'none' | 'fever' | 'super' = 'none';
    setActiveCutin(null);
    setFeverState('none');
    setFinishBanner(null);
    let cutinHideTimer: number | null = null;
    let finishTimer: number | null = null;
    let milestoneHideTimer: number | null = null;
    setMilestoneBanner(null);
    setLoopCount(1);
    let currentLoopRun = 1;
    const autoPadLitUntil = [0, 0, 0, 0];

    const cards = teamCardsRef.current.length > 0 ? teamCardsRef.current : DEFAULT_TEAM_CARDS;
    const skillTimes = cards.map((_, idx) =>
      Math.max(2.5, audioBuffer.duration * (0.14 + idx * 0.16))
    );
    const skillFired = cards.map(() => false);
    const feverStartSec = audioBuffer.duration * 0.52;
    const feverEndSec = audioBuffer.duration * 0.74;

    const particles: Particle[] = [];
    const laneFlashes: LaneFlash[] = [];
    let floatingJudgment: FloatingJudgment | null = null;

    // Ambient floating stage petals / stardust
    const ambientMotes = Array.from({ length: 28 }, (_, idx) => ({
      x: (idx * 0.137) % 1,
      y: (idx * 0.271) % 1,
      speedY: 0.035 + (idx % 5) * 0.012,
      swayFreq: 0.9 + (idx % 4) * 0.4,
      phase: idx * 0.85,
      size: 2.2 + (idx % 4) * 1.1,
      isAccent: idx % 3 === 0,
    }));

    // Real-time Web Audio Analyser for live stage lightsticks & spotlights
    const analyser = ctxAudio.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    const freqBins = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(soundEngine.getMusicGain());
    let audioBass = 0;
    let audioTreble = 0;

    // Active inputs: keyboard + pointers
    const pressedKeys = new Set<string>();
    const activePointers = new Map<
      number,
      { lane: number; lastY: number; lastX: number; flickedAt: number; flickDir: FlickDirection | null }
    >();

    // Sample-accurate lead-in so notes and audio stay locked on the Web Audio clock
    const leadInDuration = runStartSec === 0 ? 1.5 : 0.85;
    let songTime = Math.max(0, runStartSec) - leadInDuration;
    let audioPlaying = false;
    let lastPerfTime = performance.now();

    const getOutputLatencySec = () => {
      const lat = (ctxAudio as AudioContext & { outputLatency?: number }).outputLatency;
      return typeof lat === 'number' && isFinite(lat) && lat > 0 && lat < 0.25 ? lat : 0;
    };

    const scheduleAudioFrom = (offsetSec: number, delaySec = 0) => {
      if (ctxAudio.state === 'suspended') {
        ctxAudio.resume().catch(() => {});
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
          sourceRef.current.disconnect();
        } catch {}
      }
      const rate = practiceRateRef.current;
      const src = ctxAudio.createBufferSource();
      src.buffer = audioBuffer;
      src.playbackRate.value = rate;
      src.connect(analyser);
      const clampedOffset = Math.max(0, Math.min(audioBuffer.duration - 0.05, offsetSec));
      const whenCtx = ctxAudio.currentTime + Math.max(0, delaySec / rate);
      src.start(whenCtx, clampedOffset);
      sourceRef.current = src;
      audioStartCtxTimeRef.current = whenCtx;
      songOffsetAtStartRef.current = clampedOffset;
      pausedAtSongTimeRef.current = clampedOffset - delaySec;
      audioPlaying = true;
    };

    const stopAudio = () => {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
          sourceRef.current.disconnect();
        } catch {}
        sourceRef.current = null;
      }
      audioPlaying = false;
    };

    // Schedule initial audio cleanly from t = runStartSec after leadInDuration
    scheduleAudioFrom(Math.max(0, runStartSec), leadInDuration);

    const isCoarsePointer =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 0);

    const isEcoFrame = (W: number) => {
      const q = settingsRef.current.graphicsQuality ?? 'auto';
      if (q === 'eco') return true;
      if (q === 'high') return false;
      return isCoarsePointer || W < 768;
    };

    let singleHeadIdx = 0;

    // Helper: get highway geometry for current canvas size (adaptive for PC, tablet, portrait & landscape phone)
    const getGeo = (W: number, H: number) => {
      const cx = W * 0.5;
      const isNarrow = W < 640;
      const isLandscapePhone = H < 540 && W > H;
      const yTop = isNarrow ? H * 0.14 : isLandscapePhone ? H * 0.11 : H * 0.13;
      const yJudge = isNarrow ? H * 0.78 : isLandscapePhone ? H * 0.77 : H * 0.81;
      const judgeWidth = isNarrow
        ? Math.min(W * 0.96, 560)
        : isLandscapePhone
        ? Math.min(W * 0.84, 780)
        : Math.min(W * 0.94, 980);
      const topWidth = judgeWidth * (isNarrow ? 0.25 : isLandscapePhone ? 0.21 : 0.17);
      return { cx, yTop, yJudge, judgeWidth, topWidth };
    };

    const projectTime = (
      noteTime: number,
      curTime: number,
      approachSec: number,
      geo: ReturnType<typeof getGeo>
    ) => {
      const dt = noteTime - curTime;
      const progress = 1 - dt / approachSec;
      const zTop = 6.2;
      const zJudge = 1.0;
      const z = Math.max(0.22, zTop + (zJudge - zTop) * progress);
      const p = (1 / z - 1 / zTop) / (1 / zJudge - 1 / zTop);
      const y = geo.yTop + (geo.yJudge - geo.yTop) * p;
      const roadW = geo.topWidth + (geo.judgeWidth - geo.topWidth) * p;
      return { y, roadW, p, progress };
    };

    const clientToLane = (clientX: number, rect: DOMRect, geo: ReturnType<typeof getGeo>) => {
      const x = clientX - rect.left;
      const rel = (x - (geo.cx - geo.judgeWidth / 2)) / geo.judgeWidth;
      return rel * 12;
    };

    const isLaneCoveredByInputs = (lane: number, width: number, tolerance = 0.75): boolean => {
      const minL = lane - tolerance;
      const maxL = lane + width + tolerance;

      // Check keyboard bindings (4 keys across 12 logical units -> 3 units per lane)
      const bindings = settingsRef.current.keyBindings;
      for (let k = 0; k < bindings.length; k++) {
        if (pressedKeys.has(bindings[k].toLowerCase())) {
          const keyStart = k * 3;
          const keyEnd = keyStart + 3;
          if (keyEnd >= minL && keyStart <= maxL) return true;
        }
      }

      // Check pointers/touches
      for (const ptr of activePointers.values()) {
        if (ptr.lane >= minL && ptr.lane <= maxL) return true;
      }

      return false;
    };

    const spawnHitParticles = (
      lane: number,
      width: number,
      color: string,
      isCrit: boolean,
      isPerfect = false
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const eco = isEcoFrame(W);
      const maxParticles = eco ? 45 : 140;
      if (particles.length >= maxParticles) return;

      const geo = getGeo(W, H);
      const xCenter = geo.cx - geo.judgeWidth / 2 + ((lane + width / 2) / 12) * geo.judgeWidth;
      const y = geo.yJudge;

      laneFlashes.push({
        lane,
        width,
        color,
        alpha: isCrit ? 0.92 : isPerfect ? 0.82 : 0.65,
        beam: isPerfect || isCrit,
        critical: isCrit,
      });

      const count = isCrit ? (eco ? 10 : 18) : isPerfect ? (eco ? 6 : 12) : eco ? 4 : 8;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI * Math.random();
        const speed = 130 + Math.random() * (isCrit ? 300 : 250);
        const burstColor =
          isPerfect && !isCrit && i % 3 === 0 ? '#ff5599' : color;
        particles.push({
          x: xCenter + (Math.random() - 0.5) * ((width / 12) * geo.judgeWidth * 0.6),
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          life: 0.35 + Math.random() * 0.22,
          maxLife: 0.57,
          color: burstColor,
          size: (isCrit ? 4.8 : isPerfect ? 3.8 : 3.2) + Math.random() * 3,
        });
      }
    };

    const registerJudgment = (
      rawType: JudgmentType,
      critical: boolean,
      deltaMs = 0,
      lane = 5,
      width = 2,
      isFlick = false,
      isSlideTick = false
    ) => {
      const skillsOn = settingsRef.current.enableSkills;
      const type: JudgmentType =
        skillsOn && songTime <= perfectLockUntil && (rawType === 'GREAT' || rawType === 'GOOD')
          ? 'PERFECT'
          : rawType;

      counts[type]++;
      if (type === 'PERFECT' || type === 'GREAT') {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        comboPop = 1.0;
        if (combo >= 50 && combo % 50 === 0) {
          setMilestoneBanner({ combo, id: Date.now() + combo });
          if (!settingsRef.current.autoPlay) {
            triggerMilestoneHaptic(settingsRef.current.hapticsEnabled);
          }
          if (milestoneHideTimer !== null) window.clearTimeout(milestoneHideTimer);
          milestoneHideTimer = window.setTimeout(() => setMilestoneBanner(null), 1650);
        }
      } else {
        combo = 0;
        if (songTime >= feverStartSec && songTime <= feverEndSec) {
          feverBroken = true;
        }
      }

      if (settingsRef.current.autoPlay && type !== 'MISS') {
        const padIdx = Math.max(0, Math.min(3, Math.floor((lane + width * 0.5) / 3)));
        autoPadLitUntil[padIdx] = performance.now() + 95;
      }

      if (type !== 'PERFECT' && type !== 'MISS') {
        if (deltaMs < 0) fastCount++;
        else if (deltaMs > 0) lateCount++;
      }

      if (!isSlideTick) {
        const dur = Math.max(1, audioBuffer.duration);
        hitTimeline.push({
          progress: Math.max(0, Math.min(1, songTime / dur)),
          ms: type === 'MISS' ? 145 : Math.round(deltaMs),
          judgment: type,
        });
      }

      const win = JUDGMENT_WINDOWS.find((w) => w.type === type);
      const weight = win ? win.weight : 0;
      const critMult = critical ? 2 : 1;
      const skillMult = skillsOn && songTime <= scoreBoostUntil ? 1.3 : 1.0;
      const inFever = skillsOn && songTime >= feverStartSec && songTime <= feverEndSec;
      const feverMult = inFever ? (feverBroken ? 1.1 : 1.2) : 1.0;
      if (maxWeightUnits > 0) {
        score += (maxScore / maxWeightUnits) * weight * critMult * skillMult * feverMult;
      }

      const hpDelta = win ? win.hpDelta : -75;
      if (!settingsRef.current.noFail) {
        hp = Math.max(0, Math.min(1000, hp + hpDelta));
      } else {
        hp = Math.max(100, Math.min(1000, hp + hpDelta));
      }

      if (!isSlideTick) {
        floatingJudgment = {
          text: type,
          subText:
            settingsRef.current.showFastLate && type !== 'PERFECT' && type !== 'MISS'
              ? deltaMs < 0
                ? 'FAST'
                : 'LATE'
              : undefined,
          critical: critical && type === 'PERFECT',
          timeLeft: 0.55,
          maxTime: 0.55,
        };
      }

      // SE, Haptics & Particles (tile hit sounds muted unless explicitly enabled in settings)
      if (type !== 'MISS') {
        if (!settingsRef.current.autoPlay && !isSlideTick && type !== 'BAD') {
          if (isFlick) {
            triggerAccentHaptic(settingsRef.current.hapticsEnabled, 'flick');
          } else if (critical) {
            triggerAccentHaptic(settingsRef.current.hapticsEnabled, 'critical');
          } else {
            triggerTapHaptic(
              settingsRef.current.hapticsEnabled,
              settingsRef.current.hapticsMode ?? 'accents'
            );
          }
        }
        if (settingsRef.current.tileHitSound) {
          if (isSlideTick) {
            soundEngine.playSlideTickSE(critical);
          } else if (isFlick) {
            soundEngine.playFlickSE(critical);
          } else {
            soundEngine.playTapSE(critical);
          }
        }

        const color = critical
          ? '#ffd24c'
          : isFlick
          ? '#ff5599'
          : isSlideTick
          ? '#34d399'
          : '#33e6cc';
        spawnHitParticles(lane, width, color, critical, type === 'PERFECT');
      }
    };

    const tryHitLaneRange = (
      hitMinLane: number,
      hitMaxLane: number,
      isFlickAction: boolean
    ) => {
      if (isPausedRef.current || finished || settingsRef.current.autoPlay) return;
      const userOffsetSec = settingsRef.current.audioOffsetMs / 1000;
      const evalTime = songTime - userOffsetSec;

      let bestSingle: RuntimeSingleNote | null = null;
      let bestAbsDiff = Infinity;

      for (let i = singleHeadIdx; i < singles.length; i++) {
        const n = singles[i];
        if (n.judged) continue;
        const diff = evalTime - n.time;
        if (diff < -MISS_WINDOW_SEC) break;
        if (Math.abs(diff) > 0.132) continue;

        const nMin = n.lane - 0.65;
        const nMax = n.lane + n.width + 0.65;
        if (hitMaxLane >= nMin && hitMinLane <= nMax) {
          if (Math.abs(diff) < bestAbsDiff) {
            bestAbsDiff = Math.abs(diff);
            bestSingle = n;
          }
        }
      }

      // Check slide start nodes too
      let bestSlideStart: RuntimeSlideNote | null = null;
      let bestSlideDiff = Infinity;
      for (const sl of slides) {
        if (sl.startJudged) continue;
        const startT = sl.points[0].time;
        const diff = evalTime - startT;
        if (diff < -MISS_WINDOW_SEC) break;
        if (Math.abs(diff) > 0.132) continue;
        const p0 = sl.points[0];
        if (hitMaxLane >= p0.lane - 0.65 && hitMinLane <= p0.lane + p0.width + 0.65) {
          if (Math.abs(diff) < bestSlideDiff) {
            bestSlideDiff = Math.abs(diff);
            bestSlideStart = sl;
          }
        }
      }

      if (bestSingle && (!bestSlideStart || bestAbsDiff <= bestSlideDiff)) {
        // For flick notes: allow if flick action OR keyboardFlickAssist
        if (bestSingle.kind === 'flick' && !isFlickAction && !settingsRef.current.keyboardFlickAssist) {
          return;
        }
        const diffMs = (evalTime - bestSingle.time) * 1000;
        const absMs = Math.abs(diffMs);
        let jType: JudgmentType = 'BAD';
        for (const w of JUDGMENT_WINDOWS) {
          if (absMs <= w.maxMs) {
            jType = w.type;
            break;
          }
        }
        bestSingle.judged = true;
        bestSingle.judgment = jType;
        registerJudgment(
          jType,
          bestSingle.critical,
          diffMs,
          bestSingle.lane,
          bestSingle.width,
          bestSingle.kind === 'flick'
        );
        return;
      }

      if (bestSlideStart) {
        const p0 = bestSlideStart.points[0];
        const diffMs = (evalTime - p0.time) * 1000;
        const absMs = Math.abs(diffMs);
        let jType: JudgmentType = 'BAD';
        for (const w of JUDGMENT_WINDOWS) {
          if (absMs <= w.maxMs) {
            jType = w.type;
            break;
          }
        }
        bestSlideStart.startJudged = true;
        bestSlideStart.activeHold = true;
        bestSlideStart.lastHeldTime = evalTime;
        registerJudgment(jType, bestSlideStart.critical, diffMs, p0.lane, p0.width, false);
        return;
      }

      if (!isFlickAction) {
        if (settingsRef.current.tileHitSound) {
          soundEngine.playEmptySE();
        }
        laneFlashes.push({
          lane: Math.max(0, Math.floor(hitMinLane)),
          width: Math.max(1, Math.round(hitMaxLane - hitMinLane)),
          color: 'rgba(255,255,255,0.35)',
          alpha: 0.35,
        });
      }
    };

    // Keyboard listeners
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        togglePauseRef.current();
        return;
      }
      const k = e.key.toLowerCase();
      const idx = settingsRef.current.keyBindings.findIndex((b) => b.toLowerCase() === k);
      if (idx !== -1 && (k.startsWith('arrow') || k === ' ')) {
        e.preventDefault();
      }
      if (e.repeat) return;
      if (idx === -1) {
        if (k === 'r') {
          setIsPaused(false);
          setRestartToken((t) => t + 1);
        }
        return;
      }
      pressedKeys.add(k);
      tryHitLaneRange(idx * 3, idx * 3 + 3, true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Pointer listeners on canvas (multi-touch optimized for phones & mouse)
    const canvas = canvasRef.current;
    const onPointerDown = (e: PointerEvent) => {
      if (!canvas) return;
      if (e.pointerType === 'touch') e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      const rect = canvas.getBoundingClientRect();
      const geo = getGeo(rect.width, rect.height);
      const lane = clientToLane(e.clientX, rect, geo);
      activePointers.set(e.pointerId, {
        lane,
        lastY: e.clientY,
        lastX: e.clientX,
        flickedAt: 0,
        flickDir: null,
      });
      // Touchscreen phones require a real swipe for pink Flick notes; desktop mouse click keeps assist if enabled
      const allowTapFlick = e.pointerType !== 'touch' && settingsRef.current.keyboardFlickAssist;
      tryHitLaneRange(lane - 0.6, lane + 0.6, allowTapFlick);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!canvas) return;
      const ptr = activePointers.get(e.pointerId);
      if (!ptr) return;
      if (e.pointerType === 'touch') e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const geo = getGeo(rect.width, rect.height);
      const lane = clientToLane(e.clientX, rect, geo);
      const dy = e.clientY - ptr.lastY;
      const dx = e.clientX - ptr.lastX;
      const dist = Math.hypot(dx, dy);

      ptr.lane = lane;
      ptr.lastY = e.clientY;
      ptr.lastX = e.clientX;

      const flickThreshold = e.pointerType === 'touch' ? 7 : 10;
      if (dist > flickThreshold && performance.now() - ptr.flickedAt > 75) {
        ptr.flickedAt = performance.now();
        const evalNow = songTime - settingsRef.current.audioOffsetMs / 1000;
        for (const sl of slides) {
          if (sl.endJudged || !sl.endFlick) continue;
          const endPt = sl.points[sl.points.length - 1];
          if (
            Math.abs(evalNow - endPt.time) <= 0.16 &&
            lane >= endPt.lane - 0.9 &&
            lane <= endPt.lane + endPt.width + 0.9
          ) {
            sl.endFlickSatisfied = true;
            sl.endJudged = true;
            registerJudgment(
              Math.abs(evalNow - endPt.time) <= 0.07 ? 'PERFECT' : 'GREAT',
              sl.critical,
              (evalNow - endPt.time) * 1000,
              endPt.lane,
              endPt.width,
              true
            );
            return;
          }
        }
        tryHitLaneRange(lane - 0.85, lane + 0.85, true);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
    };

    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
    }

    const completeGame = (cleared: boolean) => {
      if (finished) return;
      finished = true;
      stopAudio();
      const fullCombo = cleared && counts.GOOD === 0 && counts.BAD === 0 && counts.MISS === 0;
      const allPerfect = fullCombo && counts.GREAT === 0;
      const payload: PlayResult = {
        songId: song.id,
        difficulty,
        score: Math.round(score),
        maxPossibleScore: maxScore,
        maxCombo,
        totalNotes: totalJudgments,
        counts,
        fastCount,
        lateCount,
        hitTimeline,
        hpRemaining: hp,
        cleared,
        fullCombo,
        allPerfect,
        autoPlayUsed: settingsRef.current.autoPlay,
        practiceLoopUsed: isLoopActive,
      };
      if (!cleared) {
        onFinish(payload);
        return;
      }
      const bannerKind: 'AP' | 'FC' | 'CLEAR' = allPerfect ? 'AP' : fullCombo ? 'FC' : 'CLEAR';
      setFinishBanner(bannerKind);
      triggerFinishHaptic(settingsRef.current.hapticsEnabled, bannerKind);
      soundEngine.playClearFanfare(
        bannerKind,
        Math.max(settingsRef.current.seVolume, settingsRef.current.musicVolume * 0.52)
      );
      const burstColors = allPerfect
        ? ['#fde047', '#f472b6', '#38bdf8', '#34d399', '#a855f7']
        : fullCombo
        ? ['#ff5599', '#39C5BB', '#f472b6', '#ffffff']
        : ['#39C5BB', '#38bdf8', '#ffffff'];
      const cvs = canvasRef.current;
      const W = cvs?.clientWidth ?? 900;
      const H = cvs?.clientHeight ?? 600;
      for (let i = 0; i < 65; i++) {
        const ang = (Math.PI * 2 * i) / 65 + Math.random() * 0.15;
        const spd = 160 + Math.random() * 340;
        particles.push({
          x: W * 0.5 + (Math.random() - 0.5) * 140,
          y: H * 0.48 + (Math.random() - 0.5) * 40,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 90,
          life: 1.4 + Math.random() * 0.5,
          maxLife: 1.9,
          color: burstColors[i % burstColors.length],
          size: 4 + Math.random() * 4.5,
        });
      }
      finishTimer = window.setTimeout(() => {
        onFinish(payload);
      }, 2050);
    };

    let rafId = 0;

    const getSlideStateAt = (sl: RuntimeSlideNote, t: number) => {
      const pts = sl.points;
      if (t <= pts[0].time) return { lane: pts[0].lane, width: pts[0].width };
      const last = pts[pts.length - 1];
      if (t >= last.time) return { lane: last.lane, width: last.width };
      for (let i = 0; i < pts.length - 1; i++) {
        if (t >= pts[i].time && t <= pts[i + 1].time) {
          const seg = Math.max(0.0001, pts[i + 1].time - pts[i].time);
          const f = easeValue((t - pts[i].time) / seg, pts[i].ease);
          return {
            lane: pts[i].lane + (pts[i + 1].lane - pts[i].lane) * f,
            width: pts[i].width + (pts[i + 1].width - pts[i].width) * f,
          };
        }
      }
      return { lane: last.lane, width: last.width };
    };

    const renderFrame = (now: number) => {
      const dtFrame = Math.min(0.05, (now - lastPerfTime) / 1000);
      lastPerfTime = now;

      if (isPausedRef.current || resumeCountdownRef.current !== null) {
        if (audioPlaying) {
          pausedAtSongTimeRef.current = songTime;
          stopAudio();
        }
        if (videoElRef.current && !videoElRef.current.paused) {
          videoElRef.current.pause();
        }
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      // Advance time locked to Web Audio hardware clock (compensated for outputLatency)
      const rate = practiceRateRef.current;
      if (!audioPlaying) {
        const targetStart = Math.max(0, runStartSec);
        if (pausedAtSongTimeRef.current < targetStart) {
          scheduleAudioFrom(targetStart, targetStart - pausedAtSongTimeRef.current);
        } else {
          scheduleAudioFrom(pausedAtSongTimeRef.current, 0);
        }
      }
      songTime =
        songOffsetAtStartRef.current +
        (ctxAudio.currentTime - audioStartCtxTimeRef.current) * rate -
        getOutputLatencySec();

      // Practice A-B Loop wrap-around
      if (isLoopActive && !finished && songTime >= runEndSec) {
        for (const n of singles) {
          n.judged = false;
          n.judgment = undefined;
        }
        for (const sl of slides) {
          sl.startJudged = false;
          sl.endJudged = false;
          sl.activeHold = false;
          sl.lastHeldTime = -10;
          for (const tk of sl.ticks) tk.judged = false;
        }
        singleHeadIdx = 0;
        currentLoopRun++;
        setLoopCount(currentLoopRun);
        const loopLead = 0.85;
        songTime = Math.max(0, runStartSec) - loopLead;
        scheduleAudioFrom(Math.max(0, runStartSec), loopLead);
      }

      // Trigger Team Skills & Fever Mode when enabled
      if (settingsRef.current.enableSkills) {
        for (let i = 0; i < cards.length; i++) {
          if (!skillFired[i] && songTime >= skillTimes[i]) {
            skillFired[i] = true;
            const c = cards[i];
            if (c.skillType === 'score_up') {
              scoreBoostUntil = songTime + 5.0;
            } else if (c.skillType === 'perfect_lock') {
              perfectLockUntil = songTime + 4.5;
            } else if (c.skillType === 'healer') {
              hp = Math.min(1000, hp + 200);
              healFlashUntil = songTime + 1.1;
              const cvs = canvasRef.current;
              const W = cvs?.clientWidth ?? 900;
              for (let hi = 0; hi < 14; hi++) {
                particles.push({
                  x: W * (0.28 + Math.random() * 0.44),
                  y: 68 + Math.random() * 24,
                  vx: (Math.random() - 0.5) * 80,
                  vy: -80 - Math.random() * 90,
                  life: 0.75 + Math.random() * 0.35,
                  maxLife: 1.1,
                  color: hi % 2 === 0 ? '#34d399' : '#f9a8d4',
                  size: 4 + Math.random() * 3,
                });
              }
            }
            setActiveCutin({ card: c, id: Date.now() + i });
            if (cutinHideTimer !== null) window.clearTimeout(cutinHideTimer);
            cutinHideTimer = window.setTimeout(() => setActiveCutin(null), 2400);
          }
        }

        const nextFever: 'none' | 'fever' | 'super' =
          songTime >= feverStartSec && songTime <= feverEndSec
            ? !feverBroken && combo >= 10
              ? 'super'
              : 'fever'
            : 'none';
        if (nextFever !== lastFeverUi) {
          lastFeverUi = nextFever;
          setFeverState(nextFever);
        }
      } else if (lastFeverUi !== 'none') {
        lastFeverUi = 'none';
        setFeverState('none');
      }

      // Sync 2DMV video clip with songTime
      const vid = videoElRef.current;
      if (vid && bgMediaRef.current?.kind === 'video') {
        if (vid.playbackRate !== rate) {
          try {
            vid.playbackRate = rate;
          } catch {}
        }
        if (songTime < 0) {
          if (!vid.paused) vid.pause();
          if (Math.abs(vid.currentTime - Math.max(0, runStartSec)) > 0.1) {
            try {
              vid.currentTime = Math.max(0, runStartSec);
            } catch {}
          }
        } else {
          if (vid.paused) {
            vid.play().catch(() => {});
          }
          if (vid.duration && isFinite(vid.duration) && vid.duration > 0) {
            const targetSec = songTime % vid.duration;
            if (Math.abs(vid.currentTime - targetSec) > 0.35) {
              try {
                vid.currentTime = targetSec;
              } catch {}
            }
          }
        }
      }

      const userOffsetSec = settingsRef.current.audioOffsetMs / 1000;
      const evalTime = songTime - userOffsetSec;
      const isAuto = settingsRef.current.autoPlay;

      // Advance monotonic head cursor past already-judged or missed notes
      while (singleHeadIdx < singles.length && (singles[singleHeadIdx].judged || evalTime - singles[singleHeadIdx].time > MISS_WINDOW_SEC)) {
        singleHeadIdx++;
      }

      // Update Auto-Play, Trace hover, & Miss checks (only over active window)
      for (let i = singleHeadIdx; i < singles.length; i++) {
        const n = singles[i];
        if (n.time > evalTime + MISS_WINDOW_SEC) break;
        if (n.judged) continue;
        if (isAuto && evalTime >= n.time) {
          n.judged = true;
          n.judgment = 'PERFECT';
          registerJudgment(
            'PERFECT',
            n.critical,
            0,
            n.lane,
            n.width,
            n.kind === 'flick',
            n.kind === 'trace'
          );
        } else if (
          n.kind === 'trace' &&
          Math.abs(evalTime - n.time) <= 0.065 &&
          isLaneCoveredByInputs(n.lane, n.width, 0.85)
        ) {
          n.judged = true;
          n.judgment = 'PERFECT';
          registerJudgment('PERFECT', n.critical, 0, n.lane, n.width, false, true);
        } else if (evalTime - n.time > MISS_WINDOW_SEC) {
          n.judged = true;
          n.judgment = 'MISS';
          registerJudgment(
            'MISS',
            n.critical,
            0,
            n.lane,
            n.width,
            n.kind === 'flick',
            n.kind === 'trace'
          );
        }
      }

      for (const sl of slides) {
        const startPt = sl.points[0];
        const endPt = sl.points[sl.points.length - 1];

        if (!sl.startJudged) {
          if (isAuto && evalTime >= startPt.time) {
            sl.startJudged = true;
            sl.activeHold = true;
            registerJudgment('PERFECT', sl.critical, 0, startPt.lane, startPt.width, false);
          } else if (evalTime - startPt.time > MISS_WINDOW_SEC) {
            sl.startJudged = true;
            sl.activeHold = false;
            registerJudgment('MISS', sl.critical, 0, startPt.lane, startPt.width, false);
          }
        }

        // Check active hold coverage while inside slide body
        if (evalTime >= startPt.time && evalTime <= endPt.time) {
          const cur = getSlideStateAt(sl, evalTime);
          if (isAuto) {
            sl.activeHold = true;
            sl.holdGlowPhase += dtFrame * 10;
            const padIdx = Math.max(0, Math.min(3, Math.floor((cur.lane + cur.width * 0.5) / 3)));
            autoPadLitUntil[padIdx] = Math.max(autoPadLitUntil[padIdx], now + 50);
          } else {
            const held = isLaneCoveredByInputs(cur.lane, cur.width, 0.9);
            if (held) {
              sl.activeHold = true;
              sl.lastHeldTime = evalTime;
              sl.holdGlowPhase += dtFrame * 10;
            } else if (evalTime - sl.lastHeldTime > 0.14) {
              sl.activeHold = false;
            }
          }
        }

        // Judge slide ticks
        for (const tk of sl.ticks) {
          if (tk.judged) continue;
          if (evalTime >= tk.time) {
            tk.judged = true;
            if (isAuto || sl.activeHold) {
              registerJudgment('PERFECT', sl.critical, 0, tk.lane, tk.width, false, true);
            } else {
              registerJudgment('MISS', sl.critical, 0, tk.lane, tk.width, false, true);
            }
          }
        }

        // Judge slide end (with authentic endFlick window for touch swipe)
        if (!sl.endJudged) {
          const hasEndFlick = Boolean(sl.endFlick);
          const hasKeyboardAssist =
            settingsRef.current.keyboardFlickAssist &&
            settingsRef.current.keyBindings.some((k) => pressedKeys.has(k.toLowerCase()));
          if (!hasEndFlick) {
            if (evalTime >= endPt.time) {
              sl.endJudged = true;
              if (isAuto || sl.activeHold) {
                registerJudgment('PERFECT', sl.critical, 0, endPt.lane, endPt.width, false);
              } else {
                registerJudgment('MISS', sl.critical, 0, endPt.lane, endPt.width, false);
              }
            }
          } else {
            if (isAuto && evalTime >= endPt.time) {
              sl.endJudged = true;
              registerJudgment('PERFECT', sl.critical, 0, endPt.lane, endPt.width, true);
            } else if (sl.endFlickSatisfied && evalTime >= endPt.time - 0.08) {
              sl.endJudged = true;
              registerJudgment('PERFECT', sl.critical, 0, endPt.lane, endPt.width, true);
            } else if (hasKeyboardAssist && sl.activeHold && evalTime >= endPt.time) {
              sl.endJudged = true;
              registerJudgment('PERFECT', sl.critical, 0, endPt.lane, endPt.width, true);
            } else if (evalTime >= endPt.time + 0.135) {
              sl.endJudged = true;
              registerJudgment(
                sl.activeHold ? 'GOOD' : 'MISS',
                sl.critical,
                0,
                endPt.lane,
                endPt.width,
                true
              );
            }
          }
        }
      }

      // Sample real-time audio spectrum for concert lights & fan penlights
      if (audioPlaying && !finished) {
        analyser.getByteFrequencyData(freqBins);
        let bSum = 0;
        for (let i = 0; i < 6; i++) bSum += freqBins[i] || 0;
        let tSum = 0;
        for (let i = 10; i < 28; i++) tSum += freqBins[i] || 0;
        audioBass = audioBass * 0.55 + (bSum / (6 * 255)) * 0.45;
        audioTreble = audioTreble * 0.55 + (tSum / (18 * 255)) * 0.45;
      } else {
        audioBass *= 0.9;
        audioTreble *= 0.9;
      }

      // Check fail or song end
      if (!finished) {
        if (hp <= 0 && !settingsRef.current.noFail) {
          completeGame(false);
          return;
        }
        if (songTime >= audioBuffer.duration + 0.35) {
          completeGame(true);
        }
      }

      // ================= RENDERING =================
      const cvs = canvasRef.current;
      if (cvs) {
        const W = cvs.clientWidth;
        const H = cvs.clientHeight;
        const eco = isEcoFrame(W);
        const dpr = Math.min(window.devicePixelRatio || 1, eco ? 1.5 : 2);
        if (cvs.width !== Math.floor(W * dpr) || cvs.height !== Math.floor(H * dpr)) {
          cvs.width = Math.floor(W * dpr);
          cvs.height = Math.floor(H * dpr);
        }
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // 1. Stage Background (transparent dim overlay when 2DMV clip/image is active)
          const hasBgMedia = Boolean(bgMediaRef.current);
          const beatPhase = ((evalTime - song.offsetMs / 1000) * song.bpm) / 60;
          const beatPulse =
            beatPhase >= 0 ? Math.pow(Math.max(0, 1 - (beatPhase - Math.floor(beatPhase))), 2.6) : 0;
          const stageAvatar = avatarRef.current;
          const [ahr, ahg, ahb] = hexToRgb(stageAvatar.hair);
          const [atr, atg, atb] = hexToRgb(stageAvatar.tie);

          if (hasBgMedia) {
            ctx.clearRect(0, 0, W, H);
            const dimAlpha = typeof song.bgDim === 'number' ? song.bgDim : 0.55;
            ctx.fillStyle = `rgba(6, 9, 22, ${dimAlpha})`;
            ctx.fillRect(0, 0, W, H);

            // Subtle beat-reactive border/top glow over the clip
            const rad = ctx.createRadialGradient(
              W * 0.5,
              H * 0.14,
              20,
              W * 0.5,
              H * 0.34,
              W * (0.52 + beatPulse * 0.08)
            );
            rad.addColorStop(0, `rgba(${ahr}, ${ahg}, ${ahb}, ${0.09 + beatPulse * 0.07})`);
            rad.addColorStop(1, 'transparent');
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, W, H);
          } else {
            // Cinematic concert hall backdrop: deep navy aurora with coloured pools
            const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
            bgGrad.addColorStop(0, '#04061a');
            bgGrad.addColorStop(0.42, '#0c1032');
            bgGrad.addColorStop(0.74, '#141a48');
            bgGrad.addColorStop(1, '#070b22');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);

            // Colour pools bleeding from the wings (teal left, magenta right)
            const poolL = ctx.createRadialGradient(W * 0.06, H * 0.3, 10, W * 0.06, H * 0.3, W * 0.42);
            poolL.addColorStop(0, `rgba(${ahr}, ${ahg}, ${ahb}, ${0.2 + audioBass * 0.2})`);
            poolL.addColorStop(1, 'transparent');
            ctx.fillStyle = poolL;
            ctx.fillRect(0, 0, W, H);

            const poolR = ctx.createRadialGradient(W * 0.94, H * 0.66, 10, W * 0.94, H * 0.66, W * 0.42);
            poolR.addColorStop(0, `rgba(${atr}, ${atg}, ${atb}, ${0.17 + audioBass * 0.18})`);
            poolR.addColorStop(1, 'transparent');
            ctx.fillStyle = poolR;
            ctx.fillRect(0, 0, W, H);

            // Beat-synced stage spotlight pulse from the rig
            const rad = ctx.createRadialGradient(
              W * 0.5,
              H * 0.14,
              20,
              W * 0.5,
              H * 0.36,
              W * (0.54 + beatPulse * 0.09)
            );
            rad.addColorStop(0, `rgba(${ahr}, ${ahg}, ${ahb}, ${0.2 + beatPulse * 0.13})`);
            rad.addColorStop(0.4, `rgba(${atr}, ${atg}, ${atb}, ${0.09 + beatPulse * 0.07})`);
            rad.addColorStop(1, 'transparent');
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, W, H);

            // Volumetric light shafts fanning down from the ceiling rig
            if (!eco) {
              const shaftCount = 5;
              for (let si = 0; si < shaftCount; si++) {
                const spread = (si - (shaftCount - 1) / 2) * 0.2;
                const sway = Math.sin(beatPhase * Math.PI * 0.5 + si * 1.3) * 0.035;
                const originX = W * 0.5 + spread * W;
                const tint = si % 2 === 0 ? stageAvatar.hair : stageAvatar.tie;
                const beamW = W * (0.075 + 0.02 * ((si % 3) + 1));
                const sg = ctx.createLinearGradient(originX, 0, originX + (spread + sway) * W * 0.9, H * 0.9);
                sg.addColorStop(0, `${tint}55`);
                sg.addColorStop(0.35, `${tint}18`);
                sg.addColorStop(1, 'transparent');
                ctx.save();
                ctx.globalAlpha = 0.1 + beatPulse * 0.09;
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = sg;
                ctx.beginPath();
                ctx.moveTo(originX - beamW * 0.28, 0);
                ctx.lineTo(originX + beamW * 0.28, 0);
                ctx.lineTo(originX + (spread + sway) * W * 1.1 + beamW * 1.5, H * 0.92);
                ctx.lineTo(originX + (spread + sway) * W * 1.1 - beamW * 1.5, H * 0.92);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
              }
            }

            // Wide soft central beam (classic stage follow-spot)
            ctx.save();
            ctx.globalAlpha = 0.05 + beatPulse * 0.035;
            const beamGrad = ctx.createLinearGradient(0, 0, 0, H * 0.85);
            beamGrad.addColorStop(0, stageAvatar.hair);
            beamGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = beamGrad;
            ctx.beginPath();
            ctx.moveTo(W * 0.46, 0);
            ctx.lineTo(W * 0.54, 0);
            ctx.lineTo(W * 0.86, H);
            ctx.lineTo(W * 0.14, H);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Hazy horizon glow where the stage floor meets the backdrop
            const hz = ctx.createLinearGradient(0, H * 0.62, 0, H);
            hz.addColorStop(0, 'transparent');
            hz.addColorStop(0.62, `rgba(${ahr}, ${ahg}, ${ahb}, ${0.06 + beatPulse * 0.04})`);
            hz.addColorStop(1, 'transparent');
            ctx.fillStyle = hz;
            ctx.fillRect(0, H * 0.62, W, H * 0.38);
          }

          const geo = getGeo(W, H);
          const approachSec = 6.0 / (settingsRef.current.noteSpeed + 0.3);
          const curSkin = settingsRef.current.noteSkin ?? 'classic';

          // Miku Virtual Concert Stage Backdrop (only when no custom 2DMV clip is set)
          if (!hasBgMedia) {
            drawMikuConcertStage(
              ctx,
              W,
              H,
              geo,
              beatPhase,
              beatPulse,
              avatarRef.current,
              audioBass,
              lastFeverUi !== 'none',
              settingsRef.current.sekaiTheme,
              eco
            );
          }

          // Ambient drifting stage petals / stardust (half count in eco mode)
          ctx.save();
          const speedMult = lastFeverUi !== 'none' ? 2.1 : 1 + audioTreble * 0.9;
          const themeInfo = SEKAI_THEMES[settingsRef.current.sekaiTheme] ?? SEKAI_THEMES.stage;
          const moteStep = eco ? 2 : 1;
          for (let mi = 0; mi < ambientMotes.length; mi += moteStep) {
            const m = ambientMotes[mi];
            m.y = (m.y + m.speedY * speedMult * dtFrame) % 1;
            const mx = ((m.x + Math.sin(now * 0.001 * m.swayFreq + m.phase) * 0.03) * W + W) % W;
            const my = m.y * H;
            const alpha = (0.2 + beatPulse * 0.16 + (lastFeverUi !== 'none' ? 0.18 : 0)) * (m.isAccent ? 0.9 : 0.7);
            ctx.globalAlpha = Math.min(0.65, alpha);
            ctx.fillStyle =
              curSkin === 'sakura'
                ? m.isAccent
                  ? '#ff99c8'
                  : '#ffd6e8'
                : curSkin === 'starlight'
                ? m.isAccent
                  ? '#fde047'
                  : '#a5b4fc'
                : m.isAccent
                ? themeInfo.secondary
                : themeInfo.primary;

            ctx.save();
            ctx.translate(mx, my);
            if (curSkin === 'sakura') {
              ctx.rotate(now * 0.002 + m.phase);
              ctx.beginPath();
              ctx.ellipse(0, 0, m.size * 1.4, m.size * 0.7, 0, 0, Math.PI * 2);
              ctx.fill();
            } else if (curSkin === 'starlight' || lastFeverUi !== 'none') {
              ctx.rotate(now * 0.0015 + m.phase);
              ctx.beginPath();
              ctx.moveTo(0, -m.size * 1.5);
              ctx.lineTo(m.size * 0.45, -m.size * 0.45);
              ctx.lineTo(m.size * 1.5, 0);
              ctx.lineTo(m.size * 0.45, m.size * 0.45);
              ctx.lineTo(0, m.size * 1.5);
              ctx.lineTo(-m.size * 0.45, m.size * 0.45);
              ctx.lineTo(-m.size * 1.5, 0);
              ctx.lineTo(-m.size * 0.45, -m.size * 0.45);
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, m.size, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
          ctx.restore();

          // End highway cleanly at the judgment line (pads sit neatly right beneath)
          const roadBottomY = geo.yJudge + 4;
          const bottomFactor = (roadBottomY - geo.yTop) / (geo.yJudge - geo.yTop);
          const bottomRoadW = geo.topWidth + (geo.judgeWidth - geo.topWidth) * bottomFactor;

          // 2. Highway Trapezoid Surface
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(geo.cx - geo.topWidth / 2, geo.yTop);
          ctx.lineTo(geo.cx + geo.topWidth / 2, geo.yTop);
          ctx.lineTo(geo.cx + bottomRoadW / 2, roadBottomY);
          ctx.lineTo(geo.cx - bottomRoadW / 2, roadBottomY);
          ctx.closePath();
          ctx.fillStyle = `rgba(12, 16, 36, ${settingsRef.current.laneOpacity})`;
          ctx.fill();

          // Depth gradient inside the highway — brighter near the judge line
          ctx.save();
          ctx.clip();
          const depthGrad = ctx.createLinearGradient(0, geo.yTop, 0, roadBottomY);
          depthGrad.addColorStop(0, 'rgba(56, 189, 248, 0.03)');
          depthGrad.addColorStop(0.55, 'rgba(45, 212, 191, 0.05)');
          depthGrad.addColorStop(1, `rgba(${ahr}, ${ahg}, ${ahb}, ${0.12 + beatPulse * 0.06})`);
          ctx.fillStyle = depthGrad;
          ctx.fillRect(0, geo.yTop, W, roadBottomY - geo.yTop);

          // Reflected stage light pooling at the bottom of the road
          const pool = ctx.createRadialGradient(
            geo.cx,
            roadBottomY,
            4,
            geo.cx,
            roadBottomY,
            bottomRoadW * 0.7
          );
          pool.addColorStop(0, `rgba(${ahr}, ${ahg}, ${ahb}, ${0.16 + beatPulse * 0.1})`);
          pool.addColorStop(1, 'transparent');
          ctx.fillStyle = pool;
          ctx.fillRect(0, geo.yTop, W, roadBottomY - geo.yTop);
          ctx.restore();

          // Outer neon rails (tinted by SEKAI theme, or rainbow pulse in Fever!)
          const themeColors = SEKAI_THEMES[settingsRef.current.sekaiTheme] ?? SEKAI_THEMES.stage;
          const [tr, tg, tb] = hexToRgb(
            lastFeverUi === 'super'
              ? '#ff4f93'
              : lastFeverUi === 'fever'
              ? '#fde047'
              : themeColors.primary
          );
          if (!eco) {
            ctx.shadowColor = `rgba(${tr}, ${tg}, ${tb}, 0.9)`;
            ctx.shadowBlur = 12 + beatPulse * 12;
          }
          ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, ${lastFeverUi !== 'none' ? 0.95 : 0.8})`;
          ctx.lineWidth = lastFeverUi !== 'none' ? 4.4 : 3.2;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // 3. Lane dividers (4 wide lanes across 12 logical units) — glowing rails
          for (let i = 1; i < 4; i++) {
            const frac = i / 4;
            const x1 = geo.cx - geo.topWidth / 2 + geo.topWidth * frac;
            const x2 = geo.cx - bottomRoadW / 2 + bottomRoadW * frac;
            ctx.beginPath();
            ctx.moveTo(x1, geo.yTop);
            ctx.lineTo(x2, roadBottomY);
            if (!eco) {
              ctx.shadowColor = i === 2 ? 'rgba(103, 232, 249, 0.75)' : 'rgba(191, 219, 254, 0.4)';
              ctx.shadowBlur = i === 2 ? 9 + beatPulse * 7 : 5;
            }
            ctx.strokeStyle = i === 2 ? 'rgba(103, 232, 249, 0.4)' : 'rgba(255, 255, 255, 0.22)';
            ctx.lineWidth = i === 2 ? 2 : 1.4;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          // Active key/pointer pressed highlights on the 4 lanes
          for (let k = 0; k < 4; k++) {
            const keyName = (settingsRef.current.keyBindings[k] ?? '').toLowerCase();
            const keyPressed = keyName ? pressedKeys.has(keyName) : false;
            const autoPressed = settingsRef.current.autoPlay && autoPadLitUntil[k] > now;
            let ptrPressed = false;
            for (const p of activePointers.values()) {
              if (p.lane >= k * 3 && p.lane < k * 3 + 3) {
                ptrPressed = true;
                break;
              }
            }
            if (keyPressed || ptrPressed || autoPressed) {
              const f0 = k / 4;
              const f1 = (k + 1) / 4;
              const tx0 = geo.cx - geo.topWidth / 2 + geo.topWidth * f0;
              const tx1 = geo.cx - geo.topWidth / 2 + geo.topWidth * f1;
              const bx0 = geo.cx - bottomRoadW / 2 + bottomRoadW * f0;
              const bx1 = geo.cx - bottomRoadW / 2 + bottomRoadW * f1;
              const lg = ctx.createLinearGradient(0, geo.yTop, 0, roadBottomY);
              lg.addColorStop(0, 'rgba(51,230,204,0.0)');
              lg.addColorStop(0.7, 'rgba(51,230,204,0.18)');
              lg.addColorStop(1, 'rgba(51,230,204,0.34)');
              ctx.beginPath();
              ctx.moveTo(tx0, geo.yTop);
              ctx.lineTo(tx1, geo.yTop);
              ctx.lineTo(bx1, roadBottomY);
              ctx.lineTo(bx0, roadBottomY);
              ctx.closePath();
              ctx.fillStyle = lg;
              ctx.fill();
            }
          }

          // Beat horizontal guide lines (subtle measure & beat lines scrolling down on beat)
          const beatSec = 60 / song.bpm;
          const firstBeatVis = Math.floor(((evalTime - 0.1 - song.offsetMs / 1000) / beatSec));
          const lastBeatVis = Math.ceil(((evalTime + approachSec - song.offsetMs / 1000) / beatSec));
          for (let b = firstBeatVis; b <= lastBeatVis; b++) {
            const bt = beatToTimeSec(b, song.bpm, song.offsetMs, song.bpmChanges);
            const pr = projectTime(bt, evalTime, approachSec, geo);
            if (pr.y < geo.yTop || pr.y > geo.yJudge + 2) continue;
            const isMeasure = b % 4 === 0;
            ctx.beginPath();
            ctx.moveTo(geo.cx - pr.roadW / 2, pr.y);
            ctx.lineTo(geo.cx + pr.roadW / 2, pr.y);
            ctx.strokeStyle = isMeasure ? 'rgba(103, 232, 249, 0.24)' : 'rgba(255,255,255,0.07)';
            ctx.lineWidth = isMeasure ? 1.5 : 0.8;
            ctx.stroke();
          }

          // Hit lane flashes & vertical PERFECT/CRITICAL tap beams
          for (let i = laneFlashes.length - 1; i >= 0; i--) {
            const lf = laneFlashes[i];
            lf.alpha -= dtFrame * 3.4;
            if (lf.alpha <= 0) {
              laneFlashes.splice(i, 1);
              continue;
            }
            const f0 = lf.lane / 12;
            const f1 = (lf.lane + lf.width) / 12;
            const tx0 = geo.cx - geo.topWidth / 2 + geo.topWidth * f0;
            const tx1 = geo.cx - geo.topWidth / 2 + geo.topWidth * f1;
            const bx0 = geo.cx - bottomRoadW / 2 + bottomRoadW * f0;
            const bx1 = geo.cx - bottomRoadW / 2 + bottomRoadW * f1;
            ctx.save();
            if (lf.beam) {
              const bGrad = ctx.createLinearGradient(0, geo.yTop, 0, roadBottomY);
              bGrad.addColorStop(0, 'rgba(255,255,255,0)');
              bGrad.addColorStop(0.45, lf.color);
              bGrad.addColorStop(1, '#ffffff');
              ctx.globalAlpha = lf.alpha * (lf.critical ? 0.56 : 0.42);
              ctx.fillStyle = bGrad;
            } else {
              ctx.globalAlpha = lf.alpha * 0.42;
              ctx.fillStyle = lf.color;
            }
            ctx.beginPath();
            ctx.moveTo(tx0, geo.yTop);
            ctx.lineTo(tx1, geo.yTop);
            ctx.lineTo(bx1, roadBottomY);
            ctx.lineTo(bx0, roadBottomY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          // 4. Judgment Line with beat-synced glow & PJSK diamond endpoints
          const jx0 = geo.cx - geo.judgeWidth / 2;
          const jx1 = geo.cx + geo.judgeWidth / 2;
          ctx.save();

          // Bloom halo hugging the judgment line
          if (!eco) {
            const bloom = ctx.createLinearGradient(0, geo.yJudge - 26, 0, geo.yJudge + 26);
            bloom.addColorStop(0, 'rgba(51, 230, 204, 0)');
            bloom.addColorStop(0.5, `rgba(51, 230, 204, ${0.18 + beatPulse * 0.14})`);
            bloom.addColorStop(1, 'rgba(51, 230, 204, 0)');
            ctx.fillStyle = bloom;
            ctx.fillRect(jx0 - 20, geo.yJudge - 26, jx1 - jx0 + 40, 52);
          }

          if (!eco) {
            ctx.shadowColor = '#33e6cc';
            ctx.shadowBlur = 18 + beatPulse * 16;
          }
          const jGrad = ctx.createLinearGradient(jx0, 0, jx1, 0);
          jGrad.addColorStop(0, '#33e6cc');
          jGrad.addColorStop(0.5, '#ffffff');
          jGrad.addColorStop(1, '#33e6cc');
          ctx.strokeStyle = jGrad;
          ctx.lineWidth = 4.6 + beatPulse * 1.8;
          ctx.beginPath();
          ctx.moveTo(jx0 - 8, geo.yJudge);
          ctx.lineTo(jx1 + 8, geo.yJudge);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Thin secondary rail just beneath the main line (PJSK layered look)
          ctx.strokeStyle = `rgba(165, 243, 252, ${0.3 + beatPulse * 0.2})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(jx0 - 4, geo.yJudge + 5);
          ctx.lineTo(jx1 + 4, geo.yJudge + 5);
          ctx.stroke();

          // Left & Right Diamond markers (pulse gently with the beat)
          const dSize = 5 + beatPulse * 2.4;
          for (const dx of [jx0 - 10, jx1 + 10]) {
            ctx.save();
            ctx.translate(dx, geo.yJudge);
            ctx.rotate(Math.PI / 4);
            if (!eco) {
              ctx.shadowColor = '#33e6cc';
              ctx.shadowBlur = 10 + beatPulse * 8;
            }
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#33e6cc';
            ctx.lineWidth = 2;
            ctx.fillRect(-dSize, -dSize, dSize * 2, dSize * 2);
            ctx.strokeRect(-dSize, -dSize, dSize * 2, dSize * 2);
            ctx.restore();
          }
          ctx.restore();

          // Interactive 4 Lane Tap Pads below Judgment Line (crisp symmetrical rounded 3D glass pads)
          const tileTopY = geo.yJudge + 10;
          const padH = Math.min(76, Math.max(44, H - tileTopY - 12));
          const padGap = Math.max(4, geo.judgeWidth * 0.008);
          const laneSpanW = geo.judgeWidth / 4;
          const padRadius = Math.min(14, padH * 0.28);

          for (let k = 0; k < 4; k++) {
            const keyName = (settingsRef.current.keyBindings[k] ?? '').toLowerCase();
            const keyDown = keyName ? pressedKeys.has(keyName) : false;
            const autoDown = settingsRef.current.autoPlay && autoPadLitUntil[k] > now;
            let ptrDown = false;
            for (const p of activePointers.values()) {
              if (p.lane >= k * 3 && p.lane < k * 3 + 3) {
                ptrDown = true;
                break;
              }
            }
            const isActiveTile = keyDown || ptrDown || autoDown;

            const px = geo.cx - geo.judgeWidth / 2 + k * laneSpanW + padGap;
            const pw = Math.max(24, laneSpanW - padGap * 2);
            const pressOffset = isActiveTile ? 2 : 0;

            ctx.save();
            // Subtle bottom depth shadow lip (3D arcade pad feel)
            if (!isActiveTile) {
              roundRectPath(ctx, px, tileTopY + 4, pw, padH, padRadius);
              ctx.fillStyle = 'rgba(3, 7, 20, 0.85)';
              ctx.fill();
            }

            // Coloured glow bleeding upward from the pad onto the highway
            if (!eco) {
              const bleed = ctx.createRadialGradient(
                px + pw / 2,
                tileTopY,
                2,
                px + pw / 2,
                tileTopY,
                pw * 0.9
              );
              bleed.addColorStop(
                0,
                isActiveTile ? 'rgba(94, 234, 212, 0.4)' : 'rgba(103, 232, 249, 0.12)'
              );
              bleed.addColorStop(1, 'transparent');
              ctx.fillStyle = bleed;
              ctx.fillRect(px - pw * 0.4, tileTopY - padH * 0.6, pw * 1.8, padH * 0.8);
            }

            roundRectPath(ctx, px, tileTopY + pressOffset, pw, padH, padRadius);
            const tGrad = ctx.createLinearGradient(0, tileTopY + pressOffset, 0, tileTopY + pressOffset + padH);
            if (isActiveTile) {
              tGrad.addColorStop(0, 'rgba(125, 251, 237, 0.95)');
              tGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.82)');
              tGrad.addColorStop(0.78, 'rgba(232, 121, 249, 0.68)');
              tGrad.addColorStop(1, 'rgba(244, 114, 182, 0.62)');
              if (!eco) {
                ctx.shadowColor = 'rgba(94, 234, 212, 0.9)';
                ctx.shadowBlur = 22;
              }
            } else {
              tGrad.addColorStop(0, 'rgba(38, 54, 100, 0.82)');
              tGrad.addColorStop(0.42, 'rgba(22, 32, 66, 0.88)');
              tGrad.addColorStop(0.85, 'rgba(14, 21, 47, 0.93)');
              tGrad.addColorStop(1, 'rgba(9, 14, 34, 0.96)');
            }
            ctx.fillStyle = tGrad;
            ctx.fill();

            // Prism edge on the pad border
            const pGrad = ctx.createLinearGradient(px, 0, px + pw, 0);
            if (isActiveTile) {
              pGrad.addColorStop(0, '#ffffff');
              pGrad.addColorStop(0.5, '#a5f3fc');
              pGrad.addColorStop(1, '#ffffff');
            } else {
              pGrad.addColorStop(0, 'rgba(103, 232, 249, 0.55)');
              pGrad.addColorStop(0.5, 'rgba(165, 243, 252, 0.34)');
              pGrad.addColorStop(1, 'rgba(103, 232, 249, 0.55)');
            }
            ctx.strokeStyle = pGrad;
            ctx.lineWidth = isActiveTile ? 2.2 : 1.4;
            ctx.stroke();

            // Soft top inner glass reflection
            ctx.shadowBlur = 0;
            roundRectPath(
              ctx,
              px + 4,
              tileTopY + pressOffset + 3,
              Math.max(8, pw - 8),
              Math.max(4, padH * 0.26),
              Math.max(4, padRadius - 4)
            );
            ctx.fillStyle = isActiveTile ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.11)';
            ctx.fill();

            // Bottom bounce light on the pad
            roundRectPath(
              ctx,
              px + 5,
              tileTopY + pressOffset + padH * 0.76,
              Math.max(6, pw - 10),
              Math.max(3, padH * 0.16),
              Math.max(3, padRadius - 5)
            );
            ctx.fillStyle = isActiveTile ? 'rgba(255, 255, 255, 0.18)' : 'rgba(56, 189, 248, 0.07)';
            ctx.fill();

            if (settingsRef.current.showKeyHints) {
              const kx = px + pw / 2;
              const ky = tileTopY + pressOffset + padH / 2;
              if (isCoarsePointer && W < 820) {
                const pillW = Math.min(46, Math.max(22, pw * 0.38));
                roundRectPath(ctx, kx - pillW / 2, ky - 3, pillW, 6, 3);
                ctx.fillStyle = isActiveTile ? '#ffffff' : 'rgba(165, 243, 252, 0.58)';
                ctx.fill();
              } else {
                const capW = Math.min(44, Math.max(28, pw * 0.3));
                const capH = Math.min(28, padH * 0.58);

                roundRectPath(ctx, kx - capW / 2, ky - capH / 2, capW, capH, 8);
                ctx.fillStyle = isActiveTile
                  ? 'rgba(255, 255, 255, 0.96)'
                  : 'rgba(11, 18, 40, 0.65)';
                ctx.fill();
                ctx.strokeStyle = isActiveTile
                  ? '#ffffff'
                  : 'rgba(103, 232, 249, 0.48)';
                ctx.lineWidth = 1.2;
                ctx.stroke();

                const keyLabel = formatKeyLabel(keyName);
                ctx.font = keyLabel.length > 2 ? '900 10px system-ui, sans-serif' : '900 15px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isActiveTile ? '#0f766e' : 'rgba(224, 242, 254, 0.95)';
                ctx.fillText(keyLabel, kx, ky + 0.5);
              }
            }
            ctx.restore();
          }

          // Clip falling notes cleanly between horizon line yTop and just below the judgment line
          ctx.beginPath();
          ctx.rect(0, geo.yTop - 2, W, geo.yJudge + 14 - (geo.yTop - 2));
          ctx.clip();

          // 5. Render Slide Ribbons (drawn underneath single notes)
          for (const sl of slides) {
            const firstT = sl.points[0].time;
            const lastT = sl.points[sl.points.length - 1].time;
            if (firstT > evalTime + approachSec || lastT < evalTime - 0.15) continue;
            if (sl.endJudged) continue;

            const visStartT = Math.max(firstT, sl.activeHold ? evalTime : firstT);
            const visEndT = Math.min(lastT, evalTime + approachSec);
            if (visEndT <= visStartT) continue;

            const steps = Math.max(16, Math.min(56, Math.ceil((visEndT - visStartT) / 0.024)));
            const leftPts: Array<{ x: number; y: number }> = [];
            const rightPts: Array<{ x: number; y: number }> = [];
            const centerPts: Array<{ x: number; y: number }> = [];

            for (let i = 0; i <= steps; i++) {
              const t = visStartT + ((visEndT - visStartT) * i) / steps;
              const st = getSlideStateAt(sl, t);
              const pr = projectTime(t, evalTime, approachSec, geo);
              const xl = geo.cx - pr.roadW / 2 + (st.lane / 12) * pr.roadW;
              const xr = geo.cx - pr.roadW / 2 + ((st.lane + st.width) / 12) * pr.roadW;
              leftPts.push({ x: xl, y: pr.y });
              rightPts.push({ x: xr, y: pr.y });
              centerPts.push({ x: (xl + xr) * 0.5, y: pr.y });
            }

            ctx.beginPath();
            ctx.moveTo(leftPts[0].x, leftPts[0].y);
            for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
            for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
            ctx.closePath();

            const ribGrad = ctx.createLinearGradient(0, geo.yTop, 0, geo.yJudge);
            if (sl.critical) {
              ribGrad.addColorStop(0, 'rgba(253, 224, 71, 0.45)');
              ribGrad.addColorStop(1, sl.activeHold ? 'rgba(250, 204, 21, 0.88)' : 'rgba(245, 158, 11, 0.68)');
            } else {
              ribGrad.addColorStop(0, 'rgba(52, 211, 153, 0.44)');
              ribGrad.addColorStop(1, sl.activeHold ? 'rgba(52, 211, 153, 0.88)' : 'rgba(16, 185, 129, 0.65)');
            }
            ctx.fillStyle = ribGrad;
            ctx.fill();

            ctx.strokeStyle = sl.critical ? 'rgba(254, 240, 138, 0.92)' : 'rgba(167, 243, 208, 0.92)';
            ctx.lineWidth = 2.2;
            ctx.stroke();

            // Glowing center guide spline along the curved slide path
            if (centerPts.length >= 2) {
              ctx.beginPath();
              ctx.moveTo(centerPts[0].x, centerPts[0].y);
              for (let i = 1; i < centerPts.length; i++) ctx.lineTo(centerPts[i].x, centerPts[i].y);
              ctx.strokeStyle = sl.critical
                ? 'rgba(255, 255, 255, 0.5)'
                : 'rgba(220, 252, 231, 0.48)';
              ctx.lineWidth = sl.activeHold ? 3.2 : 2;
              ctx.stroke();
            }

            // Render visible diamond ticks inside slide
            for (const tk of sl.ticks) {
              if (!tk.isVisibleDiamond || tk.judged) continue;
              if (tk.time > evalTime + approachSec || tk.time < evalTime - 0.1) continue;
              const pr = projectTime(tk.time, evalTime, approachSec, geo);
              const xCenter = geo.cx - pr.roadW / 2 + ((tk.lane + tk.width / 2) / 12) * pr.roadW;
              const r = 7 * Math.max(0.35, pr.p);
              ctx.save();
              ctx.translate(xCenter, pr.y);
              ctx.rotate(Math.PI / 4);
              ctx.fillStyle = sl.critical ? '#fef08a' : '#a7f3d0';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.fillRect(-r, -r, r * 2, r * 2);
              ctx.strokeRect(-r, -r, r * 2, r * 2);
              ctx.restore();
            }

            // Render slide start cap if unjudged
            if (!sl.startJudged) {
              const p0 = sl.points[0];
              const pr = projectTime(p0.time, evalTime, approachSec, geo);
              drawNoteBar(ctx, geo, pr, p0.lane, p0.width, sl.critical ? 'gold' : 'green', null, curSkin, eco);
            } else if (sl.activeHold && evalTime < lastT) {
              // Active hold orb on judgment line
              const cur = getSlideStateAt(sl, evalTime);
              const xC = geo.cx - geo.judgeWidth / 2 + ((cur.lane + cur.width / 2) / 12) * geo.judgeWidth;
              const pulse = 1 + 0.25 * Math.sin(sl.holdGlowPhase);
              ctx.save();
              ctx.beginPath();
              ctx.arc(xC, geo.yJudge, 18 * pulse, 0, Math.PI * 2);
              ctx.fillStyle = sl.critical ? 'rgba(253, 224, 71, 0.45)' : 'rgba(52, 211, 153, 0.45)';
              ctx.fill();
              ctx.beginPath();
              ctx.arc(xC, geo.yJudge, 9 * pulse, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.restore();
            }

            // Render slide end cap (or flick arrow)
            const pEnd = sl.points[sl.points.length - 1];
            if (pEnd.time <= evalTime + approachSec && pEnd.time >= evalTime - 0.1) {
              const pr = projectTime(pEnd.time, evalTime, approachSec, geo);
              drawNoteBar(
                ctx,
                geo,
                pr,
                pEnd.lane,
                pEnd.width,
                sl.critical ? 'gold' : sl.endFlick ? 'pink' : 'green',
                sl.endFlick ?? null,
                curSkin,
                eco
              );
            }
          }

          // 6. Simultaneous Note Horizontal White Guide Lines (zero-allocation O(1) window)
          let visEndIdx = singleHeadIdx;
          const maxVisT = evalTime + approachSec;
          const minVisT = evalTime - 0.12;
          while (visEndIdx < singles.length && singles[visEndIdx].time <= maxVisT) {
            visEndIdx++;
          }
          let prevVisSingle: RuntimeSingleNote | null = null;
          for (let i = singleHeadIdx; i < visEndIdx; i++) {
            const cur = singles[i];
            if (cur.judged || cur.time < minVisT) continue;
            if (prevVisSingle && Math.abs(prevVisSingle.time - cur.time) < 0.005) {
              const pr = projectTime(cur.time, evalTime, approachSec, geo);
              const xa = geo.cx - pr.roadW / 2 + ((prevVisSingle.lane + prevVisSingle.width / 2) / 12) * pr.roadW;
              const xb = geo.cx - pr.roadW / 2 + ((cur.lane + cur.width / 2) / 12) * pr.roadW;
              ctx.beginPath();
              ctx.moveTo(xa, pr.y);
              ctx.lineTo(xb, pr.y);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
              ctx.lineWidth = Math.max(1.2, 2.5 * pr.p);
              ctx.stroke();
            }
            prevVisSingle = cur;
          }

          // 7. Render Single Tap, Trace & Flick Notes (far-to-near so closer notes draw on top)
          const skipShadow = eco || visEndIdx - singleHeadIdx > 18;

          // 7a. Comet trails behind falling notes — gives the highway motion & depth
          if (!eco) {
            for (let i = visEndIdx - 1; i >= singleHeadIdx; i--) {
              const n = singles[i];
              if (n.judged || n.time < minVisT) continue;
              if (n.kind === 'trace') continue;
              const pr = projectTime(n.time, evalTime, approachSec, geo);
              const tx = geo.cx - pr.roadW / 2 + ((n.lane + n.width / 2) / 12) * pr.roadW;
              const tw = Math.max(3, (n.width / 12) * pr.roadW * 0.72);
              const trailLen = Math.max(14, 62 * pr.p);
              const isGold = n.critical;
              const tg2 = ctx.createLinearGradient(0, pr.y - trailLen, 0, pr.y);
              if (isGold) {
                tg2.addColorStop(0, 'rgba(253, 224, 71, 0)');
                tg2.addColorStop(0.55, 'rgba(250, 204, 21, 0.16)');
                tg2.addColorStop(1, 'rgba(255, 240, 138, 0.5)');
              } else if (n.kind === 'flick') {
                tg2.addColorStop(0, 'rgba(255, 79, 147, 0)');
                tg2.addColorStop(0.55, 'rgba(255, 79, 147, 0.15)');
                tg2.addColorStop(1, 'rgba(255, 167, 210, 0.46)');
              } else {
                tg2.addColorStop(0, 'rgba(56, 189, 248, 0)');
                tg2.addColorStop(0.55, 'rgba(57, 197, 187, 0.15)');
                tg2.addColorStop(1, 'rgba(165, 243, 252, 0.45)');
              }
              ctx.fillStyle = tg2;
              ctx.beginPath();
              ctx.moveTo(tx - tw / 2, pr.y - trailLen);
              ctx.lineTo(tx + tw / 2, pr.y - trailLen);
              ctx.lineTo(tx + tw / 2, pr.y);
              ctx.lineTo(tx - tw / 2, pr.y);
              ctx.closePath();
              ctx.fill();
            }
          }

          for (let i = visEndIdx - 1; i >= singleHeadIdx; i--) {
            const n = singles[i];
            if (n.judged || n.time < minVisT) continue;
            const pr = projectTime(n.time, evalTime, approachSec, geo);
            if (n.kind === 'trace') {
              drawTraceNote(ctx, geo, pr, n.lane, n.width, n.critical, curSkin, skipShadow);
            } else {
              const palette = n.critical ? 'gold' : n.kind === 'flick' ? 'pink' : 'cyan';
              drawNoteBar(
                ctx,
                geo,
                pr,
                n.lane,
                n.width,
                palette,
                n.kind === 'flick' ? n.direction ?? 'up' : null,
                curSkin,
                skipShadow
              );
            }
          }

          ctx.restore(); // remove highway clip

          // 8. Hit Particles (unclipped, styled by Note Skin)
          for (let i = particles.length - 1; i >= 0; i--) {
            const pt = particles[i];
            pt.life -= dtFrame;
            if (pt.life <= 0) {
              particles.splice(i, 1);
              continue;
            }
            pt.x += pt.vx * dtFrame;
            pt.y += pt.vy * dtFrame;
            pt.vy += 420 * dtFrame;
            const frac = Math.max(0, pt.life / pt.maxLife);
            const r = pt.size * frac;
            ctx.save();
            ctx.globalAlpha = frac;
            ctx.fillStyle = pt.color;
            ctx.translate(pt.x, pt.y);
            if (curSkin === 'sakura') {
              ctx.rotate(pt.life * 8);
              ctx.beginPath();
              ctx.ellipse(0, 0, r * 1.45, r * 0.75, 0, 0, Math.PI * 2);
              ctx.fill();
            } else if (curSkin === 'starlight') {
              ctx.rotate(pt.life * 5);
              ctx.beginPath();
              ctx.moveTo(0, -r * 1.6);
              ctx.lineTo(r * 0.45, -r * 0.45);
              ctx.lineTo(r * 1.6, 0);
              ctx.lineTo(r * 0.45, r * 0.45);
              ctx.lineTo(0, r * 1.6);
              ctx.lineTo(-r * 0.45, r * 0.45);
              ctx.lineTo(-r * 1.6, 0);
              ctx.lineTo(-r * 0.45, -r * 0.45);
              ctx.closePath();
              ctx.fill();
            } else if (curSkin === 'cyber') {
              ctx.rotate(Math.PI / 4);
              ctx.fillRect(-r, -r, r * 2, r * 2);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }

          // 9. Floating Judgment Text (Authentic Project SEKAI iridescent gradient typography)
          if (floatingJudgment) {
            floatingJudgment.timeLeft -= dtFrame;
            if (floatingJudgment.timeLeft <= 0) {
              floatingJudgment = null;
            } else {
              const tNorm = floatingJudgment.timeLeft / floatingJudgment.maxTime;
              const scale = tNorm > 0.85 ? 1 + (1 - tNorm) * 1.7 : 1.0;
              const isShortLand = H < 540;
              ctx.save();
              ctx.translate(geo.cx, geo.yJudge - (isShortLand ? 54 : 78));
              ctx.scale(scale, scale);
              ctx.globalAlpha = Math.min(1, tNorm * 2.5);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = isShortLand
                ? 'italic 900 28px system-ui, sans-serif'
                : 'italic 900 37px system-ui, sans-serif';

              let fillStyle: string | CanvasGradient = '#94a3b8';
              if (floatingJudgment.text === 'PERFECT') {
                const pGrad = ctx.createLinearGradient(0, -18, 0, 18);
                if (floatingJudgment.critical) {
                  pGrad.addColorStop(0, '#fef08a');
                  pGrad.addColorStop(0.52, '#ffffff');
                  pGrad.addColorStop(1, '#38bdf8');
                } else {
                  pGrad.addColorStop(0, '#a5f3fc');
                  pGrad.addColorStop(0.5, '#ffffff');
                  pGrad.addColorStop(1, '#f472b6');
                }
                fillStyle = pGrad;
              } else if (floatingJudgment.text === 'GREAT') {
                fillStyle = '#f472b6';
              } else if (floatingJudgment.text === 'GOOD') {
                fillStyle = '#4ade80';
              } else if (floatingJudgment.text === 'BAD') {
                fillStyle = '#60a5fa';
              }

              ctx.strokeStyle = 'rgba(8, 12, 28, 0.92)';
              ctx.lineWidth = isShortLand ? 5.5 : 6.5;
              ctx.strokeText(floatingJudgment.text, 0, 0);
              ctx.fillStyle = fillStyle;
              ctx.fillText(floatingJudgment.text, 0, 0);

              if (floatingJudgment.subText) {
                ctx.font = isShortLand ? '900 11px system-ui, sans-serif' : '900 12px system-ui, sans-serif';
                ctx.strokeStyle = 'rgba(8, 12, 28, 0.85)';
                ctx.lineWidth = 3;
                ctx.strokeText(floatingJudgment.subText, 0, isShortLand ? 20 : 25);
                ctx.fillStyle = floatingJudgment.subText === 'FAST' ? '#38bdf8' : '#fb7185';
                ctx.fillText(floatingJudgment.subText, 0, isShortLand ? 20 : 25);
              }
              ctx.restore();
            }
          }

          // 10. Combo Counter ("COMBO" label ABOVE giant number, matching original Project SEKAI)
          if (combo > 0) {
            comboPop = Math.max(0, comboPop - dtFrame * 6);
            const scale = 1 + comboPop * 0.22;
            const isShortLand = H < 540 && W > H;
            const hasRightSpace = W - geo.judgeWidth >= 120;
            const centerCombo = W < 680 || (isShortLand && !hasRightSpace);
            const comboX = centerCombo
              ? geo.cx
              : Math.min(W - (isShortLand ? 54 : 92), geo.cx + geo.judgeWidth * (isShortLand ? 0.47 : 0.44));
            const comboY = centerCombo
              ? geo.yTop + (geo.yJudge - geo.yTop) * 0.37
              : H * (isShortLand ? 0.47 : 0.45);
            const smallComboFont = centerCombo || isShortLand;
            ctx.save();
            ctx.globalAlpha = centerCombo ? 0.8 : 1;
            ctx.translate(comboX, comboY);
            ctx.scale(scale, scale);
            ctx.textAlign = 'center';

            // "COMBO" header above the number
            ctx.font = smallComboFont ? '900 11px system-ui, sans-serif' : '900 14px system-ui, sans-serif';
            ctx.strokeStyle = 'rgba(10, 12, 28, 0.78)';
            ctx.lineWidth = 3.5;
            ctx.strokeText('COMBO', 0, smallComboFont ? -34 : -46);
            ctx.fillStyle = 'rgba(224, 247, 250, 0.94)';
            ctx.fillText('COMBO', 0, smallComboFont ? -34 : -46);

            ctx.font = smallComboFont ? '900 44px system-ui, sans-serif' : '900 66px system-ui, sans-serif';
            ctx.strokeStyle = 'rgba(10, 12, 28, 0.84)';
            ctx.lineWidth = smallComboFont ? 6 : 8;
            ctx.strokeText(String(combo), 0, 0);
            const cGrad = ctx.createLinearGradient(0, -34, 0, 22);
            cGrad.addColorStop(0, '#ffffff');
            cGrad.addColorStop(0.6, '#cffafe');
            cGrad.addColorStop(1, '#39C5BB');
            ctx.fillStyle = cGrad;
            ctx.fillText(String(combo), 0, 0);
            ctx.restore();
          }

          // 11. Screen Edge Reactions: FEVER Prism Glow, Low-HP Danger Vignette & Heal Glow
          if (lastFeverUi !== 'none') {
            const edgePulse = 0.34 + 0.2 * Math.sin(now * 0.008);
            const edgeW = Math.min(150, W * 0.18);

            // Rainbow prism border (top / bottom / left / right)
            const prismTop = ctx.createLinearGradient(0, 0, W, 0);
            prismTop.addColorStop(0, lastFeverUi === 'super' ? 'rgba(255,79,147,0.9)' : 'rgba(250,204,21,0.85)');
            prismTop.addColorStop(0.35, 'rgba(56,189,248,0.85)');
            prismTop.addColorStop(0.7, lastFeverUi === 'super' ? 'rgba(167,139,250,0.85)' : 'rgba(57,197,187,0.85)');
            prismTop.addColorStop(1, lastFeverUi === 'super' ? 'rgba(56,189,248,0.9)' : 'rgba(236,72,153,0.85)');
            ctx.save();
            ctx.globalAlpha = 0.55 + edgePulse * 0.35;
            ctx.fillStyle = prismTop;
            ctx.fillRect(0, 0, W, 4);
            ctx.fillRect(0, H - 4, W, 4);
            ctx.restore();

            const leftEdge = ctx.createLinearGradient(0, 0, edgeW, 0);
            leftEdge.addColorStop(
              0,
              lastFeverUi === 'super'
                ? `rgba(255, 79, 147, ${edgePulse})`
                : `rgba(250, 204, 21, ${edgePulse * 0.85})`
            );
            leftEdge.addColorStop(1, 'transparent');
            ctx.fillStyle = leftEdge;
            ctx.fillRect(0, 0, edgeW, H);

            const rightEdge = ctx.createLinearGradient(W, 0, W - edgeW, 0);
            rightEdge.addColorStop(
              0,
              lastFeverUi === 'super'
                ? `rgba(57, 197, 187, ${edgePulse})`
                : `rgba(236, 72, 153, ${edgePulse * 0.85})`
            );
            rightEdge.addColorStop(1, 'transparent');
            ctx.fillStyle = rightEdge;
            ctx.fillRect(W - edgeW, 0, edgeW, H);
          }

          if (hp < 250 && !settingsRef.current.noFail) {
            const dangerPulse = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(now * 0.01));
            const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.28, W * 0.5, H * 0.5, Math.max(W, H) * 0.68);
            vig.addColorStop(0, 'transparent');
            vig.addColorStop(1, `rgba(244, 63, 94, ${dangerPulse})`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, W, H);
          }

          if (songTime <= healFlashUntil) {
            const healAlpha = Math.max(0, (healFlashUntil - songTime) / 1.1) * 0.35;
            const hGrad = ctx.createLinearGradient(0, 0, 0, 120);
            hGrad.addColorStop(0, `rgba(52, 211, 153, ${healAlpha})`);
            hGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = hGrad;
            ctx.fillRect(0, 0, W, 120);
          }

          // 12. Top HUD (HP Bar, Score, AP/FC Diamond, Song Info, Progress)
          const hasLoopBadge = Boolean(
            practiceLoopRef.current?.enabled &&
              practiceLoopRef.current.endSec > practiceLoopRef.current.startSec + 3
          );
          const rightBadgeW =
            54 +
            (isAuto ? 108 : 0) +
            (bgMediaRef.current ? 72 : 0) +
            (practiceRateRef.current !== 1.0 ? 60 : 0) +
            (hasLoopBadge ? 94 : 0);
          const apStatus: 'AP' | 'FC' | 'NONE' =
            counts.MISS > 0 || counts.BAD > 0
              ? 'NONE'
              : counts.GREAT > 0 || counts.GOOD > 0
              ? 'FC'
              : 'AP';
          drawHUD(
            ctx,
            W,
            H,
            song,
            difficulty,
            score,
            hp,
            songTime,
            audioBuffer.duration,
            rightBadgeW,
            apStatus
          );

          // 12b. In-canvas FEVER banner — bold glowing marquee during Fever
          if (lastFeverUi !== 'none') {
            const isSuper = lastFeverUi === 'super';
            const bannerY = Math.max(96, H * 0.16);
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.007);
            const label = isSuper ? '★ SUPER FEVER ★' : '✦ FEVER CHANCE ✦';
            const sub = isSuper ? '+20% SCORE' : '+10% SCORE';

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Main glowing text
            ctx.shadowColor = isSuper ? '#ff4f93' : '#fde047';
            ctx.shadowBlur = 26 + pulse * 22;
            ctx.font = '900 34px system-ui, sans-serif';
            const tg3 = ctx.createLinearGradient(geo.cx - 200, 0, geo.cx + 200, 0);
            tg3.addColorStop(0, isSuper ? '#fde047' : '#ffffff');
            tg3.addColorStop(0.5, isSuper ? '#ff4f93' : '#fde047');
            tg3.addColorStop(1, isSuper ? '#67e8f9' : '#ffffff');
            ctx.fillStyle = tg3;
            ctx.fillText(label, geo.cx, bannerY);

            // Sub label
            ctx.shadowBlur = 10;
            ctx.font = '800 13px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillText(sub, geo.cx, bannerY + 26);
            ctx.restore();
          }

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      stopAudio();
      try {
        analyser.disconnect();
      } catch {}
      if (cutinHideTimer !== null) window.clearTimeout(cutinHideTimer);
      if (finishTimer !== null) window.clearTimeout(finishTimer);
      if (milestoneHideTimer !== null) window.clearTimeout(milestoneHideTimer);
      if (videoElRef.current) {
        videoElRef.current.pause();
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (canvas) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
      }
    };
  }, [
    song,
    difficulty,
    audioBuffer,
    startFromSec,
    practiceLoop?.enabled,
    practiceLoop?.startSec,
    practiceLoop?.endSec,
    restartToken,
    onFinish,
  ]);

  const handleRestart = () => {
    setIsPaused(false);
    if (videoElRef.current) {
      try {
        videoElRef.current.pause();
        videoElRef.current.currentTime = Math.max(0, startFromSec);
      } catch {}
    }
    setRestartToken((t) => t + 1);
  };

  return (
    <div className="relative w-full h-full bg-[#0a0d1c] overflow-hidden select-none">
      {/* 2DMV Video Clip or Custom Image Background */}
      {bgMedia?.kind === 'video' && (
        <video
          ref={videoElRef}
          src={bgMedia.url}
          muted
          playsInline
          loop
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}
      {bgMedia?.kind === 'image' && (
        <img
          src={bgMedia.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}

      <canvas
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        className="relative z-[1] w-full h-full block touch-none"
      />

      {/* Diagonal PJSK Portrait Skill Cut-In Banner (stays on left margin so 4 lanes stay unobstructed) */}
      {activeCutin && (
        <div
          key={activeCutin.id}
          className="pjsk-cutin-enter pointer-events-none absolute left-2 sm:left-4 top-[88px] sm:top-24 [@media(max-height:540px)]:top-[76px] [@media(max-height:540px)]:left-2 z-10 origin-top-left scale-[0.82] sm:scale-100 [@media(max-height:540px)]:scale-[0.76]"
        >
          <div
            className="pjsk-holo-sheen flex items-center gap-3 pl-2 pr-4 py-2 rounded-2xl bg-gradient-to-r from-slate-950/92 via-slate-900/90 to-slate-900/75 backdrop-blur-md border-2 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
            style={{
              borderColor: activeCutin.card.color,
              boxShadow: `0 0 24px ${activeCutin.card.color}55`,
            }}
          >
            <div
              className="w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 bg-white shadow-lg"
              style={{ borderColor: activeCutin.card.color }}
            >
              {activeCutin.card.customImageDataUrl ? (
                <img
                  src={activeCutin.card.customImageDataUrl}
                  alt={activeCutin.card.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <MikuAvatar
                  def={
                    MIKU_AVATARS.find((a) => a.id === activeCutin.card.avatarId) ?? MIKU_AVATARS[0]
                  }
                  className="w-full h-full"
                />
              )}
            </div>
            <div className="min-w-0 skew-x-[10deg]">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70">
                {activeCutin.card.unitLabel} · LIVE SKILL
              </div>
              <div className="text-xs font-black uppercase tracking-wider text-cyan-200 truncate">
                {activeCutin.card.name}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[11px] font-black text-white">
                {activeCutin.card.skillType === 'score_up' && (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-300" /> SCORE BOOST +30%
                  </>
                )}
                {activeCutin.card.skillType === 'perfect_lock' && (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-300" /> PERFECT LOCK
                  </>
                )}
                {activeCutin.card.skillType === 'healer' && (
                  <>
                    <Heart className="w-3.5 h-3.5 text-pink-300" /> HEAL +200 HP
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fever / Super Fever Rainbow Screen Edge Frame + Top Pill */}
      {feverState !== 'none' && (
        <>
          <div
            className="pjsk-fever-edge pointer-events-none fixed inset-0 z-[4]"
            style={{
              boxShadow:
                feverState === 'super'
                  ? 'inset 0 0 38px rgba(255,79,147,0.45), inset 0 0 18px rgba(57,197,187,0.45)'
                  : 'inset 0 0 28px rgba(250,204,21,0.35)',
            }}
          />
          <div
            className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-10 px-5 py-1 rounded-full border-2 border-white/85 shadow-xl text-xs font-black tracking-widest text-white uppercase animate-bounce"
            style={{
              background:
                feverState === 'super'
                  ? 'linear-gradient(90deg, #ff4f93, #facc15, #39C5BB)'
                  : 'linear-gradient(90deg, #f59e0b, #ec4899)',
            }}
          >
            {feverState === 'super' ? '★ SUPER FEVER! (+20%) ★' : '✦ FEVER CHANCE (+10%) ✦'}
          </div>
        </>
      )}

      {/* Combo Milestone Celebration Banner (50 / 100 / 150 / 200...) */}
      {milestoneBanner && !finishBanner && (
        <div
          key={milestoneBanner.id}
          className="pointer-events-none absolute top-[120px] sm:top-[132px] [@media(max-height:540px)]:top-[68px] left-1/2 -translate-x-1/2 z-10 px-5 py-1.5 rounded-full bg-gradient-to-r from-[#39C5BB]/90 via-cyan-500/90 to-[#ff4f93]/90 border-2 border-white/85 shadow-[0_8px_24px_rgba(57,197,187,0.45)] animate-pop-in"
        >
          <span className="text-xs sm:text-sm font-black tracking-widest text-white uppercase drop-shadow">
            ✦ {milestoneBanner.combo} COMBO! ✦
          </span>
        </div>
      )}

      {/* Pause & Auto & Loop & 2DMV indicators */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        {practiceLoop?.enabled && practiceLoop.endSec > practiceLoop.startSec + 3 && (
          <div className="px-2.5 py-1.5 rounded-full bg-cyan-500/25 border border-cyan-300/70 text-cyan-100 text-[11px] font-mono font-black flex items-center gap-1 backdrop-blur-sm">
            <Repeat className="w-3.5 h-3.5" />
            LOOP ×{loopCount}
          </div>
        )}
        {practiceRate !== 1.0 && (
          <div className="px-2.5 py-1.5 rounded-full bg-indigo-500/30 border border-indigo-300/60 text-indigo-100 text-[11px] font-mono font-black">
            {practiceRate}x
          </div>
        )}
        {bgMedia && (
          <div className="px-2.5 py-1.5 rounded-full bg-pink-500/25 border border-pink-300/60 text-pink-100 text-[11px] font-black flex items-center gap-1 backdrop-blur-sm">
            <Film className="w-3.5 h-3.5" />
            {bgMedia.kind === 'video' ? '2DMV' : 'BG'}
          </div>
        )}
        {settings.autoPlay && (
          <div className="px-3 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/60 text-amber-200 text-xs font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            AUTO LIVE
          </div>
        )}
        <button
          onClick={() => togglePauseRef.current()}
          className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-white transition"
          title="Пауза (Esc) · Рестарт (R)"
        >
          <Pause className="w-5 h-5" />
        </button>
      </div>

      {/* 3 · 2 · 1 Resume Countdown Overlay */}
      {resumeCountdown !== null && !isPaused && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
          <div key={resumeCountdown} className="animate-pop-in flex flex-col items-center">
            <div className="text-[11px] font-black tracking-[0.38em] text-cyan-200 uppercase mb-1 drop-shadow">
              Приготовьтесь
            </div>
            <div
              className="text-7xl sm:text-8xl font-black italic text-white drop-shadow-[0_6px_28px_rgba(57,197,187,0.85)]"
              style={{ WebkitTextStroke: '3px rgba(15, 23, 42, 0.7)' }}
            >
              {resumeCountdown}
            </div>
          </div>
        </div>
      )}

      {/* Stage Finish Celebration Banner (2s before ResultsScreen) */}
      {finishBanner && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] animate-pop-in">
          <div
            className={`px-10 py-6 rounded-3xl border-2 shadow-2xl text-center ${
              finishBanner === 'AP'
                ? 'bg-gradient-to-r from-amber-500/85 via-fuchsia-600/85 to-cyan-500/85 border-amber-200 shadow-amber-400/40'
                : finishBanner === 'FC'
                ? 'bg-gradient-to-r from-pink-500/85 via-purple-600/85 to-cyan-500/85 border-pink-200 shadow-pink-400/40'
                : 'bg-gradient-to-r from-teal-500/85 via-cyan-600/85 to-sky-600/85 border-cyan-200 shadow-cyan-400/40'
            }`}
          >
            <div className="text-[11px] font-black tracking-[0.42em] text-white/90 uppercase mb-1">
              Project SEKAI · Stage Complete
            </div>
            <div className="text-4xl sm:text-5xl font-black italic tracking-wider text-white drop-shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
              {finishBanner === 'AP'
                ? 'ALL PERFECT!'
                : finishBanner === 'FC'
                ? 'FULL COMBO!'
                : 'SHOW CLEAR!'}
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal (fits cleanly on short landscape phones too) */}
      {isPaused && (
        <div className="absolute inset-0 z-20 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="pjsk-pause-panel w-full max-w-sm [@media(max-height:540px)]:max-w-lg rounded-2xl bg-[#151936] border border-cyan-400/35 p-5 sm:p-6 [@media(max-height:540px)]:p-4 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="text-center mb-4 [@media(max-height:540px)]:mb-2.5">
              <div className="text-xs font-bold tracking-widest text-cyan-300 uppercase mb-1">
                Пауза
              </div>
              <h2 className="text-xl [@media(max-height:540px)]:text-lg font-bold text-white truncate">{song.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {DIFFICULTY_META[difficulty].label} · Скорость нот {settings.noteSpeed.toFixed(1)}
              </p>
            </div>

            {/* Practice Playback Rate */}
            <div className="mb-3.5 [@media(max-height:540px)]:mb-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 text-center">
                Темп трека (Практика)
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[0.75, 1.0, 1.25].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setPracticeRate(r);
                      setIsPaused(false);
                      setRestartToken((t) => t + 1);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold border transition ${
                      practiceRate === r
                        ? 'bg-cyan-400/25 border-cyan-300 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 [@media(max-height:540px)]:grid-cols-2 gap-2.5">
              <button
                onClick={startResumeCountdown}
                className="w-full py-3 [@media(max-height:540px)]:py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 font-bold flex items-center justify-center gap-2 hover:brightness-110 transition"
              >
                <Play className="w-4 h-4 fill-current" /> Продолжить
              </button>
              <button
                onClick={handleRestart}
                className="w-full py-3 [@media(max-height:540px)]:py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold flex items-center justify-center gap-2 transition"
              >
                <RotateCcw className="w-4 h-4" /> Начать заново (R)
              </button>
              <button
                onClick={onOpenSettings}
                className="w-full py-3 [@media(max-height:540px)]:py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold flex items-center justify-center gap-2 transition"
              >
                <Settings className="w-4 h-4" /> Настройки
              </button>
              <button
                onClick={onExit}
                className="w-full py-3 [@media(max-height:540px)]:py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 font-semibold flex items-center justify-center gap-2 transition"
              >
                <LogOut className="w-4 h-4" /> Выйти в меню
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function drawNoteBar(
  ctx: CanvasRenderingContext2D,
  geo: { cx: number; yTop: number; yJudge: number; judgeWidth: number; topWidth: number },
  pr: { y: number; roadW: number; p: number },
  lane: number,
  width: number,
  palette: 'cyan' | 'pink' | 'green' | 'gold',
  flickDir: FlickDirection | null,
  skin: NoteSkin = 'classic',
  skipShadow = false
) {
  const x = geo.cx - pr.roadW / 2 + (lane / 12) * pr.roadW;
  const w = (width / 12) * pr.roadW;
  const h = Math.max(8, (skin === 'cyber' ? 23 : 27) * Math.max(0.32, pr.p));
  const r = skin === 'cyber' ? Math.min(5, h / 3) : Math.min(h / 2, 11);

  const skinPalettes = {
    classic: {
      cyan: { top: '#ecfeff', mid: '#39C5BB', bot: '#0284c7', border: '#ffffff', glow: 'rgba(57,197,187,0.68)' },
      pink: { top: '#fdf2f8', mid: '#ff5599', bot: '#be185d', border: '#ffffff', glow: 'rgba(255,85,153,0.68)' },
      green: { top: '#ecfdf5', mid: '#34d399', bot: '#059669', border: '#ffffff', glow: 'rgba(52,211,153,0.68)' },
      gold: { top: '#fefce8', mid: '#facc15', bot: '#d97706', border: '#ffffff', glow: 'rgba(250,204,21,0.75)' },
    },
    sakura: {
      cyan: { top: '#fff1f7', mid: '#fb7185', bot: '#e11d48', border: '#ffe4ef', glow: 'rgba(251,113,133,0.72)' },
      pink: { top: '#fdf4ff', mid: '#e879f9', bot: '#a21caf', border: '#fae8ff', glow: 'rgba(232,121,249,0.72)' },
      green: { top: '#f0fdf4', mid: '#4ade80', bot: '#16a34a', border: '#dcfce7', glow: 'rgba(74,222,128,0.68)' },
      gold: { top: '#fefce8', mid: '#fde047', bot: '#eab308', border: '#ffffff', glow: 'rgba(253,224,71,0.78)' },
    },
    cyber: {
      cyan: { top: '#e0f2fe', mid: '#00f5d4', bot: '#0369a1', border: '#67e8f9', glow: 'rgba(0,245,212,0.82)' },
      pink: { top: '#fce7f3', mid: '#ff2a85', bot: '#831843', border: '#f9a8d4', glow: 'rgba(255,42,133,0.82)' },
      green: { top: '#d1fae5', mid: '#10b981', bot: '#065f46', border: '#6ee7b7', glow: 'rgba(16,185,129,0.8)' },
      gold: { top: '#fef9c3', mid: '#f59e0b', bot: '#92400e', border: '#fde047', glow: 'rgba(245,158,11,0.85)' },
    },
    starlight: {
      cyan: { top: '#eef2ff', mid: '#818cf8', bot: '#3730a3', border: '#e0e7ff', glow: 'rgba(129,140,248,0.78)' },
      pink: { top: '#fdf2f8', mid: '#f472b6', bot: '#9d174d', border: '#fce7f3', glow: 'rgba(244,114,182,0.78)' },
      green: { top: '#ecfeff', mid: '#2dd4bf', bot: '#0f766e', border: '#ccfbf1', glow: 'rgba(45,212,191,0.75)' },
      gold: { top: '#fefce8', mid: '#fde047', bot: '#b45309', border: '#ffffff', glow: 'rgba(253,224,71,0.85)' },
    },
  };
  const colors = skinPalettes[skin][palette];

  ctx.save();
  if (!skipShadow) {
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = Math.max(5, (skin === 'cyber' ? 18 : 14) * pr.p);
  }
  const grad = ctx.createLinearGradient(0, pr.y - h / 2, 0, pr.y + h / 2);
  grad.addColorStop(0, colors.top);
  grad.addColorStop(0.45, colors.mid);
  grad.addColorStop(1, colors.bot);

  ctx.fillStyle = grad;
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = Math.max(1.1, 2.1 * pr.p);

  roundRectPath(ctx, x + 1.5, pr.y - h / 2, Math.max(4, w - 3), h, r);
  ctx.fill();
  ctx.stroke();

  // Soft glossy top prism highlight strip + skin accent
  ctx.shadowBlur = 0;
  ctx.fillStyle = skin === 'cyber' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.58)';
  roundRectPath(
    ctx,
    x + 4,
    pr.y - h * 0.32,
    Math.max(2, w - 8),
    Math.max(1.8, h * 0.28),
    Math.max(1, r * 0.4)
  );
  ctx.fill();

  if (skin === 'starlight' && w > 18) {
    const cx = x + w / 2;
    const sr = Math.max(2.5, 4.5 * pr.p);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, pr.y - sr);
    ctx.lineTo(cx + sr * 0.35, pr.y - sr * 0.35);
    ctx.lineTo(cx + sr, pr.y);
    ctx.lineTo(cx + sr * 0.35, pr.y + sr * 0.35);
    ctx.lineTo(cx, pr.y + sr);
    ctx.lineTo(cx - sr * 0.35, pr.y + sr * 0.35);
    ctx.lineTo(cx - sr, pr.y);
    ctx.lineTo(cx - sr * 0.35, pr.y - sr * 0.35);
    ctx.closePath();
    ctx.fill();
  } else if (skin === 'sakura' && w > 18) {
    const cx = x + w / 2;
    const sr = Math.max(2, 3.8 * pr.p);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - sr * 0.4, pr.y, sr * 0.65, sr * 0.38, -0.4, 0, Math.PI * 2);
    ctx.ellipse(cx + sr * 0.4, pr.y, sr * 0.65, sr * 0.38, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flick 3D Chevron Arrow above the note
  if (flickDir) {
    const cx = x + w / 2;
    const arrowSize = Math.max(7, 16 * Math.max(0.3, pr.p));
    const ay = pr.y - h * 0.9 - arrowSize * 0.65;
    ctx.save();
    ctx.translate(cx, ay);
    if (flickDir === 'left') ctx.rotate(-0.42);
    if (flickDir === 'right') ctx.rotate(0.42);

    ctx.beginPath();
    ctx.moveTo(0, -arrowSize);
    ctx.lineTo(arrowSize * 0.85, 0);
    ctx.lineTo(arrowSize * 0.36, 0);
    ctx.lineTo(arrowSize * 0.36, arrowSize * 0.55);
    ctx.lineTo(-arrowSize * 0.36, arrowSize * 0.55);
    ctx.lineTo(-arrowSize * 0.36, 0);
    ctx.lineTo(-arrowSize * 0.85, 0);
    ctx.closePath();

    ctx.fillStyle = palette === 'gold' ? '#fef08a' : skin === 'sakura' ? '#f472b6' : '#ff66aa';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.2, 2 * pr.p);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawTraceNote(
  ctx: CanvasRenderingContext2D,
  geo: { cx: number; yTop: number; yJudge: number; judgeWidth: number; topWidth: number },
  pr: { y: number; roadW: number; p: number },
  lane: number,
  width: number,
  critical: boolean,
  skin: NoteSkin = 'classic',
  skipShadow = false
) {
  const x = geo.cx - pr.roadW / 2 + (lane / 12) * pr.roadW;
  const w = (width / 12) * pr.roadW;
  const h = Math.max(4, 10 * Math.max(0.28, pr.p));
  ctx.save();
  if (!skipShadow) {
    ctx.shadowColor = critical
      ? 'rgba(250,204,21,0.7)'
      : skin === 'sakura'
      ? 'rgba(244,114,182,0.7)'
      : skin === 'starlight'
      ? 'rgba(129,140,248,0.75)'
      : 'rgba(52,211,153,0.7)';
    ctx.shadowBlur = Math.max(4, 10 * pr.p);
  }
  ctx.fillStyle = critical
    ? '#fef08a'
    : skin === 'sakura'
    ? '#fbcfe8'
    : skin === 'starlight'
    ? '#c7d2fe'
    : '#a7f3d0';
  ctx.strokeStyle = critical
    ? '#f59e0b'
    : skin === 'sakura'
    ? '#ec4899'
    : skin === 'starlight'
    ? '#6366f1'
    : '#10b981';
  ctx.lineWidth = Math.max(1, 1.5 * pr.p);
  roundRectPath(ctx, x + 2, pr.y - h / 2, Math.max(4, w - 4), h, h / 2);
  ctx.fill();
  ctx.stroke();

  const cx = x + w / 2;
  const r = Math.max(5, 9 * Math.max(0.3, pr.p));
  ctx.translate(cx, pr.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = critical
    ? '#facc15'
    : skin === 'sakura'
    ? '#f472b6'
    : skin === 'starlight'
    ? '#818cf8'
    : '#34d399';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 1.6 * pr.p);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.strokeRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  song: SongItem,
  difficulty: Difficulty,
  score: number,
  hp: number,
  songTime: number,
  duration: number,
  rightBadgeW: number,
  apStatus: 'AP' | 'FC' | 'NONE'
) {
  ctx.save();
  // Gradient song progress bar at very top
  const prog = Math.max(0, Math.min(1, songTime / Math.max(1, duration)));
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 0, W, 6);
  const pGrad = ctx.createLinearGradient(0, 0, W, 0);
  pGrad.addColorStop(0, '#33e6cc');
  pGrad.addColorStop(0.5, '#38bdf8');
  pGrad.addColorStop(1, '#ff5599');
  ctx.fillStyle = pGrad;
  ctx.fillRect(0, 0, W * prog, 6);
  // Progress head marker
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W * prog, 3, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Top-Left: Authentic Project SEKAI Score + Live Rank Panel
  const compactHud = W < 540 || H < 540;
  const hudW = compactHud ? 196 : 264;
  const hudH = compactHud ? 58 : 72;

  const hudGrad = ctx.createLinearGradient(12, 12, 12 + hudW, 12 + hudH);
  hudGrad.addColorStop(0, 'rgba(20, 28, 58, 0.9)');
  hudGrad.addColorStop(1, 'rgba(10, 14, 34, 0.92)');
  ctx.fillStyle = hudGrad;
  roundRectPath(ctx, 12, 12, hudW, hudH, 14);
  ctx.fill();

  const hEdge = ctx.createLinearGradient(12, 0, 12 + hudW, 0);
  hEdge.addColorStop(0, 'rgba(57, 197, 187, 0.9)');
  hEdge.addColorStop(0.55, 'rgba(56, 189, 248, 0.6)');
  hEdge.addColorStop(1, 'rgba(255, 79, 147, 0.8)');
  ctx.strokeStyle = hEdge;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Score Label + Live AP/FC Status Diamond + Number
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '900 9px system-ui, sans-serif';
  ctx.fillText('SCORE', 22, compactHud ? 26 : 29);

  if (apStatus !== 'NONE') {
    const dCx = 66;
    const dCy = compactHud ? 22.5 : 25.5;
    const dR = 5.5;
    ctx.save();
    ctx.translate(dCx, dCy);
    ctx.rotate(Math.PI / 4);
    if (apStatus === 'AP') {
      const apG = ctx.createLinearGradient(-dR, -dR, dR, dR);
      apG.addColorStop(0, '#fde047');
      apG.addColorStop(0.5, '#f472b6');
      apG.addColorStop(1, '#38bdf8');
      ctx.fillStyle = apG;
      ctx.shadowColor = '#f472b6';
    } else {
      ctx.fillStyle = '#ec4899';
      ctx.shadowColor = '#ec4899';
    }
    ctx.shadowBlur = 7;
    ctx.fillRect(-dR, -dR, dR * 2, dR * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-dR, -dR, dR * 2, dR * 2);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.font = '900 9px system-ui, sans-serif';
    ctx.fillStyle = apStatus === 'AP' ? '#fde047' : '#f9a8d4';
    ctx.fillText(apStatus, dCx + 10, compactHud ? 26 : 29);
  }

  ctx.save();
  ctx.shadowColor = 'rgba(56, 189, 248, 0.55)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.font = compactHud ? '900 20px ui-monospace, monospace' : '900 25px ui-monospace, monospace';
  ctx.fillText(String(Math.round(score)).padStart(7, '0'), 22, compactHud ? 47 : 55);
  ctx.restore();

  // Live Rank Badge + D→C→B→A→S segmented bar
  const liveRank =
    score >= 900000 ? 'S' : score >= 750000 ? 'A' : score >= 500000 ? 'B' : score >= 250000 ? 'C' : 'D';
  const rankColors: Record<string, string> = {
    S: '#f472b6',
    A: '#fbbf24',
    B: '#38bdf8',
    C: '#34d399',
    D: '#94a3b8',
  };
  ctx.save();
  ctx.shadowColor = rankColors[liveRank];
  ctx.shadowBlur = 14;
  ctx.fillStyle = rankColors[liveRank];
  ctx.font = compactHud ? 'italic 900 20px system-ui, sans-serif' : 'italic 900 26px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(liveRank, 12 + hudW - 12, compactHud ? 44 : 50);
  ctx.restore();

  const rankBarW = hudW - 24;
  const rankBarX = 24;
  const rankBarY = 12 + hudH - 11;
  const rankProg = Math.max(0, Math.min(1, score / 900000));
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRectPath(ctx, rankBarX, rankBarY, rankBarW, 5, 2.5);
  ctx.fill();
  const rGrad = ctx.createLinearGradient(rankBarX, 0, rankBarX + rankBarW, 0);
  rGrad.addColorStop(0, '#38bdf8');
  rGrad.addColorStop(0.55, '#fbbf24');
  rGrad.addColorStop(1, '#ff4f93');
  ctx.fillStyle = rGrad;
  if (rankProg > 0) {
    roundRectPath(ctx, rankBarX, rankBarY, rankBarW * rankProg, 5, 2.5);
    ctx.fill();
  }
  // D/C/B/A/S tick notches
  ctx.fillStyle = 'rgba(10,14,34,0.65)';
  for (const frac of [0.28, 0.55, 0.83]) {
    ctx.fillRect(rankBarX + rankBarW * frac, rankBarY, 1.5, 5);
  }

  // Top-Right: Authentic Project SEKAI LIFE / HP Meter (dynamically clears active top-right badges)
  const lifeW = compactHud ? 148 : 206;
  const lifeH = compactHud ? 26 : 30;
  const minRightSpace = 12 + hudW + 16 + lifeW + rightBadgeW + 16;
  const lifeRowClear = W >= Math.max(680, minRightSpace);
  const lifeX = lifeRowClear ? W - 14 - rightBadgeW - lifeW : W - 12 - lifeW;
  const lifeY = lifeRowClear ? 15 : 58;

  ctx.fillStyle = 'rgba(14, 20, 44, 0.88)';
  roundRectPath(ctx, lifeX, lifeY, lifeW, lifeH, 11);
  ctx.fill();
  const hpFrac = Math.max(0, Math.min(1, hp / 1000));
  ctx.strokeStyle = hpFrac > 0.25 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(244, 63, 94, 0.9)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = hpFrac > 0.25 ? '#6ee7b7' : '#fda4af';
  ctx.font = '900 9px system-ui, sans-serif';
  ctx.fillText('LIFE', lifeX + 9, lifeY + (compactHud ? 16 : 18));

  const lBarX = lifeX + 36;
  const lBarW = lifeW - 76;
  const lBarY = lifeY + (lifeH - 9) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRectPath(ctx, lBarX, lBarY, lBarW, 9, 4.5);
  ctx.fill();

  const hpGrad = ctx.createLinearGradient(lBarX, 0, lBarX + lBarW, 0);
  if (hpFrac > 0.25) {
    hpGrad.addColorStop(0, '#39C5BB');
    hpGrad.addColorStop(1, '#34d399');
  } else {
    hpGrad.addColorStop(0, '#f43f5e');
    hpGrad.addColorStop(1, '#fb923c');
  }
  ctx.fillStyle = hpGrad;
  roundRectPath(ctx, lBarX, lBarY, Math.max(4, lBarW * hpFrac), 9, 4.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRectPath(ctx, lBarX + 1, lBarY + 1, Math.max(2, lBarW * hpFrac - 2), 3, 1.5);
  ctx.fill();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 11px ui-monospace, monospace';
  ctx.fillText(String(Math.round(hp)), lifeX + lifeW - 8, lifeY + (compactHud ? 16 : 19));

  // Center/Top title pill (only when clear space exists between left Score card and right LIFE/controls)
  const diffMeta = DIFFICULTY_META[difficulty];
  const minCenterLeft = 14 + hudW + 14;
  const maxCenterRight = lifeRowClear ? lifeX - 14 : W - 14 - rightBadgeW - 10;
  const availCenterW = maxCenterRight - minCenterLeft;
  if (availCenterW >= 140) {
    const rawLabel = `${song.title}  ·  ${diffMeta.label}`;
    ctx.font = 'bold 13px system-ui, sans-serif';
    const maxTw = Math.min(340, availCenterW);
    let label = rawLabel;
    while (label.length > 8 && ctx.measureText(label).width + 32 > maxTw) {
      label = `${label.slice(0, -4)}...`;
    }
    const tw = Math.min(maxTw, ctx.measureText(label).width + 32);
    const pillCx = (minCenterLeft + maxCenterRight) * 0.5;
    ctx.fillStyle = 'rgba(13, 18, 42, 0.75)';
    roundRectPath(ctx, pillCx - tw / 2, 14, tw, 32, 16);
    ctx.fill();
    ctx.strokeStyle = diffMeta.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, pillCx, 34);
  }
  ctx.restore();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  if (Number.isNaN(n)) return [57, 197, 187];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const customAvatarImageCache = new Map<string, HTMLImageElement>();
function getCustomAvatarImage(dataUrl: string): HTMLImageElement | null {
  let img = customAvatarImageCache.get(dataUrl);
  if (!img) {
    img = new Image();
    img.src = dataUrl;
    customAvatarImageCache.set(dataUrl, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function drawMikuConcertStage(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  geo: { cx: number; yTop: number; yJudge: number; judgeWidth: number; topWidth: number },
  beatPhase: number,
  beatPulse: number,
  avatar: AvatarView,
  audioBass = 0,
  isFever = false,
  sekaiTheme: keyof typeof SEKAI_THEMES = 'stage',
  eco = false
) {
  const themeColors = SEKAI_THEMES[sekaiTheme] ?? SEKAI_THEMES.stage;
  const [hr, hg, hb] = hexToRgb(avatar.hair);
  const [tr, tg, tb] = hexToRgb(avatar.tie);
  const [sr, sg, sb] = hexToRgb(themeColors.primary);
  const bassBoost = Math.min(1, audioBass * 1.45);

  ctx.save();

  // Fever concert stage aura wash
  if (isFever) {
    const fGrad = ctx.createRadialGradient(geo.cx, geo.yTop, 30, geo.cx, H * 0.4, W * 0.72);
    fGrad.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.2 + bassBoost * 0.14})`);
    fGrad.addColorStop(0.6, `rgba(${tr}, ${tg}, ${tb}, 0.12)`);
    fGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = fGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // Glowing concert stage horizon ring behind yTop (colored by avatar + audio bass)
  const archY = geo.yTop + 10;
  const archR = Math.max(95, geo.topWidth * (1.42 + bassBoost * 0.14));

  const halo = ctx.createRadialGradient(geo.cx, archY - 18, 12, geo.cx, archY - 10, archR * 1.38);
  halo.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${0.3 + beatPulse * 0.16 + bassBoost * 0.18})`);
  halo.addColorStop(0.6, `rgba(${tr}, ${tg}, ${tb}, ${0.12 + beatPulse * 0.07})`);
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(geo.cx, archY - 12, archR * 1.38, 0, Math.PI * 2);
  ctx.fill();

  // Concert stage neon arc — double ring for depth
  ctx.save();
  if (!eco) {
    ctx.shadowColor = `rgba(${hr}, ${hg}, ${hb}, 0.85)`;
    ctx.shadowBlur = 14 + bassBoost * 14;
  }
  ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.4 + beatPulse * 0.28 + bassBoost * 0.28})`;
  ctx.lineWidth = 2.4 + bassBoost * 1.6;
  ctx.beginPath();
  ctx.arc(geo.cx, archY, archR, Math.PI * 1.04, Math.PI * 1.96);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, ${0.16 + beatPulse * 0.1})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(geo.cx, archY, archR * 1.07, Math.PI * 1.02, Math.PI * 1.98);
  ctx.stroke();
  ctx.restore();

  // Performer hologram on the stage: uploaded photo or Miku-style silhouette
  const s = Math.min(1.05, Math.max(0.55, W / 1100));
  ctx.save();
  ctx.translate(geo.cx, geo.yTop - 6);
  ctx.scale(s, s);

  const customImg = avatar.customDataUrl ? getCustomAvatarImage(avatar.customDataUrl) : null;
  if (customImg) {
    // Circular photo hologram with neon ring
    ctx.globalAlpha = 0.92;
    const r = 36;
    const cy = -40;
    const glow = ctx.createRadialGradient(0, cy, r * 0.4, 0, cy, r * 2);
    glow.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${0.5 + beatPulse * 0.2})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, cy, r * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(customImg, -r, cy - r, r * 2, r * 2);
    ctx.restore();

    ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${Math.min(1, 0.75 + beatPulse * 0.25)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, cy, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, cy, r + 7, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Stylized twin-tail silhouette in the avatar's colors
    ctx.globalAlpha = 0.28 + beatPulse * 0.1 + bassBoost * 0.08;

    // Sweeping twin-tails
    ctx.fillStyle = avatar.hair;
    ctx.beginPath();
    ctx.moveTo(-24, -44);
    ctx.bezierCurveTo(-54, -36, -68, 4, -56, 36);
    ctx.bezierCurveTo(-48, 16, -38, -10, -20, -28);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(24, -44);
    ctx.bezierCurveTo(54, -36, 68, 4, 56, 36);
    ctx.bezierCurveTo(48, 16, 38, -10, 20, -28);
    ctx.closePath();
    ctx.fill();

    // Head & torso silhouette
    ctx.beginPath();
    ctx.arc(0, -40, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-16, -18);
    ctx.lineTo(16, -18);
    ctx.lineTo(22, 18);
    ctx.lineTo(-22, 18);
    ctx.closePath();
    ctx.fill();

    // Hair-tie highlights in the avatar's accent color
    ctx.fillStyle = avatar.tie;
    ctx.fillRect(-26, -49, 7, 9);
    ctx.fillRect(19, -49, 7, 9);
  }
  ctx.restore();

  // Beat + audio-synced flanking concert equalizer bars & swaying fan penlights (лайтстики зала)
  const barCount = 10;
  const sideWidth = Math.max(0, geo.cx - geo.judgeWidth / 2 - 42);
  if (sideWidth > 36) {
    for (let i = 0; i < barCount; i++) {
      const wave = 0.3 + 0.7 * Math.abs(Math.sin(beatPhase * Math.PI + i * 0.65));
      const barH = (26 + beatPulse * 28 + bassBoost * 42) * wave;
      const barW = Math.min(10, sideWidth / (barCount * 1.8));
      const gap = barW * 0.65;
      const yBase = H * 0.78;
      const color =
        i % 3 === 0
          ? `rgba(${tr}, ${tg}, ${tb}, ${0.24 + bassBoost * 0.2})`
          : `rgba(${hr}, ${hg}, ${hb}, ${0.24 + bassBoost * 0.2})`;
      ctx.fillStyle = color;

      // Left flank equalizer
      const lx = geo.cx - geo.judgeWidth / 2 - 28 - (i + 1) * (barW + gap);
      if (lx > 10) {
        roundRectPath(ctx, lx, yBase - barH, barW, barH, 3);
        ctx.fill();
      }

      // Right flank equalizer
      const rx = geo.cx + geo.judgeWidth / 2 + 28 + i * (barW + gap);
      if (rx + barW < W - 10) {
        roundRectPath(ctx, rx, yBase - barH, barW, barH, 3);
        ctx.fill();
      }
    }

    // Audience glowsticks swaying in rhythm along the lower wings
    const penCount = Math.min(11, Math.floor(sideWidth / 24));
    for (let row = 0; row < 2; row++) {
      const rowY = H * (0.86 + row * 0.065);
      for (let i = 0; i < penCount; i++) {
        const sway = Math.sin(beatPhase * Math.PI + i * 0.45 + row * 1.1) * (0.28 + bassBoost * 0.2);
        const stickAlpha = 0.42 + beatPulse * 0.2 + (isFever ? 0.28 : 0);
        const stickColor =
          (i + row) % 3 === 0
            ? themeColors.secondary
            : (i + row) % 2 === 0
            ? themeColors.primary
            : avatar.hair;

        for (const side of [-1, 1] as const) {
          const px =
            side < 0
              ? geo.cx - geo.judgeWidth / 2 - 24 - i * (sideWidth / Math.max(1, penCount))
              : geo.cx + geo.judgeWidth / 2 + 24 + i * (sideWidth / Math.max(1, penCount));
          if (px < 12 || px > W - 12) continue;

          ctx.save();
          ctx.translate(px, rowY);
          ctx.rotate(sway);

          // Light bloom around the glowstick tip
          if (!eco) {
            const glow = ctx.createRadialGradient(0, -18, 1, 0, -18, 16);
            glow.addColorStop(0, stickColor);
            glow.addColorStop(0.35, `${stickColor}66`);
            glow.addColorStop(1, 'transparent');
            ctx.globalAlpha = Math.min(0.55, stickAlpha * 0.7);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, -18, 16, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.globalAlpha = Math.min(0.9, stickAlpha);
          if (!eco) {
            ctx.shadowColor = stickColor;
            ctx.shadowBlur = isFever ? 18 : 10;
          }
          ctx.fillStyle = stickColor;
          roundRectPath(ctx, -2, -21, 4, 21, 2);
          ctx.fill();

          // Bright hot core of the penlight
          ctx.shadowBlur = 0;
          ctx.globalAlpha = Math.min(0.95, stickAlpha + 0.2);
          ctx.fillStyle = '#ffffff';
          roundRectPath(ctx, -1, -20, 2, 6, 1);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  ctx.restore();
}

