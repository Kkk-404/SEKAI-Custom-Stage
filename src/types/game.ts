export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'master' | 'append';

export const DIFFICULTIES: Difficulty[] = [
  'easy',
  'normal',
  'hard',
  'expert',
  'master',
  'append',
];

export const DIFFICULTY_META: Record<
  Difficulty,
  {
    label: string;
    color: string;
    gradient?: string;
    bg: string;
    border: string;
    defaultLevel: number;
  }
> = {
  easy: {
    label: 'EASY',
    color: '#56cc18',
    bg: 'rgba(86, 204, 24, 0.16)',
    border: 'rgba(86, 204, 24, 0.65)',
    defaultLevel: 7,
  },
  normal: {
    label: 'NORMAL',
    color: '#2aa2ff',
    bg: 'rgba(42, 162, 255, 0.16)',
    border: 'rgba(42, 162, 255, 0.65)',
    defaultLevel: 13,
  },
  hard: {
    label: 'HARD',
    color: '#f5a100',
    bg: 'rgba(245, 161, 0, 0.16)',
    border: 'rgba(245, 161, 0, 0.65)',
    defaultLevel: 19,
  },
  expert: {
    label: 'EXPERT',
    color: '#ee3e6b',
    bg: 'rgba(238, 62, 107, 0.16)',
    border: 'rgba(238, 62, 107, 0.65)',
    defaultLevel: 25,
  },
  master: {
    label: 'MASTER',
    color: '#b036ff',
    bg: 'rgba(176, 54, 255, 0.16)',
    border: 'rgba(176, 54, 255, 0.65)',
    defaultLevel: 30,
  },
  append: {
    label: 'APPEND',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ff5599 0%, #39C5BB 50%, #a855f7 100%)',
    bg: 'rgba(236, 72, 153, 0.18)',
    border: 'rgba(57, 197, 187, 0.75)',
    defaultLevel: 33,
  },
};

/** Interface appearance is independent of the concert world and note colours. */
export type ResolvedAppTheme = 'light' | 'pink' | 'mint' | 'gold' | 'dark' | 'cyber';
export type AppTheme = ResolvedAppTheme | 'system';

export type SekaiTheme = 'stage' | 'vivid' | 'nightcord';

export type GraphicsQuality = 'auto' | 'high' | 'eco';

export type HapticsMode = 'accents' | 'all';

export type SoundPack = 'crystal' | 'arcade' | 'soft';

export const SOUND_PACKS: Record<
  SoundPack,
  { label: string; desc: string }
> = {
  crystal: {
    label: 'Хрустальный',
    desc: 'Фирменный звонкий отклик SEKAI',
  },
  arcade: {
    label: 'Аркадный',
    desc: 'Яркий ритм-синтезатор и клик',
  },
  soft: {
    label: 'Мягкий',
    desc: 'Тёплая маримба и нежный удар',
  },
};

export type NoteSkin = 'classic' | 'sakura' | 'cyber' | 'starlight';

export const NOTE_SKINS: Record<
  NoteSkin,
  { label: string; desc: string; previewColors: [string, string, string] }
> = {
  classic: {
    label: 'Классика SEKAI',
    desc: 'Бирюза, розовый и золото',
    previewColors: ['#39C5BB', '#ff5599', '#facc15'],
  },
  sakura: {
    label: 'Сакура / Пастель',
    desc: 'Лепестки сакуры и нежный мёд',
    previewColors: ['#ff85b3', '#5eead4', '#fde047'],
  },
  cyber: {
    label: 'Неон Кибер',
    desc: 'Ультра-неон и лазеры',
    previewColors: ['#00f5d4', '#ff007f', '#38bdf8'],
  },
  starlight: {
    label: 'Звёздный свет',
    desc: 'Звёзды, индиго и сияние',
    previewColors: ['#818cf8', '#f472b6', '#fcd34d'],
  },
};

export const SEKAI_THEMES: Record<
  SekaiTheme,
  { label: string; subtitle: string; primary: string; secondary: string }
> = {
  stage: {
    label: 'Stage SEKAI',
    subtitle: 'Светлая сцена Мику',
    primary: '#39C5BB',
    secondary: '#ff4f93',
  },
  vivid: {
    label: 'Vivid Street',
    subtitle: 'Неоновый стрит-вайб',
    primary: '#00e5ff',
    secondary: '#ff2e93',
  },
  nightcord: {
    label: 'Empty SEKAI',
    subtitle: 'Ночной Nightcord 25:00',
    primary: '#a78bfa',
    secondary: '#38bdf8',
  },
};

