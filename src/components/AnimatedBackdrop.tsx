import type { CSSProperties } from 'react';
import type { GraphicsQuality } from '../types/game';

/**
 * Живой анимированный фон сцены SEKAI.
 *
 * Слои (снизу вверх):
 *  1. aurora-пятна — медленно плывущие световые облака в цветах активной темы;
 *  2. призматическое гало — вращающийся конический свет за сценой;
 *  3. перспективный пол — уходящая вдаль сетка, которая едет на зрителя;
 *  4. сценические прожекторы — широкие косые лучи, гуляющие по экрану;
 *  5. пыль/искры — мерцающие частицы в воздухе;
 *  6. летящие ноты — ♪ ♫ ♩ поднимаются вверх и растворяются;
 *  7. эквалайзер — тонкие пульсирующие полосы у нижней кромки;
 *  8. виньетка + зерно — глубина и «плёночная» текстура.
 *
 * Всё рисуется только transform/opacity, без JS-цикла кадров, поэтому
 * не мешает 60 fps в самой игре. При `eco` и в режиме уменьшенной
 * анимации тяжёлые слои отключаются.
 */

type Props = {
  quality?: GraphicsQuality;
  /** Меню — полная версия, сплэш/результаты — облегчённая. */
  variant?: 'menu' | 'stage' | 'quiet';
  className?: string;
};

/** Детерминированный ГПСЧ — частицы не «прыгают» между рендерами. */
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rnd = makeRandom(20261119);

const DUST = Array.from({ length: 46 }, (_, i) => {
  const size = 1.4 + rnd() * 3.6;
  return {
    id: i,
    left: rnd() * 100,
    top: rnd() * 100,
    size,
    delay: -rnd() * 22,
    duration: 9 + rnd() * 16,
    drift: (rnd() - 0.5) * 90,
    hue: rnd(),
  };
});

const NOTES = [
  { glyph: '♪', left: 8, size: 34, delay: -2, duration: 26 },
  { glyph: '♫', left: 24, size: 26, delay: -11, duration: 32 },
  { glyph: '♩', left: 41, size: 20, delay: -19, duration: 29 },
  { glyph: '♬', left: 58, size: 30, delay: -6, duration: 35 },
  { glyph: '♪', left: 74, size: 24, delay: -15, duration: 27 },
  { glyph: '♫', left: 89, size: 36, delay: -23, duration: 38 },
];

const EQ_BARS = Array.from({ length: 34 }, (_, i) => ({
  id: i,
  height: 22 + Math.abs(Math.sin(i * 1.7)) * 74,
  delay: -(i % 11) * 0.11,
  duration: 1.05 + (i % 5) * 0.14,
}));

const BEAMS = [
  { left: '4%', width: '26vw', rotate: -16, delay: 0, duration: 19, hue: 1 },
  { left: '42%', width: '20vw', rotate: 12, delay: -7, duration: 24, hue: 2 },
  { left: '74%', width: '24vw', rotate: -22, delay: -13, duration: 21, hue: 3 },
];

export function AnimatedBackdrop({ quality = 'auto', variant = 'menu', className = '' }: Props) {
  const eco = quality === 'eco';
  const lite = eco || variant === 'quiet';
  const rich = !lite;
  const auroraCount = eco ? 2 : lite ? 3 : 4;

  return (
    <div
      aria-hidden="true"
      className={`amb-shell amb-shell--${variant} ${className}`}
      data-quality={eco ? 'eco' : 'rich'}
    >
      {/* 1. Аврора: мягкие световые облака в цветах темы */}
      <div className="amb-layer amb-aurora-field">
        {Array.from({ length: auroraCount }, (_, i) => (
          <span key={i} className={`amb-aurora amb-aurora--${i + 1}`} />
        ))}
      </div>

      {/* 2. Вращающееся призматическое гало */}
      {rich && (
        <div className="amb-layer amb-halo">
          <span className="amb-halo__ring" />
          <span className="amb-halo__ring amb-halo__ring--b" />
        </div>
      )}

      {/* 3. Перспективный пол сцены */}
      {!eco && (
        <div className="amb-layer amb-floor">
          <span className="amb-floor__grid" />
          <span className="amb-floor__wires" />
        </div>
      )}

      {/* 4. Прожекторы */}
      {!eco && (
        <div className="amb-layer amb-beams">
          {BEAMS.map((b, i) => (
            <span
              key={i}
              className="amb-beam"
              style={
                {
                  '--beam-left': b.left,
                  '--beam-width': b.width,
                  '--beam-rotate': `${b.rotate}deg`,
                  '--beam-delay': `${b.delay}s`,
                  '--beam-duration': `${b.duration}s`,
                  '--beam-hue': `var(--amb-${b.hue})`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* 5. Пыль и искры */}
      {!eco && (
        <div className="amb-layer amb-dust">
          {DUST.map((d) => (
            <span
              key={d.id}
              className="amb-dust__mote"
              style={
                {
                  left: `${d.left}%`,
                  top: `${d.top}%`,
                  width: `${d.size}px`,
                  height: `${d.size}px`,
                  animationDelay: `${d.delay}s`,
                  animationDuration: `${d.duration}s`,
                  '--mote-drift': `${d.drift}px`,
                  '--mote-hue': `var(--amb-${(d.id % 3) + 1})`,
                  opacity: 0.35 + d.hue * 0.5,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* 6. Летящие ноты */}
      {!lite && (
        <div className="amb-layer amb-notes">
          {NOTES.map((n) => (
            <span
              key={n.glyph + n.left}
              className="amb-note"
              style={{
                left: `${n.left}%`,
                fontSize: `${n.size}px`,
                animationDelay: `${n.delay}s`,
                animationDuration: `${n.duration}s`,
              }}
            >
              {n.glyph}
            </span>
          ))}
        </div>
      )}

      {/* 7. Эквалайзер по нижней кромке */}
      {rich && (
        <div className="amb-layer amb-eq">
          {EQ_BARS.map((b) => (
            <span
              key={b.id}
              className="amb-eq__bar"
              style={{
                height: `${b.height}%`,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* 8. Глубина: виньетка + зерно */}
      <div className="amb-layer amb-vignette" />
      <div className="amb-layer amb-grain" />
    </div>
  );
}

export default AnimatedBackdrop;
