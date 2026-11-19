import React, { useId } from 'react';
import { AVATAR_FRAMES } from '../types/game';
import { AvatarSelection } from '../types/game';

export interface MikuAvatarDef {
  id: string;
  name: string;
  badge: string;
  hair: string;
  hairDeep: string;
  hairLight: string;
  tie: string;
  eyes: string;
  bgFrom: string;
  bgTo: string;
}

/** Встроенные стили Хатсунэ Мику для Colorful Stage */
export const MIKU_AVATARS: MikuAvatarDef[] = [
  {
    id: 'classic_01',
    name: 'Классическая 01',
    badge: '01',
    hair: '#39C5BB',
    hairDeep: '#0d9488',
    hairLight: '#6cf5ea',
    tie: '#ff4f93',
    eyes: '#0f766e',
    bgFrom: '#e9fffc',
    bgTo: '#bdf2ea',
  },
  {
    id: 'sakura',
    name: 'Сакура',
    badge: '02',
    hair: '#ff8fb8',
    hairDeep: '#e0518e',
    hairLight: '#ffc9dd',
    tie: '#7c6cf0',
    eyes: '#9d2f6b',
    bgFrom: '#fff1f7',
    bgTo: '#ffdcec',
  },
  {
    id: 'starry',
    name: 'Звёздная ночь',
    badge: '03',
    hair: '#7c8cf8',
    hairDeep: '#4353d8',
    hairLight: '#b6beff',
    tie: '#fbbf24',
    eyes: '#3b49c9',
    bgFrom: '#eef1ff',
    bgTo: '#d4dbff',
  },
  {
    id: 'cyber',
    name: 'Cyber Neon',
    badge: '04',
    hair: '#22d3ee',
    hairDeep: '#0e7490',
    hairLight: '#9df1fb',
    tie: '#ff4f93',
    eyes: '#0e7490',
    bgFrom: '#eafcff',
    bgTo: '#c6f2fc',
  },
  {
    id: 'mint',
    name: 'Весенний мятный',
    badge: '05',
    hair: '#6ee7b7',
    hairDeep: '#059669',
    hairLight: '#bdfce0',
    tie: '#f472b6',
    eyes: '#047857',
    bgFrom: '#effdf6',
    bgTo: '#ccf6e5',
  },
  {
    id: 'dream',
    name: 'Мечта',
    badge: '06',
    hair: '#b7a6ff',
    hairDeep: '#8b5cf6',
    hairLight: '#e5dfff',
    tie: '#38bdf8',
    eyes: '#6d28d9',
    bgFrom: '#f6f3ff',
    bgTo: '#e4dcff',
  },
];

export interface AvatarView {
  id: string;
  name: string;
  hair: string;
  tie: string;
  accent: string;
  def?: MikuAvatarDef;
  customDataUrl?: string | null;
}

export function resolveAvatar(sel: AvatarSelection): AvatarView {
  if (sel.id === 'custom' && sel.customDataUrl) {
    return {
      id: 'custom',
      name: 'Моя аватарка',
      hair: '#39C5BB',
      tie: '#ff4f93',
      accent: '#39C5BB',
      customDataUrl: sel.customDataUrl,
    };
  }
  const def = MIKU_AVATARS.find((a) => a.id === sel.id) ?? MIKU_AVATARS[0];
  return {
    id: def.id,
    name: def.name,
    hair: def.hair,
    tie: def.tie,
    accent: def.hair,
    def,
  };
}

/**
 * Параметрическая фигура Хатсунэ Мику (та же геометрия, что и MikuStageIllustration),
 * перекрашиваемая под выбранного аватара.
 */