export type SekaiTag =
  | 'custom'
  | 'virtual_singer'
  | 'leoneed'
  | 'mmj'
  | 'vbs'
  | 'wxs'
  | 'n25';

export const SEKAI_TAGS: Record<SekaiTag, { label: string; color: string }> = {
  custom: { label: 'Моё', color: '#ff4f93' },
  virtual_singer: { label: 'Virtual Singer', color: '#39C5BB' },
  leoneed: { label: 'Leo/need', color: '#4455dd' },
  mmj: { label: 'MORE MORE JUMP!', color: '#66dd11' },
  vbs: { label: 'Vivid BAD SQUAD', color: '#ee1166' },
  wxs: { label: 'Wonderlands×Showtime', color: '#ff9900' },
  n25: { label: 'Nightcord at 25:00', color: '#884499' },
};

export type SkillType = 'score_up' | 'perfect_lock' | 'healer';

export interface TeamCard {
  id: string;
  name: string;
  unitLabel: string;
  skillType: SkillType;
  color: string;
  avatarId?: string;
  customImageDataUrl?: string | null;
}

export const DEFAULT_TEAM_CARDS: TeamCard[] = [
  {
    id: 'card_1',
    name: 'Hatsune Miku',
    unitLabel: 'VIRTUAL SINGER',
    skillType: 'score_up',
    color: '#39C5BB',
    avatarId: 'classic_01',
  },
  {
    id: 'card_2',
    name: 'Sakura Miku',
    unitLabel: 'STAGE SEKAI',
    skillType: 'healer',
    color: '#ff6ea8',
    avatarId: 'sakura',
  },
  {
    id: 'card_3',
    name: 'Nightcord Miku',
    unitLabel: '25:00 SEKAI',
    skillType: 'perfect_lock',
    color: '#8b5cf6',
    avatarId: 'nightcord',
  },
  {
    id: 'card_4',
    name: 'Vivid Miku',
    unitLabel: 'STREET SEKAI',
    skillType: 'score_up',
    color: '#ec4899',
    avatarId: 'vivid',
  },
  {
    id: 'card_5',
    name: 'Snow Miku',
    unitLabel: 'WINTER LIVE',
    skillType: 'perfect_lock',
    color: '#38bdf8',
    avatarId: 'snow',
  },
];

export type FlickDirection = 'up' | 'left' | 'right';
export type SlideEase = 'linear' | 'in' | 'out' | 'sine';

export interface PracticeLoopConfig {
  enabled: boolean;
  startSec: number;
  endSec: number;
}

/** Выбранный аватар: id встроенной Мику ('classic_01'...) или 'custom' со своим фото */
export interface AvatarSelection {
  id: string;
  customDataUrl?: string | null;
}

export interface TapNote {
  id: string;
  type: 'tap';
  beat: number;
  lane: number; // 0..11
  width: number; // 1..12
  critical: boolean;
}

export interface FlickNote {
  id: string;
  type: 'flick';
  beat: number;
  lane: number;
  width: number;
  critical: boolean;
  direction: FlickDirection;
}

export interface TraceNote {
  id: string;
  type: 'trace';
  beat: number;
  lane: number;
  width: number;
  critical: boolean;
}

export interface SlidePoint {
  id: string;
  beat: number;
  lane: number; // 0..11
  width: number; // 1..12
  ease: SlideEase;
  kind: 'start' | 'tick' | 'attach' | 'end';
}

export interface SlideNote {
  id: string;
  type: 'slide';
  critical: boolean;
  points: SlidePoint[]; // sorted by beat, length >= 2
  endFlick?: FlickDirection | null;
}

export type ChartNote = TapNote | FlickNote | TraceNote | SlideNote;

export interface BpmChange {
  beat: number;
  bpm: number;
}

export interface Chart {
  difficulty: Difficulty;
  level: number;
  notes: ChartNote[];
}

export interface HighScoreRecord {
  score: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
  fullCombo: boolean;
  allPerfect: boolean;
  cleared: boolean;
  updatedAt: number;
}

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  bpmChanges?: BpmChange[];
  offsetMs: number; // time of beat 0 in ms
  durationSec: number;
  coverDataUrl?: string;
  favorite?: boolean;
  tag?: SekaiTag;
  bgKind?: 'video' | 'image';
  bgDim?: number; // 0.2..0.9 (default 0.55)
  isBuiltin?: boolean;
  builtinId?: string;
  analyzerVersion?: number;
  chartEdited?: boolean;
  charts: Partial<Record<Difficulty, Chart>>;
  highScores?: Partial<Record<Difficulty, HighScoreRecord>>;
  createdAt: number;
}

