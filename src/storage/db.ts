import {
  AvatarSelection,
  DEFAULT_PROGRESSION,
  DEFAULT_SETTINGS,
  DEFAULT_TEAM_CARDS,
  GameSettings,
  PlayerProgression,
  PlayResult,
  SEKAI_MISSIONS,
  SongItem,
  TeamCard,
  uid,
} from '../types/game';

const DB_NAME = 'sekai_custom_stage_db';
const DB_VERSION = 2;
const SONGS_STORE = 'songs';
const AUDIO_STORE = 'audio_files';
const BG_STORE = 'bg_media';
const SETTINGS_KEY = 'sekai_custom_stage_settings_v1';
const AVATAR_KEY = 'sekai_custom_stage_avatar_v1';
const TEAM_KEY = 'sekai_custom_stage_team_v1';
const PROGRESSION_KEY = 'sekai_custom_stage_progression_v1';

export interface StoredBgMedia {
  kind: 'video' | 'image';
  mimeType: string;
  data: ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SONGS_STORE)) {
        db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
      if (!db.objectStoreNames.contains(BG_STORE)) {
        db.createObjectStore(BG_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllStoredSongs(): Promise<SongItem[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SONGS_STORE, 'readonly');
      const store = tx.objectStore(SONGS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as SongItem[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveSongMetadata(song: SongItem): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SONGS_STORE, 'readwrite');
      tx.objectStore(SONGS_STORE).put(song);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to save song metadata:', e);
  }
}

export async function saveSongAudio(songId: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      tx.objectStore(AUDIO_STORE).put(buffer, songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to save song audio:', e);
  }
}

export async function loadSongAudio(songId: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const req = tx.objectStore(AUDIO_STORE).get(songId);
      req.onsuccess = () => resolve((req.result as ArrayBuffer) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveSongBgMedia(songId: string, media: StoredBgMedia): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BG_STORE, 'readwrite');
      tx.objectStore(BG_STORE).put(media, songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to save song bg media:', e);
  }
}

export async function loadSongBgMedia(songId: string): Promise<StoredBgMedia | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(BG_STORE, 'readonly');
      const req = tx.objectStore(BG_STORE).get(songId);
      req.onsuccess = () => resolve((req.result as StoredBgMedia) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteSongBgMedia(songId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BG_STORE, 'readwrite');
      tx.objectStore(BG_STORE).delete(songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function deleteStoredSong(songId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SONGS_STORE, AUDIO_STORE, BG_STORE], 'readwrite');
      tx.objectStore(SONGS_STORE).delete(songId);
      tx.objectStore(AUDIO_STORE).delete(songId);
      tx.objectStore(BG_STORE).delete(songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to delete song:', e);
  }
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const merged: GameSettings = { ...DEFAULT_SETTINGS, ...parsed };
    // Old concert-world preferences must not leave light dialogs on a dark menu.
    // Keep an explicitly chosen old night world dark, without coupling future
    // song/unit changes to the user's interface appearance.
    if (!['system', 'light', 'pink', 'dark'].includes(String(parsed.appTheme))) {
      merged.appTheme = parsed.sekaiTheme === 'nightcord' || parsed.sekaiTheme === 'vivid'
        ? 'dark'
        : DEFAULT_SETTINGS.appTheme;
    }
    merged.highContrast = parsed.highContrast === true;
    merged.reduceMotion = parsed.reduceMotion === true;
    const kb = parsed.keyBindings as unknown;
    if (!Array.isArray(kb) || kb.length !== 4) {
      if (Array.isArray(kb) && kb.length === 6) {
        merged.keyBindings = [
          String(kb[1] ?? 'd'),
          String(kb[2] ?? 'f'),
          String(kb[3] ?? 'j'),
          String(kb[4] ?? 'k'),
        ];
      } else {
        merged.keyBindings = [...DEFAULT_SETTINGS.keyBindings];
      }
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export const DEFAULT_AVATAR: AvatarSelection = { id: 'classic_01' };

export function loadAvatar(): AvatarSelection {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (!raw) return DEFAULT_AVATAR;
    const parsed = JSON.parse(raw) as Partial<AvatarSelection>;
    if (parsed && typeof parsed.id === 'string') {
      return { id: parsed.id, customDataUrl: parsed.customDataUrl ?? null };
    }
    return DEFAULT_AVATAR;
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function saveAvatar(avatar: AvatarSelection): void {
  try {
    localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar));
  } catch {
    // ignore
  }
}

export function loadTeamCards(): TeamCard[] {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (!raw) return DEFAULT_TEAM_CARDS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 5) return parsed;
    return DEFAULT_TEAM_CARDS;
  } catch {
    return DEFAULT_TEAM_CARDS;
  }
}

export function saveTeamCards(cards: TeamCard[]): void {
  try {
    localStorage.setItem(TEAM_KEY, JSON.stringify(cards));
  } catch {
    // ignore
  }
}

export function loadProgression(): PlayerProgression {
  try {
    const raw = localStorage.getItem(PROGRESSION_KEY);
    if (!raw) return DEFAULT_PROGRESSION;
    const parsed = JSON.parse(raw) as Partial<PlayerProgression>;
    return {
      ...DEFAULT_PROGRESSION,
      ...parsed,
      unlockedFrameIds: Array.isArray(parsed.unlockedFrameIds) && parsed.unlockedFrameIds.length > 0
        ? parsed.unlockedFrameIds
        : DEFAULT_PROGRESSION.unlockedFrameIds,
      unlockedTitleIds: Array.isArray(parsed.unlockedTitleIds) && parsed.unlockedTitleIds.length > 0
        ? parsed.unlockedTitleIds
        : DEFAULT_PROGRESSION.unlockedTitleIds,
      unlockedCardIds: Array.isArray(parsed.unlockedCardIds) && parsed.unlockedCardIds.length > 0
        ? parsed.unlockedCardIds
        : DEFAULT_PROGRESSION.unlockedCardIds,
      claimedMissionIds: Array.isArray(parsed.claimedMissionIds)
        ? parsed.claimedMissionIds
        : [],
    };
  } catch {
    return DEFAULT_PROGRESSION;
  }
}

export function saveProgression(prog: PlayerProgression): void {
  try {
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify(prog));
  } catch {
    // ignore
  }
}

