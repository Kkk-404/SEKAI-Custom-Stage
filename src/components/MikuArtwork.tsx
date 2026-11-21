import React from 'react';
import { SekaiTag } from '../types/game';

export const UnitIcon: React.FC<{ tag?: SekaiTag; className?: string }> = ({
  tag = 'custom',
  className = 'w-4 h-4',
}) => {
  switch (tag) {
    case 'virtual_singer':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" stroke="#39C5BB" strokeWidth="2" />
          <path d="M7.5 14.5V10.5C7.5 8 9.5 6.2 12 6.2C14.5 6.2 16.5 8 16.5 10.5V14.5" stroke="#ff4f93" strokeWidth="2" strokeLinecap="round" />
          <rect x="6" y="12" width="3" height="5" rx="1.5" fill="#39C5BB" />
          <rect x="15" y="12" width="3" height="5" rx="1.5" fill="#39C5BB" />
        </svg>
      );
    case 'leoneed':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 2.5L14.4 8.6L21 9.2L15.9 13.4L17.6 19.8L12 16.3L6.4 19.8L8.1 13.4L3 9.2L9.6 8.6L12 2.5Z" fill="#4455dd" stroke="#93c5fd" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M5 19.5C9 15.5 14.5 11.5 20.5 7.5" stroke="#fde047" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'mmj':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="9.2" cy="9.2" r="3.4" fill="#66dd11" />
          <circle cx="14.8" cy="9.2" r="3.4" fill="#66dd11" />
          <circle cx="9.2" cy="14.8" r="3.4" fill="#66dd11" />
          <circle cx="14.8" cy="14.8" r="3.4" fill="#66dd11" />
          <circle cx="12" cy="12" r="2.1" fill="#ffffff" />
          <path d="M12 15.5V20.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'vbs':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M4 17L6.5 7.5L12 12L17.5 7.5L20 17H4Z" fill="#ee1166" stroke="#fda4af" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M5.5 20H18.5" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'wxs':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 3L14.5 9.2L21 9.5L16 13.7L17.7 20L12 16.5L6.3 20L8 13.7L3 9.5L9.5 9.2L12 3Z" fill="#ff9900" />
          <circle cx="5" cy="5.5" r="1.4" fill="#ff4f93" />
          <circle cx="19" cy="5.5" r="1.4" fill="#39C5BB" />
        </svg>
      );
    case 'n25':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M15.8 4.4A7.8 7.8 0 1 0 19.6 16.4A6.4 6.4 0 0 1 15.8 4.4Z" fill="#884499" stroke="#d8b4fe" strokeWidth="1.4" />
          <path d="M4 17H8.5L10.5 13.5L12.5 19L14.5 15.5H20" stroke="#c084fc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 3L20.5 12L12 21L3.5 12L12 3Z" fill="#ff4f93" fillOpacity="0.22" stroke="#ff4f93" strokeWidth="1.8" />
          <path d="M11 8.5V14.2C10.6 13.9 10.1 13.8 9.6 13.9C8.8 14.1 8.3 14.8 8.5 15.6C8.7 16.4 9.5 16.8 10.4 16.6C11.2 16.4 11.7 15.8 11.7 15V10.4L15 9.5V8L11 8.5Z" fill="#ff4f93" />
        </svg>
      );
  }
};

export const MikuEmblem: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 64 64" fill="none" className={className}>
    <defs>
      <linearGradient id="mikuBadgeGrad" x1="6" y1="6" x2="58" y2="58">
        <stop offset="0%" stopColor="#39C5BB" />
        <stop offset="55%" stopColor="#2ee6d6" />
        <stop offset="100%" stopColor="#ff4f93" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="56" height="56" rx="16" fill="#182235" stroke="url(#mikuBadgeGrad)" strokeWidth="3" />
    {/* Stylized twin-tails + headphones arc */}
    <path
      d="M17 30C17 20.6 23.7 13 32 13C40.3 13 47 20.6 47 30"
      stroke="#39C5BB"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <rect x="12" y="25" width="7" height="14" rx="3.5" fill="#ff4f93" />
    <rect x="45" y="25" width="7" height="14" rx="3.5" fill="#ff4f93" />
    <text
      x="32"
      y="40"
      textAnchor="middle"
      fill="#ffffff"
      fontSize="16"
      fontWeight="900"
      fontFamily="ui-monospace, monospace"
    >
      01
    </text>
  </svg>
);