export type JudgmentType = 'PERFECT' | 'GREAT' | 'GOOD' | 'BAD' | 'MISS';

export interface HitOffsetPoint {
  progress: number; // 0..1 across song duration
  ms: number;       // signed timing delta (<0 fast, >0 late)
  judgment: JudgmentType;
}

export interface PlayResult {
  songId: string;
  difficulty: Difficulty;
  score: number;
  maxPossibleScore: number;
  maxCombo: number;
  totalNotes: number;
  counts: Record<JudgmentType, number>;
  fastCount: number;
  lateCount: number;
  hitTimeline?: HitOffsetPoint[];
  hpRemaining: number;
  cleared: boolean;
  fullCombo: boolean;
  allPerfect: boolean;
  autoPlayUsed: boolean;
  practiceLoopUsed?: boolean;
  earnedCrystals?: number;
  newlyCompletedMissions?: string[];
}

export interface AvatarFrameDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  ringClass: string;
  badgeColor: string;
}

export const AVATAR_FRAMES: AvatarFrameDef[] = [
  {
    id: 'frame_classic',
    name: 'Miku Бирюза',
    desc: 'Базовая неоновая рамка SEKAI',
    cost: 0,
    ringClass: 'ring-2 ring-[#39C5BB]/70',
    badgeColor: '#39C5BB',
  },
  {
    id: 'frame_sakura',
    name: 'Сакура Весна',
    desc: 'Нежное розово-персиковое сияние',
    cost: 120,
    ringClass: 'ring-[3px] ring-[#ff6ea8] shadow-[0_0_16px_rgba(255,110,168,0.45)]',
    badgeColor: '#ff6ea8',
  },
  {
    id: 'frame_gold',
    name: 'Звёздный Idol',
    desc: 'Золотая корона за мастерство',
    cost: 200,
    ringClass: 'ring-[3px] ring-amber-400 shadow-[0_0_18px_rgba(250,204,21,0.5)]',
    badgeColor: '#f59e0b',
  },
  {
    id: 'frame_nightcord',
    name: 'Nightcord 25:00',
    desc: 'Глубокое фиолетовое свечение',
    cost: 220,
    ringClass: 'ring-[3px] ring-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.55)]',
    badgeColor: '#8b5cf6',
  },
  {
    id: 'frame_prism',
    name: 'Призма APPEND',
    desc: 'Радужный контур виртуальной дивы',
    cost: 350,
    ringClass: 'ring-[3px] ring-cyan-300 shadow-[0_0_20px_rgba(56,189,248,0.6)]',
    badgeColor: '#38bdf8',
  },
];

export interface PlayerTitleDef {
  id: string;
  label: string;
  desc: string;
  cost: number;
  gradient: string;
}

export const PLAYER_TITLES: PlayerTitleDef[] = [
  {
    id: 'title_newcomer',
    label: 'Гость Stage SEKAI',
    desc: 'Стартовый титул живого концерта',
    cost: 0,
    gradient: 'from-[#39C5BB] to-[#38bdf8]',
  },
  {
    id: 'title_rhythm_fan',
    label: 'Ловец Битов',
    desc: 'Для тех, кто чувствует каждый такт',
    cost: 80,
    gradient: 'from-cyan-500 to-emerald-400',
  },
  {
    id: 'title_sakura_idol',
    label: 'Сакура на Сцене',
    desc: 'Нежный и яркий титул сцены',
    cost: 150,
    gradient: 'from-pink-500 to-rose-400',
  },
  {
    id: 'title_night_echo',
    label: 'Эхо 25:00',
    desc: 'Таинственный ночной вайб',
    cost: 180,
    gradient: 'from-violet-500 to-indigo-500',
  },
  {
    id: 'title_combo_queen',
    label: 'Мастер Full Combo',
    desc: 'Безупречная серия без единого срыва',
    cost: 260,
    gradient: 'from-amber-400 via-pink-500 to-cyan-400',
  },
  {
    id: 'title_miku_diva',
    label: 'Виртуальная Дива 39',
    desc: 'Легендарный титул мира Хацунэ Мику',
    cost: 400,
    gradient: 'from-[#39C5BB] via-[#a855f7] to-[#ff4f93]',
  },
];

export interface CollectibleCardDef {
  card: TeamCard;
  cost: number;
  rarity: '3★' | '4★';
  desc: string;
}

