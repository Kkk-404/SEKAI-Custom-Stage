import type { GameSettings } from '../types/game';

const ARROW_LABELS: Record<string, string> = {
  arrowleft: '←',
  arrowdown: '↓',
  arrowup: '↑',
  arrowright: '→',
};

const ALLOWED_SPECIAL_KEYS = new Set([
  'arrowleft',
  'arrowdown',
  'arrowup',
  'arrowright',
]);

/**
 * Convert KeyboardEvent.key into a stored binding string, or null if it should not be bound.
 * Supports any printable 1-character key (letters, numbers, punctuation, Space) and Arrow keys.
 */
export function normalizeBindableKey(rawKey: string): string | null {
  if (!rawKey) return null;
  const lower = rawKey.toLowerCase();
  if (ALLOWED_SPECIAL_KEYS.has(lower)) return lower;
  if (rawKey.length === 1 && lower !== '\r' && lower !== '\n' && lower !== '\t') {
    return lower;
  }
  return null;
}

/**
 * Human-friendly short label for a stored key binding (renders crisp arrows on keycaps and buttons).
 */
export function formatKeyLabel(key: string): string {
  const lower = (key ?? '').toLowerCase();
  if (ARROW_LABELS[lower]) return ARROW_LABELS[lower];
  if (lower === ' ') return 'SPACE';
  return lower.toUpperCase();
}

export const KEY_BINDING_PRESETS: Array<{
  label: string;
  keys: GameSettings['keyBindings'];
}> = [
  { label: 'D F J K', keys: ['d', 'f', 'j', 'k'] },
  { label: '← ↓ ↑ →', keys: ['arrowleft', 'arrowdown', 'arrowup', 'arrowright'] },
  { label: 'A S K L', keys: ['a', 's', 'k', 'l'] },
];