const MikuFigure: React.FC<{ def: MikuAvatarDef; uid: string }> = ({ def, uid }) => (
  <g>
    <defs>
      <linearGradient id={`mHairMain${uid}`} x1="60" y1="40" x2="360" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={def.hairLight} />
        <stop offset="45%" stopColor={def.hair} />
        <stop offset="100%" stopColor={def.hairDeep} />
      </linearGradient>
      <linearGradient id={`mHairGlow${uid}`} x1="210" y1="30" x2="210" y2="490" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={def.hairLight} stopOpacity="0.9" />
        <stop offset="100%" stopColor={def.hair} stopOpacity="0.15" />
      </linearGradient>
      <linearGradient id={`mTie${uid}`} x1="200" y1="230" x2="225" y2="375" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={def.hair} />
        <stop offset="100%" stopColor={def.hairDeep} />
      </linearGradient>
      <radialGradient id={`mAura${uid}`} cx="50%" cy="38%" r="50%">
        <stop offset="0%" stopColor={def.hair} stopOpacity="0.38" />
        <stop offset="55%" stopColor={def.tie} stopOpacity="0.16" />
        <stop offset="100%" stopColor={def.hair} stopOpacity="0" />
      </radialGradient>
    </defs>

    <circle cx="210" cy="215" r="190" fill={`url(#mAura${uid})`} />
    <circle cx="210" cy="210" r="152" stroke={def.hair} strokeOpacity="0.32" strokeWidth="1.5" strokeDasharray="8 8" />
    <circle cx="210" cy="210" r="174" stroke={def.tie} strokeOpacity="0.22" strokeWidth="1.2" strokeDasharray="4 10" />

    {/* Left Twin-Tail */}
    <path
      d="M150 118 C92 125, 42 190, 32 300 C26 362, 48 430, 82 478 C72 415, 76 340, 102 275 C118 232, 138 190, 160 156 Z"
      fill={`url(#mHairMain${uid})`}
    />
    <path
      d="M148 124 C105 142, 66 205, 58 292 C72 240, 102 188, 152 148 Z"
      fill={`url(#mHairGlow${uid})`}
    />

    {/* Right Twin-Tail */}
    <path
      d="M270 118 C328 125, 378 190, 388 300 C394 362, 372 430, 338 478 C348 415, 344 340, 318 275 C302 232, 282 190, 260 156 Z"
      fill={`url(#mHairMain${uid})`}
    />
    <path
      d="M272 124 C315 142, 354 205, 362 292 C348 240, 318 188, 268 148 Z"
      fill={`url(#mHairGlow${uid})`}
    />

    {/* Back Hair */}
    <ellipse cx="210" cy="145" rx="64" ry="66" fill={def.hairDeep} />

    {/* Neck & Shoulders */}
    <path d="M196 198 L224 198 L226 232 L194 232 Z" fill="#fef2ea" />
    <path
      d="M152 240 C168 225, 190 222, 210 222 C230 222, 252 225, 268 240 L282 355 L138 355 Z"
      fill="#f1f5f9"
      stroke="#cbd5e1"
      strokeWidth="2"
    />
    <path d="M174 226 L210 264 L246 226 L236 222 L210 248 L184 222 Z" fill="#1e293b" />

    {/* Tie */}
    <path d="M204 246 L216 246 L221 348 L210 364 L199 348 Z" fill={`url(#mTie${uid})`} />
    <path d="M206 250 L214 250 L216 335 L210 346 L204 335 Z" fill={def.hairLight} opacity="0.45" />

    {/* Detached Sleeves */}
    <path d="M144 260 L114 378 L146 386 L160 274 Z" fill="#1e293b" stroke={def.hair} strokeWidth="2" />
    <path d="M276 260 L306 378 L274 386 L260 274 Z" fill="#1e293b" stroke={def.hair} strokeWidth="2" />
    <rect x="114" y="366" width="32" height="7" rx="3" fill={def.tie} transform="rotate(14 114 366)" />
    <rect x="274" y="373" width="32" height="7" rx="3" fill={def.tie} transform="rotate(-14 274 373)" />

    {/* Face */}
    <path
      d="M162 142 C162 104, 258 104, 258 142 C258 182, 234 206, 210 206 C186 206, 162 182, 162 142 Z"
      fill="#fff5ee"
    />
    <ellipse cx="180" cy="168" rx="9" ry="4.5" fill="#ff85b3" opacity="0.45" />
    <ellipse cx="240" cy="168" rx="9" ry="4.5" fill="#ff85b3" opacity="0.45" />

    {/* Eyes */}
    <ellipse cx="187" cy="152" rx="9" ry="12" fill={def.eyes} />
    <ellipse cx="187" cy="155" rx="6" ry="7" fill={def.hair} />
    <circle cx="184" cy="147" r="3.2" fill="#ffffff" />
    <circle cx="190" cy="158" r="1.6" fill="#ffffff" />
    <ellipse cx="233" cy="152" rx="9" ry="12" fill={def.eyes} />
    <ellipse cx="233" cy="155" rx="6" ry="7" fill={def.hair} />
    <circle cx="230" cy="147" r="3.2" fill="#ffffff" />
    <circle cx="236" cy="158" r="1.6" fill="#ffffff" />

    {/* Smile */}
    <path d="M202 180 Q210 187 218 180" stroke="#e11d48" strokeWidth="2.4" strokeLinecap="round" />

    {/* Bangs */}
    <path
      d="M152 142 C152 86, 268 86, 268 142 C256 122, 244 128, 236 150 C228 122, 218 122, 210 152 C202 122, 192 122, 184 150 C176 128, 164 122, 152 142 Z"
      fill={`url(#mHairMain${uid})`}
    />
    <path
      d="M174 114 Q210 100 246 114"
      stroke={def.hairLight}
      strokeWidth="4"
      strokeLinecap="round"
      opacity="0.7"
    />

    {/* Hair Ties */}
    <rect
      x="140"
      y="106"
      width="18"
      height="24"
      rx="4"
      fill="#1e293b"
      stroke={def.tie}
      strokeWidth="3"
      transform="rotate(-18 149 118)"
    />
    <rect
      x="262"
      y="106"
      width="18"
      height="24"
      rx="4"
      fill="#1e293b"
      stroke={def.tie}
      strokeWidth="3"
      transform="rotate(18 271 118)"
    />

    {/* Headphones & Mic */}
    <path d="M154 136 C154 88, 266 88, 266 136" stroke="#1e293b" strokeWidth="7" strokeLinecap="round" />
    <rect x="144" y="136" width="16" height="32" rx="7" fill="#1e293b" stroke={def.hair} strokeWidth="2.5" />
    <rect x="260" y="136" width="16" height="32" rx="7" fill="#1e293b" stroke={def.hair} strokeWidth="2.5" />
    <path d="M152 162 Q166 184 196 184" stroke={def.hair} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="198" cy="184" r="3" fill={def.tie} />
  </g>
);