export const COLLECTIBLE_CARDS: CollectibleCardDef[] = [
  {
    card: {
      id: 'col_idol_miku',
      name: 'Stage Idol Miku',
      unitLabel: 'MORE MORE STAGE',
      skillType: 'score_up',
      color: '#39C5BB',
      avatarId: 'classic_01',
    },
    cost: 160,
    rarity: '4★',
    desc: 'Ослепительный буст счёта на главном припеве',
  },
  {
    card: {
      id: 'col_sakura_blossom',
      name: 'Blooming Sakura Miku',
      unitLabel: 'SPRING LIVE',
      skillType: 'healer',
      color: '#ff6ea8',
      avatarId: 'sakura',
    },
    cost: 140,
    rarity: '3★',
    desc: 'Лечит +200 HP и украшает сцену лепестками',
  },
  {
    card: {
      id: 'col_cyber_diva',
      name: 'Cyber Neon Miku',
      unitLabel: 'VIVID STAGE',
      skillType: 'perfect_lock',
      color: '#06b6d4',
      avatarId: 'vivid',
    },
    cost: 220,
    rarity: '4★',
    desc: 'Превращает неточные нажатия в чистый PERFECT',
  },
  {
    card: {
      id: 'col_moon_n25',
      name: 'Moonlight 25:00 Miku',
      unitLabel: 'EMPTY SEKAI',
      skillType: 'perfect_lock',
      color: '#8b5cf6',
      avatarId: 'nightcord',
    },
    cost: 240,
    rarity: '4★',
    desc: 'Стабилизирует сложные потоки 16-х нот',
  },
  {
    card: {
      id: 'col_crystal_snow',
      name: 'Crystal Snow Miku',
      unitLabel: 'WINTER SYMPHONY',
      skillType: 'healer',
      color: '#38bdf8',
      avatarId: 'snow',
    },
    cost: 190,
    rarity: '4★',
    desc: 'Оберегает HP на марафонах Master / Append',
  },
  {
    card: {
      id: 'col_append_prism',
      name: 'Append Prism Miku',
      unitLabel: '39TH ANNIVERSARY',
      skillType: 'score_up',
      color: '#ec4899',
      avatarId: 'classic_02',
    },
    cost: 320,
    rarity: '4★',
    desc: 'Редкая юбилейная карта максимального блеска',
  },
];

export interface SekaiMissionDef {
  id: string;
  title: string;
  desc: string;
  rewardCrystals: number;
  target: number;
  metric:
    | 'totalClears'
    | 'totalFullCombos'
    | 'totalAllPerfects'
    | 'expertPlusClears'
    | 'rankSClears'
    | 'customSongsUploaded';
}

export const SEKAI_MISSIONS: SekaiMissionDef[] = [
  {
    id: 'm_first_live',
    title: 'Первый выход на сцену',
    desc: 'Пройди любую песню до конца (без Auto Live)',
    rewardCrystals: 120,
    target: 1,
    metric: 'totalClears',
  },
  {
    id: 'm_five_lives',
    title: 'Звезда концертов',
    desc: 'Пройди 5 песен в режиме Live',
    rewardCrystals: 220,
    target: 5,
    metric: 'totalClears',
  },
  {
    id: 'm_fifteen_lives',
    title: 'Легенда SEKAI',
    desc: 'Пройди 15 песен в режиме Live',
    rewardCrystals: 400,
    target: 15,
    metric: 'totalClears',
  },
  {
    id: 'm_first_fc',
    title: 'Безупречная серия!',
    desc: 'Получи свой первый Full Combo',
    rewardCrystals: 250,
    target: 1,
    metric: 'totalFullCombos',
  },
  {
    id: 'm_first_ap',
    title: 'Абсолютный слух',
    desc: 'Сделай All Perfect на любой сложности',
    rewardCrystals: 500,
    target: 1,
    metric: 'totalAllPerfects',
  },
  {
    id: 'm_expert_clear',
    title: 'Покоритель Expert / Master',
    desc: 'Пройди песню на Expert, Master или Append',
    rewardCrystals: 280,
    target: 1,
    metric: 'expertPlusClears',
  },
  {
    id: 'm_rank_s',
    title: 'Сияние ранга S',
    desc: 'Набери точность 92%+ (ранг S или S+) 3 раза',
    rewardCrystals: 260,
    target: 3,
    metric: 'rankSClears',
  },
  {
    id: 'm_custom_song',
    title: 'Свой продюсер',
    desc: 'Загрузи хотя бы 1 свою песню в библиотеку',
    rewardCrystals: 180,
    target: 1,
    metric: 'customSongsUploaded',
  },
];

