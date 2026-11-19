import React, { useEffect, useRef, useState } from 'react';
import { Activity, Check, Download, HardDrive, Info, Keyboard, Palette, RotateCcw, Sliders, Smartphone, Sparkles, Trash2, Upload, Volume2, X } from 'lucide-react';
import { cleanupOrphanMedia, exportProfileBackup, getStorageUsageStats, importProfileBackup, StorageUsageStats } from '../storage/db';
import { DEFAULT_SETTINGS, GameSettings, GraphicsQuality, HapticsMode, NOTE_SKINS, NoteSkin, SEKAI_THEMES, SOUND_PACKS, SekaiTheme, SoundPack, ResolvedAppTheme } from '../types/game';
import { triggerAccentHaptic, triggerMilestoneHaptic } from '../utils/haptics';
import { OffsetWizard } from './OffsetWizard';
import { AppearancePanel } from './AppearancePanel';

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
  initialSection?: 'appearance' | 'live';
  resolvedTheme: ResolvedAppTheme;
  onProfileRestored?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onChange, onClose, initialSection = 'live', resolvedTheme, onProfileRestored }) => {
  const [section, setSection] = useState<'appearance' | 'live'>(initialSection);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [section]);
  const [listeningIdx, setListeningIdx] = useState<number | null>(null);
  const [showOffsetWizard, setShowOffsetWizard] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageUsageStats | null>(null);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStorageUsageStats().then(setStorageStats);
  }, []);

  const handleExportProfile = async () => {
    try {
      const json = await exportProfileBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SEKAI-Profile-Backup-${new Date().toISOString().slice(0, 10)}.sekaibackup.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupNotice('Профиль, рекорды и команда сохранены в файл');
      window.setTimeout(() => setBackupNotice(null), 3200);
    } catch {
      setBackupNotice('Не удалось экспортировать бэкап');
    }
  };

  const handleImportProfile = async (file: File) => {
    try {
      const text = await file.text();
      const res = await importProfileBackup(text);
      onChange(res.settings);
      onProfileRestored?.();
      setBackupNotice(`Профиль восстановлен · обновлено рекордов: ${res.updatedSongs}`);
      window.setTimeout(() => setBackupNotice(null), 3500);
    } catch (err) {
      setBackupNotice(err instanceof Error ? err.message : 'Ошибка чтения файла бэкапа');
    }
  };

  const handleCleanupMedia = async () => {
    const removed = await cleanupOrphanMedia();
    const updated = await getStorageUsageStats();
    setStorageStats(updated);
    setCleanupNotice(
      removed > 0 ? `Удалено лишних файлов: ${removed}` : 'Лишних файлов не найдено'
    );
    window.setTimeout(() => setCleanupNotice(null), 2800);
  };

  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const handleKeyCapture = (e: React.KeyboardEvent, idx: number) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setListeningIdx(null);
      return;
    }
    if (e.key.length === 1) {
      const nextKeys = [...settings.keyBindings] as GameSettings['keyBindings'];
      nextKeys[idx] = e.key.toLowerCase();
      update('keyBindings', nextKeys);
      setListeningIdx(null);
    }
  };

  return (
    <div className="pjsk-themed-ui pjsk-modal-overlay settings-overlay fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-3 sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-dialog pjsk-modal-panel animate-pop-in"
        onKeyDown={(e) => {
          if (showOffsetWizard) return;
          if (e.key === 'Escape' && listeningIdx === null) { e.preventDefault(); e.stopPropagation(); onClose(); }
          if (e.key === 'Tab') {
            const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
          }
        }}
      >
        <div className="settings-accent-line" />
        <header className="settings-header">
          <span className="settings-header-icon"><Sliders size={20} strokeWidth={1.7} /></span>
          <div><h2 id="settings-title">Настройки</h2><p>Пусть всё будет по-твоему.</p></div>
          <button type="button" onClick={onClose} className="settings-close" aria-label="Закрыть настройки"><X size={20} /></button>
        </header>
        <div className="settings-tabs" role="tablist" aria-label="Раздел настроек" onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            const next = e.key === 'Home' ? 'appearance' : e.key === 'End' ? 'live' : section === 'appearance' ? 'live' : 'appearance';
            setSection(next);
            document.getElementById(`settings-tab-${next}`)?.focus();
          }
        }}>
          <button type="button" role="tab" id="settings-tab-appearance" aria-selected={section === 'appearance'} aria-controls="settings-panel-appearance" tabIndex={section === 'appearance' ? 0 : -1} onClick={() => setSection('appearance')}><Palette size={16} />Оформление<span className="settings-new-badge">NEW</span></button>
          <button type="button" role="tab" id="settings-tab-live" aria-selected={section === 'live'} aria-controls="settings-panel-live" tabIndex={section === 'live' ? 0 : -1} onClick={() => setSection('live')}><Activity size={16} />Игра и звук</button>
        </div>

        <div ref={bodyRef} className={`settings-scroll-area ${section === 'live' ? 'p-5 sm:p-6 space-y-5 text-sm' : ''}`} role="tabpanel" id={`settings-panel-${section}`} aria-labelledby={`settings-tab-${section}`}>
          {section === 'appearance' ? <AppearancePanel settings={settings} resolvedTheme={resolvedTheme} onChange={onChange} /> : <>
          {/* Speed & Offset */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-extrabold text-slate-700">Скорость нот (Note Speed)</span>
                <span className="font-mono font-black text-[#009683]">
                  {settings.noteSpeed.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={12.0}
                step={0.1}
                value={settings.noteSpeed}
                onChange={(e) => update('noteSpeed', Number(e.target.value))}
                className="w-full accent-[#39C5BB]"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>Медленно (1.0)</span>
                <span>Рекомендуем: 8.0–10.5</span>
                <span>Быстро (12.0)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-extrabold text-slate-700">Синхронизация (Offset)</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOffsetWizard(true)}
                    className="px-2.5 py-1 rounded-lg bg-[#effdfb] hover:bg-[#39C5BB] border border-[#39C5BB]/50 text-[#0f766e] hover:text-white text-[11px] font-extrabold flex items-center gap-1 transition"
                  >
                    <Activity className="w-3 h-3" /> Поймать ритм
                  </button>
                  <span className="font-mono font-black text-[#009683]">
                    {settings.audioOffsetMs > 0 ? `+${settings.audioOffsetMs}` : settings.audioOffsetMs} мс
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={-200}
                max={200}
                step={5}
                value={settings.audioOffsetMs}
                onChange={(e) => update('audioOffsetMs', Number(e.target.value))}
                className="w-full accent-[#39C5BB]"
              />
            </div>
          </div>

          {/* Volumes */}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-[#39C5BB]" /> Звук
            </div>
            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span className="text-slate-600 font-bold">Громкость музыки</span>
                <span className="font-mono font-bold text-[#009683]">
                  {Math.round(settings.musicVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={settings.musicVolume}
                onChange={(e) => update('musicVolume', Number(e.target.value))}
                className="w-full accent-[#39C5BB]"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span className="text-slate-600 font-bold">Громкость эффектов (SE нажатий)</span>
                <span className="font-mono font-bold text-[#ff4f93]">
                  {Math.round(settings.seVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={settings.seVolume}
                onChange={(e) => update('seVolume', Number(e.target.value))}
                className="w-full accent-[#ff4f93]"
              />
            </div>
            <div>
              <div className="text-xs text-slate-600 font-bold mb-1.5">
                Набор звуков нажатий (SE Pack)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(SOUND_PACKS) as SoundPack[]).map((pk) => {
                  const active = (settings.soundPack ?? 'crystal') === pk;
                  return (
                    <button
                      key={pk}
                      type="button"
                      onClick={() => update('soundPack', pk)}
                      className={`p-2 rounded-xl border-2 text-left transition ${
                        active
                          ? 'border-[#ff4f93] bg-[#fff1f7]'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-black text-slate-800">{SOUND_PACKS[pk].label}</div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                        {SOUND_PACKS[pk].desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Key Bindings (4 lanes) */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-[#39C5BB]" /> Клавиши 4 дорожек (ПК)
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {settings.keyBindings.map((k, idx) => (
                <button
                  key={idx}
                  onClick={() => setListeningIdx(idx)}
                  onKeyDown={(e) => {
                    if (listeningIdx === idx) handleKeyCapture(e, idx);
                  }}
                  className={`py-3 rounded-xl font-mono font-black text-base border-2 transition ${
                    listeningIdx === idx
                      ? 'bg-[#39C5BB] text-white border-[#0f766e] animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-[#39C5BB]'
                  }`}
                >
                  {listeningIdx === idx ? '...' : k.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Нажми на кнопку и затем клавишу на клавиатуре. Также можно играть мышкой или касаниями по 4 плиткам!
            </p>
          </div>

          {/* SEKAI Visual Theme */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-[#39C5BB]" /> Мир концертной сцены
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SEKAI_THEMES) as SekaiTheme[]).map((tId) => {
                const t = SEKAI_THEMES[tId];
                const active = settings.sekaiTheme === tId;
                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => update('sekaiTheme', tId)}
                    className={`p-2.5 rounded-xl border-2 text-left transition ${
                      active
                        ? 'border-[#39C5BB] bg-[#effdfb] shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ background: t.primary }}
                      />
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ background: t.secondary }}
                      />
                    </div>
                    <div className="text-xs font-black text-slate-800 leading-tight">{t.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note Skins */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#ff4f93]" /> Скин нот и эффектов (Note Skin)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(NOTE_SKINS) as NoteSkin[]).map((sId) => {
                const skin = NOTE_SKINS[sId];
                const active = settings.noteSkin === sId;
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => update('noteSkin', sId)}
                    className={`p-2.5 rounded-xl border-2 text-left transition ${
                      active
                        ? 'border-[#ff4f93] bg-[#fff1f7] shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {skin.previewColors.map((c, idx) => (
                        <span
                          key={idx}
                          className="w-4 h-2 rounded-full"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <div className="text-xs font-black text-slate-800 leading-tight">{skin.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{skin.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Graphics & Device Optimization */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#39C5BB]" /> Оптимизация графики (ПК / Телефон)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'auto', label: 'Авто', desc: 'Умно под устройство' },
                  { id: 'high', label: 'Макс (ПК)', desc: 'Полный неон и 2× DPR' },
                  { id: 'eco', label: '60+ FPS', desc: 'Лёгкий режим / экономия' },
                ] as Array<{ id: GraphicsQuality; label: string; desc: string }>
              ).map((q) => {
                const active = (settings.graphicsQuality ?? 'auto') === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => update('graphicsQuality', q.id)}
                    className={`p-2 rounded-xl border-2 text-left transition ${
                      active
                        ? 'border-[#39C5BB] bg-[#effdfb] shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-black text-slate-800 leading-tight">{q.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{q.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Haptics / Vibration (Android APK & mobile touch) */}
          <div className="border-t border-slate-200 pt-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[#ff4f93]" /> Тактильная вибрация (Haptics)
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerAccentHaptic(true, 'critical');
                  window.setTimeout(() => triggerMilestoneHaptic(true), 120);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#fff1f7] hover:bg-[#ff4f93] border border-[#ff4f93]/40 text-[#db2777] hover:text-white text-[11px] font-extrabold transition"
              >
                Тест отклика
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-[#effdfb] transition">
                <input
                  type="checkbox"
                  checked={settings.hapticsEnabled ?? true}
                  onChange={(e) => update('hapticsEnabled', e.target.checked)}
                  className="mt-0.5 accent-[#39C5BB] w-4 h-4"
                />
                <div>
                  <div className="text-xs font-extrabold text-slate-800">Вибрация APK</div>
                  <div className="text-[10px] text-slate-500">Отклик на телефоне</div>
                </div>
              </label>
              {(
                [
                  { id: 'accents', label: 'Только акценты', desc: 'Critical, Flick, комбо' },
                  { id: 'all', label: 'Все ноты', desc: 'Каждое попадание + акценты' },
                ] as Array<{ id: HapticsMode; label: string; desc: string }>
              ).map((m) => {
                const active = (settings.hapticsMode ?? 'accents') === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={settings.hapticsEnabled === false}
                    onClick={() => {
                      update('hapticsMode', m.id);
                      triggerAccentHaptic(true, 'flick');
                    }}
                    className={`p-2 rounded-xl border-2 text-left transition disabled:opacity-45 ${
                      active
                        ? 'border-[#ff4f93] bg-[#fff1f7] shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-black text-slate-800 leading-tight">{m.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gameplay Toggles */}
          <div className="border-t border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { key: 'menuPreviewEnabled', label: 'Музыкальное превью в меню', desc: 'Припев играет при выборе песни' },
              { key: 'autoThemeByTag', label: 'Авто-сцена под юнит', desc: 'Меняет концертный фон, не тему меню' },
              { key: 'enableSkills', label: 'Навыки команды и Fever', desc: 'Cut-in бонусы от 5 карт' },
              { key: 'tileHitSound', label: 'Звук пластинок (SE)', desc: 'Отклик при нажатии нот' },
              { key: 'autoPlay', label: 'Auto Live (Авто-игра)', desc: 'Бот играет сам' },
              { key: 'noFail', label: 'No Fail (Без проигрыша)', desc: 'HP не падает до 0' },
              {
                key: 'keyboardFlickAssist',
                label: 'Лёгкие флики (ПК)',
                desc: 'Нажатие клавиши засчитывает Flick',
              },
              { key: 'mirrorChart', label: 'Зеркало (Mirror)', desc: 'Отразить дорожку' },
              { key: 'showKeyHints', label: 'Подсказки клавиш', desc: 'Буквы под линией' },
              { key: 'showFastLate', label: 'FAST / LATE', desc: 'Показывать ранний/поздний тап' },
            ].map((item) => {
              const k = item.key as keyof GameSettings;
              const checked = Boolean(settings[k]);
              return (
                <label
                  key={item.key}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-[#effdfb] transition"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => update(k, e.target.checked as GameSettings[typeof k])}
                    className="mt-0.5 accent-[#39C5BB] w-4 h-4"
                  />
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">{item.label}</div>
                    <div className="text-[11px] text-slate-500">{item.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Storage Usage & Media Cache Cleanup */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-[#39C5BB]" /> Память песен и 2DMV
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs space-y-0.5">
                <div className="font-extrabold text-slate-800">
                  Занято:{' '}
                  <span className="font-mono text-[#0f766e]">
                    {storageStats ? (storageStats.totalBytes / (1024 * 1024)).toFixed(1) : '...'} МБ
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Аудио:{' '}
                  {storageStats ? (storageStats.audioBytes / (1024 * 1024)).toFixed(1) : '0.0'} МБ ·
                  Клипы/Фоны:{' '}
                  {storageStats ? (storageStats.bgBytes / (1024 * 1024)).toFixed(1) : '0.0'} МБ
                  {storageStats && storageStats.orphanCount > 0 && (
                    <span className="text-amber-600 font-bold">
                      {' '}
                      · Хвостов: {storageStats.orphanCount}
                    </span>
                  )}
                </div>
                {cleanupNotice && (
                  <div className="text-[11px] font-bold text-[#00a896]">{cleanupNotice}</div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCleanupMedia}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-xs font-extrabold text-slate-700 hover:text-rose-600 flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Очистить кэш
              </button>
            </div>
          </div>

          {/* Profile Backup & About Release */}
          <div className="border-t border-slate-200 pt-4 space-y-2.5">
            <div className="text-xs font-black text-slate-400 uppercase flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#39C5BB]" /> Бэкап профиля и версия
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs">
                  <div className="font-extrabold text-slate-800">
                    Резервная копия профиля (.sekaibackup.json)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Рекорды, кристаллы, миссии, 5 карт и настройки
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportProfile}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#effdfb] border border-slate-200 hover:border-[#39C5BB] text-xs font-extrabold text-slate-700 flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-[#00a896]" /> Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => backupInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#fff1f7] border border-slate-200 hover:border-[#ff4f93] text-xs font-extrabold text-slate-700 flex items-center gap-1.5 transition"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#ff4f93]" /> Восстановить
                  </button>
                  <input
                    ref={backupInputRef}
                    type="file"
                    accept=".json,.sekaibackup.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportProfile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              {backupNotice && (
                <div className="text-[11px] font-bold text-[#00a896]">{backupNotice}</div>
              )}
              <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-bold">SEKAI: Custom Stage · Release v1.1.0</span>
                <span>Фанатский 4-lane плеер для ваших песен и чартов</span>
              </div>
            </div>
          </div>
          </>}
        </div>

        <footer className="settings-footer">
          <div className="settings-footer-left">
            <span className="settings-saved"><Check size={13} strokeWidth={2.5} />Сохраняется автоматически</span>
            <button type="button" onClick={() => onChange(section === 'appearance'
              ? { ...settings, appTheme: 'system', highContrast: false, reduceMotion: false }
              : { ...DEFAULT_SETTINGS, appTheme: settings.appTheme, highContrast: settings.highContrast, reduceMotion: settings.reduceMotion })} className="settings-reset">
              <RotateCcw size={12} />{section === 'appearance' ? 'Сбросить оформление' : 'Сбросить настройки игры'}
            </button>
          </div>
          <button type="button" onClick={onClose} className="settings-done">Готово<Check size={16} strokeWidth={2.5} /></button>
        </footer>
      </div>

      {showOffsetWizard && (
        <OffsetWizard
          currentOffsetMs={settings.audioOffsetMs}
          onApply={(ms) => update('audioOffsetMs', ms)}
          onClose={() => setShowOffsetWizard(false)}
        />
      )}
    </div>
  );
};