export function evaluateMissionsOnProgression(prog: PlayerProgression): {
  next: PlayerProgression;
  newlyCompleted: string[];
  missionCrystals: number;
} {
  const next: PlayerProgression = {
    ...prog,
    claimedMissionIds: [...prog.claimedMissionIds],
  };
  const newlyCompleted: string[] = [];
  let missionCrystals = 0;

  for (const m of SEKAI_MISSIONS) {
    if (next.claimedMissionIds.includes(m.id)) continue;
    const val = next[m.metric] ?? 0;
    if (val >= m.target) {
      next.claimedMissionIds.push(m.id);
      next.crystals += m.rewardCrystals;
      missionCrystals += m.rewardCrystals;
      newlyCompleted.push(m.title);
    }
  }
  return { next, newlyCompleted, missionCrystals };
}

export function applyLiveResultToProgression(
  prog: PlayerProgression,
  result: PlayResult
): {
  next: PlayerProgression;
  earnedCrystals: number;
  newlyCompletedMissions: string[];
} {
  if (result.autoPlayUsed || result.practiceLoopUsed || !result.cleared) {
    return { next: prog, earnedCrystals: 0, newlyCompletedMissions: [] };
  }

  const accuracy =
    result.totalNotes > 0
      ? ((result.counts.PERFECT * 1 +
          result.counts.GREAT * 0.7 +
          result.counts.GOOD * 0.5 +
          result.counts.BAD * 0.1) /
          result.totalNotes) *
        100
      : 100;

  const baseReward = result.allPerfect ? 60 : result.fullCombo ? 40 : 25;
  const isExpertPlus =
    result.difficulty === 'expert' ||
    result.difficulty === 'master' ||
    result.difficulty === 'append';

  const updated: PlayerProgression = {
    ...prog,
    crystals: prog.crystals + baseReward,
    totalClears: prog.totalClears + 1,
    totalFullCombos: prog.totalFullCombos + (result.fullCombo ? 1 : 0),
    totalAllPerfects: prog.totalAllPerfects + (result.allPerfect ? 1 : 0),
    expertPlusClears: prog.expertPlusClears + (isExpertPlus ? 1 : 0),
    rankSClears: prog.rankSClears + (accuracy >= 92 || result.allPerfect ? 1 : 0),
  };

  const evaluated = evaluateMissionsOnProgression(updated);
  return {
    next: evaluated.next,
    earnedCrystals: baseReward + evaluated.missionCrystals,
    newlyCompletedMissions: evaluated.newlyCompleted,
  };
}

