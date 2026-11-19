import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { HapticsMode } from '../types/game';

let lastNoteHapticAt = 0;
const MIN_NOTE_GAP_MS = 28;

function canUseNavigatorVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function safeImpact(style: ImpactStyle, webMs: number): void {
  if (isNative()) {
    Haptics.impact({ style }).catch(() => {});
  } else if (canUseNavigatorVibrate()) {
    try {
      navigator.vibrate(webMs);
    } catch {
      // Ignore browser blocks before user gesture
    }
  }
}

export function triggerTapHaptic(enabled: boolean | undefined, mode: HapticsMode = 'accents'): void {
  if (enabled === false || mode !== 'all') return;
  const now = performance.now();
  if (now - lastNoteHapticAt < MIN_NOTE_GAP_MS) return;
  lastNoteHapticAt = now;
  safeImpact(ImpactStyle.Light, 9);
}

export function triggerAccentHaptic(
  enabled: boolean | undefined,
  kind: 'critical' | 'flick'
): void {
  if (enabled === false) return;
  const now = performance.now();
  if (now - lastNoteHapticAt < MIN_NOTE_GAP_MS) return;
  lastNoteHapticAt = now;
  if (kind === 'critical') {
    safeImpact(ImpactStyle.Heavy, 20);
  } else {
    safeImpact(ImpactStyle.Medium, 15);
  }
}

export function triggerMilestoneHaptic(enabled: boolean | undefined): void {
  if (enabled === false) return;
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  } else if (canUseNavigatorVibrate()) {
    try {
      navigator.vibrate([16, 40, 22]);
    } catch {
      // ignore
    }
  }
}

export function triggerFinishHaptic(
  enabled: boolean | undefined,
  kind: 'CLEAR' | 'FC' | 'AP'
): void {
  if (enabled === false) return;
  if (isNative()) {
    if (kind === 'AP' || kind === 'FC') {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      window.setTimeout(() => {
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      }, 140);
    } else {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }
  } else if (canUseNavigatorVibrate()) {
    try {
      navigator.vibrate(
        kind === 'AP' ? [22, 45, 22, 45, 36] : kind === 'FC' ? [18, 45, 28] : [20, 40, 20]
      );
    } catch {
      // ignore
    }
  }
}

export function triggerUiTapHaptic(enabled: boolean | undefined): void {
  if (enabled === false) return;
  safeImpact(ImpactStyle.Light, 8);
}