export interface PlayerProgression {
  crystals: number;
  totalClears: number;
  totalFullCombos: number;
  totalAllPerfects: number;
  expertPlusClears: number;
  rankSClears: number;
  customSongsUploaded: number;
  unlockedFrameIds: string[];
  activeFrameId: string;
  unlockedTitleIds: string[];
  activeTitleId: string;
  unlockedCardIds: string[];
  claimedMissionIds: string[];
}

export const DEFAULT_PROGRESSION: PlayerProgression = {
  crystals: 150,
  totalClears: 0,
  totalFullCombos: 0,
  totalAllPerfects: 0,
  expertPlusClears: 0,
  rankSClears: 0,
  customSongsUploaded: 0,
  unlockedFrameIds: ['frame_classic'],
  activeFrameId: 'frame_classic',
  unlockedTitleIds: ['title_newcomer'],
  activeTitleId: 'title_newcomer',
  unlockedCardIds: DEFAULT_TEAM_CARDS.map((c) => c.id),
  claimedMissionIds: [],
};

export interface GameSettings {
  appTheme: AppTheme;
  highContrast: boolean;
  reduceMotion: boolean;
  noteSpeed: number; // 1.0 - 12.0 (default 8.5)
  audioOffsetMs: number; // -200..200
  musicVolume: number; // 0..1
  seVolume: number; // 0..1
  laneOpacity: number; // 0.4..1.0
  showKeyHints: boolean;
  showFastLate: boolean;
  autoPlay: boolean;
  noFail: boolean;
  keyboardFlickAssist: boolean;
  mirrorChart: boolean;
  sekaiTheme: SekaiTheme;
  autoThemeByTag: boolean;
  noteSkin: NoteSkin;
  enableSkills: boolean;
  tileHitSound: boolean;
  soundPack: SoundPack;
  menuPreviewEnabled: boolean;
  graphicsQuality: GraphicsQuality;
  hapticsEnabled: boolean;
  hapticsMode: HapticsMode;
  keyBindings: [string, string, string, string];
}

export const DEFAULT_SETTINGS: GameSettings = {
  appTheme: 'system',
  highContrast: false,
  reduceMotion: false,
  noteSpeed: 8.5,
  audioOffsetMs: 0,
  musicVolume: 0.85,
  seVolume: 0.0,
  laneOpacity: 0.88,
  showKeyHints: true,
  showFastLate: true,
  autoPlay: false,
  noFail: false,
  keyboardFlickAssist: true,
  mirrorChart: false,
  sekaiTheme: 'stage',
  autoThemeByTag: true,
  noteSkin: 'classic',
  enableSkills: true,
  tileHitSound: false,
  soundPack: 'crystal',
  menuPreviewEnabled: true,
  graphicsQuality: 'auto',
  hapticsEnabled: true,
  hapticsMode: 'accents',
  keyBindings: ['d', 'f', 'j', 'k'],
};

export function beatToTimeSec(
  beat: number,
  bpm: number,
  offsetMs: number,
  bpmChanges?: BpmChange[]
): number {
  const baseSec = offsetMs / 1000;
  if (!bpmChanges || bpmChanges.length === 0) {
    return baseSec + (beat * 60) / bpm;
  }
  const sorted = [...bpmChanges].sort((a, b) => a.beat - b.beat);
  let currentBeat = 0;
  let currentBpm = bpm;
  let elapsed = baseSec;

  for (const chg of sorted) {
    if (beat <= chg.beat) {
      return elapsed + ((beat - currentBeat) * 60) / currentBpm;
    }
    elapsed += ((chg.beat - currentBeat) * 60) / currentBpm;
    currentBeat = chg.beat;
    currentBpm = chg.bpm;
  }
  return elapsed + ((beat - currentBeat) * 60) / currentBpm;
}

export function timeSecToBeat(
  timeSec: number,
  bpm: number,
  offsetMs: number,
  bpmChanges?: BpmChange[]
): number {
  const baseSec = offsetMs / 1000;
  if (!bpmChanges || bpmChanges.length === 0) {
    return ((timeSec - baseSec) * bpm) / 60;
  }
  const sorted = [...bpmChanges].sort((a, b) => a.beat - b.beat);
  let currentBeat = 0;
  let currentBpm = bpm;
  let elapsed = baseSec;

  for (const chg of sorted) {
    const segEndTime = elapsed + ((chg.beat - currentBeat) * 60) / currentBpm;
    if (timeSec <= segEndTime) {
      return currentBeat + ((timeSec - elapsed) * currentBpm) / 60;
    }
    elapsed = segEndTime;
    currentBeat = chg.beat;
    currentBpm = chg.bpm;
  }
  return currentBeat + ((timeSec - elapsed) * currentBpm) / 60;
}

export function uid(prefix = 'n'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}
