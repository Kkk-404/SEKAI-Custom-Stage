import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  Camera,
  Check,
  Crown,
  Disc3,
  Download,
  Edit3,
  Film,
  Gem,
  Headphones,
  Heart,
  HelpCircle,
  LayoutGrid,
  List,
  Menu,
  Minus,
  Music,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { analyzeAudioBuffer, generateAllDifficulties } from './audio/analyzer';
import { triggerUiTapHaptic } from './utils/haptics';
import { APP_THEME_ORDER, APP_THEMES, useAppAppearance } from './theme/appearance';
import { ThemeMiniPreview } from './components/AppearancePanel';
import { createBuiltinDemos } from './audio/demoGenerator';
import { findBestPreviewStart, soundEngine } from './audio/soundEngine';
import { AnimatedBackdrop } from './components/AnimatedBackdrop';
import { AvatarFace, MIKU_AVATARS, MikuAvatar, resolveAvatar } from './components/Avatars';
import { MikuEmblem, MikuStageIllustration, UnitIcon } from './components/MikuArtwork';

const AvatarPicker = lazy(() =>
  import('./components/AvatarPicker').then((m) => ({ default: m.AvatarPicker }))
);
const ChartEditor = lazy(() =>
  import('./components/ChartEditor').then((m) => ({ default: m.ChartEditor }))
);
const GameCanvas = lazy(() =>
  import('./components/GameCanvas').then((m) => ({ default: m.GameCanvas }))
);
const MissionsModal = lazy(() =>
  import('./components/MissionsModal').then((m) => ({ default: m.MissionsModal }))
);
const ResultsScreen = lazy(() =>
  import('./components/ResultsScreen').then((m) => ({ default: m.ResultsScreen }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const SongCoverModal = lazy(() =>
  import('./components/SongCoverModal').then((m) => ({ default: m.SongCoverModal }))
);
const TeamModal = lazy(() =>
  import('./components/TeamModal').then((m) => ({ default: m.TeamModal }))
);
const UploadSongModal = lazy(() =>
  import('./components/UploadSongModal').then((m) => ({ default: m.UploadSongModal }))
);
import {
  applyLiveResultToProgression,
  deleteStoredSong,
  evaluateMissionsOnProgression,
  exportSongPackage,
  exportSongsPack,
  getAllStoredSongs,
  loadAvatar,
  loadProgression,
  loadSettings,
  loadSongAudio,
  loadTeamCards,
  parseSongsPack,
  saveAvatar,
  saveProgression,
  saveSettings,
  saveSongAudio,
  saveSongBgMedia,
  saveSongMetadata,
  saveTeamCards,
} from './storage/db';
import {
  AvatarSelection,
  Chart,
  DIFFICULTIES,
  DIFFICULTY_META,
  Difficulty,
  GameSettings,
  HighScoreRecord,
  PLAYER_TITLES,
  PlayResult,
  PlayerProgression,
  PracticeLoopConfig,
  SEKAI_TAGS,
  SekaiTag,
  SekaiTheme,
  SongItem,
  TeamCard,
} from './types/game';

type ScreenMode = 'menu' | 'playing' | 'results' | 'editor';
type LibraryFilter = 'all' | 'fav' | 'custom' | 'demo';
type SortMode = 'recent' | 'title' | 'bpm' | 'score';

function getRecordGrade(rec?: HighScoreRecord): string | null {
  if (!rec || !rec.cleared) return null;
  if (rec.allPerfect) return 'S+';
  const total = rec.perfect + rec.great + rec.good + rec.bad + rec.miss;
  const acc =
    total > 0
      ? ((rec.perfect + rec.great * 0.7 + rec.good * 0.5 + rec.bad * 0.1) / total) * 100
      : 100;
  if (acc >= 92) return 'S';
  if (acc >= 82) return 'A';
  if (acc >= 70) return 'B';
  return 'C';
}

export function App() {
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string>('');
  const [selectedDiff, setSelectedDiff] = useState<Difficulty>('expert');
  const [screen, setScreen] = useState<ScreenMode>('menu');
  const [playStartSec, setPlayStartSec] = useState<number>(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [libFilter, setLibFilter] = useState<LibraryFilter>('all');
  const [tagFilter, setTagFilter] = useState<'all' | SekaiTag>('all');
  const [sortBy, setSortBy] = useState<SortMode>('recent');

  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const resolvedAppTheme = useAppAppearance(settings);
  const [avatar, setAvatar] = useState<AvatarSelection>(() => loadAvatar());
  const [teamCards, setTeamCards] = useState<TeamCard[]>(() => loadTeamCards());
  const [progression, setProgression] = useState<PlayerProgression>(() => loadProgression());
  const [showUpload, setShowUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'appearance' | 'live'>('appearance');
  const openSettings = (section: 'appearance' | 'live' = 'live') => {
    setSettingsSection(section);
    setShowSettings(true);
    setShowHeaderMenu(false);
  };
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showMissionsModal, setShowMissionsModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [mobileTab, setMobileTab] = useState<'songs' | 'stage'>('songs');
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const packImportRef = useRef<HTMLInputElement>(null);
  const [editingCoverSong, setEditingCoverSong] = useState<SongItem | null>(null);
  const avatarView = resolveAvatar(avatar);
  const [lastResult, setLastResult] = useState<PlayResult | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [packBusyMsg, setPackBusyMsg] = useState<string | null>(null);
  const [listViewMode, setListViewMode] = useState<'wheel' | 'grid'>('wheel');
  const [musicStartCurtain, setMusicStartCurtain] = useState<{
    song: SongItem;
    diff: Difficulty;
    startSec: number;
    buf: AudioBuffer;
  } | null>(null);
  const curtainTimerRef = useRef<number | null>(null);
  const [splashPhase, setSplashPhase] = useState<'active' | 'exiting' | 'done'>('active');
  const splashTimersRef = useRef<number[]>([]);

  useEffect(() => {
    if (splashPhase !== 'active') return;
    const t1 = window.setTimeout(() => setSplashPhase('exiting'), 2350);
    const t2 = window.setTimeout(() => setSplashPhase('done'), 2780);
    splashTimersRef.current = [t1, t2];
    return () => {
      splashTimersRef.current.forEach((id) => window.clearTimeout(id));
      splashTimersRef.current = [];
    };
  }, [splashPhase]);

  const dismissSplash = () => {
    if (splashPhase !== 'active') return;
    userInteractedRef.current = true;
    soundEngine.getContext().resume().catch(() => {});
    splashTimersRef.current.forEach((id) => window.clearTimeout(id));
    setSplashPhase('exiting');
    const tDone = window.setTimeout(() => setSplashPhase('done'), 420);
    splashTimersRef.current = [tDone];
  };

  const [practiceLoop, setPracticeLoop] = useState<PracticeLoopConfig>({
    enabled: false,
    startSec: 20,
    endSec: 45,
  });
  const [showLoopEditor, setShowLoopEditor] = useState(false);
  const [showNotesGuide, setShowNotesGuide] = useState(false);
  const [showThemePopover, setShowThemePopover] = useState(false);
  const themePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showThemePopover) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!themePopoverRef.current?.contains(event.target as Node)) setShowThemePopover(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowThemePopover(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showThemePopover]);

  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const previewReqIdRef = useRef(0);
  const userInteractedRef = useRef(false);
  const previewStartCacheRef = useRef<Map<string, number>>(new Map());

  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const [activeAudioBuffer, setActiveAudioBuffer] = useState<AudioBuffer | null>(null);

  const handleProfileRestored = async () => {
    setAvatar(loadAvatar());
    setTeamCards(loadTeamCards());
    setProgression(loadProgression());
    const stored = await getAllStoredSongs();
    const storedMap = new Map(stored.map((s) => [s.id, s]));
    setSongs((prev) => prev.map((s) => storedMap.get(s.id) ?? s));
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || screen === 'playing') return;
    let removeListener: (() => void) | undefined;
    CapApp.addListener('backButton', () => {
      if (showThemePopover) {
        setShowThemePopover(false);
        return;
      }
      if (showHeaderMenu) {
        setShowHeaderMenu(false);
        return;
      }
      if (showNotesGuide) {
        setShowNotesGuide(false);
        return;
      }
      if (showSettings) {
        setShowSettings(false);
        return;
      }
      if (showMissionsModal) {
        setShowMissionsModal(false);
        return;
      }
      if (showTeamModal) {
        setShowTeamModal(false);
        return;
      }
      if (showAvatarPicker) {
        setShowAvatarPicker(false);
        return;
      }
      if (showUpload) {
        setShowUpload(false);
        return;
      }
      if (editingCoverSong) {
        setEditingCoverSong(null);
        return;
      }
      if (screen === 'editor' || screen === 'results') {
        setScreen('menu');
        return;
      }
      CapApp.minimizeApp().catch(() => {});
    }).then((h) => {
      removeListener = () => h.remove();
    });
    return () => {
      removeListener?.();
    };
  }, [
    screen,
    showThemePopover,
    showHeaderMenu,
    showNotesGuide,
    showSettings,
    showMissionsModal,
    showTeamModal,
    showAvatarPicker,
    showUpload,
    editingCoverSong,
  ]);

  useEffect(() => {
    if (!showHeaderMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!headerMenuRef.current?.contains(event.target as Node)) setShowHeaderMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowHeaderMenu(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showHeaderMenu]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const ctx = soundEngine.getContext();
      const demos = createBuiltinDemos(ctx);
      for (const d of demos) {
        bufferCacheRef.current.set(d.song.id, d.buffer);
      }

      const stored = await getAllStoredSongs();
      const storedMap = new Map(stored.map((s) => [s.id, s]));

      const mergedDemos = demos.map((d) => {
        const cached = storedMap.get(d.song.id);
        if (!cached) return d.song;
        if (cached.createdAt < d.song.createdAt) {
          return {
            ...cached,
            charts: d.song.charts,
            createdAt: d.song.createdAt,
          };
        }
        return cached;
      });
      const userSongs = stored
        .filter((s) => !s.isBuiltin)
        .sort((a, b) => b.createdAt - a.createdAt);

      const all = [...userSongs, ...mergedDemos];
      if (!mounted) return;
      setSongs(all);
      if (all.length > 0) {
        setSelectedSongId(all[0].id);
      }

      // Automatically re-analyze / upgrade pre-v4 custom songs to 4-lane Colorful Stage density
      for (const us of userSongs) {
        if ((us.analyzerVersion ?? 1) < 4 && !us.chartEdited) {
          try {
            const raw = await loadSongAudio(us.id);
            if (!raw || !mounted) continue;
            const decoded = await soundEngine.decodeAudioData(raw);
            bufferCacheRef.current.set(us.id, decoded);
            const analysis = analyzeAudioBuffer(decoded);
            const charts = generateAllDifficulties(analysis, analysis.bpm, analysis.offsetMs);
            const upgraded: SongItem = {
              ...us,
              bpm: analysis.bpm,
              offsetMs: analysis.offsetMs,
              analyzerVersion: 4,
              charts,
            };
            await saveSongMetadata(upgraded);
            if (mounted) {
              setSongs((prev) => prev.map((item) => (item.id === upgraded.id ? upgraded : item)));
            }
          } catch {
            // Skip unreadable audio safely
          }
        }
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = songs.filter((s) => {
      if (libFilter === 'fav' && !s.favorite) return false;
      if (libFilter === 'custom' && s.isBuiltin) return false;
      if (libFilter === 'demo' && !s.isBuiltin) return false;
      if (tagFilter !== 'all' && (s.tag ?? (s.isBuiltin ? 'virtual_singer' : 'custom')) !== tagFilter) {
        return false;
      }
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'ru');
      if (sortBy === 'bpm') return b.bpm - a.bpm;
      if (sortBy === 'score') {
        const sa = a.highScores?.[selectedDiff]?.score ?? 0;
        const sb = b.highScores?.[selectedDiff]?.score ?? 0;
        return sb - sa;
      }
      return b.createdAt - a.createdAt;
    });
  }, [songs, searchQuery, libFilter, tagFilter, sortBy, selectedDiff]);

  const selectedSong = useMemo(
    () => songs.find((s) => s.id === selectedSongId) ?? filteredSongs[0] ?? songs[0] ?? null,
    [songs, filteredSongs, selectedSongId]
  );

  const customCount = useMemo(() => songs.filter((s) => !s.isBuiltin).length, [songs]);

  const updateSettings = (next: GameSettings) => {
    setSettings(next);
    saveSettings(next);
    soundEngine.setVolumes(next.musicVolume, next.seVolume);
    soundEngine.setSoundPack(next.soundPack ?? 'crystal');
    if (!next.menuPreviewEnabled) {
      stopPreview();
    } else {
      soundEngine.setMenuPreviewVolume(next.musicVolume * 0.65);
    }
  };

  const updateProgression = (next: PlayerProgression) => {
    setProgression(next);
    saveProgression(next);
  };

  const handleAvatarSelect = (next: AvatarSelection) => {
    setAvatar(next);
    saveAvatar(next);
  };

  const stopPreview = () => {
    previewReqIdRef.current++;
    soundEngine.stopMenuPreview();
    setPreviewPlayingId(null);
  };

  useEffect(() => {
    return () => stopPreview();
  }, []);

  // Unlock menu preview after first user interaction
  useEffect(() => {
    const unlock = () => {
      userInteractedRef.current = true;
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const ensureAudioBuffer = async (song: SongItem, silent = false): Promise<AudioBuffer | null> => {
    const cached = bufferCacheRef.current.get(song.id);
    if (cached) return cached;

    if (!silent) setLoadingAudio(true);
    try {
      const raw = await loadSongAudio(song.id);
      if (!raw) {
        if (!silent) alert('Аудиофайл не найден в локальном хранилище.');
        return null;
      }
      const decoded = await soundEngine.decodeAudioData(raw);
      bufferCacheRef.current.set(song.id, decoded);
      return decoded;
    } catch {
      if (!silent) alert('Не удалось декодировать аудиофайл.');
      return null;
    } finally {
      if (!silent) setLoadingAudio(false);
    }
  };

  const playHighlightPreview = async (song: SongItem, silent = false) => {
    const reqId = ++previewReqIdRef.current;
    soundEngine.stopMenuPreview();
    const buf = await ensureAudioBuffer(song, silent);
    if (!buf || previewReqIdRef.current !== reqId) return;

    let startSec = previewStartCacheRef.current.get(song.id);
    if (startSec === undefined) {
      startSec = findBestPreviewStart(buf, 18);
      previewStartCacheRef.current.set(song.id, startSec);
    }
    soundEngine.playMenuPreview(buf, startSec, 18, Math.max(0.15, settings.musicVolume * 0.65));
    setPreviewPlayingId(song.id);
  };

  // Auto-play chorus/highlight preview when picking a song in menu
  useEffect(() => {
    if (screen !== 'menu' || !selectedSong) {
      stopPreview();
      return;
    }
    // Reset practice loop bounds nicely to selected song duration
    const dur = Math.max(12, Math.floor(selectedSong.durationSec));
    const defStart = Math.min(Math.max(0, Math.floor(dur * 0.3)), Math.max(0, dur - 18));
    const defEnd = Math.min(dur, defStart + 22);
    setPracticeLoop((prev) => ({ ...prev, startSec: defStart, endSec: defEnd }));

    if (!settings.menuPreviewEnabled || !userInteractedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      playHighlightPreview(selectedSong, true);
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedSong?.id, screen, settings.menuPreviewEnabled]);

  const togglePreview = async (song: SongItem) => {
    userInteractedRef.current = true;
    if (previewPlayingId === song.id) {
      stopPreview();
      return;
    }
    await playHighlightPreview(song, false);
  };

  const launchLiveNow = (song: SongItem, diff: Difficulty, startSec: number, buf: AudioBuffer) => {
    if (curtainTimerRef.current !== null) {
      window.clearTimeout(curtainTimerRef.current);
      curtainTimerRef.current = null;
    }
    setMusicStartCurtain(null);
    setActiveAudioBuffer(buf);
    setSelectedSongId(song.id);
    setSelectedDiff(diff);
    setPlayStartSec(startSec);
    setScreen('playing');
  };

  const handleStartLive = async (song: SongItem, diff: Difficulty, startSec = 0) => {
    triggerUiTapHaptic(settings.hapticsEnabled);
    stopPreview();
    soundEngine.getContext().resume().catch(() => {});
    const buf = await ensureAudioBuffer(song);
    if (!buf) return;
    if (startSec > 0) {
      launchLiveNow(song, diff, startSec, buf);
      return;
    }
    setMusicStartCurtain({ song, diff, startSec, buf });
    if (curtainTimerRef.current !== null) {
      window.clearTimeout(curtainTimerRef.current);
    }
    curtainTimerRef.current = window.setTimeout(() => {
      launchLiveNow(song, diff, startSec, buf);
    }, 1080);
  };

  const handleOpenEditor = async (song: SongItem, diff: Difficulty) => {
    stopPreview();
    const buf = await ensureAudioBuffer(song);
    if (!buf) return;
    setActiveAudioBuffer(buf);
    setSelectedSongId(song.id);
    setSelectedDiff(diff);
    setScreen('editor');
  };

  const handleSongCreated = async (
    newSong: SongItem,
    audioBytes: ArrayBuffer,
    decodedBuffer: AudioBuffer
  ) => {
    await saveSongAudio(newSong.id, audioBytes);
    await saveSongMetadata(newSong);
    bufferCacheRef.current.set(newSong.id, decodedBuffer);
    setSongs((prev) => [newSong, ...prev]);
    setSelectedSongId(newSong.id);
    setLibFilter('all');

    const evaluated = evaluateMissionsOnProgression({
      ...progression,
      customSongsUploaded: progression.customSongsUploaded + 1,
    });
    updateProgression(evaluated.next);
  };

  const handleSaveSong = async (updatedSong: SongItem) => {
    await saveSongMetadata(updatedSong);
    setSongs((prev) => prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)));
  };

  const updateTeamCards = (next: TeamCard[]) => {
    setTeamCards(next);
    saveTeamCards(next);
  };

  const toggleFavorite = async (song: SongItem) => {
    await handleSaveSong({ ...song, favorite: !song.favorite });
  };

  const handleExportSong = async (song: SongItem) => {
    try {
      const json = await exportSongPackage(song, bufferCacheRef.current.get(song.id));
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.title.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '_')}.sekaisong.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Экспорт доступен для загруженных песен');
    }
  };

  const handleExportAllPack = async () => {
    const customSongs = songs.filter((s) => !s.isBuiltin);
    const targetSongs = customSongs.length > 0 ? customSongs : songs;
    if (targetSongs.length === 0) return;
    setPackBusyMsg('Собираю сборник...');
    try {
      const cacheRecord: Record<string, AudioBuffer> = {};
      bufferCacheRef.current.forEach((v, k) => {
        cacheRecord[k] = v;
      });
      const { json, count } = await exportSongsPack(targetSongs, cacheRecord);
      if (count === 0) {
        alert('Не найдено песен с аудиофайлами для экспорта.');
        return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sekai-playlist-${new Date().toISOString().slice(0, 10)}.sekaipack.json`;
      a.click();
      URL.revokeObjectURL(url);
      setPackBusyMsg(`Экспортировано песен: ${count}`);
      window.setTimeout(() => setPackBusyMsg(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка экспорта сборника');
      setPackBusyMsg(null);
    }
  };

  const handleImportPackFile = async (file: File) => {
    setPackBusyMsg('Импортирую...');
    try {
      const text = await file.text();
      const imported = await parseSongsPack(text);
      if (imported.length === 0) {
        alert('В файле не найдено песен.');
        setPackBusyMsg(null);
        return;
      }
      const addedSongs: SongItem[] = [];
      for (const item of imported) {
        await saveSongAudio(item.song.id, item.audioBytes);
        if (item.bgMedia) {
          await saveSongBgMedia(item.song.id, item.bgMedia);
        }
        await saveSongMetadata(item.song);
        try {
          const decoded = await soundEngine.decodeAudioData(item.audioBytes);
          bufferCacheRef.current.set(item.song.id, decoded);
        } catch {}
        addedSongs.push(item.song);
      }
      setSongs((prev) => [...addedSongs, ...prev]);
      setSelectedSongId(addedSongs[0].id);
      setLibFilter('all');
      const evaluated = evaluateMissionsOnProgression({
        ...progression,
        customSongsUploaded: progression.customSongsUploaded + addedSongs.length,
      });
      updateProgression(evaluated.next);
      setPackBusyMsg(`Импортировано песен: ${addedSongs.length}`);
      window.setTimeout(() => setPackBusyMsg(null), 3500);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось прочитать файл сборника');
      setPackBusyMsg(null);
    }
  };

  const handleRandomSong = () => {
    const pool = filteredSongs.length > 0 ? filteredSongs : songs;
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelectedSongId(pick.id);
  };

  const handleRebalanceCharts = async (song: SongItem) => {
    const buf = await ensureAudioBuffer(song);
    if (!buf) return;
    const analysis = analyzeAudioBuffer(buf);
    const nextBpm = song.isBuiltin ? song.bpm : analysis.bpm;
    const nextOffset = song.isBuiltin ? song.offsetMs : analysis.offsetMs;
    const charts = generateAllDifficulties(analysis, nextBpm, nextOffset);
    await handleSaveSong({
      ...song,
      bpm: nextBpm,
      offsetMs: nextOffset,
      analyzerVersion: 4,
      charts,
    });
  };

  const handleDeleteSong = async (song: SongItem) => {
    if (song.isBuiltin) return;
    if (!confirm(`Удалить «${song.title}» из библиотеки?`)) return;
    if (previewPlayingId === song.id) stopPreview();
    await deleteStoredSong(song.id);
    bufferCacheRef.current.delete(song.id);
    setSongs((prev) => {
      const next = prev.filter((s) => s.id !== song.id);
      if (selectedSongId === song.id && next.length > 0) {
        setSelectedSongId(next[0].id);
      }
      return next;
    });
  };

  const handleGameFinish = async (result: PlayResult) => {
    const progRes = applyLiveResultToProgression(progression, result);
    if (progRes.earnedCrystals > 0 || progRes.newlyCompletedMissions.length > 0) {
      updateProgression(progRes.next);
    }
    const enrichedResult: PlayResult = {
      ...result,
      earnedCrystals: progRes.earnedCrystals,
      newlyCompletedMissions: progRes.newlyCompletedMissions,
    };
    setLastResult(enrichedResult);
    setScreen('results');

    if (!result.autoPlayUsed && !result.practiceLoopUsed && selectedSong) {
      const prevBest = selectedSong.highScores?.[result.difficulty];
      const shouldUpdate =
        !prevBest ||
        result.score > prevBest.score ||
        (result.fullCombo && !prevBest.fullCombo) ||
        (result.allPerfect && !prevBest.allPerfect);

      if (shouldUpdate) {
        const record: HighScoreRecord = {
          score: Math.max(result.score, prevBest?.score ?? 0),
          maxCombo: Math.max(result.maxCombo, prevBest?.maxCombo ?? 0),
          perfect: result.counts.PERFECT,
          great: result.counts.GREAT,
          good: result.counts.GOOD,
          bad: result.counts.BAD,
          miss: result.counts.MISS,
          fullCombo: Boolean(result.fullCombo || prevBest?.fullCombo),
          allPerfect: Boolean(result.allPerfect || prevBest?.allPerfect),
          cleared: Boolean(result.cleared || prevBest?.cleared),
          updatedAt: Date.now(),
        };
        const updated: SongItem = {
          ...selectedSong,
          highScores: {
            ...selectedSong.highScores,
            [result.difficulty]: record,
          },
        };
        await handleSaveSong(updated);
      }
    }
  };

  const currentChart: Chart | undefined = selectedSong?.charts[selectedDiff];
  const currentHigh = selectedSong?.highScores?.[selectedDiff];

  const noteStats = useMemo(() => {
    const notes = currentChart?.notes ?? [];
    let tap = 0;
    let flick = 0;
    let slide = 0;
    let critical = 0;
    for (const n of notes) {
      if (n.critical) critical++;
      if (n.type === 'tap') tap++;
      else if (n.type === 'flick') flick++;
      else if (n.type === 'slide') slide++;
    }
    return { tap, flick, slide, critical, total: notes.length };
  }, [currentChart]);

  const effectiveTheme: SekaiTheme =
    settings.autoThemeByTag && selectedSong?.tag === 'n25'
      ? 'nightcord'
      : settings.autoThemeByTag && selectedSong?.tag === 'vbs'
      ? 'vivid'
      : settings.sekaiTheme;

  if (screen === 'playing' && selectedSong && activeAudioBuffer) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-[#0d1024]" />}>
        <GameCanvas
          song={selectedSong}
          difficulty={selectedDiff}
          audioBuffer={activeAudioBuffer}
          settings={{ ...settings, sekaiTheme: effectiveTheme }}
          avatar={avatarView}
          teamCards={teamCards}
          startFromSec={playStartSec}
          practiceLoop={practiceLoop}
          onOpenSettings={() => openSettings('live')}
          onFinish={handleGameFinish}
          onExit={() => setScreen('menu')}
        />
        {showSettings && (
          <SettingsModal
            initialSection={settingsSection}
            resolvedTheme={resolvedAppTheme}
            settings={settings}
            onChange={updateSettings}
            onProfileRestored={handleProfileRestored}
            onClose={() => setShowSettings(false)}
          />
        )}
      </Suspense>
    );
  }

  if (screen === 'editor' && selectedSong && activeAudioBuffer) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-[#0d1024]" />}>
        <ChartEditor
          song={selectedSong}
          difficulty={selectedDiff}
          audioBuffer={activeAudioBuffer}
          onSaveSong={handleSaveSong}
          onTestPlay={(updated, diff, startSec) => handleStartLive(updated, diff, startSec)}
          onBack={() => setScreen('menu')}
        />
      </Suspense>
    );
  }

  if (screen === 'results' && selectedSong && lastResult) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-[#0d1024]" />}>
        <ResultsScreen
          song={selectedSong}
          result={lastResult}
          avatar={avatarView}
          frameId={progression.activeFrameId}
          activeTitleId={progression.activeTitleId}
          teamCards={teamCards}
          onRetry={() => handleStartLive(selectedSong, selectedDiff, 0)}
          onOpenEditor={() => handleOpenEditor(selectedSong, selectedDiff)}
          onBackToMenu={() => setScreen('menu')}
        />
      </Suspense>
    );
  }

  const bestGrade = getRecordGrade(currentHigh);
  const activeTitle =
    PLAYER_TITLES.find((t) => t.id === progression.activeTitleId) ?? PLAYER_TITLES[0];

  return (
    <div className="pjsk-themed-ui pjsk-app-shell relative w-full h-full pjsk-menu-bg flex flex-col overflow-hidden">
      {/* Soft ambient jacket tint (desktop only for smooth mobile scrolling) */}
      {selectedSong?.coverDataUrl && (
        <div
          className="hidden md:block pointer-events-none fixed inset-0 opacity-[0.14] blur-3xl scale-125 transition-all duration-700"
          style={{
            backgroundImage: `url(${selectedSong.coverDataUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* Живой анимированный фон сцены: аврора, прожекторы, пол, искры и ноты */}
      <AnimatedBackdrop quality={settings.graphicsQuality} variant="menu" />

      {/* Hatsune Miku stage hologram floating on the right backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="hidden xl:block absolute right-6 bottom-0 w-[340px] opacity-[0.26] animate-float-slow">
          <MikuStageIllustration className="w-full h-auto" />
        </div>
      </div>

      {/* PJSK / Hatsune Miku Top Navigation Header */}
      <header className="relative z-30 pjsk-header shrink-0">
        {/* Holographic prism top stripe */}
        <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] via-55% to-[#ff4f93]" />
        <div className="pjsk-land-header-bar min-h-[64px] px-3 sm:px-5 flex items-center justify-between gap-2.5">
          {/* Brand: allowed to shrink instead of colliding with the controls */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSplashPhase('active')}
              title="Повторить анимацию запуска"
              className="relative shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition"
            >
              <span className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-[#39C5BB]/35 to-[#ff4f93]/30 blur-md" />
              <MikuEmblem className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0 drop-shadow-[0_3px_10px_rgba(0,0,0,0.35)]" />
            </button>
            <div
              className="pjsk-brand-plate relative min-w-0 pl-3 sm:pl-4 pr-5 sm:pr-6 py-1.5 rounded-l-xl bg-gradient-to-r from-[#131c36] via-[#1e2b4e] to-[#2e3f6e] text-white shadow-lg flex items-center border-l-4 border-[#39C5BB] ring-1 ring-white/20 overflow-hidden"
              style={{
                boxShadow: '0 10px 26px rgba(15,23,42,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 11px) 100%, 0 100%)',
              }}
            >
              {/* Subtle prism sheen inside the brand plate */}
              <span className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[linear-gradient(115deg,transparent_38%,#ffffff_50%,transparent_62%)]" />
              <span className="min-w-0 flex items-center gap-2 relative z-10">
                <span className="w-2.5 h-2.5 rotate-45 bg-[#39C5BB] shadow-[0_0_10px_#39C5BB] inline-block shrink-0" />
                <span className="text-xs sm:text-sm font-black tracking-wider whitespace-nowrap truncate">
                  <span className="hidden sm:inline">SOLO LIVE · HATSUNE MIKU</span>
                  <span className="sm:hidden">SOLO LIVE</span>
                </span>
              </span>
            </div>
            <div className="hidden 2xl:block shrink-0">
              <div className="text-[11px] font-black text-[#0f766e] pjsk-dark-text tracking-wide flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00d8bd] animate-pulse" />
                COLORFUL STAGE · 01
              </div>
              <div className="text-[11px] text-slate-500 pjsk-muted-text font-semibold">
                Свои треки: {customCount} · Всего песен: {songs.length}
              </div>
            </div>
          </div>

          {/* Actions never wrap: secondary controls move into the compact menu */}
          <nav className="flex items-center gap-1.5 sm:gap-2 shrink-0" aria-label="Главное меню">
            {/* Crystals & Missions pill */}
            <button
              onClick={() => setShowMissionsModal(true)}
              title="Миссии, кристаллы, рамки и коллекция карточек"
              className="flex items-center gap-1.5 h-10 sm:h-11 px-2.5 sm:px-3 rounded-full pjsk-surface-box bg-white/95 hover:bg-[#effdfb] border border-[#39C5BB]/45 text-xs font-black text-slate-800 shadow-sm transition"
            >
              <Gem className="w-4 h-4 text-[#00bfa5]" />
              <span className="font-mono">{progression.crystals}</span>
              <span className="hidden lg:inline text-[11px] text-[#0f766e]">Миссии</span>
            </button>

            <div className="hidden 2xl:flex items-center gap-2">
              <button
                onClick={() => setShowTeamModal(true)}
                title="Команда из 5 карт (Skills)"
                className="flex items-center gap-1.5 px-3 py-2 rounded-full pjsk-surface-box bg-white/95 hover:bg-[#effdfb] border border-slate-200 text-xs font-extrabold text-slate-700 shadow-sm transition"
              >
                <Users className="w-3.5 h-3.5 text-[#39C5BB]" />
                <span>Команда</span>
                <span className="px-1.5 py-0.5 rounded-full bg-[#39C5BB]/15 text-[#0f766e] pjsk-dark-text text-[10px] font-black">5</span>
              </button>
              <button
                onClick={() => updateSettings({ ...settings, autoPlay: !settings.autoPlay })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-extrabold transition shadow-sm ${
                  settings.autoPlay
                    ? 'bg-gradient-to-r from-amber-300 to-amber-400 border-amber-500 text-slate-950 shadow-amber-400/30'
                    : 'pjsk-surface-box bg-white/95 border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                AUTO: {settings.autoPlay ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
              <button
                onClick={() => openSettings('live')}
                className="px-3 py-2 rounded-full pjsk-surface-box bg-white/95 hover:bg-slate-50 border border-slate-200 text-xs font-extrabold text-slate-700 flex items-center gap-1.5 shadow-sm transition"
              >
                <Settings className="w-4 h-4 text-[#00bfa5]" />
                <span>Настройки</span>
                <span className="px-2 py-0.5 rounded-full bg-[#00bfa5]/15 text-[#008e7b] pjsk-dark-text font-mono text-[11px] font-black">x{settings.noteSpeed.toFixed(1)}</span>
              </button>
              <button
                onClick={() => setShowNotesGuide(true)}
                title="Гид по нотам и управлению"
                aria-label="Гид по нотам и управлению"
                className="w-9 h-9 rounded-full pjsk-surface-box bg-white/95 hover:bg-[#effdfb] border border-slate-200 text-[#00a995] flex items-center justify-center shadow-sm transition"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>

            <div ref={themePopoverRef} className="relative">
              <button
                type="button"
                onClick={() => setShowThemePopover((o) => !o)}
                aria-expanded={showThemePopover}
                title={`Оформление: ${APP_THEMES[resolvedAppTheme].label}`}
                aria-label="Выбрать дизайн приложения"
                className="pjsk-theme-shortcut"
              >
                <Palette size={17} strokeWidth={1.8} />
                <span className="hidden md:inline">{APP_THEMES[resolvedAppTheme].label}</span>
                <span className="pjsk-theme-shortcut-dot" aria-hidden="true" />
              </button>

              {showThemePopover && (
                <div
                  role="dialog"
                  aria-label="Выбор дизайна приложения"
                  className="pjsk-theme-popover fixed right-3 top-[76px] sm:absolute sm:right-0 sm:top-[calc(100%+0.75rem)] z-50 w-[min(23rem,calc(100vw-1.5rem))] rounded-2xl p-3.5 animate-menu-pop"
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#00a995]">
                        Выбор дизайна
                      </p>
                      <p className="text-xs font-black">Палитра приложения (6 тем)</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          ...settings,
                          appTheme: settings.appTheme === 'system' ? resolvedAppTheme : 'system',
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border transition ${
                        settings.appTheme === 'system'
                          ? 'bg-[#39C5BB] text-white border-transparent'
                          : 'border-slate-200 hover:border-[#39C5BB]'
                      }`}
                    >
                      Авто: {settings.appTheme === 'system' ? 'ВКЛ' : 'ВЫКЛ'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {APP_THEME_ORDER.map((id) => {
                      const t = APP_THEMES[id];
                      const active = settings.appTheme === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => updateSettings({ ...settings, appTheme: id })}
                          className={`pjsk-theme-quick-card ${active ? 'is-selected' : ''}`}
                        >
                          <ThemeMiniPreview theme={id} compact />
                          <div className="flex items-center justify-between gap-1 px-0.5">
                            <span className="text-[11px] font-black truncate">{t.label}</span>
                            {active ? (
                              <span className="w-4 h-4 rounded-full bg-[#39C5BB] text-white flex items-center justify-center shrink-0">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 shrink-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-black/10"
                                  style={{ background: t.accent }}
                                />
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-black/10"
                                  style={{ background: t.accent2 }}
                                />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowThemePopover(false);
                      openSettings('appearance');
                    }}
                    className="mt-2.5 w-full py-2 rounded-xl border border-slate-200 hover:border-[#39C5BB] text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition"
                  >
                    <Settings className="w-3.5 h-3.5" /> Контраст, анимации и все параметры →
                  </button>
                </div>
              )}
            </div>

            {/* Avatar & Profile Stats Capsule */}
            <button
              onClick={() => setShowAvatarPicker(true)}
              title={`Профиль и аватар: ${avatarView.name} (${activeTitle.label})`}
              aria-label={`Открыть профиль ${avatarView.name}`}
              className="group flex items-center gap-2 p-1 sm:pr-2.5 rounded-full pjsk-surface-box bg-white/95 hover:bg-white border border-slate-200/90 shadow-sm hover:shadow transition"
            >
              <div className="relative rounded-full transition">
                <AvatarFace
                  view={avatarView}
                  frameId={progression.activeFrameId}
                  className="w-8 h-8 sm:w-9 sm:h-9"
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#ff4f8b] border-2 border-white shadow" />
              </div>
              <div className="hidden xl:flex flex-col items-start text-left max-w-[104px]">
                <span className="text-xs font-black text-slate-700 pjsk-dark-text truncate w-full leading-tight">
                  {avatarView.name}
                </span>
                <span
                  className={`px-1.5 py-[1px] rounded-full text-[8px] font-black text-white bg-gradient-to-r ${activeTitle.gradient} truncate max-w-full`}
                >
                  {activeTitle.label}
                </span>
              </div>
            </button>

            {/* Responsive utilities menu: prevents controls overlapping at laptop/tablet widths */}
            <div ref={headerMenuRef} className="relative 2xl:hidden">
              <button
                onClick={() => setShowHeaderMenu((open) => !open)}
                aria-expanded={showHeaderMenu}
                aria-haspopup="menu"
                aria-label="Открыть быстрое меню"
                className={`h-10 sm:h-11 px-2.5 sm:px-3 rounded-full border flex items-center gap-1.5 text-xs font-black shadow-sm transition ${
                  showHeaderMenu
                    ? 'bg-[#172038] border-[#39C5BB] text-white shadow-[#39C5BB]/20'
                    : 'pjsk-surface-box bg-white/95 border-slate-200 text-slate-700 hover:bg-[#effdfb]'
                }`}
              >
                <Menu className="w-4 h-4" />
                <span className="hidden md:inline">Меню</span>
                <span className={`hidden md:block w-1.5 h-1.5 border-r-2 border-b-2 rotate-45 -translate-y-0.5 transition-transform ${showHeaderMenu ? 'rotate-[225deg] translate-y-0.5' : ''}`} />
              </button>

              {showHeaderMenu && (
                <div role="menu" className="pjsk-header-popover fixed right-3 top-[76px] sm:absolute sm:right-0 sm:top-[calc(100%+0.75rem)] z-50 w-[min(20rem,calc(100vw-1.5rem))] max-h-[80dvh] overflow-y-auto rounded-2xl p-2.5 border shadow-2xl animate-menu-pop">
                  <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] font-black text-[#00a995]">Быстрое меню</p>
                      <p className="text-xs font-black pjsk-dark-text text-slate-800">Настройки сцены</p>
                    </div>
                    <span className="px-2 py-1 rounded-full bg-[#39C5BB]/12 text-[10px] font-black text-[#008e7b] pjsk-dark-text">SEKAI 01</span>
                  </div>

                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowMissionsModal(true);
                      setShowHeaderMenu(false);
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className="pjsk-menu-icon bg-cyan-50 text-[#00a995]"><Trophy className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">Миссии и Коллекция</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">Карты, рамки и титулы</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#39C5BB]/15 font-mono text-[10px] font-black text-[#008e7b]">{progression.crystals} 💎</span>
                  </button>

                  <button
                    role="menuitem"
                    onClick={() => {
                      updateSettings({ ...settings, autoPlay: !settings.autoPlay });
                      setShowHeaderMenu(false);
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className={`pjsk-menu-icon ${settings.autoPlay ? 'bg-amber-100 text-amber-600' : 'bg-cyan-50 text-[#00a995]'}`}><Sparkles className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">AUTO LIVE</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">Автоматическая игра</span>
                    </span>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black ${settings.autoPlay ? 'bg-amber-300 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{settings.autoPlay ? 'ВКЛ' : 'ВЫКЛ'}</span>
                  </button>

                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowTeamModal(true);
                      setShowHeaderMenu(false);
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className="pjsk-menu-icon bg-emerald-50 text-[#00a995]"><Users className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">Команда</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">5 карт и Live Skills</span>
                    </span>
                    <span className="font-mono text-xs font-black text-[#00a995]">5/5</span>
                  </button>

                  <button
                    role="menuitem"
                    onClick={() => {
                      openSettings('appearance');
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className="pjsk-menu-icon bg-violet-50"><Palette className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">Оформление</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">Светлая, розовая или тёмная</span>
                    </span>
                    <span className="text-[10px] font-black pjsk-dark-text text-slate-600 max-w-[82px] truncate">{APP_THEMES[resolvedAppTheme].label}</span>
                  </button>

                  <button
                    role="menuitem"
                    onClick={() => {
                      openSettings('live');
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className="pjsk-menu-icon bg-pink-50 text-[#ff4f8b]"><Settings className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">Настройки</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">Скорость, звук и управление</span>
                    </span>
                    <span className="px-2 py-1 rounded-full bg-[#39C5BB]/12 font-mono text-[10px] font-black text-[#008e7b] pjsk-dark-text">x{settings.noteSpeed.toFixed(1)}</span>
                  </button>

                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowNotesGuide(true);
                      setShowHeaderMenu(false);
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className="pjsk-menu-icon bg-cyan-50 text-[#00a995]"><HelpCircle className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">Гид по нотам</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">Tap, Flick, Slide, Trace и кнопки</span>
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-200/70" />

                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      handleExportAllPack();
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className="pjsk-menu-icon bg-sky-50 text-sky-600"><Download className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">Сохранить весь сборник</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">Плейлист .sekaipack.json (ПК ↔ APK)</span>
                    </span>
                  </button>

                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      packImportRef.current?.click();
                    }}
                    className="pjsk-menu-action w-full"
                  >
                    <span className="pjsk-menu-icon bg-pink-50 text-[#ff4f8b]"><Upload className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-black">Загрузить сборник / пакет</span>
                      <span className="block text-[10px] pjsk-muted-text text-slate-500">.sekaipack.json или .sekaisong.json</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Upload remains the primary action, but becomes icon-only on small phones */}
            <button
              onClick={() => setShowUpload(true)}
              aria-label="Загрузить свою песню"
              className="sekai-slant h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-gradient-to-r from-[#ff4588] via-[#ff5a96] to-[#ff7db0] text-white font-black text-xs sm:text-sm shadow-lg shadow-pink-500/25 hover:brightness-105 active:scale-95 transition border border-white/40"
            >
              <span className="sekai-unslant flex items-center gap-1.5">
                <Plus className="w-4 h-4 stroke-[3]" />
                <span className="hidden sm:inline">Загрузить</span>
              </span>
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile / Tablet Compact Tab Bar (< lg portrait only; hidden in landscape) */}
      <div className="lg:hidden pjsk-land-tabs-hide relative z-20 px-3 pt-2.5 shrink-0">
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl pjsk-surface-box bg-white/85 border border-slate-200/80 shadow-sm">
          <button
            onClick={() => setMobileTab('songs')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              mobileTab === 'songs'
                ? 'bg-gradient-to-r from-[#00d2ba] to-[#1ee9c8] text-white shadow-sm'
                : 'text-slate-600 pjsk-muted-text'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Песни ({filteredSongs.length})</span>
          </button>
          <button
            onClick={() => setMobileTab('stage')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition truncate ${
              mobileTab === 'stage'
                ? 'bg-gradient-to-r from-[#ff4588] to-[#ff7db0] text-white shadow-sm'
                : 'text-slate-600 pjsk-muted-text'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current shrink-0" />
            <span className="truncate">{selectedSong ? selectedSong.title : 'Сцена и старт'}</span>
          </button>
        </div>
      </div>

      {/* Main Content: Larger Left Slanted Song Tiles + Larger Right PJSK Detail Card */}
      <main className="pjsk-land-main relative z-10 flex-1 min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6 p-3 sm:p-5 lg:p-7 max-w-[1560px] w-full mx-auto">
        {/* LEFT COLUMN: Authentic Colorful Stage Song Tiles ("Плитки песен") */}
        <section className={`pjsk-land-col-left ${mobileTab === 'songs' ? 'flex' : 'hidden'} lg:flex flex-1 lg:flex-none lg:w-[44%] flex-col min-h-0`}>
          {/* Search, Tabs, Sort & Random */}
          <div className="pjsk-land-search-wrap mb-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[150px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Найти песню или автора..."
                  className="w-full pl-9 pr-3 py-2 rounded-full pjsk-surface-box bg-white/95 border border-slate-200/90 text-xs font-semibold text-slate-800 placeholder:text-slate-400 shadow-sm focus:border-[#00d8bd] outline-none transition"
                />
              </div>

              <div className="flex rounded-full pjsk-surface-box bg-white/90 p-1 border border-slate-200 shadow-sm text-[11px] font-extrabold">
                {(
                  [
                    { id: 'all', label: 'Все' },
                    { id: 'fav', label: '❤️' },
                    { id: 'custom', label: 'Мои' },
                    { id: 'demo', label: 'Демо' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setLibFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-full transition ${
                      libFilter === tab.id
                        ? 'bg-gradient-to-r from-[#00d2ba] to-[#1ee9c8] text-white shadow-sm'
                        : 'text-slate-500 pjsk-muted-text hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value as 'all' | SekaiTag)}
                className="px-3 py-1.5 rounded-full pjsk-surface-box bg-white/95 border border-slate-200 text-[11px] font-bold text-slate-700 shadow-sm outline-none cursor-pointer"
              >
                <option value="all">Все юниты</option>
                {(Object.keys(SEKAI_TAGS) as SekaiTag[]).map((t) => (
                  <option key={t} value={t}>
                    {SEKAI_TAGS[t].label}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                className="px-3 py-1.5 rounded-full pjsk-surface-box bg-white/95 border border-slate-200 text-[11px] font-bold text-slate-700 shadow-sm outline-none cursor-pointer"
              >
                <option value="recent">Сначала новые</option>
                <option value="title">По названию</option>
                <option value="bpm">По BPM</option>
                <option value="score">По рекорду</option>
              </select>

              <button
                onClick={handleRandomSong}
                title="Случайный трек"
                className="ml-auto px-3 py-1.5 rounded-full pjsk-surface-box bg-white/95 hover:bg-[#effdfb] border border-slate-200 text-[11px] font-extrabold text-[#0f766e] pjsk-dark-text flex items-center gap-1.5 shadow-sm shrink-0 transition"
              >
                <Shuffle className="w-3.5 h-3.5 text-[#39C5BB]" /> Случайная
              </button>

              <button
                onClick={() => setListViewMode((m) => (m === 'wheel' ? 'grid' : 'wheel'))}
                title={listViewMode === 'wheel' ? 'Переключить на сетку обложек' : 'Переключить на список-колесо'}
                className="px-2.5 py-1.5 rounded-full pjsk-surface-box bg-white/95 hover:bg-[#effdfb] border border-slate-200 text-[11px] font-extrabold text-slate-700 pjsk-dark-text flex items-center gap-1 shadow-sm shrink-0 transition"
              >
                {listViewMode === 'wheel' ? (
                  <>
                    <LayoutGrid className="w-3.5 h-3.5 text-[#ff4f93]" />
                    <span className="hidden sm:inline">Сетка</span>
                  </>
                ) : (
                  <>
                    <List className="w-3.5 h-3.5 text-[#39C5BB]" />
                    <span className="hidden sm:inline">Список</span>
                  </>
                )}
              </button>
            </div>

            {/* Difficulty Clear / FC / AP Progress Pill Bar */}
            {songs.length > 0 && (() => {
              const clearedCount = songs.filter((s) => s.highScores?.[selectedDiff]?.cleared).length;
              const fcCount = songs.filter((s) => s.highScores?.[selectedDiff]?.fullCombo).length;
              const apCount = songs.filter((s) => s.highScores?.[selectedDiff]?.allPerfect).length;
              const pct = Math.round((clearedCount / songs.length) * 100);
              return (
                <div className="pjsk-land-hide-short flex items-center gap-2.5 px-3 py-1.5 rounded-full pjsk-surface-box bg-white/85 border border-slate-200/80 text-[10px] font-black shadow-sm">
                  <span
                    className="px-2 py-0.5 rounded-full text-white text-[9px] shrink-0"
                    style={{ background: DIFFICULTY_META[selectedDiff].gradient ?? DIFFICULTY_META[selectedDiff].color }}
                  >
                    {DIFFICULTY_META[selectedDiff].label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums text-slate-600 pjsk-muted-text">
                    <span>Clear {clearedCount}/{songs.length}</span>
                    <span className="text-[#ff4f93]">FC {fcCount}</span>
                    <span className="text-amber-500">AP {apCount}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Scrollable Stack of Crisp PJSK Song Tiles OR Cover Grid */}
          <div
            className={`flex-1 overflow-y-auto pl-2 pr-3 py-1.5 ${
              listViewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5 content-start'
                : 'space-y-2.5'
            }`}
          >
            {filteredSongs.length === 0 ? (
              <div className={`${listViewMode === 'grid' ? 'col-span-full ' : ''}h-48 rounded-3xl pjsk-card border border-white flex flex-col items-center justify-center text-center p-4`}>
                <Music className="w-8 h-8 text-slate-400 mb-2" />
                <div className="text-sm font-bold text-slate-700 pjsk-dark-text">Песни не найдены</div>
                <button
                  onClick={() => setShowUpload(true)}
                  className="mt-3 px-4 py-1.5 rounded-full bg-[#00d8bd] text-white text-xs font-extrabold shadow"
                >
                  + Загрузить свой MP3
                </button>
              </div>
            ) : (
              filteredSongs.map((song) => {
                const isSel = selectedSong?.id === song.id;
                const isPreviewing = previewPlayingId === song.id;
                const rec = song.highScores?.[selectedDiff];
                const diffMeta = DIFFICULTY_META[selectedDiff];
                const chartLv = song.charts[selectedDiff]?.level ?? diffMeta.defaultLevel;
                const songTag = song.tag ?? (song.isBuiltin ? 'virtual_singer' : 'custom');

                if (listViewMode === 'grid') {
                  const statusRibbon = rec?.allPerfect
                    ? { label: 'AP', bg: 'from-amber-400 via-pink-500 to-cyan-400' }
                    : rec?.fullCombo
                    ? { label: 'FC', bg: 'from-[#ff4f93] to-pink-500' }
                    : rec?.cleared
                    ? { label: 'CLEAR', bg: 'from-[#39C5BB] to-sky-400' }
                    : Date.now() - song.createdAt < 1000 * 60 * 60 * 24 * 3
                    ? { label: 'NEW', bg: 'from-violet-500 to-fuchsia-500' }
                    : null;

                  return (
                    <div
                      key={song.id}
                      onClick={() => {
                        const isLandscapePhone = window.innerHeight <= 540 && window.innerWidth > window.innerHeight;
                        if (selectedSong?.id === song.id && window.innerWidth < 1024 && !isLandscapePhone) {
                          setMobileTab('stage');
                        } else {
                          setSelectedSongId(song.id);
                        }
                      }}
                      className={`group relative rounded-2xl p-2 cursor-pointer transition-all duration-200 flex flex-col gap-2 ${
                        isSel
                          ? 'pjsk-tile-selected pjsk-holo-sheen !translate-x-0 scale-[1.01]'
                          : 'pjsk-tile-idle border border-slate-200/80 hover:!translate-x-0 hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-900/10 border border-white shadow">
                        <img
                          src={song.coverDataUrl}
                          alt={song.title}
                          className="w-full h-full object-cover group-hover:scale-[1.06] transition duration-500"
                        />
                        {/* Bottom scrim + inner rim */}
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent z-10" />
                        <span className="pointer-events-none absolute inset-0 rounded-xl border border-white/25 z-10 shadow-[inset_0_0_24px_rgba(0,0,0,0.28)]" />
                        {statusRibbon && (
                          <span
                            className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r ${statusRibbon.bg} text-white text-[9px] font-black tracking-wider shadow z-20`}
                          >
                            {statusRibbon.label}
                          </span>
                        )}
                        <div
                          className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-xs shadow-lg ring-2 ring-white/90 tabular-nums z-20"
                          style={{
                            background: diffMeta.gradient ?? diffMeta.color,
                            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                          }}
                        >
                          {chartLv}
                        </div>
                        {isPreviewing && (
                          <div className="absolute inset-0 bg-slate-900/45 flex items-end justify-center gap-1 p-3 z-30">
                            <span className="w-1.5 h-6 bg-[#39C5BB] rounded-full animate-eq-1 origin-bottom" />
                            <span className="w-1.5 h-8 bg-[#ff5599] rounded-full animate-eq-2 origin-bottom" />
                            <span className="w-1.5 h-5 bg-[#39C5BB] rounded-full animate-eq-3 origin-bottom" />
                          </div>
                        )}
                      </div>
                      <div className="px-0.5">
                        <div className="flex items-center gap-1">
                          <UnitIcon tag={songTag} className="w-3.5 h-3.5 shrink-0" />
                          <div className="text-xs font-black text-slate-800 pjsk-dark-text truncate">
                            {song.title}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 pjsk-muted-text font-semibold truncate mt-0.5">
                          {song.artist} · {song.bpm} BPM
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={song.id}
                    onClick={() => {
                      const isLandscapePhone = window.innerHeight <= 540 && window.innerWidth > window.innerHeight;
                      if (selectedSong?.id === song.id && window.innerWidth < 1024 && !isLandscapePhone) {
                        setMobileTab('stage');
                      } else {
                        setSelectedSongId(song.id);
                      }
                    }}
                    className={`pjsk-land-tile group relative rounded-2xl cursor-pointer transition-all duration-200 flex items-center px-3.5 sm:px-4 py-3 sm:py-3.5 gap-3 sm:gap-3.5 ${
                      isSel
                        ? 'pjsk-tile-selected pjsk-holo-sheen'
                        : 'pjsk-tile-idle border border-slate-200/75'
                    }`}
                  >
                    {/* Left colored unit ribbon (matches Project SEKAI unit colors) */}
                    <div
                      className="w-1.5 self-stretch rounded-full shrink-0"
                      style={{
                        background: `linear-gradient(180deg, ${SEKAI_TAGS[songTag].color} 0%, ${
                          song.isBuiltin ? '#39C5BB' : '#a855f7'
                        } 100%)`,
                      }}
                    />

                      {/* Inner card content */}
                      <div className="flex-1 min-w-0 flex items-center gap-3.5">
                        <div className="relative shrink-0 p-0.5 rounded-xl bg-white/90 shadow-md border border-white overflow-hidden">
                          <img
                            src={song.coverDataUrl}
                            alt={song.title}
                            className="pjsk-land-tile-cover w-14 h-14 rounded-[10px] object-cover"
                          />
                          {/* Inner rim + bottom scrim for depth */}
                          <span className="pointer-events-none absolute inset-0.5 rounded-[10px] border border-white/30 z-10" />
                          {isPreviewing && (
                            <div className="absolute inset-0.5 rounded-[10px] bg-slate-900/60 backdrop-blur-[1px] flex items-end justify-center gap-0.5 p-1.5 z-20">
                              <span className="w-1 h-4 bg-[#39C5BB] rounded-full animate-eq-1 origin-bottom" />
                              <span className="w-1 h-5 bg-[#ff5599] rounded-full animate-eq-2 origin-bottom" />
                              <span className="w-1 h-3.5 bg-[#39C5BB] rounded-full animate-eq-3 origin-bottom" />
                            </div>
                          )}
                        </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <UnitIcon tag={songTag} className="w-4 h-4 shrink-0" />
                          <h3 className="text-[15px] font-black text-slate-800 pjsk-dark-text truncate">
                            {song.title}
                          </h3>
                          {song.isBuiltin ? (
                            <span className="px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-400/35 text-[#00a896] text-[9px] font-black shrink-0">
                              DEMO
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-pink-500/15 border border-pink-400/35 text-[#ff4f93] text-[9px] font-black shrink-0">
                              MY
                            </span>
                          )}
                          {song.bgKind && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-400/35 text-purple-500 text-[9px] font-black shrink-0 flex items-center gap-0.5">
                              <Film className="w-2.5 h-2.5" />
                              {song.bgKind === 'video' ? '2DMV' : 'BG'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 pjsk-muted-text font-semibold truncate mt-0.5">
                          {song.artist} · <span className="font-mono">{song.bpm}</span> BPM
                        </div>
                      </div>

                      {/* Right PJSK Level Badge + Clear/FC/AP Diamond + Favorite */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(song);
                          }}
                          className={`p-1 rounded-lg transition ${
                            song.favorite
                              ? 'text-[#ff4f93]'
                              : 'opacity-0 group-hover:opacity-100 text-slate-300 hover:text-[#ff4f93]'
                          }`}
                          title={song.favorite ? 'Убрать из любимых' : 'В любимые'}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${song.favorite ? 'fill-current' : ''}`}
                          />
                        </button>

                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm shadow-md ring-2 ring-white/90 tabular-nums"
                          style={{ background: diffMeta.gradient ?? diffMeta.color }}
                        >
                          {chartLv}
                        </div>

                        {/* Iconic PJSK Diamond */}
                        <div
                          title={
                            rec?.allPerfect
                              ? 'ALL PERFECT'
                              : rec?.fullCombo
                              ? 'FULL COMBO'
                              : rec?.cleared
                              ? 'CLEAR'
                              : 'Не пройдено'
                          }
                          className="w-4 h-4 rotate-45 rounded-[4px] border-2 shadow-sm"
                          style={{
                            borderColor: rec?.cleared ? '#ffffff' : '#cbd5e1',
                            background: rec?.allPerfect
                              ? 'linear-gradient(135deg, #fde047, #f472b6, #38bdf8)'
                              : rec?.fullCombo
                              ? 'linear-gradient(135deg, #ff5599, #f472b6)'
                              : rec?.cleared
                              ? '#38bdf8'
                              : 'rgba(148,163,184,0.2)',
                          }}
                        />

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCoverSong(song);
                          }}
                          className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-teal-500/15 text-slate-400 hover:text-[#00a896] transition"
                          title="Сменить обложку / аватарку песни"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>

                        {!song.isBuiltin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSong(song);
                            }}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-500/15 text-slate-400 hover:text-rose-500 transition"
                            title="Удалить трек"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sticky Mobile Mini-Live Launch Bar (< lg portrait only; hidden in landscape) */}
          {selectedSong && (
            <div className="lg:hidden pjsk-land-tabs-hide mt-2.5 p-2.5 rounded-2xl pjsk-card border border-[#39C5BB]/35 flex items-center gap-2.5 shrink-0">
              <img
                src={selectedSong.coverDataUrl}
                alt={selectedSong.title}
                onClick={() => setMobileTab('stage')}
                className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white shadow cursor-pointer"
              />
              <div
                onClick={() => setMobileTab('stage')}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <div className="text-xs font-black text-slate-800 pjsk-dark-text truncate">
                  {selectedSong.title}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-black text-white"
                    style={{ background: DIFFICULTY_META[selectedDiff].gradient ?? DIFFICULTY_META[selectedDiff].color }}
                  >
                    {DIFFICULTY_META[selectedDiff].label} {selectedSong.charts[selectedDiff]?.level ?? DIFFICULTY_META[selectedDiff].defaultLevel}
                  </span>
                  <span className="text-[10px] text-slate-500 pjsk-muted-text font-semibold truncate">
                    Нажми для деталей
                  </span>
                </div>
              </div>
              <button
                disabled={loadingAudio}
                onClick={() => handleStartLive(selectedSong, selectedDiff, 0)}
                className="sekai-slant pjsk-live-cta px-4 py-2.5 rounded-xl text-white font-black text-xs tracking-wide shrink-0 active:scale-95 transition"
              >
                <span className="sekai-unslant flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{loadingAudio ? '...' : 'LIVE!'}</span>
                </span>
              </button>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Iconic Colorful Stage Song Detail Panel */}
        {selectedSong && (
          <section className={`pjsk-land-col-right ${mobileTab === 'stage' ? 'flex' : 'hidden'} lg:flex flex-1 rounded-[28px] pjsk-card border border-[#39C5BB]/25 p-4 sm:p-6 lg:p-7 flex-col justify-between gap-4 sm:gap-5 overflow-y-auto relative`}>
            {/* Subtle Miku 01 watermark & top-right corner prism */}
            <div className="pointer-events-none absolute top-3 right-5 font-mono font-black text-6xl text-[#39C5BB]/10 select-none pjsk-land-hide-short">
              01
            </div>
            {/* Top Showcase: Crisp White Bevel Jacket + PJSK Title Banner */}
            <div className="pjsk-land-showcase-top flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative shrink-0 group">
                {/* Ambient jacket aura */}
                <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-gradient-to-tr from-[#39C5BB]/30 via-[#38bdf8]/20 to-[#ff4f93]/30 blur-xl opacity-80 group-hover:opacity-100 transition duration-300" />
                {/* PJSK corner prism accents */}
                <span className="pointer-events-none absolute -top-1.5 -left-1.5 w-4 h-4 border-t-[3px] border-l-[3px] border-[#39C5BB] rounded-tl-md z-10" />
                <span className="pointer-events-none absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-[3px] border-r-[3px] border-[#ff4f93] rounded-br-md z-10" />
                <div
                  onClick={() => setEditingCoverSong(selectedSong)}
                  className="pjsk-land-jacket relative w-44 h-44 sm:w-52 sm:h-52 rounded-2xl bg-white p-1.5 shadow-2xl border-2 border-white cursor-pointer overflow-hidden"
                  title="Нажми, чтобы поставить свою аватарку / обложку на песню"
                >
                  {/* Inner prism rim */}
                  <span className="pointer-events-none absolute inset-1 rounded-xl z-10 border border-white/35 shadow-[inset_0_0_20px_rgba(0,0,0,0.28)]" />
                  <img
                    src={selectedSong.coverDataUrl}
                    alt={selectedSong.title}
                    className="w-full h-full object-cover rounded-xl transition duration-300 group-hover:scale-[1.03]"
                  />
                  {/* Bottom gradient scrim for legibility */}
                  <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 h-1/3 rounded-b-xl z-10 bg-gradient-to-t from-black/45 to-transparent" />
                  <div className="absolute inset-1.5 rounded-xl bg-slate-900/55 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white gap-1 z-20">
                    <Camera className="w-6 h-6" />
                    <span className="text-[11px] font-black">Сменить обложку</span>
                  </div>
                </div>

                {/* Change Cover Pill Button */}
                <button
                  onClick={() => setEditingCoverSong(selectedSong)}
                  className="absolute -bottom-2.5 left-2 px-3 py-1.5 rounded-full bg-white hover:bg-[#39C5BB] hover:text-white border border-slate-200 hover:border-[#39C5BB] text-slate-700 text-xs font-black flex items-center gap-1 shadow-lg transition"
                  title="Поставить свою аватарку / картинку на песню"
                >
                  <Camera className="w-3.5 h-3.5" /> Обложка
                </button>

                {/* Audio Preview Button */}
                <button
                  onClick={() => togglePreview(selectedSong)}
                  className={`absolute -bottom-2.5 right-2 px-3 py-1.5 rounded-full border text-xs font-black flex items-center gap-1 shadow-lg transition ${
                    previewPlayingId === selectedSong.id
                      ? 'bg-[#ff4f8b] border-white text-white shadow-pink-500/35'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-[#00d8bd] hover:text-white hover:border-[#00d8bd]'
                  }`}
                >
                  {previewPlayingId === selectedSong.id ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" /> Стоп
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" /> Превью
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#39C5BB]/15 border border-[#39C5BB]/40 text-[10px] font-black text-[#00a896] uppercase tracking-widest">
                    <UnitIcon
                      tag={selectedSong.tag ?? (selectedSong.isBuiltin ? 'virtual_singer' : 'custom')}
                      className="w-3.5 h-3.5"
                    />
                    <Disc3
                      className={`w-3 h-3 ${
                        previewPlayingId === selectedSong.id ? 'animate-spin' : ''
                      }`}
                    />
                    {SEKAI_TAGS[selectedSong.tag ?? (selectedSong.isBuiltin ? 'virtual_singer' : 'custom')].label}
                  </div>
                  <button
                    onClick={() => toggleFavorite(selectedSong)}
                    className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black flex items-center gap-1 transition ${
                      selectedSong.favorite
                        ? 'bg-[#ff4f93] border-[#ff4f93] text-white shadow-sm'
                        : 'pjsk-surface-box bg-white/90 border-slate-200 text-slate-500 hover:text-[#ff4f93]'
                    }`}
                  >
                    <Heart className={`w-3 h-3 ${selectedSong.favorite ? 'fill-current' : ''}`} />
                    {selectedSong.favorite ? 'Любимая' : 'В любимые'}
                  </button>
                </div>

                <h2 className="pjsk-land-title pjsk-display text-2xl sm:text-4xl font-black text-slate-900 pjsk-dark-text leading-tight break-words tracking-tight">
                  {selectedSong.title}
                </h2>
                <p className="text-base font-bold text-slate-500 pjsk-muted-text mt-1">
                  {selectedSong.artist}
                </p>
                <div className="pjsk-divider w-28 sm:mx-0 mx-auto mt-2.5" />

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3.5 text-xs">
                  <span className="px-3 py-1 rounded-full pjsk-surface-box bg-slate-100/90 border border-slate-200 font-mono font-bold text-slate-700 tabular-nums">
                    BPM {selectedSong.bpm}
                  </span>
                  <span className="px-3 py-1 rounded-full pjsk-surface-box bg-slate-100/90 border border-slate-200 font-mono font-bold text-slate-700 tabular-nums">
                    {Math.floor(selectedSong.durationSec / 60)}:
                    {String(Math.floor(selectedSong.durationSec % 60)).padStart(2, '0')}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-pink-500/12 border border-pink-400/35 font-mono font-bold text-[#ff4f93] tabular-nums">
                    {noteStats.total} нот
                  </span>
                  <button
                    onClick={() => setEditingCoverSong(selectedSong)}
                    className={`px-3 py-1 rounded-full border font-extrabold flex items-center gap-1.5 transition ${
                      selectedSong.bgKind
                        ? 'bg-gradient-to-r from-[#ff4f93] to-[#8b5cf6] border-white text-white shadow-sm'
                        : 'pjsk-surface-box bg-[#effdfb] hover:bg-[#39C5BB] border-[#39C5BB]/50 text-[#0f766e] hover:text-white'
                    }`}
                    title="Поставить видеоклип (MP4/WebM) или арт на фон во время игры"
                  >
                    <Film className="w-3.5 h-3.5" />
                    {selectedSong.bgKind === 'video'
                      ? '2DMV Клип ✓'
                      : selectedSong.bgKind === 'image'
                      ? 'Фон-арт ✓'
                      : '+ Клип на фон'}
                  </button>
                  {!selectedSong.isBuiltin && (
                    <button
                      onClick={() => handleExportSong(selectedSong)}
                      className="px-3 py-1 rounded-full pjsk-surface-box bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-extrabold flex items-center gap-1 transition"
                      title="Экспортировать песню + ноты + обложку в 1 файл (.sekaisong.json)"
                    >
                      <Download className="w-3.5 h-3.5 text-[#39C5BB]" /> .sekaisong
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Iconic 6-Difficulty Colored Pills (Exact PJSK Style!) + Note Composition Bar */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black text-slate-500 pjsk-muted-text uppercase tracking-widest">
                  Сложность Live
                </span>
                <div className="flex items-center gap-3 text-[11px] font-bold tabular-nums">
                  <span className="text-cyan-500">Tap: {noteStats.tap}</span>
                  <span className="text-pink-500">Flick: {noteStats.flick}</span>
                  <span className="text-emerald-500">Slide: {noteStats.slide}</span>
                  {noteStats.critical > 0 && (
                    <span className="text-amber-500">Gold: {noteStats.critical}</span>
                  )}
                </div>
              </div>

              {/* Proportional Note Breakdown Bar */}
              <div className="h-1.5 w-full rounded-full bg-slate-200/70 pjsk-surface-box overflow-hidden flex mb-3">
                {noteStats.total > 0 && (
                  <>
                    <div
                      className="h-full bg-[#39C5BB] transition-all duration-300"
                      style={{ width: `${(noteStats.tap / noteStats.total) * 100}%` }}
                    />
                    <div
                      className="h-full bg-[#ff4f93] transition-all duration-300"
                      style={{ width: `${(noteStats.flick / noteStats.total) * 100}%` }}
                    />
                    <div
                      className="h-full bg-emerald-400 transition-all duration-300"
                      style={{ width: `${(noteStats.slide / noteStats.total) * 100}%` }}
                    />
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {DIFFICULTIES.map((diff) => {
                  const meta = DIFFICULTY_META[diff];
                  const chart = selectedSong.charts[diff];
                  const rec = selectedSong.highScores?.[diff];
                  const isAct = selectedDiff === diff;

                  return (
                    <button
                      key={diff}
                      onClick={() => setSelectedDiff(diff)}
                      className={`pjsk-land-diff-btn pjsk-diff-pill relative overflow-hidden py-3.5 px-1.5 rounded-2xl border-2 text-center transition-all duration-150 ${
                        isAct
                          ? 'scale-[1.05] shadow-lg text-white'
                          : 'pjsk-surface-box bg-white/95 hover:bg-white hover:-translate-y-0.5 text-slate-700 shadow-sm'
                      }`}
                      style={{
                        background: isAct ? meta.gradient ?? meta.color : undefined,
                        borderColor: isAct ? '#ffffff' : meta.color,
                        boxShadow: isAct
                          ? `0 12px 30px ${meta.bg}, 0 0 24px ${meta.bg}, inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -3px 0 rgba(0,0,0,0.14)`
                          : `0 3px 10px rgba(30,58,108,0.07), inset 0 1px 0 rgba(255,255,255,0.9)`,
                      }}
                    >
                      {/* Glossy top highlight */}
                      <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/3 rounded-t-xl bg-white/30" />
                      {/* Bottom depth shade */}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 rounded-b-xl bg-black/10" />
                      {/* FC/AP diamond */}
                      {rec?.cleared && (
                        <span
                          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rotate-45 rounded-[2px] border-2 border-white shadow z-10"
                          style={{
                            background: rec.allPerfect
                              ? 'linear-gradient(135deg, #fde047, #f472b6, #38bdf8)'
                              : rec.fullCombo
                              ? '#ff5599'
                              : '#38bdf8',
                          }}
                        />
                      )}
                      <div
                        className="relative z-10 text-[10px] sm:text-xs font-black tracking-wider"
                        style={{
                          color: isAct ? '#ffffff' : meta.color,
                          textShadow: isAct ? '0 1px 3px rgba(0,0,0,0.35)' : undefined,
                        }}
                      >
                        {meta.label}
                      </div>
                      <div className="pjsk-land-diff-lv relative z-10 text-xl sm:text-2xl font-black font-mono mt-0.5 tabular-nums">
                        {chart?.level ?? meta.defaultLevel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Score & Key Hints Card (Key hints hidden on short landscape phone to fit 100% cleanly) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-2xl pjsk-surface-box bg-gradient-to-br from-white/95 to-slate-50/90 border border-slate-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 pjsk-muted-text font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" /> Лучший результат
                  </div>
                  {currentHigh ? (
                    <>
                      <div className="text-3xl font-black font-mono text-slate-800 pjsk-dark-text mt-1 tabular-nums">
                        {String(currentHigh.score).padStart(7, '0')}
                      </div>
                      <div className="text-xs text-[#00a38e] font-bold mt-0.5">
                        Макс. комбо: {currentHigh.maxCombo}
                        {currentHigh.allPerfect
                          ? ' · ALL PERFECT'
                          : currentHigh.fullCombo
                          ? ' · FULL COMBO'
                          : ''}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400 pjsk-muted-text font-semibold mt-1.5">
                      Ещё не сыграно
                    </div>
                  )}
                </div>

                {bestGrade && (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00d8bd] via-[#38bdf8] to-[#a855f7] text-white flex items-center justify-center shadow-lg ring-2 ring-white/60">
                    <span className="text-2xl font-black">{bestGrade}</span>
                  </div>
                )}
              </div>

              <div className="pjsk-land-hide-short p-4 rounded-2xl pjsk-surface-box bg-gradient-to-br from-white/95 to-[#f3fcfb] border border-slate-200/80 shadow-sm flex flex-col justify-between">
                <div className="text-[11px] text-slate-500 pjsk-muted-text font-black uppercase tracking-wider flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5 text-[#00bfa5]" /> 4 плитки управления
                </div>
                <div className="hidden sm:flex items-center gap-2 mt-2">
                  {settings.keyBindings.map((k, idx) => (
                    <span
                      key={idx}
                      className="flex-1 py-2 rounded-xl pjsk-key-tile border border-[#39C5BB]/40 text-center font-mono text-sm font-black text-[#0f766e]"
                    >
                      {k.toUpperCase()}
                    </span>
                  ))}
                </div>
                <div className="sm:hidden flex items-center gap-1.5 mt-2">
                  {[1, 2, 3, 4].map((num) => (
                    <span
                      key={num}
                      className="flex-1 py-2 rounded-xl pjsk-key-tile border border-[#39C5BB]/40 text-center font-mono text-xs font-black text-[#0f766e]"
                    >
                      ПЛИТКА {num}
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 pjsk-muted-text mt-1.5">
                  На ПК: {settings.keyBindings.map((k) => k.toUpperCase()).join(' ')} · На телефоне: тапай по 4 плиткам!
                </div>
              </div>
            </div>

            {/* Quick Practice Loop A-B & Auto Live Bar */}
            <div className="pjsk-land-hide-short rounded-2xl pjsk-surface-box bg-white/85 border border-slate-200/80 px-3.5 py-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => updateSettings({ ...settings, autoPlay: !settings.autoPlay })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition ${
                      settings.autoPlay
                        ? 'bg-amber-300 border-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#39C5BB]'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto Live: {settings.autoPlay ? 'ВКЛ' : 'ВЫКЛ'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = !practiceLoop.enabled;
                      setPracticeLoop((p) => ({ ...p, enabled: nextEnabled }));
                      if (nextEnabled) setShowLoopEditor(true);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition ${
                      practiceLoop.enabled
                        ? 'bg-[#effdfb] border-[#39C5BB] text-[#0f766e]'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#39C5BB]'
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    Повтор отрезка A–B: {practiceLoop.enabled ? 'ВКЛ' : 'ВЫКЛ'}
                  </button>

                  {/* Quick Note Speed Stepper on Song Card */}
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-black uppercase text-slate-500 pl-1">
                      Скорость
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          ...settings,
                          noteSpeed: Math.max(4, Number((settings.noteSpeed - 0.5).toFixed(1))),
                        })
                      }
                      aria-label="Уменьшить скорость нот"
                      className="w-6 h-6 rounded-lg bg-white hover:bg-[#effdfb] border border-slate-200 flex items-center justify-center text-slate-700 transition"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="min-w-[36px] text-center font-mono text-xs font-black text-[#0f766e]">
                      {settings.noteSpeed.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          ...settings,
                          noteSpeed: Math.min(12, Number((settings.noteSpeed + 0.5).toFixed(1))),
                        })
                      }
                      aria-label="Увеличить скорость нот"
                      className="w-6 h-6 rounded-lg bg-white hover:bg-[#effdfb] border border-slate-200 flex items-center justify-center text-slate-700 transition"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {practiceLoop.enabled && (
                    <button
                      type="button"
                      onClick={() => setShowLoopEditor((v) => !v)}
                      className="text-[11px] font-extrabold text-[#0f766e] hover:underline"
                    >
                      {showLoopEditor ? 'Свернуть' : `${Math.floor(practiceLoop.startSec)}с – ${Math.floor(practiceLoop.endSec)}с`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportAllPack}
                    className="hidden 2xl:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 transition"
                    title="Сохранить весь сборник песен в 1 файл (.sekaipack.json)"
                  >
                    <Download className="w-3 h-3" /> Сборник
                  </button>
                  <button
                    type="button"
                    onClick={() => packImportRef.current?.click()}
                    className="hidden 2xl:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 transition"
                    title="Импортировать сборник (.sekaipack.json) или песню (.sekaisong.json)"
                  >
                    <Upload className="w-3 h-3" /> Импорт
                  </button>
                </div>
              </div>

              {practiceLoop.enabled && showLoopEditor && (
                <div className="pt-2 border-t border-slate-200/70 flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">От (сек):</span>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, Math.floor(selectedSong.durationSec) - 5)}
                      value={Math.floor(practiceLoop.startSec)}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        setPracticeLoop((p) => ({
                          ...p,
                          startSec: val,
                          endSec: Math.max(val + 5, p.endSec),
                        }));
                      }}
                      className="w-16 px-2 py-1 rounded-lg bg-white border border-slate-200 font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">До (сек):</span>
                    <input
                      type="number"
                      min={5}
                      max={Math.ceil(selectedSong.durationSec)}
                      value={Math.floor(practiceLoop.endSec)}
                      onChange={(e) => {
                        const val = Math.min(
                          Math.ceil(selectedSong.durationSec),
                          Math.max(practiceLoop.startSec + 4, Number(e.target.value))
                        );
                        setPracticeLoop((p) => ({ ...p, endSec: val }));
                      }}
                      className="w-16 px-2 py-1 rounded-lg bg-white border border-slate-200 font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    {[
                      {
                        label: 'Начало',
                        a: 0,
                        b: Math.min(25, Math.floor(selectedSong.durationSec)),
                      },
                      {
                        label: 'Припев',
                        a: previewStartCacheRef.current.get(selectedSong.id) ?? Math.floor(selectedSong.durationSec * 0.32),
                        b: Math.min(
                          Math.floor(selectedSong.durationSec),
                          (previewStartCacheRef.current.get(selectedSong.id) ?? Math.floor(selectedSong.durationSec * 0.32)) + 22
                        ),
                      },
                      {
                        label: 'Финал',
                        a: Math.max(0, Math.floor(selectedSong.durationSec) - 24),
                        b: Math.floor(selectedSong.durationSec),
                      },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setPracticeLoop({
                            enabled: true,
                            startSec: Math.floor(preset.a),
                            endSec: Math.max(Math.floor(preset.a) + 5, Math.floor(preset.b)),
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-[#effdfb] hover:bg-[#39C5BB] border border-[#39C5BB]/40 text-[11px] font-extrabold text-[#0f766e] hover:text-white transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Compact 5-Card Pre-Live Team Strip (click to customize Team & Skills) */}
            <div
              onClick={() => setShowTeamModal(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setShowTeamModal(true);
              }}
              title="Нажми, чтобы изменить команду из 5 карт и их навыки"
              className="pjsk-land-hide-short flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl pjsk-surface-box bg-white/85 hover:bg-[#effdfb]/90 border border-slate-200/85 cursor-pointer transition group"
            >
              <div className="flex items-center gap-2 shrink-0">
                <Users className="w-4 h-4 text-[#39C5BB]" />
                <div className="text-left">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 pjsk-muted-text">
                    Состав Live
                  </div>
                  <div className="text-[11px] font-black text-[#0f766e] pjsk-dark-text group-hover:underline">
                    5 карт · Skills
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {teamCards.slice(0, 5).map((card, idx) => {
                  const avDef = MIKU_AVATARS.find((a) => a.id === card.avatarId) ?? MIKU_AVATARS[0];
                  return (
                    <div
                      key={card.id}
                      className={`relative w-9 h-9 rounded-xl overflow-hidden border-2 bg-white shrink-0 shadow-sm ${
                        idx === 0 ? 'ring-2 ring-amber-300/80' : ''
                      }`}
                      style={{ borderColor: card.color }}
                    >
                      {card.customImageDataUrl ? (
                        <img src={card.customImageDataUrl} alt={card.name} className="w-full h-full object-cover" />
                      ) : (
                        <MikuAvatar def={avDef} className="w-full h-full" />
                      )}
                      {idx === 0 && (
                        <span className="absolute top-0 left-0 px-0.5 rounded-br bg-amber-400 text-[7px] font-black text-slate-950 leading-tight">
                          L
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom CTA Buttons: Editor + Rebalance + Iconic Mint LIVE! Button */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1">
              <button
                disabled={loadingAudio}
                onClick={() => handleOpenEditor(selectedSong, selectedDiff)}
                className="pjsk-land-subbtn sekai-slant px-4 sm:px-5 py-3.5 sm:py-4 rounded-2xl pjsk-surface-box bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 font-black text-sm shadow-sm transition"
              >
                <span className="sekai-unslant flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-[#ff4f8b]" />
                  <span>Редактор нот</span>
                </span>
              </button>

              <button
                disabled={loadingAudio}
                onClick={() => handleRebalanceCharts(selectedSong)}
                title="Пересчитать ноты всех 6 сложностей с новым балансом и синхронизацией"
                className="pjsk-land-subbtn sekai-slant px-4 py-3.5 sm:py-4 rounded-2xl pjsk-surface-box bg-white hover:bg-[#effdfb] border-2 border-[#39C5BB]/40 text-[#0f766e] font-black text-sm shadow-sm transition"
              >
                <span className="sekai-unslant flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Пересчитать</span>
                </span>
              </button>

              <button
                disabled={loadingAudio}
                onClick={() => handleStartLive(selectedSong, selectedDiff, 0)}
                className="pjsk-land-cta pjsk-live-cta flex-1 min-w-[200px] sm:min-w-[240px] py-[18px] px-6 sm:px-8 rounded-2xl text-white font-black text-xl tracking-wider ring-2 ring-white/85 transition active:scale-[0.99]"
              >
                <span className="relative z-10 flex items-center justify-center gap-3 drop-shadow-[0_2px_6px_rgba(0,80,70,0.5)]">
                  <Play className="w-6 h-6 fill-current" />
                  <span>{loadingAudio ? 'ЗАГРУЗКА...' : 'ИГРАТЬ LIVE!'}</span>
                </span>
              </button>
            </div>
          </section>
        )}
      </main>

      <Suspense fallback={null}>
        {showUpload && (
          <UploadSongModal
            onClose={() => setShowUpload(false)}
            onSongCreated={handleSongCreated}
          />
        )}

        {showSettings && (
          <SettingsModal
            initialSection={settingsSection}
            resolvedTheme={resolvedAppTheme}
            settings={settings}
            onChange={updateSettings}
            onProfileRestored={handleProfileRestored}
            onClose={() => setShowSettings(false)}
          />
        )}

        {showAvatarPicker && (
          <AvatarPicker
            current={avatar}
            songs={songs}
            onSelect={handleAvatarSelect}
            onClose={() => setShowAvatarPicker(false)}
          />
        )}

        {showTeamModal && (
          <TeamModal
            cards={teamCards}
            unlockedCardIds={progression.unlockedCardIds}
            onChange={updateTeamCards}
            onClose={() => setShowTeamModal(false)}
          />
        )}

        {showMissionsModal && (
          <MissionsModal
            progression={progression}
            avatar={avatarView}
            teamCards={teamCards}
            onUpdateProgression={updateProgression}
            onEquipCardToSlot={(card, slotIndex) => {
              const next = teamCards.map((c, idx) =>
                idx === slotIndex
                  ? {
                      ...c,
                      name: card.name,
                      unitLabel: card.unitLabel,
                      skillType: card.skillType,
                      color: card.color,
                      avatarId: card.avatarId,
                      customImageDataUrl: null,
                    }
                  : c
              );
              updateTeamCards(next);
            }}
            onClose={() => setShowMissionsModal(false)}
          />
        )}

        {editingCoverSong && (
          <SongCoverModal
            song={editingCoverSong}
            onSave={handleSaveSong}
            onClose={() => setEditingCoverSong(null)}
          />
        )}
      </Suspense>

      {/* Hidden Pack/Song Import File Input */}
      <input
        ref={packImportRef}
        type="file"
        accept=".json,.sekaipack.json,.sekaisong.json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) handleImportPackFile(f);
        }}
      />

      {/* Toast Notification for Playlist Pack Export/Import */}
      {packBusyMsg && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-2xl bg-[#172038] text-white border border-[#39C5BB]/60 shadow-xl text-xs font-black animate-pop-in">
          {packBusyMsg}
        </div>
      )}

      {/* PJSK "MUSIC START" Loading Curtain Overlay */}
      {musicStartCurtain && (
        <div
          onClick={() =>
            launchLiveNow(
              musicStartCurtain.song,
              musicStartCurtain.diff,
              musicStartCurtain.startSec,
              musicStartCurtain.buf
            )
          }
          className="pjsk-preserve fixed inset-0 z-[70] sekai-bg flex items-center justify-center p-4 cursor-pointer select-none animate-pop-in"
        >
          <div className="pointer-events-none fixed inset-0 sekai-grid-overlay" />
          {/* Radiating stage light behind the curtain */}
          <div
            className="pointer-events-none fixed inset-0 opacity-[0.12]"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.9) 0deg 5deg, transparent 5deg 18deg)',
              maskImage: 'radial-gradient(circle at 50% 45%, #000 5%, transparent 52%)',
              WebkitMaskImage: 'radial-gradient(circle at 50% 45%, #000 5%, transparent 52%)',
            }}
          />
          <div className="relative w-full max-w-xl rounded-[28px] sekai-glass border border-[#39C5BB]/55 overflow-hidden shadow-[0_28px_80px_rgba(0,0,0,0.7)]">
            <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93]" />
            <div className="p-6 sm:p-7 flex flex-col items-center text-center gap-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.38em] text-[#39C5BB]">
                <Sparkles className="w-3.5 h-3.5" /> MUSIC START <Sparkles className="w-3.5 h-3.5" />
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 w-full bg-slate-950/55 border border-white/10 rounded-2xl p-4 relative overflow-hidden">
                <span className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(115deg,transparent_38%,#ffffff_50%,transparent_62%)]" />
                <div className="relative shrink-0">
                  <span className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-[#39C5BB]/45 to-[#ff4f93]/40 blur-lg" />
                  <img
                    src={musicStartCurtain.song.coverDataUrl}
                    alt={musicStartCurtain.song.title}
                    className="relative w-24 h-24 rounded-xl object-cover border-2 border-white/80 shadow-xl"
                  />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 mb-1.5">
                    <UnitIcon
                      tag={
                        musicStartCurtain.song.tag ??
                        (musicStartCurtain.song.isBuiltin ? 'virtual_singer' : 'custom')
                      }
                      className="w-4 h-4"
                    />
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-black text-white"
                      style={{
                        background:
                          DIFFICULTY_META[musicStartCurtain.diff].gradient ??
                          DIFFICULTY_META[musicStartCurtain.diff].color,
                      }}
                    >
                      {DIFFICULTY_META[musicStartCurtain.diff].label} Lv.
                      {musicStartCurtain.song.charts[musicStartCurtain.diff]?.level ??
                        DIFFICULTY_META[musicStartCurtain.diff].defaultLevel}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white truncate">
                    {musicStartCurtain.song.title}
                  </h3>
                  <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                    {musicStartCurtain.song.artist} · {musicStartCurtain.song.bpm} BPM
                  </p>
                </div>
              </div>

              {/* 5-Card Team Preview Strip */}
              <div className="grid grid-cols-5 gap-2 w-full">
                {teamCards.slice(0, 5).map((card, idx) => {
                  const avDef = MIKU_AVATARS.find((a) => a.id === card.avatarId) ?? MIKU_AVATARS[0];
                  return (
                    <div
                      key={card.id}
                      className={`pjsk-holo-sheen rounded-xl p-1.5 bg-slate-900/80 border flex flex-col items-center gap-1 ${
                        idx === 0 ? 'border-amber-300/75' : 'border-white/15'
                      }`}
                    >
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/25 bg-white">
                        {card.customImageDataUrl ? (
                          <img src={card.customImageDataUrl} alt={card.name} className="w-full h-full object-cover" />
                        ) : (
                          <MikuAvatar def={avDef} className="w-full h-full" />
                        )}
                        {idx === 0 && (
                          <Crown className="w-3 h-3 text-amber-300 absolute top-0.5 left-0.5 drop-shadow" />
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-white/90 truncate w-full">
                        {card.name.split(' ')[0]}
                      </span>
                      <span className="text-[8px] text-cyan-300 font-black">
                        {card.skillType === 'score_up' && <Zap className="w-2.5 h-2.5 inline text-amber-300" />}
                        {card.skillType === 'perfect_lock' && <ShieldCheck className="w-2.5 h-2.5 inline text-cyan-300" />}
                        {card.skillType === 'healer' && <Heart className="w-2.5 h-2.5 inline text-pink-300" />}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="text-[10px] font-bold text-slate-400 tracking-wider">
                Нажми на экран, чтобы пропустить
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Guide Modal: Note Types & Controls */}
      {showNotesGuide && (
        <div
          onClick={() => setShowNotesGuide(false)}
          className="pjsk-themed-ui pjsk-modal-overlay fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="pjsk-modal-panel w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl bg-white border-2 border-[#39C5BB]/45 shadow-2xl text-slate-800"
          >
            <div className="px-6 py-4 bg-gradient-to-r from-[#effdfb] via-white to-[#fff1f6] border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#39C5BB] to-[#0ea5e9] text-white flex items-center justify-center shadow">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    Гид по нотам и управлению
                  </h2>
                  <p className="text-[11px] font-semibold text-slate-500">
                    Правила Project SEKAI · 4-Lane Colorful Stage
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNotesGuide(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    name: 'Tap (Обычная)',
                    badge: 'CYAN',
                    barClass: 'bg-gradient-to-b from-cyan-200 via-[#39C5BB] to-teal-500 border-white',
                    desc: 'Нажми в момент пересечения линии внизу.',
                  },
                  {
                    name: 'Critical (Критическая)',
                    badge: '×2 SCORE',
                    barClass: 'bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 border-amber-100',
                    desc: 'Золотая нота — даёт двойные очки за PERFECT.',
                  },
                  {
                    name: 'Flick (Флик ▲)',
                    badge: 'SWIPE UP',
                    barClass: 'bg-gradient-to-b from-pink-200 via-[#ff4f93] to-rose-600 border-pink-100',
                    desc: 'На телефоне — проведи пальцем по плитке. На ПК — нажми клавишу.',
                  },
                  {
                    name: 'Trace (Трейс ◆)',
                    badge: 'TOUCH',
                    barClass: 'bg-gradient-to-b from-emerald-200 via-emerald-400 to-teal-500 border-white',
                    desc: 'Просто удерживай палец или клавишу на дорожке — кликать не нужно.',
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3"
                  >
                    <div className="w-16 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 shadow-inner">
                      <div className={`w-11 h-3.5 rounded-full border shadow ${item.barClass}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-slate-900">{item.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-[9px] font-black text-slate-700">
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-snug">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#effdfb] to-[#f0f9ff] border border-[#39C5BB]/35 flex items-center gap-3.5">
                <div className="w-16 h-12 rounded-xl bg-slate-900 flex flex-col items-center justify-center shrink-0 shadow-inner p-1.5">
                  <div className="w-10 h-2 rounded-full bg-pink-400" />
                  <div className="w-8 h-4 bg-emerald-400/50 border-x border-emerald-300" />
                  <div className="w-10 h-2 rounded-full bg-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">
                    Slide (Длинная лента) + End Flick
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                    Зажми зелёную ноту и веди палец вдоль изгиба ленты. Если в конце розовая стрелка —
                    сделай свайп (или отпусти/нажми на ПК).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="font-black text-slate-900 mb-1.5">Управление на ПК</div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {settings.keyBindings.map((k, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-mono font-black text-[#0f766e]"
                      >
                        {k.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Esc — пауза с отсчётом 3·2·1 · R — мгновенный рестарт.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="font-black text-slate-900 mb-1.5">Управление на телефоне</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Нажимай по 4 стеклянным плиткам внизу экрана. Поддерживается мультитач (одновременные
                    аккорды и слайды двумя руками).
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowNotesGuide(false)}
                className="sekai-slant px-6 py-2 rounded-xl pjsk-live-cta text-white text-sm font-black"
              >
                <span className="sekai-unslant block">Понятно!</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authentic Project SEKAI Startup Splash Animation */}
      {splashPhase !== 'done' && (
        <div
          onClick={dismissSplash}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') dismissSplash();
          }}
          aria-label="Заставка Project SEKAI — нажми для входа"
          className={`fixed inset-0 z-[90] pjsk-menu-bg flex flex-col items-center justify-center p-6 cursor-pointer select-none overflow-hidden ${
            splashPhase === 'exiting' ? 'pjsk-splash-exit' : ''
          }`}
        >
          {/* Animated aurora stage behind the splash emblem */}
          <AnimatedBackdrop quality="high" variant="quiet" />
          {/* Prism Grid & Radiating Light Rays */}
          <div className="pointer-events-none fixed inset-0 pjsk-prism-grid opacity-80" />
          <div
            className="pointer-events-none fixed inset-0 opacity-[0.38]"
            style={{
              background:
                'conic-gradient(from 0deg at 50% 48%, rgba(57,197,187,0.22) 0deg 35deg, transparent 35deg 90deg, rgba(255,79,147,0.18) 90deg 130deg, transparent 130deg 210deg, rgba(56,189,248,0.2) 210deg 255deg, transparent 255deg 360deg)',
              maskImage: 'radial-gradient(circle at 50% 48%, #000 12%, transparent 65%)',
              WebkitMaskImage: 'radial-gradient(circle at 50% 48%, #000 12%, transparent 65%)',
            }}
          />

          {/* Floating Glass Shards */}
          <svg
            className="pjsk-prism-shard pointer-events-none absolute top-[14%] left-[12%] w-16 h-16 text-[#39C5BB]/25"
            viewBox="0 0 100 100"
            fill="currentColor"
          >
            <polygon points="50,8 94,86 6,86" />
          </svg>
          <svg
            className="pjsk-prism-shard pointer-events-none absolute bottom-[16%] right-[14%] w-20 h-20 text-[#ff4f93]/20"
            style={{ animationDelay: '-3s' }}
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
          >
            <polygon points="50,10 90,85 10,85" />
          </svg>

          {/* Center Emblem + Shockwave Rings + Title Reveal */}
          <div className="relative flex flex-col items-center text-center max-w-lg w-full">
            {/* Expanding Shockwave Rings */}
            <div className="pointer-events-none absolute top-10 w-44 h-44 rounded-full border-2 border-[#39C5BB]/60 pjsk-splash-ring" />
            <div className="pointer-events-none absolute top-10 w-44 h-44 rounded-full border-2 border-[#ff4f93]/50 pjsk-splash-ring-2" />

            {/* Rotating SEKAI Prism Frame + Miku 01 Emblem */}
            <div className="pjsk-splash-prism relative mb-5">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-[28px] rotate-45 bg-white/85 backdrop-blur-md border-2 border-[#39C5BB]/75 shadow-[0_18px_50px_rgba(57,197,187,0.32)] flex items-center justify-center pjsk-holo-sheen">
                <div className="-rotate-45 flex items-center justify-center">
                  <MikuEmblem className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-md" />
                </div>
              </div>
              <span className="absolute -top-2 -right-3 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#39C5BB] to-[#ff4f93] text-white text-[10px] font-black tracking-widest shadow">
                01
              </span>
            </div>

            {/* Stacked PJSK Title Lockup */}
            <div className="pjsk-splash-title space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#131c36] text-white text-[10px] sm:text-xs font-black tracking-[0.26em] uppercase shadow-md border border-[#39C5BB]/60">
                <span className="w-2 h-2 rotate-45 bg-[#39C5BB]" />
                HATSUNE MIKU
                <span className="w-2 h-2 rotate-45 bg-[#ff4f93]" />
              </div>

              <h1 className="text-3xl sm:text-5xl font-black tracking-wide pjsk-shimmer-text drop-shadow-sm">
                COLORFUL STAGE!
              </h1>
            </div>

            <div className="pjsk-splash-sub mt-2 flex items-center gap-2 text-xs sm:text-sm font-extrabold text-slate-600">
              <span>SEKAI CUSTOM STAGE</span>
              <span className="text-[#39C5BB]">◆</span>
              <span className="text-[#ff4f93]">4-LANE LIVE</span>
            </div>

            {/* Equalizer + Progress Bar */}
            <div className="pjsk-splash-sub mt-8 w-full max-w-xs space-y-2.5">
              <div className="flex items-end justify-center gap-1 h-5">
                <span className="w-1.5 h-4 bg-[#39C5BB] rounded-full animate-eq-1 origin-bottom" />
                <span className="w-1.5 h-5 bg-[#38bdf8] rounded-full animate-eq-2 origin-bottom" />
                <span className="w-1.5 h-3.5 bg-[#ff4f93] rounded-full animate-eq-3 origin-bottom" />
                <span className="w-1.5 h-5 bg-[#39C5BB] rounded-full animate-eq-2 origin-bottom" />
                <span className="w-1.5 h-4 bg-[#ff4f93] rounded-full animate-eq-1 origin-bottom" />
              </div>

              <div className="h-2 w-full rounded-full bg-white/90 border border-slate-200/80 shadow-inner overflow-hidden p-0.5">
                <div className="pjsk-splash-bar h-full rounded-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93]" />
              </div>

              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                TAP TO START · ПОДКЛЮЧЕНИЕ К SEKAI
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