/** Круглый аватар Мику: кроп на голову/плечи + бейдж номера */
export const MikuAvatar: React.FC<{ def: MikuAvatarDef; className?: string }> = ({
  def,
  className = '',
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={def.name}>
      <defs>
        <clipPath id={`mClip${uid}`}>
          <circle cx="100" cy="100" r="98" />
        </clipPath>
        <radialGradient id={`mBg${uid}`} cx="50%" cy="35%" r="80%">
          <stop offset="0%" stopColor={def.bgFrom} />
          <stop offset="100%" stopColor={def.bgTo} />
        </radialGradient>
      </defs>

      <circle cx="100" cy="100" r="98" fill={`url(#mBg${uid})`} />
      <g clipPath={`url(#mClip${uid})`}>
        <g transform="scale(0.8333) translate(-90,-50)">
          <MikuFigure def={def} uid={uid} />
        </g>
      </g>
      <circle cx="100" cy="100" r="96.5" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.65" />

      {/* Number badge */}
      <rect x="140" y="140" width="47" height="31" rx="9" fill="#182235" stroke={def.tie} strokeWidth="2.5" />
      <text
        x="163.5"
        y="162"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="17"
        fontWeight="900"
        fontFamily="ui-monospace, monospace"
      >
        {def.badge}
      </text>
    </svg>
  );
};

/** Универсальный круглый аватар: векторная Мику или загруженное фото + необязательная рамка */
export const AvatarFace: React.FC<{
  view: AvatarView;
  className?: string;
  frameId?: string;
}> = ({ view, className = '', frameId }) => {
  const frameCls = frameId
    ? AVATAR_FRAMES.find((f) => f.id === frameId)?.ringClass ?? ''
    : '';
  const combined = `${className} ${frameCls}`.trim();
  if (view.def) return <MikuAvatar def={view.def} className={`${combined} rounded-full`} />;
  if (view.customDataUrl) {
    return (
      <img
        src={view.customDataUrl}
        alt={view.name}
        className={`${combined} rounded-full object-cover`}
      />
    );
  }
  return <div className={`${combined} rounded-full bg-slate-200`} />;
};

/** Ужимает и центрирует изображение до 256×256 PNG data-URL */
export function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad image'));
    };
    img.src = url;
  });
}