export const MikuStageIllustration: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 420 520" fill="none" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="mikuHairMain" x1="60" y1="40" x2="360" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#6cf5ea" />
        <stop offset="45%" stopColor="#39C5BB" />
        <stop offset="100%" stopColor="#0d9488" />
      </linearGradient>
      <linearGradient id="mikuHairGlow" x1="210" y1="30" x2="210" y2="490" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#a7fff8" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#39C5BB" stopOpacity="0.15" />
      </linearGradient>
      <linearGradient id="mikuTieGrad" x1="200" y1="230" x2="225" y2="375" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#39C5BB" />
        <stop offset="100%" stopColor="#0e7490" />
      </linearGradient>
      <radialGradient id="mikuStageAura" cx="50%" cy="38%" r="50%">
        <stop offset="0%" stopColor="#39C5BB" stopOpacity="0.38" />
        <stop offset="55%" stopColor="#ff4f93" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#39C5BB" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Stage Aura */}
    <circle cx="210" cy="215" r="190" fill="url(#mikuStageAura)" />

    {/* Orbiting Equalizer Ring */}
    <circle
      cx="210"
      cy="210"
      r="152"
      stroke="#39C5BB"
      strokeOpacity="0.32"
      strokeWidth="1.5"
      strokeDasharray="8 8"
    />
    <circle
      cx="210"
      cy="210"
      r="174"
      stroke="#ff4f93"
      strokeOpacity="0.22"
      strokeWidth="1.2"
      strokeDasharray="4 10"
    />

    {/* Left Sweeping Twin-Tail */}
    <path
      d="M150 118 C92 125, 42 190, 32 300 C26 362, 48 430, 82 478 C72 415, 76 340, 102 275 C118 232, 138 190, 160 156 Z"
      fill="url(#mikuHairMain)"
    />
    <path
      d="M148 124 C105 142, 66 205, 58 292 C72 240, 102 188, 152 148 Z"
      fill="url(#mikuHairGlow)"
    />

    {/* Right Sweeping Twin-Tail */}
    <path
      d="M270 118 C328 125, 378 190, 388 300 C394 362, 372 430, 338 478 C348 415, 344 340, 318 275 C302 232, 282 190, 260 156 Z"
      fill="url(#mikuHairMain)"
    />
    <path
      d="M272 124 C315 142, 354 205, 362 292 C348 240, 318 188, 268 148 Z"
      fill="url(#mikuHairGlow)"
    />

    {/* Back Hair */}
    <ellipse cx="210" cy="145" rx="64" ry="66" fill="#28a89f" />

    {/* Neck & Shoulders (Sleeveless Vest Silhouette) */}
    <path d="M196 198 L224 198 L226 232 L194 232 Z" fill="#fef2ea" />
    <path
      d="M152 240 C168 225, 190 222, 210 222 C230 222, 252 225, 268 240 L282 355 L138 355 Z"
      fill="#f1f5f9"
      stroke="#cbd5e1"
      strokeWidth="2"
    />
    {/* Vest Collar & Dark Trim */}
    <path d="M174 226 L210 264 L246 226 L236 222 L210 248 L184 222 Z" fill="#1e293b" />
    {/* Miku Tie */}
    <path d="M204 246 L216 246 L221 348 L210 364 L199 348 Z" fill="url(#mikuTieGrad)" />
    <path d="M206 250 L214 250 L216 335 L210 346 L204 335 Z" fill="#6cf5ea" opacity="0.45" />

    {/* Detached Cyber Sleeves */}
    <path d="M144 260 L114 378 L146 386 L160 274 Z" fill="#1e293b" stroke="#39C5BB" strokeWidth="2" />
    <path d="M276 260 L306 378 L274 386 L260 274 Z" fill="#1e293b" stroke="#39C5BB" strokeWidth="2" />
    <rect x="114" y="366" width="32" height="7" rx="3" fill="#ff4f93" transform="rotate(14 114 366)" />
    <rect x="274" y="373" width="32" height="7" rx="3" fill="#ff4f93" transform="rotate(-14 274 373)" />

    {/* Face */}
    <path
      d="M162 142 C162 104, 258 104, 258 142 C258 182, 234 206, 210 206 C186 206, 162 182, 162 142 Z"
      fill="#fff5ee"
    />
    {/* Soft Blush */}
    <ellipse cx="180" cy="168" rx="9" ry="4.5" fill="#ff85b3" opacity="0.45" />
    <ellipse cx="240" cy="168" rx="9" ry="4.5" fill="#ff85b3" opacity="0.45" />

    {/* Expressive Miku Eyes */}
    <ellipse cx="187" cy="152" rx="9" ry="12" fill="#0f766e" />
    <ellipse cx="187" cy="155" rx="6" ry="7" fill="#39C5BB" />
    <circle cx="184" cy="147" r="3.2" fill="#ffffff" />
    <circle cx="190" cy="158" r="1.6" fill="#ffffff" />

    <ellipse cx="233" cy="152" rx="9" ry="12" fill="#0f766e" />
    <ellipse cx="233" cy="155" rx="6" ry="7" fill="#39C5BB" />
    <circle cx="230" cy="147" r="3.2" fill="#ffffff" />
    <circle cx="236" cy="158" r="1.6" fill="#ffffff" />

    {/* Smile */}
    <path d="M202 180 Q210 187 218 180" stroke="#e11d48" strokeWidth="2.4" strokeLinecap="round" />

    {/* Iconic Miku Bangs */}
    <path
      d="M152 142 C152 86, 268 86, 268 142 C256 122, 244 128, 236 150 C228 122, 218 122, 210 152 C202 122, 192 122, 184 150 C176 128, 164 122, 152 142 Z"
      fill="url(#mikuHairMain)"
    />
    {/* Hair Shine */}
    <path d="M174 114 Q210 100 246 114" stroke="#ccfbf1" strokeWidth="4" strokeLinecap="round" opacity="0.7" />

    {/* Square Magenta Hair Ties */}
    <rect x="140" y="106" width="18" height="24" rx="4" fill="#1e293b" stroke="#ff4f93" strokeWidth="3" transform="rotate(-18 149 118)" />
    <rect x="262" y="106" width="18" height="24" rx="4" fill="#1e293b" stroke="#ff4f93" strokeWidth="3" transform="rotate(18 271 118)" />

    {/* Headphones & Mic */}
    <path d="M154 136 C154 88, 266 88, 266 136" stroke="#1e293b" strokeWidth="7" strokeLinecap="round" />
    <rect x="144" y="136" width="16" height="32" rx="7" fill="#1e293b" stroke="#39C5BB" strokeWidth="2.5" />
    <rect x="260" y="136" width="16" height="32" rx="7" fill="#1e293b" stroke="#39C5BB" strokeWidth="2.5" />
    <path d="M152 162 Q166 184 196 184" stroke="#39C5BB" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="198" cy="184" r="3" fill="#ff4f93" />

    {/* Floating Music Notes */}
    <text x="58" y="106" fill="#39C5BB" fontSize="28" fontWeight="900" opacity="0.75">♪</text>
    <text x="342" y="96" fill="#ff4f93" fontSize="32" fontWeight="900" opacity="0.75">♫</text>
    <text x="348" y="425" fill="#39C5BB" fontSize="24" fontWeight="900" opacity="0.65">✦</text>
    <text x="52" y="410" fill="#ff4f93" fontSize="22" fontWeight="900" opacity="0.65">✦</text>
  </svg>
);