// ======================================================
// Portable Full Song Package (.sekaisong.json) Export / Import
// ======================================================
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function audioBufferToWavArrayBuffer(buffer: AudioBuffer): ArrayBuffer {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const dataBytes = numFrames * numCh * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  const ch0 = buffer.getChannelData(0);
  const ch1 = numCh > 1 ? buffer.getChannelData(1) : ch0;
  for (let i = 0; i < numFrames; i++) {
    const s0 = Math.max(-1, Math.min(1, ch0[i]));
    view.setInt16(offset, s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff, true);
    offset += 2;
    if (numCh > 1) {
      const s1 = Math.max(-1, Math.min(1, ch1[i]));
      view.setInt16(offset, s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}

export interface SongPackageFile {
  format: 'sekai-song-package-v1';
  song: Omit<SongItem, 'id' | 'isBuiltin' | 'builtinId' | 'highScores'>;
  audioBase64: string;
  bgMedia?: { kind: 'video' | 'image'; mimeType: string; dataBase64: string };
}

export async function exportSongPackage(
  song: SongItem,
  fallbackBuffer?: AudioBuffer
): Promise<string> {
  let audioBytes = await loadSongAudio(song.id);
  if (!audioBytes && fallbackBuffer) {
    audioBytes = audioBufferToWavArrayBuffer(fallbackBuffer);
  }
  if (!audioBytes) {
    throw new Error('Не найден аудиофайл песни для экспорта');
  }
  const bg = await loadSongBgMedia(song.id);
  const pkg: SongPackageFile = {
    format: 'sekai-song-package-v1',
    song: {
      title: song.title,
      artist: song.artist,
      bpm: song.bpm,
      bpmChanges: song.bpmChanges,
      offsetMs: song.offsetMs,
      durationSec: song.durationSec,
      coverDataUrl: song.coverDataUrl,
      favorite: song.favorite,
      tag: song.tag,
      bgKind: song.bgKind,
      bgDim: song.bgDim,
      charts: song.charts,
      createdAt: song.createdAt,
    },
    audioBase64: arrayBufferToBase64(audioBytes),
    ...(bg
      ? {
          bgMedia: {
            kind: bg.kind,
            mimeType: bg.mimeType,
            dataBase64: arrayBufferToBase64(bg.data),
          },
        }
      : {}),
  };
  return JSON.stringify(pkg);
}

export async function parseSongPackage(jsonText: string): Promise<{
  song: SongItem;
  audioBytes: ArrayBuffer;
  bgMedia?: StoredBgMedia;
}> {
  const pkg = JSON.parse(jsonText) as SongPackageFile;
  if (pkg.format !== 'sekai-song-package-v1' || !pkg.audioBase64 || !pkg.song) {
    throw new Error('Неверный формат пакета песни (.sekaisong.json)');
  }
  const newId = uid('song');
  const song: SongItem = {
    ...pkg.song,
    id: newId,
    isBuiltin: false,
    highScores: {},
    createdAt: Date.now(),
  };
  const audioBytes = base64ToArrayBuffer(pkg.audioBase64);
  const bgMedia: StoredBgMedia | undefined = pkg.bgMedia
    ? {
        kind: pkg.bgMedia.kind,
        mimeType: pkg.bgMedia.mimeType,
        data: base64ToArrayBuffer(pkg.bgMedia.dataBase64),
      }
    : undefined;
  return { song, audioBytes, bgMedia };
}

// ======================================================
// Portable Full Playlist / Collection Pack (.sekaipack.json)
// ======================================================
export interface SongPackItem {
  song: Omit<SongItem, 'id' | 'isBuiltin' | 'builtinId'>;
  audioBase64: string;
  bgMedia?: { kind: 'video' | 'image'; mimeType: string; dataBase64: string };
}

export interface SongsPackFile {
  format: 'sekai-song-pack-v1';
  exportedAt: number;
  items: SongPackItem[];
}

export async function exportSongsPack(
  songs: SongItem[],
  fallbackBuffers?: Record<string, AudioBuffer>
): Promise<{ json: string; count: number }> {
  const items: SongPackItem[] = [];
  for (const song of songs) {
    let audioBytes = await loadSongAudio(song.id);
    if (!audioBytes && fallbackBuffers?.[song.id]) {
      audioBytes = audioBufferToWavArrayBuffer(fallbackBuffers[song.id]);
    }
    if (!audioBytes) continue;
    const bg = await loadSongBgMedia(song.id);
    items.push({
      song: {
        title: song.title,
        artist: song.artist,
        bpm: song.bpm,
        bpmChanges: song.bpmChanges,
        offsetMs: song.offsetMs,
        durationSec: song.durationSec,
        coverDataUrl: song.coverDataUrl,
        favorite: song.favorite,
        tag: song.tag,
        bgKind: song.bgKind,
        bgDim: song.bgDim,
        analyzerVersion: song.analyzerVersion,
        chartEdited: song.chartEdited,
        charts: song.charts,
        highScores: song.highScores,
        createdAt: song.createdAt,
      },
      audioBase64: arrayBufferToBase64(audioBytes),
      ...(bg
        ? {
            bgMedia: {
              kind: bg.kind,
              mimeType: bg.mimeType,
              dataBase64: arrayBufferToBase64(bg.data),
            },
          }
        : {}),
    });
  }
  const pack: SongsPackFile = {
    format: 'sekai-song-pack-v1',
    exportedAt: Date.now(),
    items,
  };
  return { json: JSON.stringify(pack), count: items.length };
}

export async function parseSongsPack(jsonText: string): Promise<
  Array<{
    song: SongItem;
    audioBytes: ArrayBuffer;
    bgMedia?: StoredBgMedia;
  }>
> {
  const parsed = JSON.parse(jsonText) as SongsPackFile | SongPackageFile;
  if ((parsed as SongPackageFile).format === 'sekai-song-package-v1') {
    return [await parseSongPackage(jsonText)];
  }
  const pack = parsed as SongsPackFile;
  if (pack.format !== 'sekai-song-pack-v1' || !Array.isArray(pack.items)) {
    throw new Error('Неверный формат сборника песен (.sekaipack.json)');
  }
  const out: Array<{ song: SongItem; audioBytes: ArrayBuffer; bgMedia?: StoredBgMedia }> = [];
  for (const item of pack.items) {
    if (!item?.song || !item?.audioBase64) continue;
    const song: SongItem = {
      ...item.song,
      id: uid('song'),
      isBuiltin: false,
      highScores: item.song.highScores ?? {},
      createdAt: item.song.createdAt || Date.now(),
    };
    const audioBytes = base64ToArrayBuffer(item.audioBase64);
    const bgMedia: StoredBgMedia | undefined = item.bgMedia
      ? {
          kind: item.bgMedia.kind,
          mimeType: item.bgMedia.mimeType,
          data: base64ToArrayBuffer(item.bgMedia.dataBase64),
        }
      : undefined;
    out.push({ song, audioBytes, bgMedia });
  }
  return out;
}

export interface StorageUsageStats {
  songsCount: number;
  audioBytes: number;
  bgBytes: number;
  totalBytes: number;
  orphanCount: number;
}

export async function getStorageUsageStats(): Promise<StorageUsageStats> {
  try {
    const db = await openDB();
    const songs = await getAllStoredSongs();
    const validIds = new Set(songs.map((s) => s.id));
    let audioBytes = 0;
    let bgBytes = 0;
    let orphanCount = 0;

    await new Promise<void>((resolve) => {
      const tx = db.transaction([AUDIO_STORE, BG_STORE], 'readonly');
      const aStore = tx.objectStore(AUDIO_STORE);
      const bStore = tx.objectStore(BG_STORE);

      const aCur = aStore.openCursor();
      aCur.onsuccess = () => {
        const c = aCur.result;
        if (!c) return;
        const val = c.value as ArrayBuffer | undefined;
        if (val && typeof val.byteLength === 'number') audioBytes += val.byteLength;
        if (!validIds.has(String(c.key))) orphanCount++;
        c.continue();
      };

      const bCur = bStore.openCursor();
      bCur.onsuccess = () => {
        const c = bCur.result;
        if (!c) return;
        const val = c.value as StoredBgMedia | undefined;
        if (val?.data && typeof val.data.byteLength === 'number') bgBytes += val.data.byteLength;
        if (!validIds.has(String(c.key))) orphanCount++;
        c.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    return {
      songsCount: songs.length,
      audioBytes,
      bgBytes,
      totalBytes: audioBytes + bgBytes,
      orphanCount,
    };
  } catch {
    return { songsCount: 0, audioBytes: 0, bgBytes: 0, totalBytes: 0, orphanCount: 0 };
  }
}

export async function cleanupOrphanMedia(): Promise<number> {
  try {
    const db = await openDB();
    const songs = await getAllStoredSongs();
    const validIds = new Set(songs.map((s) => s.id));
    let removed = 0;

    await new Promise<void>((resolve) => {
      const tx = db.transaction([AUDIO_STORE, BG_STORE], 'readwrite');
      for (const storeName of [AUDIO_STORE, BG_STORE]) {
        const store = tx.objectStore(storeName);
        const curReq = store.openCursor();
        curReq.onsuccess = () => {
          const c = curReq.result;
          if (!c) return;
          if (!validIds.has(String(c.key))) {
            c.delete();
            removed++;
          }
          c.continue();
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return removed;
  } catch {
    return 0;
  }
}

export interface ProfileBackupPayload {
  format: 'sekai-profile-backup-v1';
  exportedAt: number;
  settings: GameSettings;
  avatar: AvatarSelection;
  teamCards: TeamCard[];
  progression: PlayerProgression;
  songRecords: Record<
    string,
    {
      favorite?: boolean;
      highScores: SongItem['highScores'];
    }
  >;
}

export async function exportProfileBackup(): Promise<string> {
  const songs = await getAllStoredSongs();
  const songRecords: ProfileBackupPayload['songRecords'] = {};
  for (const s of songs) {
    songRecords[s.id] = {
      favorite: s.favorite,
      highScores: s.highScores ?? {},
    };
  }
  const payload: ProfileBackupPayload = {
    format: 'sekai-profile-backup-v1',
    exportedAt: Date.now(),
    settings: loadSettings(),
    avatar: loadAvatar(),
    teamCards: loadTeamCards(),
    progression: loadProgression(),
    songRecords,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importProfileBackup(rawText: string): Promise<{
  settings: GameSettings;
  avatar: AvatarSelection;
  teamCards: TeamCard[];
  progression: PlayerProgression;
  updatedSongs: number;
}> {
  const parsed = JSON.parse(rawText) as Partial<ProfileBackupPayload>;
  if (parsed?.format !== 'sekai-profile-backup-v1') {
    throw new Error('Неверный формат файла бэкапа (.sekaibackup.json)');
  }
  const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
  const avatar: AvatarSelection = parsed.avatar?.id
    ? parsed.avatar
    : { id: 'classic_01', customDataUrl: null };
  const teamCards =
    Array.isArray(parsed.teamCards) && parsed.teamCards.length === 5
      ? parsed.teamCards
      : DEFAULT_TEAM_CARDS;
  const progression = { ...DEFAULT_PROGRESSION, ...(parsed.progression ?? {}) };

  saveSettings(settings);
  saveAvatar(avatar);
  saveTeamCards(teamCards);
  saveProgression(progression);

  let updatedSongs = 0;
  if (parsed.songRecords && typeof parsed.songRecords === 'object') {
    const existing = await getAllStoredSongs();
    for (const s of existing) {
      const rec = parsed.songRecords[s.id];
      if (!rec) continue;
      await saveSongMetadata({
        ...s,
        favorite: rec.favorite ?? s.favorite,
        highScores: { ...(s.highScores ?? {}), ...(rec.highScores ?? {}) },
      });
      updatedSongs++;
    }
  }

  return { settings, avatar, teamCards, progression, updatedSongs };
}
