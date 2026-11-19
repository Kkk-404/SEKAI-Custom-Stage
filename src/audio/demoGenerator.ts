import { SongItem } from '../types/game';
import { analyzeAudioBuffer, generateAllDifficulties } from './analyzer';

export function createProceduralCover(title: string, c1: string, c2: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, 400, 400);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);

  // Geometric SEKAI triangles
  ctx.save();
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    const x = ((i * 97) % 360) + 20;
    const y = ((i * 151) % 360) + 20;
    const r = 24 + (i % 5) * 16;
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.86, y + r * 0.5);
    ctx.lineTo(x - r * 0.86, y + r * 0.5);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(13,15,30,0.18)';
    ctx.fill();
  }
  ctx.restore();

  // Subtle "01" Miku watermark
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.font = '900 130px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('01', 382, 120);
  ctx.restore();

  // Diagonal ribbon
  ctx.save();
  ctx.translate(200, 205);
  ctx.rotate(-0.18);
  ctx.fillStyle = 'rgba(22, 30, 50, 0.78)';
  ctx.fillRect(-260, -50, 520, 100);
  ctx.strokeStyle = '#39C5BB';
  ctx.lineWidth = 4;
  ctx.strokeRect(-260, -50, 520, 100);
  ctx.restore();

  // Title text
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const shortTitle = title.length > 20 ? title.slice(0, 19) + '…' : title;
  ctx.fillText(shortTitle, 200, 198);

  ctx.fillStyle = '#39C5BB';
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.fillText('♪ MIKU CUSTOM STAGE ♫', 200, 230);

  return canvas.toDataURL('image/png');
}

function synthesizeDemoBuffer(
  ctx: AudioContext,
  bpm: number,
  bars: number,
  variant: 'sparkle' | 'cyber'
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const beatSec = 60 / bpm;
  const durationSec = bars * 4 * beatSec + 1.5;
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);

  const scaleA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
  const scaleB = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25];
  const scale = variant === 'sparkle' ? scaleA : scaleB;

  const bassProgression =
    variant === 'sparkle'
      ? [174.61, 196.0, 164.81, 220.0] // F - G - Em - Am
      : [110.0, 130.81, 146.83, 164.81]; // Am - C - D - E

  const totalSixteenths = bars * 16;
  const stepSec = beatSec / 4;

  const addKick = (startSample: number, amp: number) => {
    const len = Math.floor(0.18 * sampleRate);
    for (let i = 0; i < len && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const freq = 135 * Math.exp(-t * 28) + 45;
      const env = Math.exp(-t * 16) * amp;
      const s = Math.sin(2 * Math.PI * freq * t) * env;
      L[startSample + i] += s;
      R[startSample + i] += s;
    }
  };

  const addSnare = (startSample: number, amp: number) => {
    const len = Math.floor(0.14 * sampleRate);
    for (let i = 0; i < len && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 24) * amp;
      const noise = (Math.random() * 2 - 1) * 0.65;
      const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 35) * 0.45;
      const s = (noise + body) * env;
      L[startSample + i] += s * 0.95;
      R[startSample + i] += s * 1.05;
    }
  };

  const addHat = (startSample: number, amp: number) => {
    const len = Math.floor(0.05 * sampleRate);
    for (let i = 0; i < len && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 75) * amp;
      const s = (Math.random() * 2 - 1) * env;
      L[startSample + i] += s * 0.8;
      R[startSample + i] += s * 1.1;
    }
  };

  const addLead = (startSample: number, freq: number, durSec: number, amp: number, pan: number) => {
    const len = Math.floor(durSec * sampleRate);
    for (let i = 0; i < len && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const atk = Math.min(1, t / 0.01);
      const dec = Math.exp(-t * 5.2);
      const env = atk * dec * amp;
      // Supersaw-ish pair
      const w1 = Math.sin(2 * Math.PI * freq * t) * 0.6;
      const w2 = (2 * ((freq * 1.004 * t) % 1) - 1) * 0.25;
      const w3 = Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
      const s = (w1 + w2 + w3) * env;
      L[startSample + i] += s * (1 - pan * 0.4);
      R[startSample + i] += s * (1 + pan * 0.4);
    }
  };

  const addBass = (startSample: number, freq: number, durSec: number, amp: number) => {
    const len = Math.floor(durSec * sampleRate);
    for (let i = 0; i < len && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 6.5) * amp;
      const s = (Math.sin(2 * Math.PI * freq * t) * 0.75 + Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.4) * env;
      L[startSample + i] += s;
      R[startSample + i] += s;
    }
  };

  const melodyPattern =
    variant === 'sparkle'
      ? [0, 2, 4, 5, 4, 2, 3, 5, 7, 5, 4, 2, 3, 4, 2, 0]
      : [0, 0, 3, 4, 5, 4, 3, 2, 4, 5, 7, 5, 6, 4, 3, 1];

  const offsetSamples = Math.floor(0.5 * sampleRate);

  for (let step = 0; step < totalSixteenths; step++) {
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const samplePos = offsetSamples + Math.floor(step * stepSec * sampleRate);
    const bassFreq = bassProgression[bar % bassProgression.length] * 0.5;

    // 4-on-the-floor kick
    if (inBar % 4 === 0) {
      addKick(samplePos, 0.45);
    }
    // Snare on 2 and 4
    if (inBar === 4 || inBar === 12) {
      addSnare(samplePos, 0.28);
    }
    // Syncopated snare fill at end of 4-bar phrase
    if (bar % 4 === 3 && (inBar === 14 || inBar === 15)) {
      addSnare(samplePos, 0.22);
    }
    // Hi-hats on offbeats
    if (inBar % 2 === 1) {
      addHat(samplePos, 0.1);
    }

    // Driving octave bass on 8th notes
    if (inBar % 2 === 0) {
      const bf = inBar % 4 === 2 ? bassFreq * 2 : bassFreq;
      addBass(samplePos, bf, stepSec * 1.8, 0.28);
    }

    // Melody
    const shouldPlayLead =
      variant === 'sparkle'
        ? inBar % 2 === 0 || (bar % 2 === 1 && inBar === 11)
        : inBar % 2 === 0 || inBar === 7 || inBar === 15;

    if (shouldPlayLead) {
      const noteIdx = melodyPattern[(step + bar * 3) % melodyPattern.length];
      const freq = scale[noteIdx % scale.length] * (bar >= 8 ? 1 : 1);
      const dur = inBar % 4 === 0 && bar % 2 === 0 ? stepSec * 3.2 : stepSec * 1.8;
      const pan = ((step % 4) - 1.5) * 0.35;
      addLead(samplePos, freq, dur, 0.2, pan);
    }
  }

  // Soft limiter
  for (let i = 0; i < totalSamples; i++) {
    L[i] = Math.tanh(L[i]);
    R[i] = Math.tanh(R[i]);
  }

  return buffer;
}

