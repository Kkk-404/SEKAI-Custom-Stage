import React, { useRef, useState } from 'react';
import { Camera, Heart, RotateCcw, ShieldCheck, Sparkles, Users, X, Zap } from 'lucide-react';
import { COLLECTIBLE_CARDS, DEFAULT_TEAM_CARDS, SkillType, TeamCard } from '../types/game';
import { fileToAvatarDataUrl, MIKU_AVATARS, MikuAvatar } from './Avatars';

interface TeamModalProps {
  cards: TeamCard[];
  unlockedCardIds?: string[];
  onChange: (next: TeamCard[]) => void;
  onClose: () => void;
}

const SKILL_META: Record<
  SkillType,
  { label: string; desc: string; icon: React.ComponentType<{ className?: string }>; badge: string }
> = {
  score_up: {
    label: 'Score Boost +30%',
    desc: '+30% к очкам на 5 сек.',
    icon: Zap,
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
  },
  perfect_lock: {
    label: 'Perfect Lock 4.5с',
    desc: 'GREAT/GOOD → PERFECT',
    icon: ShieldCheck,
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  },
  healer: {
    label: 'Healer +200 HP',
    desc: 'Восстанавливает +200 HP',
    icon: Heart,
    badge: 'bg-pink-100 text-pink-700 border-pink-300',
  },
};

export const TeamModal: React.FC<TeamModalProps> = ({
  cards,
  unlockedCardIds = [],
  onChange,
  onClose,
}) => {
  const [localCards, setLocalCards] = useState<TeamCard[]>(cards);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const unlockedCollectibles = COLLECTIBLE_CARDS.filter((c) =>
    unlockedCardIds.includes(c.card.id)
  );

  const updateCard = (idx: number, patch: Partial<TeamCard>) => {
    const next = localCards.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setLocalCards(next);
    onChange(next);
  };

  const handlePhotoUpload = async (idx: number, file: File) => {
    try {
      const url = await fileToAvatarDataUrl(file, 256);
      updateCard(idx, { customImageDataUrl: url });
    } catch {
      alert('Не удалось загрузить картинку для карточки.');
    }
  };

  return (
    <div className="pjsk-themed-ui pjsk-modal-overlay fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-md flex items-center justify-center p-4 text-slate-800">
      <div className="pjsk-modal-panel w-full max-w-3xl rounded-[28px] bg-white/95 border border-[#39C5BB]/35 shadow-[0_28px_70px_rgba(15,23,42,0.28)] overflow-hidden flex flex-col max-h-[90vh] animate-pop-in">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93] shrink-0" />
        <div className="pjsk-modal-banner pjsk-banner-band px-6 py-4 bg-gradient-to-r from-[#f3fdfa] to-[#fff5f9] border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#39C5BB] to-[#ff4f93] flex items-center justify-center shadow-[0_6px_16px_rgba(57,197,187,0.4)]">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Команда Live (5 карточек)</h2>
              <p className="text-xs text-slate-500 font-semibold">
                Карточки активируют скиллы во время игры (можно ставить свои фото!)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {localCards.map((card, idx) => {
            const avatarDef = MIKU_AVATARS.find((a) => a.id === card.avatarId) ?? MIKU_AVATARS[0];
            const skill = SKILL_META[card.skillType];
            const SkillIcon = skill.icon;

            return (
              <div
                key={card.id}
                className={`pjsk-holo-sheen rounded-2xl bg-slate-50 border-2 p-3.5 flex flex-col gap-2.5 shadow-sm transition-shadow hover:shadow-[0_14px_32px_rgba(30,58,108,0.14)] ${
                  idx === 0 ? 'border-[#39C5BB]/70 bg-gradient-to-br from-[#effdfb] to-white' : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative group shrink-0">
                    <div
                      className="w-14 h-14 rounded-2xl overflow-hidden border-2 shadow-sm bg-white"
                      style={{ borderColor: card.color, boxShadow: `0 6px 18px ${card.color}44` }}
                    >
                      {card.customImageDataUrl ? (
                        <img
                          src={card.customImageDataUrl}
                          alt={card.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <MikuAvatar def={avatarDef} className="w-full h-full" />
                      )}
                    </div>
                    <input
                      ref={(el) => {
                        fileRefs.current[card.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) handlePhotoUpload(idx, f);
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileRefs.current[card.id]?.click()}
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-slate-300 shadow flex items-center justify-center text-slate-600 hover:bg-[#39C5BB] hover:text-white transition"
                      title="Загрузить свою картинку карточки"
                    >
                      <Camera className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black text-slate-400 uppercase">
                      Слот #{idx + 1}
                    </div>
                    <input
                      type="text"
                      value={card.name}
                      onChange={(e) => updateCard(idx, { name: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-extrabold text-slate-800 outline-none focus:border-[#39C5BB]"
                    />
                  </div>
                </div>

                {unlockedCollectibles.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const found = unlockedCollectibles.find((x) => x.card.id === e.target.value);
                      if (found) {
                        updateCard(idx, {
                          name: found.card.name,
                          unitLabel: found.card.unitLabel,
                          skillType: found.card.skillType,
                          color: found.card.color,
                          avatarId: found.card.avatarId,
                          customImageDataUrl: null,
                        });
                      }
                    }}
                    className="w-full px-2.5 py-1 rounded-xl bg-[#effdfb] border border-[#39C5BB]/40 text-[11px] font-bold text-[#0f766e] outline-none"
                  >
                    <option value="">★ Поставить карту из коллекции...</option>
                    {unlockedCollectibles.map((c) => (
                      <option key={c.card.id} value={c.card.id}>
                        {c.rarity} {c.card.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className="space-y-1.5">
                  <div className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#ff4f93]" /> Навык в игре
                  </div>
                  <select
                    value={card.skillType}
                    onChange={(e) => updateCard(idx, { skillType: e.target.value as SkillType })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-[#39C5BB]"
                  >
                    <option value="score_up">Score Boost (+30% очков)</option>
                    <option value="perfect_lock">Perfect Lock (GREAT/GOOD → PERFECT)</option>
                    <option value="healer">Healer (+200 HP)</option>
                  </select>
                  <div
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 ${skill.badge}`}
                  >
                    <SkillIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{skill.desc}</span>
                  </div>
                </div>

                {card.customImageDataUrl && (
                  <button
                    type="button"
                    onClick={() => updateCard(idx, { customImageDataUrl: null })}
                    className="text-[11px] text-rose-500 font-bold hover:underline self-start"
                  >
                    Вернуть арт Мику
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => {
              setLocalCards(DEFAULT_TEAM_CARDS);
              onChange(DEFAULT_TEAM_CARDS);
            }}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Сбросить команду
          </button>
          <button
            onClick={onClose}
            className="sekai-slant px-6 py-2 rounded-xl pjsk-live-cta text-white text-sm font-black"
          >
            <span className="sekai-unslant block">Готово</span>
          </button>
        </div>
      </div>
    </div>
  );
};
