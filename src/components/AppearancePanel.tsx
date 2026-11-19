import React, { useState } from 'react';
import {
  Check,
  Crown,
  Eye,
  Flower2,
  Monitor,
  Moon,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sun,
  Wind,
  Zap,
} from 'lucide-react';
import { APP_THEME_ORDER, APP_THEMES } from '../theme/appearance';
import type { GameSettings, ResolvedAppTheme } from '../types/game';

interface AppearancePanelProps {
  settings: GameSettings;
  resolvedTheme: ResolvedAppTheme;
  onChange: (next: GameSettings) => void;
}

const THEME_ICONS: Record<ResolvedAppTheme, React.ElementType> = {
  light: Sun,
  pink: Flower2,
  mint: Snowflake,
  gold: Crown,
  dark: Moon,
  cyber: Zap,
};

export const ThemeMiniPreview: React.FC<{ theme: ResolvedAppTheme; compact?: boolean }> = ({
  theme,
  compact = false,
}) => {
  const t = APP_THEMES[theme];
  return (
    <div
      className="appearance-mini"
      style={{
        background: `linear-gradient(145deg, ${t.canvas}, ${t.soft})`,
        borderColor: t.border,
        height: compact ? 64 : undefined,
      }}
      aria-hidden="true"
    >
      <div
        className="appearance-mini-header"
        style={{ background: t.panel, borderColor: t.border }}
      >
        <span className="appearance-mini-logo" style={{ background: t.accent }} />
        <span
          className="appearance-mini-line"
          style={{ background: t.text, width: '36%', opacity: 0.58 }}
        />
        <span
          className="appearance-mini-dot"
          style={{ background: t.accent2, marginLeft: 'auto' }}
        />
        <span className="appearance-mini-dot" style={{ background: t.accent }} />
      </div>
      <div className="appearance-mini-body">
        <div className="appearance-mini-list">
          {[true, false, false].map((selected, i) => (
            <div
              key={i}
              className="appearance-mini-song"
              style={{
                background: selected ? t.soft : t.panel,
                borderColor: selected ? t.accent : t.border,
                boxShadow: selected ? `0 0 0 1px ${t.accent}33` : undefined,
              }}
            >
              <span
                className="appearance-mini-cover"
                style={{
                  background: i === 0 ? t.accent : i === 1 ? t.accent2 : t.muted,
                  opacity: i === 2 ? 0.45 : 1,
                }}
              />
              <span
                className="appearance-mini-line"
                style={{
                  background: t.text,
                  width: `${46 - i * 6}%`,
                  opacity: selected ? 0.8 : 0.45,
                }}
              />
            </div>
          ))}
        </div>
        <div
          className="appearance-mini-detail"
          style={{ background: t.panel, borderColor: t.border }}
        >
          <span
            className="appearance-mini-art"
            style={{
              background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`,
            }}
          >
            <Sparkles size={compact ? 12 : 15} style={{ color: t.accentText }} />
          </span>
          <span
            className="appearance-mini-line"
            style={{ background: t.text, width: '62%', opacity: 0.65 }}
          />
          <span
            className="appearance-mini-cta"
            style={{
              background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

const PreferenceSwitch: React.FC<{
  id: string;
  checked: boolean;
  title: string;
  description: string;
  icon: React.ElementType;
  onToggle: () => void;
  children?: React.ReactNode;
}> = ({ id, checked, title, description, icon: Icon, onToggle, children }) => (
  <div className={`appearance-preference ${checked ? 'is-enabled' : ''}`}>
    <span className="appearance-preference-icon">
      <Icon size={19} strokeWidth={1.7} />
    </span>
    <div className="appearance-preference-copy">
      <span id={`${id}-label`} className="appearance-preference-title">
        {title}
      </span>
      <span id={`${id}-description`} className="appearance-preference-description">
        {description}
      </span>
      {children}
    </div>
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      className="appearance-switch-target"
      onClick={onToggle}
    >
      <span className="appearance-switch-track">
        <span className="appearance-switch-thumb">
          {checked && <Check size={11} strokeWidth={3} />}
        </span>
      </span>
    </button>
  </div>
);

export const AppearancePanel: React.FC<AppearancePanelProps> = ({
  settings,
  resolvedTheme,
  onChange,
}) => {
  const [filter, setFilter] = useState<'all' | 'light' | 'dark'>('all');
  const CurrentIcon = THEME_ICONS[resolvedTheme];

  const visibleThemes = APP_THEME_ORDER.filter((id) => {
    if (filter === 'light') return !APP_THEMES[id].isDark;
    if (filter === 'dark') return APP_THEMES[id].isDark;
    return true;
  });

  return (
    <div className="appearance-panel">
      <section className="appearance-intro" aria-labelledby="appearance-heading">
        <div className="appearance-intro-copy">
          <span className="appearance-eyebrow">
            <span /> MAKE IT YOUR SEKAI
          </span>
          <h3 id="appearance-heading">
            Твой мир,
            <br />
            <em>твой цвет.</em>
          </h3>
          <p>
            Выбери светлую пастель, нежную сакуру
            <br />
            или контрастную ночную сцену.
          </p>
        </div>
        <div className="appearance-orbit" aria-hidden="true">
          <span className="appearance-orbit-ring ring-one" />
          <span className="appearance-orbit-ring ring-two" />
          <span className="appearance-orbit-spark spark-one">✦</span>
          <span className="appearance-orbit-spark spark-two">✧</span>
          <span className="appearance-orbit-center">
            <CurrentIcon strokeWidth={1.15} />
          </span>
          <span className="appearance-orbit-label">{APP_THEMES[resolvedTheme].eyebrow}</span>
        </div>
      </section>

      <section aria-labelledby="palette-label">
        <div className="appearance-section-heading">
          <div>
            <h4 id="palette-label">Выбор дизайна ({visibleThemes.length})</h4>
            <span className="appearance-live-label">
              <span /> Применяется мгновенно
            </span>
          </div>
          <div className="appearance-filter-bar" role="group" aria-label="Фильтр тем">
            {(
              [
                { id: 'all', label: 'Все' },
                { id: 'light', label: 'Светлые' },
                { id: 'dark', label: 'Тёмные' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`appearance-filter-pill ${filter === f.id ? 'is-active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="appearance-theme-grid" role="group" aria-labelledby="palette-label">
          {visibleThemes.map((id) => {
            const t = APP_THEMES[id];
            const Icon = THEME_ICONS[id];
            const selected = settings.appTheme === id;
            return (
              <button
                key={id}
                type="button"
                className={`appearance-theme-card ${selected ? 'is-selected' : ''}`}
                aria-pressed={selected}
                aria-label={`${t.label} тема`}
                onClick={() => onChange({ ...settings, appTheme: id })}
              >
                <ThemeMiniPreview theme={id} />
                <div className="appearance-theme-meta-row">
                  <span className="appearance-swatches" aria-hidden="true">
                    <span className="appearance-swatch-dot" style={{ background: t.canvas }} />
                    <span className="appearance-swatch-dot" style={{ background: t.accent }} />
                    <span className="appearance-swatch-dot" style={{ background: t.accent2 }} />
                  </span>
                  <span className="appearance-mode-pill">{t.isDark ? 'Тёмная' : 'Светлая'}</span>
                </div>
                <span className="appearance-theme-caption">
                  <span className="appearance-theme-name">
                    <Icon size={14} strokeWidth={1.9} />
                    {t.label}
                  </span>
                  <span className="appearance-theme-check">
                    {selected && <Check size={11} strokeWidth={3} />}
                  </span>
                </span>
                <span className="appearance-theme-description">{t.description}</span>
              </button>
            );
          })}
        </div>

        <PreferenceSwitch
          id="follow-system-theme"
          title="Как на устройстве"
          description="Автоматически переключает светлую или тёмную тему по системе."
          icon={Monitor}
          checked={settings.appTheme === 'system'}
          onToggle={() =>
            onChange({
              ...settings,
              appTheme: settings.appTheme === 'system' ? resolvedTheme : 'system',
            })
          }
        >
          {settings.appTheme === 'system' && (
            <span className="appearance-system-current">
              Сейчас активна: {APP_THEMES[resolvedTheme].label.toLowerCase()}
            </span>
          )}
        </PreferenceSwitch>
      </section>

      <section className="appearance-comfort" aria-labelledby="comfort-label">
        <div className="appearance-section-heading">
          <h4 id="comfort-label">Комфорт для глаз</h4>
          <span className="appearance-section-line" />
        </div>
        <PreferenceSwitch
          id="high-contrast"
          title="Больше контраста"
          description="Более чёткие подписи, границы карточек и иконки."
          icon={Eye}
          checked={settings.highContrast}
          onToggle={() => onChange({ ...settings, highContrast: !settings.highContrast })}
        />
        <PreferenceSwitch
          id="reduce-motion"
          title="Меньше движения"
          description="Отключает фоновые блики и лишние переходы в меню."
          icon={Wind}
          checked={settings.reduceMotion}
          onToggle={() => onChange({ ...settings, reduceMotion: !settings.reduceMotion })}
        />
      </section>

      <div className="appearance-reassurance">
        <ShieldCheck size={17} strokeWidth={1.6} />
        <p>
          Дизайн меняет меню, карточки и окна приложения.
          <br />
          <strong>Цвета нот и читаемость дорожки во время игры остаются чёткими.</strong>
        </p>
      </div>
    </div>
  );
};
