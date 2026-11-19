import React, { useRef, useState } from 'react';
import { Camera, Film, ImagePlus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { createProceduralCover } from '../audio/demoGenerator';
import {
  deleteSongBgMedia,
  saveSongBgMedia,
} from '../storage/db';
import { SEKAI_TAGS, SekaiTag, SongItem } from '../types/game';
import { fileToAvatarDataUrl } from './Avatars';

interface SongCoverModalProps {
  song: SongItem;
  onSave: (updated: SongItem) => Promise<void>;
  onClose: () => void;
}

const COVER_PRESETS: Array<{ label: string; c1: string; c2: string }> = [
  { label: 'Miku Teal', c1: '#39C5BB', c2: '#0f766e' },
  { label: 'Sakura Miku', c1: '#ff7eb6', c2: '#ec4899' },
  { label: 'Vivid Neon', c1: '#06b6d4', c2: '#ff4f93' },
  { label: 'Nightcord', c1: '#6366f1', c2: '#312e81' },
  { label: 'Leo/need', c1: '#38bdf8', c2: '#1d4ed8' },
  { label: 'Showtime', c1: '#f59e0b', c2: '#ef4444' },
];

export const SongCoverModal: React.FC<SongCoverModalProps> = ({ song, onSave, onClose }) => {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [tag, setTag] = useState<SekaiTag>(song.tag ?? (song.isBuiltin ? 'virtual_singer' : 'custom'));
  const [coverDataUrl, setCoverDataUrl] = useState(song.coverDataUrl || '');

  const [bgKind, setBgKind] = useState<'video' | 'image' | undefined>(song.bgKind);
  const [bgDim, setBgDim] = useState<number>(song.bgDim ?? 0.55);
  const [pendingBgFile, setPendingBgFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);

  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const url = await fileToAvatarDataUrl(file, 420);
      setCoverDataUrl(url);
    } catch {
      alert('Не удалось загрузить картинку. Попробуй JPG, PNG или WEBP.');
    } finally {
      setBusy(false);
    }
  };

  const handleBgSelected = (file: File) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      alert('Выбери видео (.mp4, .webm) или картинку (.jpg, .png, .webp).');
      return;
    }
    setPendingBgFile(file);
    setBgKind(isVideo ? 'video' : 'image');
    setRemoveBg(false);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      if (removeBg) {
        await deleteSongBgMedia(song.id);
      } else if (pendingBgFile) {
        const buf = await pendingBgFile.arrayBuffer();
        await saveSongBgMedia(song.id, {
          kind: pendingBgFile.type.startsWith('video/') ? 'video' : 'image',
          mimeType: pendingBgFile.type,
          data: buf,
        });
      }

      const cleanTitle = title.trim() || song.title;
      const cleanArtist = artist.trim() || song.artist;
      await onSave({
        ...song,
        title: cleanTitle,
        artist: cleanArtist,
        tag,
        coverDataUrl: coverDataUrl || createProceduralCover(cleanTitle, '#39C5BB', '#ff4f93'),
        bgKind: removeBg ? undefined : bgKind,
        bgDim,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pjsk-themed-ui pjsk-modal-overlay fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-md flex items-center justify-center p-4 text-slate-800">
      <div className="pjsk-modal-panel w-full max-w-xl rounded-[28px] bg-white/95 border border-[#39C5BB]/35 shadow-[0_24px_60px_rgba(15,23,42,0.22)] overflow-hidden flex flex-col max-h-[92vh] animate-pop-in">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93] shrink-0" />
        {/* Header */}
        <div className="pjsk-modal-banner px-6 py-4 bg-gradient-to-r from-[#f3fdfa] to-[#fff5f9] border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#39C5BB] to-[#ff4f93] flex items-center justify-center shadow-sm">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Обложка, 2DMV фон и теги</h2>
              <p className="text-[11px] text-slate-500 font-semibold">
                Аватарка трека, видеоклип/арт позади дорожки и категория
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Preview + Cover Dropzone */}
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative shrink-0">
              <div className="w-32 h-32 rounded-2xl bg-white p-1.5 border-2 border-[#39C5BB]/50 shadow-lg overflow-hidden">
                {coverDataUrl ? (
                  <img
                    src={coverDataUrl}
                    alt={title}
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <ImagePlus className="w-8 h-8" />
                  </div>
                )}
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleFile(f);
              }}
              className="hidden"
            />

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              onClick={() => fileRef.current?.click()}
              className="flex-1 w-full border-2 border-dashed border-[#39C5BB]/55 bg-[#effdfb]/60 hover:bg-[#e1faf6] rounded-2xl p-4 text-center cursor-pointer transition"
            >
              <Upload className="w-6 h-6 mx-auto mb-1.5 text-[#00a896]" />
              <div className="text-xs font-black text-slate-800">
                {busy ? 'Загрузка картинки...' : 'Выбрать свою обложку / аватарку'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Нажми или перетащи JPG, PNG, WEBP, GIF
              </div>
            </div>
          </div>

          {/* Quick SEKAI Preset Covers */}
          <div>
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#ff4f93]" /> Быстрые обложки SEKAI
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {COVER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    setCoverDataUrl(createProceduralCover(title.trim() || song.title, p.c1, p.c2))
                  }
                  className="p-1.5 rounded-xl border border-slate-200 hover:border-[#39C5BB] bg-slate-50 text-center transition group"
                >
                  <div
                    className="w-full h-8 rounded-lg shadow-inner mb-1 group-hover:scale-105 transition"
                    style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }}
                  />
                  <div className="text-[10px] font-bold text-slate-600 truncate">{p.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2DMV / Custom Game Background */}
          <div className="border-t border-slate-200 pt-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Film className="w-4 h-4 text-[#ff4f93]" /> Фон во время игры (2DMV / Видео / Арт)
              </div>
              {bgKind && !removeBg && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingBgFile(null);
                    setBgKind(undefined);
                    setRemoveBg(true);
                  }}
                  className="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Убрать фон
                </button>
              )}
            </div>

            <input
              ref={bgFileRef}
              type="file"
              accept="video/*,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleBgSelected(f);
              }}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => bgFileRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-extrabold text-slate-700 flex items-center gap-1.5 transition"
              >
                <Film className="w-3.5 h-3.5 text-[#39C5BB]" />
                {pendingBgFile
                  ? pendingBgFile.name
                  : bgKind && !removeBg
                  ? `Установлен (${bgKind === 'video' ? 'Видео 2DMV' : 'Картинка'}) — заменить`
                  : 'Выбрать MP4 / WebM или картинку'}
              </button>

              {bgKind && !removeBg && (
                <div className="flex-1 min-w-[160px]">
                  <div className="flex justify-between text-[11px] text-slate-500 font-bold mb-0.5">
                    <span>Затемнение фона</span>
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

          {/* Title / Artist / Unit Tag */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Название</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:border-[#39C5BB] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Исполнитель</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:border-[#39C5BB] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Категория / Юнит</label>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value as SekaiTag)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:border-[#39C5BB] outline-none"
              >
                {(Object.keys(SEKAI_TAGS) as SekaiTag[]).map((k) => (
                  <option key={k} value={k}>
                    {SEKAI_TAGS[k].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-sm font-bold text-slate-600"
          >
            Отмена
          </button>
          <button
            disabled={busy}
            onClick={handleSave}
            className="sekai-slant px-6 py-2.5 rounded-xl pjsk-live-cta text-white text-sm font-black disabled:opacity-40 transition"
          >
            <span className="sekai-unslant block">Сохранить</span>
          </button>
        </div>
      </div>
    </div>
  );
};
