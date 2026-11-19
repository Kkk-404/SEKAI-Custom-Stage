import React, { useEffect, useRef, useState } from 'react';
import { Activity, Check, RotateCcw, X } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';

interface OffsetWizardProps {
  currentOffsetMs: number;
  onApply: (offsetMs: number) => void;
  onClose: () => void;
}

export const OffsetWizard: React.FC<OffsetWizardProps> = ({
  currentOffsetMs,
  onApply,
  onClose,
}) => {
  const [running, setRunning] = useState(false);
  const [tapsMs, setTapsMs] = useState<number[]>([]);
  const [pulse, setPulse] = useState(false);
  const startCtxTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const beatCountRef = useRef<number>(0);

  const stopMetronome = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  };

  const startMetronome = () => {
    stopMetronome();
    const ctx = soundEngine.getContext();
    setTapsMs([]);
    beatCountRef.current = 0;
    startCtxTimeRef.current = ctx.currentTime + 0.05;
    setRunning(true);

    const fireClick = () => {
      const idx = beatCountRef.current++;
      soundEngine.playMetronomeClick(idx % 4 === 0);
      setPulse(true);
      setTimeout(() => setPulse(false), 120);
    };

    fireClick();
    timerRef.current = window.setInterval(fireClick, 500);
  };

  useEffect(() => {
    return () => stopMetronome();
  }, []);

  const recordTap = () => {
    if (!running) {
      startMetronome();
      return;
    }
    const ctx = soundEngine.getContext();
    const elapsed = ctx.currentTime - startCtxTimeRef.current;
    if (elapsed < 0.25) return; // ignore immediate start click
    const nearestBeat = Math.round(elapsed / 0.5);
    const deltaMs = Math.round((elapsed - nearestBeat * 0.5) * 1000);
    if (Math.abs(deltaMs) > 220) return;
    soundEngine.playTapSE(false);
    setTapsMs((prev) => [...prev.slice(-15), deltaMs]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        recordTap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const recommendedOffset = (() => {
    if (tapsMs.length < 3) return null;
    const sorted = [...tapsMs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
    return Math.max(-200, Math.min(200, Math.round(med / 5) * 5));
  })();

  return (
    <div className="pjsk-themed-ui pjsk-modal-overlay fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 text-slate-800">
      <div className="pjsk-modal-panel w-full max-w-md rounded-3xl bg-white border-2 border-[#39C5BB] shadow-2xl overflow-hidden">
        <div className="pjsk-modal-banner px-6 py-4 bg-gradient-to-r from-[#effdfb] to-[#fff1f7] border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#39C5BB] flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Калибровка задержки (Offset)</h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                Текущий оффсет: {currentOffsetMs > 0 ? `+${currentOffsetMs}` : currentOffsetMs} мс
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopMetronome();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-5">
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Нажми <strong>«Старт»</strong> и затем <strong>8–10 раз</strong> тапни по кнопке (или по{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[11px]">
              Пробелу
            </kbd>
            ) ровно под звук метронома.
          </p>

          <button
            type="button"
            onClick={recordTap}
            className={`w-36 h-36 mx-auto rounded-full border-4 flex flex-col items-center justify-center transition-transform duration-100 shadow-xl ${
              running
                ? pulse
                  ? 'scale-105 bg-[#39C5BB] border-[#0f766e] text-white'
                  : 'scale-100 bg-[#effdfb] border-[#39C5BB] text-[#0f766e]'
                : 'bg-gradient-to-br from-[#39C5BB] to-[#ff4f93] border-white text-white hover:scale-105'
            }`}
          >
            <span className="text-base font-black">
              {running ? 'ТАП В РИТМ!' : 'СТАРТ'}
            </span>
            <span className="text-[11px] font-bold opacity-85 mt-1">
              {running ? `${tapsMs.length} / 8 тапов` : 'Включить метроном'}
            </span>
          </button>

          <div className="min-h-[48px] flex flex-col items-center justify-center">
            {tapsMs.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {tapsMs.slice(-8).map((d, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-mono text-[11px] font-bold text-slate-700"
                  >
                    {d > 0 ? `+${d}` : d}ms
                  </span>
                ))}
              </div>
            )}
            {recommendedOffset !== null && (
              <div className="mt-2 text-sm font-black text-[#0f766e]">
                Рекомендуемый Offset:{' '}
                <span className="font-mono text-base">
                  {recommendedOffset > 0 ? `+${recommendedOffset}` : recommendedOffset} мс
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              stopMetronome();
              setTapsMs([]);
            }}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Сброс
          </button>
          <button
            type="button"
            disabled={recommendedOffset === null}
            onClick={() => {
              if (recommendedOffset !== null) {
                stopMetronome();
                onApply(recommendedOffset);
                onClose();
              }
            }}
            className="sekai-slant px-5 py-2 rounded-xl pjsk-live-cta text-white text-xs font-black disabled:opacity-40"
          >
            <span className="sekai-unslant flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Применить
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
