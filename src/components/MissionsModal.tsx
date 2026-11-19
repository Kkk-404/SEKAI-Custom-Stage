import React, { useState } from 'react';
import { Award, Check, Crown, Gem, Lock, Sparkles, Star, Trophy, X } from 'lucide-react';
import {
  AVATAR_FRAMES,
  COLLECTIBLE_CARDS,
  PLAYER_TITLES,
  PlayerProgression,
  SEKAI_MISSIONS,
  TeamCard,
} from '../types/game';
import { AvatarFace, AvatarView, MIKU_AVATARS, MikuAvatar } from './Avatars';

interface MissionsModalProps {
  progression: PlayerProgression;
  avatar: AvatarView;
  teamCards: TeamCard[];
  onUpdateProgression: (next: PlayerProgression) => void;
  onEquipCardToSlot: (card: TeamCard, slotIndex: number) => void;
  onClose: () => void;
}

export const MissionsModal: React.FC<MissionsModalProps> = ({
  progression,
  avatar,
  teamCards,
  onUpdateProgression,
  onEquipCardToSlot,
  onClose,
}) => {
  const [tab, setTab] = useState<'missions' | 'cards' | 'cosmetics'>('missions');
  const [equipTargetCard, setEquipTargetCard] = useState<TeamCard | null>(null);

  const activeTitle =
    PLAYER_TITLES.find((t) => t.id === progression.activeTitleId) ?? PLAYER_TITLES[0];

  const handleUnlockFrame = (id: string, cost: number) => {
    if (progression.unlockedFrameIds.includes(id)) {
      onUpdateProgression({ ...progression, activeFrameId: id });
      return;
    }
    if (progression.crystals < cost) return;
    onUpdateProgression({
      ...progression,
      crystals: progression.crystals - cost,
      unlockedFrameIds: [...progression.unlockedFrameIds, id],
      activeFrameId: id,
    });
  };

  const handleUnlockTitle = (id: string, cost: number) => {
    if (progression.unlockedTitleIds.includes(id)) {
      onUpdateProgression({ ...progression, activeTitleId: id });
      return;
    }
    if (progression.crystals < cost) return;
    onUpdateProgression({
      ...progression,
      crystals: progression.crystals - cost,
      unlockedTitleIds: [...progression.unlockedTitleIds, id],
      activeTitleId: id,
    });
  };

  const handleUnlockCard = (card: TeamCard, cost: number) => {
    if (progression.unlockedCardIds.includes(card.id)) {
      setEquipTargetCard(card);
      return;
    }
    if (progression.crystals < cost) return;
    onUpdateProgression({
      ...progression,
      crystals: progression.crystals - cost,
      unlockedCardIds: [...progression.unlockedCardIds, card.id],
    });
    setEquipTargetCard(card);
  };

  return (
    <div className="pjsk-themed-ui pjsk-modal-overlay fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 text-slate-800">
      <div className="pjsk-modal-panel w-full max-w-3xl rounded-[28px] bg-white/95 border border-[#39C5BB]/35 shadow-[0_28px_70px_rgba(15,23,42,0.28)] overflow-hidden flex flex-col max-h-[90dvh] animate-pop-in">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#39C5BB] via-[#38bdf8] to-[#ff4f93] shrink-0" />

        {/* Header */}
        <div className="pjsk-modal-banner pjsk-banner-band px-5 sm:px-6 py-4 bg-gradient-to-r from-[#f3fdfa] to-[#fff5f9] border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <span className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-[#39C5BB]/30 to-[#ff4f93]/25 blur-md" />
              <AvatarFace
                view={avatar}
                frameId={progression.activeFrameId}
                className="relative w-11 h-11 shrink-0 bg-white"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900">Миссии и Коллекция</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black text-white bg-gradient-to-r ${activeTitle.gradient}`}
                  style={{ boxShadow: '0 3px 10px rgba(0,0,0,0.16)' }}
                >
                  {activeTitle.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Получай кристаллы за Live и открывай редкие карты, рамки и титулы!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#effdfb] to-[#f0f9ff] border border-[#39C5BB]/50 flex items-center gap-1.5 shadow-sm">
              <Gem className="w-4 h-4 text-[#00a695]" />
              <span className="font-mono font-black text-sm text-slate-900">
                {progression.crystals}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 pb-2 bg-slate-50/70 border-b border-slate-100 flex gap-2">
          {[
            { id: 'missions', label: 'Миссии', icon: Trophy },
            { id: 'cards', label: 'Коллекция карт', icon: Sparkles },
            { id: 'cosmetics', label: 'Рамки и титулы', icon: Crown },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id as 'missions' | 'cards' | 'cosmetics');
                  setEquipTargetCard(null);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition ${
                  active
                    ? 'bg-gradient-to-r from-[#39C5BB] to-[#2ee6d6] text-white border-[#0f766e]/20 shadow-[0_6px_16px_rgba(57,197,187,0.35)]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#39C5BB]/50 hover:bg-[#f7fffd]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {tab === 'missions' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SEKAI_MISSIONS.map((m) => {
                const currentVal = progression[m.metric] ?? 0;
                const pct = Math.min(100, Math.round((currentVal / m.target) * 100));
                const done = progression.claimedMissionIds.includes(m.id) || currentVal >= m.target;
                return (
                  <div
                    key={m.id}
                    className={`p-4 rounded-2xl border-2 transition ${
                      done
                        ? 'bg-[#f1fcf9] border-[#39C5BB]/50'
                        : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                          {done ? (
                            <Check className="w-4 h-4 text-[#00a695] shrink-0" />
                          ) : (
                            <Award className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          {m.title}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                      </div>
                      <span className="shrink-0 px-2.5 py-1 rounded-full bg-white border border-[#39C5BB]/40 text-[11px] font-black text-[#0f766e] flex items-center gap-1">
                        +{m.rewardCrystals} <Gem className="w-3 h-3" />
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>{done ? 'Выполнено!' : 'Прогресс'}</span>
                        <span className="font-mono">
                          {Math.min(currentVal, m.target)} / {m.target}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            done
                              ? 'bg-gradient-to-r from-[#39C5BB] to-[#10b981]'
                              : 'bg-gradient-to-r from-sky-400 to-[#39C5BB]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'cards' && (
            <div className="space-y-4">
              {equipTargetCard && (
                <div className="p-3.5 rounded-2xl bg-[#effdfb] border-2 border-[#39C5BB] flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-black text-[#0f766e]">
                    Куда поставить карту «{equipTargetCard.name}» в команду?
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {teamCards.map((slot, idx) => (
                      <button
                        key={slot.id}
                        onClick={() => {
                          onEquipCardToSlot(equipTargetCard, idx);
                          setEquipTargetCard(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#39C5BB] hover:text-white border border-[#39C5BB]/50 text-[11px] font-bold transition"
                      >
                        Слот #{idx + 1} ({slot.name.split(' ')[0]})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {COLLECTIBLE_CARDS.map((item) => {
                  const unlocked = progression.unlockedCardIds.includes(item.card.id);
                  const canAfford = progression.crystals >= item.cost;
                  const avDef =
                    MIKU_AVATARS.find((a) => a.id === item.card.avatarId) ?? MIKU_AVATARS[0];
                  return (
                    <div
                      key={item.card.id}
                      className={`${item.rarity === '4★' ? 'pjsk-holo-sheen ' : ''}p-3.5 rounded-2xl border-2 flex flex-col gap-2.5 ${
                        unlocked
                          ? 'bg-[#f4fdfa] border-[#39C5BB]/45'
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-14 h-14 rounded-2xl overflow-hidden border-2 shrink-0 bg-white"
                          style={{ borderColor: item.card.color }}
                        >
                          <MikuAvatar def={avDef} className="w-full h-full" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-black">
                              {item.rarity}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 truncate">
                              {item.card.unitLabel}
                            </span>
                          </div>
                          <div className="text-xs font-black text-slate-900 truncate mt-0.5">
                            {item.card.name}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug flex-1">{item.desc}</p>
                      <button
                        type="button"
                        onClick={() => handleUnlockCard(item.card, item.cost)}
                        disabled={!unlocked && !canAfford}
                        className={`w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                          unlocked
                            ? 'bg-[#39C5BB]/15 hover:bg-[#39C5BB] text-[#0f766e] hover:text-white border border-[#39C5BB]/40'
                            : canAfford
                            ? 'pjsk-live-cta text-white'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {unlocked ? (
                          <>
                            <Star className="w-3.5 h-3.5" /> Взять в команду
                          </>
                        ) : (
                          <>
                            {!canAfford && <Lock className="w-3.5 h-3.5" />}
                            Открыть за {item.cost} <Gem className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'cosmetics' && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-black text-slate-500 uppercase mb-2.5">
                  Рамки аватара
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AVATAR_FRAMES.map((fr) => {
                    const unlocked = progression.unlockedFrameIds.includes(fr.id);
                    const active = progression.activeFrameId === fr.id;
                    const canAfford = progression.crystals >= fr.cost;
                    return (
                      <button
                        key={fr.id}
                        type="button"
                        onClick={() => handleUnlockFrame(fr.id, fr.cost)}
                        disabled={!unlocked && !canAfford}
                        className={`p-3 rounded-2xl border-2 text-left flex items-center gap-3 transition ${
                          active
                            ? 'bg-[#effdfb] border-[#39C5BB]'
                            : unlocked
                            ? 'bg-white border-slate-200 hover:border-[#39C5BB]/60'
                            : canAfford
                            ? 'bg-slate-50 border-slate-200 hover:border-[#ff4f93]/50'
                            : 'bg-slate-100/70 border-slate-200 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <AvatarFace
                          view={avatar}
                          frameId={fr.id}
                          className="w-11 h-11 shrink-0 bg-white"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-slate-900 truncate">{fr.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{fr.desc}</div>
                          <div className="mt-1 text-[11px] font-extrabold text-[#0f766e]">
                            {active ? '✓ Надето' : unlocked ? 'Надеть' : `${fr.cost} 💎`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-black text-slate-500 uppercase mb-2.5">
                  Титулы под ником
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PLAYER_TITLES.map((tl) => {
                    const unlocked = progression.unlockedTitleIds.includes(tl.id);
                    const active = progression.activeTitleId === tl.id;
                    const canAfford = progression.crystals >= tl.cost;
                    return (
                      <button
                        key={tl.id}
                        type="button"
                        onClick={() => handleUnlockTitle(tl.id, tl.cost)}
                        disabled={!unlocked && !canAfford}
                        className={`p-3 rounded-2xl border-2 text-left flex items-center justify-between gap-2 transition ${
                          active
                            ? 'bg-[#effdfb] border-[#39C5BB]'
                            : unlocked
                            ? 'bg-white border-slate-200 hover:border-[#39C5BB]/60'
                            : canAfford
                            ? 'bg-slate-50 border-slate-200 hover:border-[#ff4f93]/50'
                            : 'bg-slate-100/70 border-slate-200 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="min-w-0">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black text-white bg-gradient-to-r ${tl.gradient}`}
                          >
                            {tl.label}
                          </span>
                          <div className="text-[11px] text-slate-500 mt-1 truncate">{tl.desc}</div>
                        </div>
                        <span className="shrink-0 text-xs font-black text-[#0f766e]">
                          {active ? '✓ Активен' : unlocked ? 'Выбрать' : `${tl.cost} 💎`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
