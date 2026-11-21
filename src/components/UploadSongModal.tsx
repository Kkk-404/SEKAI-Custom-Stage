import React, { useRef, useState } from 'react';
import { Film, FolderUp, Image, Music, Sparkles, Tag, Upload, Wand2, X } from 'lucide-react';
import { AudioAnalysisResult, analyzeAudioBuffer, generateAllDifficulties } from '../audio/analyzer';
import { parseAnyChartFile } from '../audio/chartFormats';
import { createProceduralCover } from '../audio/demoGenerator';
import { soundEngine } from '../audio/soundEngine';
import { parseSongPackage, saveSongBgMedia } from '../storage/db';
import { Chart, DIFFICULTIES, Difficulty, SEKAI_TAGS, SekaiTag, SongItem, uid } from '../types/game';
import { fileToAvatarDataUrl } from './Avatars';

interface UploadSongModalProps {
  onClose: () => void;
  onSongCreated: (song: SongItem, audioBytes: ArrayBuffer, decodedBuffer: AudioBuffer) => Promise<void>;
}

export const UploadSongModal: React.FC<UploadSongModalProps> = ({ onClose, onSongCreated }) => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBytes, setAudioBytes] = useState<ArrayBuffer | null>(null);
  const [decodedBuffer, setDecodedBuffer] = useState<AudioBuffer | null>(null);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [tag, setTag] = useState<SekaiTag>('custom');
  const [bpm, setBpm] = useState<number>(128);
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const [coverDataUrl, setCoverDataUrl] = useState<string>('');
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgDim, setBgDim] = useState<number>(0.52);
  const [chartMode, setChartMode] = useState<'auto' | 'blank' | 'import'>('auto');
  const [importedChart, setImportedChart] = useState<{
    notes: Chart['notes'];
    difficulty: Difficulty;
  } | null>(null);

  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const chartInputRef = useRef<HTMLInputElement | null>(null);
  const packageInputRef = useRef<HTMLInputElement | null>(null);
  const analysisRef = useRef<AudioAnalysisResult | null>(null);

  const handlePackageSelected = async (file: File) => {
    setErrorText(null);
    setIsBusy(true);
    setStatusText('Распаковываем .sekaisong.json...');
    try {
      const text = await file.text();
      const { song, audioBytes: pkgBytes, bgMedia: pkgBg } = await parseSongPackage(text);
      const decoded = await soundEngine.decodeAudioData(pkgBytes);
      const freshId = uid('song');
      if (pkgBg) {
        await saveSongBgMedia(freshId, pkgBg);
      }
      await onSongCreated(
        {
          ...song,
          id: freshId,
          durationSec: decoded.duration,
          createdAt: Date.now(),
        },
        pkgBytes,
        decoded
      );
      onClose();
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Ошибка импорта пакета .sekaisong.json');
      setStatusText(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAudioSelected = async (file: File) => {
    setErrorText(null);
    setIsBusy(true);
    setStatusText('Декодируем звук и определяем BPM...');
    try {
      const buf = await file.arrayBuffer();
      const decoded = await soundEngine.decodeAudioData(buf);
      const analysis = analyzeAudioBuffer(decoded);
      analysisRef.current = analysis;

      setAudioFile(file);
      setAudioBytes(buf);
      setDecodedBuffer(decoded);
      setBpm(analysis.bpm);
      setOffsetMs(analysis.offsetMs);

      if (file.type.startsWith('video/')) {
        setBgFile(file);
      }

      const cleanName = file.name.replace(/\.[^.]+$/, '');
      if (cleanName.includes(' - ')) {
        const [a, t] = cleanName.split(' - ', 2);
        setArtist(a.trim());
        setTitle(t.trim());
      } else {
        setTitle(cleanName);
        setArtist('Мои треки');
      }
      setStatusText(
        `Готово! ~${analysis.bpm} BPM (${Math.round(decoded.duration)} сек.)${
          file.type.startsWith('video/') ? ' · Клип поставлен на фон!' : ''
        }`
      );
    } catch {
      setErrorText('Не удалось декодировать звук. Попробуй MP3, WAV, OGG или MP4 с аудиодорожкой.');
      setStatusText(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCoverSelected = async (file: File) => {
    try {
      const url = await fileToAvatarDataUrl(file, 420);
      setCoverDataUrl(url);
    } catch {
      setErrorText('Не удалось загрузить обложку. Попробуй JPG, PNG или WEBP.');
    }
  };

  const handleChartFileSelected = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseAnyChartFile(file.name, text);
      if (parsed.imported.bpm) setBpm(parsed.imported.bpm);
      if (typeof parsed.imported.offsetMs === 'number') setOffsetMs(parsed.imported.offsetMs);
      setImportedChart({
        notes: parsed.imported.notes,
        difficulty: parsed.chart?.difficulty ?? 'expert',
      });
      setChartMode('import');
      setErrorText(null);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Ошибка чтения файла чарта');
    }
  };

  const handleSubmit = async () => {
    if (!audioBytes || !decodedBuffer) {
      setErrorText('Сначала выбери аудиофайл!');
      return;
    }
    setIsBusy(true);
    setStatusText('Генерируем дорожки нот...');
    try {
      const songTitle = title.trim() || 'Untitled Track';
      const songArtist = artist.trim() || 'Unknown Artist';
      const cover = coverDataUrl || createProceduralCover(songTitle, '#39C5BB', '#ff4f93');

      let charts: Partial<Record<Difficulty, Chart>> = {};
      if (chartMode === 'auto') {
        const analysis = analysisRef.current ?? analyzeAudioBuffer(decodedBuffer);
        charts = generateAllDifficulties(analysis, bpm, offsetMs);
      } else if (chartMode === 'blank') {
        for (const d of DIFFICULTIES) {
          charts[d] = { difficulty: d, level: 15, notes: [] };
        }
      } else if (chartMode === 'import' && importedChart) {
        const analysis = analyzeAudioBuffer(decodedBuffer);
        charts = generateAllDifficulties(analysis, bpm, offsetMs);
        charts[importedChart.difficulty] = {
          difficulty: importedChart.difficulty,
          level: 25,
          notes: importedChart.notes,
        };
      }

      const songId = uid('song');
      let bgKind: 'video' | 'image' | undefined;
      if (bgFile) {
        bgKind = bgFile.type.startsWith('video/') ? 'video' : 'image';
        const bgBuf = await bgFile.arrayBuffer();
        await saveSongBgMedia(songId, {
          kind: bgKind,
          mimeType: bgFile.type,
          data: bgBuf,
        });
      }

      const newSong: SongItem = {
        id: songId,
        title: songTitle,
        artist: songArtist,
        bpm,
        offsetMs,
        durationSec: decodedBuffer.duration,
        coverDataUrl: cover,
        tag,
        bgKind,
        bgDim,
        isBuiltin: false,
        analyzerVersion: 4,
        charts,
        highScores: {},
        createdAt: Date.now(),
      };

      await onSongCreated(newSong, audioBytes, decodedBuffer);
      onClose();
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Ошибка при сохранении песни');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="pjsk-themed-ui pjsk-modal-overlay fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-md flex items-center justify-center p-4 text-slate-800">
      <div className="pjsk-modal-panel w-full max-w-xl rounded-[28px] bg-white/95 border border-[#39C5BB]/35 shadow-[0_24px_60px_rgba(15,23,42,0.22)] overflow-hidden flex flex-col max-h-[92vh] animate-pop-in">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93] shrink-0" />
        <div className="pjsk-modal-banner px-6 py-4 bg-gradient-to-r from-[#f3fdfa] to-[#fff5f9] border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#39C5BB] to-[#ff4f93] flex items-center justify-center shadow">
              <Music className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Загрузить свою песню или клип</h2>
              <p className="text-xs text-slate-500 font-medium">
                MP3, WAV, OGG, FLAC или видеоклип MP4 / WebM
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,video/mp4,video/webm,video/quicktime"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAudioSelected(f);
            }}
            className="hidden"
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleAudioSelected(f);
            }}
            onClick={() => audioInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition ${
              audioFile
                ? 'border-[#39C5BB] bg-[#ebfcfa]'
                : 'border-[#39C5BB]/50 bg-slate-50 hover:bg-[#effdfb]'
            }`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-[#39C5BB]" />
            <div className="text-sm font-extrabold text-slate-800">
              {audioFile ? audioFile.name : 'Нажми или перетащи аудио / видеоклип (MP4) сюда'}
            </div>
            {statusText && <div className="text-xs font-bold text-[#0f766e] mt-1">{statusText}</div>}
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600">
              Есть готовый трек в формате <span className="font-mono text-[#009683]">.sekaisong.json</span>?
            </span>
            <input
              ref={packageInputRef}
              type="file"
              accept=".json,.sekaisong.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handlePackageSelected(f);
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => packageInputRef.current?.click()}
              className="px-3 py-1 rounded-lg bg-white hover:bg-[#effdfb] border border-[#39C5BB]/50 text-[#0f766e] text-xs font-extrabold flex items-center gap-1.5 shrink-0"
            >
              <FolderUp className="w-3.5 h-3.5" /> Импорт пакета
            </button>
          </div>

          {errorText && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 text-xs font-semibold">
              {errorText}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Название трека</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: World is Mine"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 focus:border-[#39C5BB] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Исполнитель</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Hatsune Miku / Автор"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 focus:border-[#39C5BB] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">BPM (авто)</label>
              <input
                type="number"
                step="0.5"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 120)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Offset (мс)</label>
              <input
                type="number"
                step="10"
                value={offsetMs}
                onChange={(e) => setOffsetMs(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Обложка</label>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCoverSelected(f);
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-full py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 min-h-[38px]"
              >
                {coverDataUrl ? (
                  <>
                    <img src={coverDataUrl} alt="" className="w-5 h-5 rounded object-cover" />
                    <span>Выбрана ✓</span>
                  </>
                ) : (
                  <>
                    <Image className="w-3.5 h-3.5 text-[#ff4f93]" />
                    <span>Загрузить</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Optional 2DMV Video Clip / Image Background */}
          <div className="p-3 rounded-2xl bg-gradient-to-r from-[#effdfb] to-[#fff1f7] border border-[#39C5BB]/40 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                <Film className="w-4 h-4 text-[#ff4f93]" />
                Клип на фон игры (2DMV)
              </div>
              {bgFile && (
                <button
                  type="button"
                  onClick={() => setBgFile(null)}
                  className="text-[11px] font-bold text-rose-500 hover:underline"
                >
                  Убрать
                </button>
              )}
            </div>
            <input
              ref={bgInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setBgFile(f);
              }}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-sm"
              >
                <Film className="w-3.5 h-3.5 text-[#39C5BB]" />
                <span className="truncate max-w-[200px]">
                  {bgFile ? `${bgFile.name} ✓` : 'Выбрать клип (.mp4/.webm) или арт'}
                </span>
              </button>
              {bgFile && (
                <div className="flex-1 min-w-[140px]">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>Затемнение</span>
                    <span className="font-mono">{Math.round(bgDim * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={0.85}
                    step={0.05}
                    value={bgDim}
                    onChange={(e) => setBgDim(Number(e.target.value))}
                    className="w-full accent-[#ff4f93]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Unit / Category Tag */}
          <div>
            <div className="text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-[#39C5BB]" /> Категория / Юнит
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SEKAI_TAGS) as SekaiTag[]).map((tKey) => {
                const tInfo = SEKAI_TAGS[tKey];
                const active = tag === tKey;
                return (
                  <button
                    key={tKey}
                    type="button"
                    onClick={() => setTag(tKey)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border transition ${
                      active
                        ? 'text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                    style={
                      active
                        ? { background: tInfo.color, borderColor: tInfo.color }
                        : undefined
                    }
                  >
                    {tInfo.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-500 mb-2">Как создать ноты (чарт)?</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setChartMode('auto')}
                className={`p-3 rounded-2xl border-2 text-left transition ${
                  chartMode === 'auto'
                    ? 'bg-[#ebfcfa] border-[#39C5BB] text-slate-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <Wand2 className="w-4 h-4 text-[#00a896] mb-1" />
                <div className="text-xs font-black">Автогенерация</div>
                <div className="text-[11px] text-slate-500">Все 6 сложностей</div>
              </button>

              <button
                type="button"
                onClick={() => setChartMode('blank')}
                className={`p-3 rounded-2xl border-2 text-left transition ${
                  chartMode === 'blank'
                    ? 'bg-pink-50 border-[#ff4f93] text-slate-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#ff4f93] mb-1" />
                <div className="text-xs font-black">Пустой чарт</div>
                <div className="text-[11px] text-slate-500">Вручную в редакторе</div>
              </button>

              <button
                type="button"
                onClick={() => chartInputRef.current?.click()}
                className={`p-3 rounded-2xl border-2 text-left transition ${
                  chartMode === 'import'
                    ? 'bg-emerald-50 border-emerald-500 text-slate-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <Upload className="w-4 h-4 text-emerald-600 mb-1" />
                <div className="text-xs font-black">Импорт файла</div>
                <div className="text-[11px] text-slate-500">
                  {importedChart ? `${importedChart.notes.length} нот` : '.sus / .usc / .json'}
                </div>
              </button>
              <input
                ref={chartInputRef}
                type="file"
                accept=".sus,.usc,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleChartFileSelected(f);
                }}
                className="hidden"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-sm font-bold text-slate-600"
          >
            Отмена
          </button>
          <button
            disabled={!audioFile || isBusy}
            onClick={handleSubmit}
            className="sekai-slant px-6 py-2.5 rounded-xl pjsk-live-cta text-white text-sm font-black disabled:opacity-40 transition"
          >
            <span className="sekai-unslant block">
              {isBusy ? 'Обработка...' : 'Добавить в игру'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