export interface BuiltinDemoResult {
  song: SongItem;
  buffer: AudioBuffer;
}

export function createBuiltinDemos(ctx: AudioContext): BuiltinDemoResult[] {
  const configs: Array<{
    id: string;
    title: string;
    artist: string;
    bpm: number;
    bars: number;
    variant: 'sparkle' | 'cyber';
    c1: string;
    c2: string;
  }> = [
    {
      id: 'demo_sparkle',
      title: 'SEKAI: First Sparkle (Demo)',
      artist: 'Custom Stage Synth',
      bpm: 136,
      bars: 16,
      variant: 'sparkle',
      c1: '#0ea5e9',
      c2: '#ec4899',
    },
    {
      id: 'demo_cyber',
      title: 'Neon Cyber Step (Demo)',
      artist: 'Virtual Pulse Lab',
      bpm: 152,
      bars: 18,
      variant: 'cyber',
      c1: '#6366f1',
      c2: '#14b8a6',
    },
  ];

  return configs.map((cfg) => {
    const buffer = synthesizeDemoBuffer(ctx, cfg.bpm, cfg.bars, cfg.variant);
    const analysis = analyzeAudioBuffer(buffer);
    const charts = generateAllDifficulties(analysis, cfg.bpm, 500);
    const song: SongItem = {
      id: cfg.id,
      title: cfg.title,
      artist: cfg.artist,
      bpm: cfg.bpm,
      offsetMs: 500,
      durationSec: buffer.duration,
      coverDataUrl: createProceduralCover(cfg.title, cfg.c1, cfg.c2),
      isBuiltin: true,
      builtinId: cfg.id,
      analyzerVersion: 4,
      charts,
      highScores: {},
      createdAt: 1700000007000,
    };
    return { song, buffer };
  });
}
