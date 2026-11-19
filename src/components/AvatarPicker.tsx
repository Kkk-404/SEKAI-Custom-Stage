import React, { useMemo, useRef, useState } from 'react';
import { Award, Camera, Check, Crown, Heart, ImagePlus, Sparkles, Trash2, Trophy, User, X } from 'lucide-react';
import { AvatarSelection, DIFFICULTIES, SongItem } from '../types/game';
import {
  fileToAvatarDataUrl,
  MIKU_AVATARS,
  MikuAvatar,
  resolveAvatar,
} from './Avatars';

interface AvatarPickerProps {
  current: AvatarSelection;
  songs?: SongItem[];
  onSelect: (next: AvatarSelection) => void;
  onClose: () => void;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({ current, songs = [], onSelect, onClose }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'avatar' | 'stats'>('avatar');
  const currentView = resolveAvatar(current);

  const stats = useMemo(() => {
    let clears = 0;
    let fcs = 0;
    let aps = 0;
    let bestScore = 0;
    let favorites = 0;
    let rankS = 0;

    for (const s of songs) {
      if (s.favorite) favorites++;
      for (const d of DIFFICULTIES) {
        const hs = s.highScores?.[d];
        if (!hs) continue;
        clears++;
        if (hs.fullCombo) fcs++;
        if (hs.allPerfect) aps++;
        if (hs.score > bestScore) bestScore = hs.score;
        if (hs.score >= 900000 || hs.allPerfect) rankS++;
      }
    }
    const playerRank = Math.max(1, 1 + clears * 2 + fcs * 3 + aps * 5);
    return { clears, fcs, aps, bestScore, favorites, rankS, playerRank, totalSongs: songs.length };
  }, [songs]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      onSelect({ id: 'custom', customDataUrl: dataUrl });
    } catch {
      alert('Не удалось загрузить изображение. Попробуй другой файл (JPG / PNG).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pjsk-themed-ui pjsk-modal-overlay fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-md flex items-center justify-center p-4 text-slate-800">
      <div className="pjsk-modal-panel w-full max-w-md rounded-[28px] bg-white/95 border border-[#39C5BB]/35 shadow-[0_28px_70px_rgba(15,23,42,0.28)] overflow-hidden flex flex-col max-h-[90vh] animate-pop-in">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93] shrink-0" />
        <div className="pjsk-modal-banner pjsk-banner-band px-6 py-4 bg-gradient-to-r from-[#f3fdfa] to-[#fff5f9] border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#39C5BB] to-[#2ee6d6] flex items-center justify-center shadow-[0_6px_16px_rgba(57,197,187,0.4)]">
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                Профиль Live · Rank {stats.playerRank}
              </h2>
              <p className="text-[11px] text-slate-500 font-semibold leading-tight">
                Персонаж и достижения на Colorful Stage
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-2 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <button
            onClick={() => setTab('avatar')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl border-b-2 transition ${
              tab === 'avatar'
                ? 'border-[#39C5BB] text-[#0f766e] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Аватарка
          </button>
          <button
            onClick={() => setTab('stats')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl border-b-2 transition flex items-center gap-1.5 ${
              tab === 'stats'
                ? 'border-[#ff4f93] text-[#db2777] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" /> Статистика
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {tab === 'stats' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#effdfb] to-[#fff1f7] border border-[#39C5BB]/40 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#39C5BB] to-[#ff4f93] text-white flex flex-col items-center justify-center shadow">
                  <span className="text-[9px] font-bold uppercase opacity-90">RANK</span>
                  <span className="text-xl font-black leading-none">{stats.playerRank}</span>
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">Игрок SEKAI</div>
                  <div className="text-xs text-slate-500 font-semibold">
                    Песен в библиотеке: {stats.totalSongs} · Любимых: {stats.favorites}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1">
                    <Award className="w-3.5 h-3.5 text-[#39C5BB]" /> Прохождений (Clear)
                  </div>
                  <div className="text-2xl font-black text-slate-900 font-mono">{stats.clears}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1">
                    <Crown className="w-3.5 h-3.5 text-[#ff4f93]" /> Full Combo
                  </div>
                  <div className="text-2xl font-black text-[#ff4f93] font-mono">{stats.fcs}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> All Perfect
                  </div>
                  <div className="text-2xl font-black text-amber-500 font-mono">{stats.aps}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1">
                    <Heart className="w-3.5 h-3.5 text-rose-500" /> Рангов S
                  </div>
                  <div className="text-2xl font-black text-slate-900 font-mono">{stats.rankS}</div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Лучший счёт за все песни</span>
                <span className="text-lg font-black font-mono text-[#009683]">
                  {stats.bestScore.toLocaleString('ru-RU')}
                </span>
              </div>
            </div>
          ) : (
            <>
          {/* Built-in Miku Avatars */}
          <div>
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2.5">
              Хатсунэ Мику · Стили
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MIKU_AVATARS.map((def) => {
                const isSel = current.id === def.id;
                return (
                  <button
                    key={def.id}
                    onClick={() => onSelect({ id: def.id })}
                    className={`relative rounded-2xl border-2 p-2 transition ${
                      isSel
                        ? 'border-[#00bfa5] bg-[#effdfb] shadow-md'
                        : 'border-transparent bg-slate-50 hover:border-[#39C5BB]/50'
                    }`}
                  >
                    <MikuAvatar def={def} className="w-full h-auto drop-shadow-sm" />
                    {isSel && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#00d8bd] text-white flex items-center justify-center shadow">
                        <Check className="w-3 h-3" strokeWidth={3.5} />
                      </span>
                    )}
                    <div className="text-[11px] font-extrabold text-center mt-1.5 text-slate-700 truncate">
                      {def.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Avatar */}
          <div className="border-t border-slate-200 pt-4">
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#39C5BB]" /> Своя аватарка
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 shrink-0">
                {currentView.customDataUrl ? (
                  <img
                    src={currentView.customDataUrl}
                    alt="Моя аватарка"
                    className="w-20 h-20 rounded-full object-cover border-2 border-[#39C5BB] shadow-sm"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                    <ImagePlus className="w-7 h-7" />
                  </div>
                )}
                {current.id === 'custom' && currentView.customDataUrl && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#00d8bd] text-white flex items-center justify-center shadow">
                    <Check className="w-3 h-3" strokeWidth={3.5} />
                  </span>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="sekai-slant px-4 py-2 rounded-xl bg-gradient-to-r from-[#00d8bd] to-[#39C5BB] text-white text-xs font-black shadow-sm hover:brightness-105 active:scale-95 transition disabled:opacity-60"
                >
                  <span className="sekai-unslant flex items-center gap-1.5">
                    <ImagePlus className="w-3.5 h-3.5" />
                    {busy ? 'Обработка...' : currentView.customDataUrl ? 'Сменить фото' : 'Загрузить фото'}
                  </span>
                </button>
                {currentView.customDataUrl && (
                  <button
                    onClick={() => onSelect({ id: 'classic_01' })}
                    className="px-4 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 text-xs font-bold text-rose-500 flex items-center justify-center gap-1.5 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Удалить свою
                  </button>
                )}
                <p className="text-[11px] text-slate-400 leading-snug">
                  JPG или PNG. Фото сохранится локально в твоём браузере.
                </p>
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="sekai-slant px-6 py-2 rounded-xl pjsk-live-cta text-white text-sm font-black"
          >
            <span className="sekai-unslant">Готово</span>
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
};
