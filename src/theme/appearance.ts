import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { AppTheme, GameSettings, ResolvedAppTheme } from '../types/game';

export interface AppThemeMeta {
  label: string;
  description: string;
  eyebrow: string;
  isDark: boolean;
  canvas: string;
  panel: string;
  soft: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  accentText: string;
}

export const APP_THEME_ORDER: ResolvedAppTheme[] = [
  'light',
  'pink',
  'mint',
  'gold',
  'dark',
  'cyber',
];

export const APP_THEMES: Record<ResolvedAppTheme, AppThemeMeta> = {
  light: {
    label: 'Светлая',
    description: 'Воздушная классика Мику',
    eyebrow: 'DAYLIGHT',
    isDark: false,
    canvas: '#edf5f5',
    panel: '#ffffff',
    soft: '#e1f2ef',
    border: '#d3e6e3',
    text: '#25383f',
    muted: '#60747b',
    accent: '#15857d',
    accent2: '#ff4f93',
    accentText: '#ffffff',
  },
  pink: {
    label: 'Сакура',
    description: 'Нежный розовый и лепестки',
    eyebrow: 'SAKURA',
    isDark: false,
    canvas: '#fbeaf0',
    panel: '#fffafd',
    soft: '#f6dce7',
    border: '#ebccda',
    text: '#4a303f',
    muted: '#836475',
    accent: '#c23670',
    accent2: '#fb7185',
    accentText: '#ffffff',
  },
  mint: {
    label: 'Зимний лёд',
    description: 'Кристальный Snow Miku',
    eyebrow: 'SNOW MIKU',
    isDark: false,
    canvas: '#ebf5ff',
    panel: '#ffffff',
    soft: '#dff0ff',
    border: '#c7dff5',
    text: '#1e354d',
    muted: '#577390',
    accent: '#0284c7',
    accent2: '#38bdf8',
    accentText: '#ffffff',
  },
  gold: {
    label: 'Шоутайм',
    description: 'Тёплый персик и карамель',
    eyebrow: 'WONDERLANDS',
    isDark: false,
    canvas: '#fff4e6',
    panel: '#fffcf7',
    soft: '#fde6cc',
    border: '#eed3b4',
    text: '#4a3019',
    muted: '#8b684a',
    accent: '#d97706',
    accent2: '#ec4899',
    accentText: '#ffffff',
  },
  dark: {
    label: 'Ночная 25:00',
    description: 'Уютный лунный аметист',
    eyebrow: 'MOONLIGHT',
    isDark: true,
    canvas: '#141520',
    panel: '#222334',
    soft: '#332d46',
    border: '#463f5b',
    text: '#f3effa',
    muted: '#aba2bf',
    accent: '#c1a5ec',
    accent2: '#f0a1c7',
    accentText: '#231738',
  },
  cyber: {
    label: 'Кибер-неон',
    description: 'Тёмный неон Vivid Street',
    eyebrow: 'VIVID CYBER',
    isDark: true,
    canvas: '#091020',
    panel: '#121b30',
    soft: '#172b42',
    border: '#243c5c',
    text: '#eef8ff',
    muted: '#8fb4d4',
    accent: '#22d3ee',
    accent2: '#ff4f93',
    accentText: '#061a24',
  },
};

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  if (query.addEventListener) {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

export function resolveAppTheme(theme: AppTheme, prefersDark = systemPrefersDark()): ResolvedAppTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme in APP_THEMES ? (theme as ResolvedAppTheme) : 'light';
}

export function useAppAppearance(settings: GameSettings): ResolvedAppTheme {
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark, () => false);
  const resolved = resolveAppTheme(settings.appTheme, prefersDark);
  const meta = APP_THEMES[resolved];

  useLayoutEffect(() => {
    const root = document.documentElement;
    // Repaint all colours together: independently animated legacy backgrounds
    // could otherwise leave white labels on a still-light button for a frame.
    root.dataset.appSwitching = 'true';
    root.dataset.appTheme = resolved;
    root.dataset.appContrast = settings.highContrast ? 'high' : 'normal';
    root.dataset.appMotion = settings.reduceMotion ? 'reduced' : 'system';
    root.style.colorScheme = meta.isDark ? 'dark' : 'light';
    const browserColor = meta.canvas;
    root.style.backgroundColor = browserColor;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', browserColor);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { delete root.dataset.appSwitching; });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      delete root.dataset.appSwitching;
    };
  }, [resolved, meta.isDark, meta.canvas, settings.highContrast, settings.reduceMotion]);

  return resolved;
}
