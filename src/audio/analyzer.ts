import {
  Chart,
  ChartNote,
  DIFFICULTY_META,
  Difficulty,
  FlickDirection,
  SlideNote,
  SlidePoint,
  beatToTimeSec,
  uid,
} from '../types/game';
import { doesSpanOverlapSlide, sanitizeChartNotes } from '../utils/chartSanitizer';

export interface AudioAnalysisResult {
  bpm: number;
  offsetMs: number;
  durationSec: number;
  frameRate: number; // 100 Hz (10ms per frame)
  onsetLow: Float32Array;
  onsetMid: Float32Array;
  onsetHigh: Float32Array;
  energyTotal: Float32Array;
}

export interface AutoChartOptions {
  bpm?: number;
  offsetMs?: number;
  densityMultiplier?: number; // 0.6..1.5 (default 1.0)
  flickRatio?: number; // 0..1 (default auto by difficulty)
  slideRatio?: number; // 0..1 (default auto by difficulty)
}

export function analyzeAudioBuffer(buffer: AudioBuffer): AudioAnalysisResult {
  const srcRate = buffer.sampleRate;
  const durationSec = buffer.duration;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

  // Downsample to ~11025 Hz for very fast DSP
  const targetRate = 11025;
  const stride = Math.max(1, Math.round(srcRate / targetRate));
  const effRate = srcRate / stride;
  const nSamples = Math.floor(ch0.length / stride);
  const mono = new Float32Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    const idx = i * stride;
    mono[i] = (ch0[idx] + ch1[idx]) * 0.5;
  }

  // 1-pole low-pass and band-split filters
  const dt = 1 / effRate;
  const rcLow = 1 / (2 * Math.PI * 200);
  const alphaLow = dt / (rcLow + dt);
  const rcMid = 1 / (2 * Math.PI * 2400);
  const alphaMid = dt / (rcMid + dt);

  const targetFrameRate = 100;
  const hop = Math.max(1, Math.round(effRate / targetFrameRate));
  const frameRate = effRate / hop; // exact frames/sec (e.g. ~100.227 Hz at 44100/110)
  const numFrames = Math.max(1, Math.floor(nSamples / hop));

  const eLow = new Float32Array(numFrames);
  const eMid = new Float32Array(numFrames);
  const eHigh = new Float32Array(numFrames);
  const energyTotal = new Float32Array(numFrames);

  let lpLow = 0;
  let lpMid = 0;

  for (let f = 0; f < numFrames; f++) {
    const start = f * hop;
    const end = Math.min(nSamples, start + hop);
    let sLow = 0;
    let sMid = 0;
    let sHigh = 0;
    let sTot = 0;
    const count = end - start;
    for (let i = start; i < end; i++) {
      const x = mono[i];
      lpLow += alphaLow * (x - lpLow);
      lpMid += alphaMid * (x - lpMid);
      const low = lpLow;
      const mid = lpMid - lpLow;
      const high = x - lpMid;
      sLow += low * low;
      sMid += mid * mid;
      sHigh += high * high;
      sTot += x * x;
    }
    eLow[f] = Math.sqrt(sLow / count);
    eMid[f] = Math.sqrt(sMid / count);
    eHigh[f] = Math.sqrt(sHigh / count);
    energyTotal[f] = Math.sqrt(sTot / count);
  }

  const computeOnset = (arr: Float32Array): Float32Array => {
    const out = new Float32Array(arr.length);
    for (let i = 1; i < arr.length; i++) {
      const diff = Math.log1p(arr[i] * 40) - Math.log1p(arr[i - 1] * 40);
      out[i] = diff > 0 ? diff : 0;
    }
    // Local adaptive threshold (subtract local mean over ±14 frames)
    const win = 14;
    const norm = new Float32Array(arr.length);
    let maxV = 1e-6;
    const nonZero: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      let sum = 0;
      let cnt = 0;
      const a = Math.max(0, i - win);
      const b = Math.min(arr.length - 1, i + win);
      for (let j = a; j <= b; j++) {
        sum += out[j];
        cnt++;
      }
      const v = Math.max(0, out[i] - (sum / cnt) * 1.15);
      norm[i] = v;
      if (v > 0) nonZero.push(v);
      if (v > maxV) maxV = v;
    }
    let scaleRef = maxV;
    if (nonZero.length > 20) {
      nonZero.sort((a, b) => a - b);
      scaleRef = Math.max(1e-6, nonZero[Math.floor(nonZero.length * 0.96)]);
    }
    for (let i = 0; i < arr.length; i++) {
      norm[i] = Math.min(1, norm[i] / scaleRef);
    }
    return norm;
  };

  const onsetLow = computeOnset(eLow);
  const onsetMid = computeOnset(eMid);
  const onsetHigh = computeOnset(eHigh);

  // Normalize total energy
  let maxE = 1e-6;
  for (let i = 0; i < energyTotal.length; i++) {
    if (energyTotal[i] > maxE) maxE = energyTotal[i];
  }
  for (let i = 0; i < energyTotal.length; i++) {
    energyTotal[i] /= maxE;
  }

  // Combined onset curve for tempo estimation (kick + snare/vocal punch)
  const onsetComb = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    onsetComb[i] = onsetLow[i] * 0.52 + onsetMid[i] * 0.34 + onsetHigh[i] * 0.14;
  }

  // Lightly smoothed onset envelope for autocorrelation (eliminates integer-frame bias)
  const onsetSmooth = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const prev = i > 0 ? onsetComb[i - 1] : 0;
    const next = i + 1 < numFrames ? onsetComb[i + 1] : 0;
    onsetSmooth[i] = prev * 0.25 + onsetComb[i] * 0.5 + next * 0.25;
  }

  const sampleLinear = (arr: Float32Array, idx: number): number => {
    if (idx < 0 || idx >= arr.length - 1) {
      const ci = Math.round(idx);
      return ci >= 0 && ci < arr.length ? arr[ci] : 0;
    }
    const i0 = Math.floor(idx);
    const frac = idx - i0;
    return arr[i0] * (1 - frac) + arr[i0 + 1] * frac;
  };

  // Sample peak onset within tight ±10ms Gaussian-weighted neighborhood (immune to integer frame bias)
  const sampleBeatPeak = (arr: Float32Array, fIdx: number): number => {
    const i0 = Math.floor(fIdx);
    let best = 0;
    for (let k = -1; k <= 2; k++) {
      const idx = i0 + k;
      if (idx < 0 || idx >= arr.length) continue;
      const dist = idx - fIdx;
      const w = Math.exp(-0.5 * (dist / 0.85) * (dist / 0.85));
      const v = arr[idx] * w;
      if (v > best) best = v;
    }
    return best;
  };

  // Find first audible moment so phase & offset lock onto actual music start
  let firstAudioSec = 0;
  for (let i = 0; i < numFrames; i++) {
    if (energyTotal[i] > 0.08 || onsetComb[i] > 0.15) {
      firstAudioSec = i / frameRate;
      break;
    }
  }

  const maxAnalysisFrames = Math.min(numFrames, Math.round(frameRate * 120));
  const analysisDuration = Math.min(durationSec - 0.1, 150);

  // Interpolated smoothed autocorrelation score (1x, 2x, 4x)
  const scoreBpmAutocorr = (bpm: number): number => {
    const periodFrames = (60 / bpm) * frameRate;
    const mults = [1, 2, 4];
    const weights = [1.0, 0.7, 0.45];
    let score = 0;
    for (let m = 0; m < mults.length; m++) {
      const lag = periodFrames * mults[m];
      if (lag <= 1 || lag >= maxAnalysisFrames - 2) continue;
      let corr = 0;
      const limit = Math.floor(maxAnalysisFrames - lag - 1);
      for (let i = 0; i < limit; i += 2) {
        corr += onsetSmooth[i] * sampleLinear(onsetSmooth, i + lag);
      }
      score += (corr / Math.max(1, limit / 2)) * weights[m];
    }
    return score;
  };

  // Find best phase (0..beatSec) and beat-vs-offbeat + duple-vs-triple contrast
  const evalBeatGridPhase = (bpm: number, phaseStep = 0.003) => {
    const beatSec = 60 / bpm;
    let bestPhase = 0;
    let bestScore = -Infinity;
    let bestOnBeatAvg = 0;
    let bestHitRate = 0;

    for (let phase = 0; phase < beatSec; phase += phaseStep) {
      let onSum = 0;
      let offSum = 0;
      let thirdSum = 0;
      let hits = 0;
      let count = 0;
      for (let t = phase; t < analysisDuration; t += beatSec) {
        if (t < firstAudioSec - 0.05) continue;
        const fOn = t * frameRate;
        const localE = sampleLinear(energyTotal, fOn);
        const localOn =
          sampleBeatPeak(onsetLow, fOn) +
          sampleBeatPeak(onsetMid, fOn) +
          sampleBeatPeak(onsetHigh, fOn);
        if (localE < 0.12 && localOn < 0.12) continue;

        const fOff = (t + beatSec * 0.5) * frameRate;
        const fT1 = (t + beatSec / 3) * frameRate;
        const fT2 = (t + (beatSec * 2) / 3) * frameRate;

        const onVal =
          sampleBeatPeak(onsetLow, fOn) * 0.62 + sampleBeatPeak(onsetMid, fOn) * 0.38;
        const offVal =
          sampleBeatPeak(onsetLow, fOff) * 0.52 + sampleBeatPeak(onsetMid, fOff) * 0.48;
        const t1Val =
          sampleBeatPeak(onsetLow, fT1) * 0.6 + sampleBeatPeak(onsetMid, fT1) * 0.4;
        const t2Val =
          sampleBeatPeak(onsetLow, fT2) * 0.6 + sampleBeatPeak(onsetMid, fT2) * 0.4;

        onSum += onVal;
        offSum += offVal;
        thirdSum += (t1Val + t2Val) * 0.5;
        if (onVal > 0.14) hits++;
        count++;
      }
      if (count === 0) continue;
      const onAvg = onSum / count;
      const offAvg = offSum / count;
      const thirdAvg = thirdSum / count;
      const net = onAvg - offAvg * 0.32 - thirdAvg * 0.68;
      if (net > bestScore) {
        bestScore = net;
        bestPhase = phase;
        bestOnBeatAvg = onAvg;
        bestHitRate = hits / count;
      }
    }
    return { bestPhase, bestScore, bestOnBeatAvg, bestHitRate };
  };

  // Step 1: Coarse scan 65..205 BPM (0.5 BPM step) & keep top local peaks
  const coarseGrid: Array<{ bpm: number; score: number }> = [];
  for (let bpm = 65; bpm <= 205; bpm += 0.5) {
    coarseGrid.push({ bpm, score: scoreBpmAutocorr(bpm) });
  }
  const peaks: Array<{ bpm: number; score: number }> = [];
  for (let i = 1; i < coarseGrid.length - 1; i++) {
    if (
      coarseGrid[i].score >= coarseGrid[i - 1].score &&
      coarseGrid[i].score >= coarseGrid[i + 1].score
    ) {
      peaks.push(coarseGrid[i]);
    }
  }
  peaks.sort((a, b) => b.score - a.score);

  // Expand top 3 peaks across harmonic multipliers (1x, 2x, 0.5x, 1.5x, 2/3x)
  const rawSeeds: number[] = [];
  for (const pk of peaks.slice(0, 3)) {
    for (const mult of [1, 2, 0.5, 1.5, 2 / 3]) {
      const b = pk.bpm * mult;
      if (b >= 65 && b <= 205) rawSeeds.push(b);
    }
  }
  if (rawSeeds.length === 0) rawSeeds.push(128);

  const octaveSeeds: number[] = [];
  for (const s of rawSeeds) {
    if (!octaveSeeds.some((x) => Math.abs(x - s) < 2.2)) {
      octaveSeeds.push(s);
    }
  }

  interface CandidateEval {
    bpm: number;
    phase: number;
    score: number;
    onAvg: number;
    hitRate: number;
    auto: number;
  }
  const evals: CandidateEval[] = [];

  for (const seed of octaveSeeds) {
    // Refine BPM around seed using BOTH autocorrelation and full-song beat-grid alignment
    let localBpm = seed;
    let localAuto = -1;
    for (let b = Math.max(65, seed - 1.5); b <= Math.min(205, seed + 1.5); b += 0.05) {
      const s = scoreBpmAutocorr(b);
      if (s > localAuto) {
        localAuto = s;
        localBpm = b;
      }
    }

    // Fine beat-grid polish (±0.4 BPM around localBpm at 0.04 step) so exact fractional BPM locks
    let bestGrid = evalBeatGridPhase(localBpm, 0.004);
    let bestGridBpm = localBpm;
    for (let b = Math.max(65, localBpm - 0.4); b <= Math.min(205, localBpm + 0.4); b += 0.04) {
      const g = evalBeatGridPhase(b, 0.004);
      if (g.bestOnBeatAvg > bestGrid.bestOnBeatAvg) {
        bestGrid = g;
        bestGridBpm = b;
      }
    }

    const snappedHalf = Math.round(bestGridBpm * 2) / 2;
    const gridSnap =
      Math.abs(snappedHalf - bestGridBpm) <= 0.06 ? evalBeatGridPhase(snappedHalf, 0.003) : null;

    const chosenBpm =
      gridSnap && gridSnap.bestOnBeatAvg >= bestGrid.bestOnBeatAvg * 0.992
        ? snappedHalf
        : bestGridBpm;
    const grid = chosenBpm === snappedHalf && gridSnap ? gridSnap : bestGrid;

    evals.push({
      bpm: chosenBpm,
      phase: grid.bestPhase,
      score: grid.bestScore,
      onAvg: grid.bestOnBeatAvg,
      hitRate: grid.bestHitRate,
      auto: scoreBpmAutocorr(chosenBpm),
    });
  }

  const maxAuto = Math.max(1e-6, ...evals.map((e) => e.auto));
  let bestBpm = evals[0]?.bpm ?? 128;
  let bestCombinedRank = -Infinity;
  let bestPhaseSec = evals[0]?.phase ?? 0;

  for (const ev of evals) {
    const autoNorm = ev.auto / maxAuto;
    const doubleEv = evals.find((o) => Math.abs(o.bpm - ev.bpm * 2) < 1.5);

    // Autocorrelation + beat-grid contrast + beat coverage
    let effScore =
      autoNorm * 0.48 +
      ev.score * 0.25 +
      ev.onAvg * 0.14 +
      ev.hitRate * 0.13;

    // Prefer natural rhythm-game tempo (110..195 BPM) over half-time (65..105 BPM)
    // ONLY when the 2x tempo actually has strong periodicity and consistent beats
    if (
      ev.bpm < 105 &&
      doubleEv &&
      doubleEv.bpm <= 195 &&
      doubleEv.hitRate >= 0.68 &&
      doubleEv.onAvg >= ev.onAvg * 0.62 &&
      doubleEv.auto >= ev.auto * 0.72
    ) {
      effScore *= 0.7;
    }

    const prior = 1 + 0.06 * Math.exp(-Math.pow((ev.bpm - 138) / 55, 2));
    const rank = effScore * prior;
    if (rank > bestCombinedRank) {
      bestCombinedRank = rank;
      bestBpm = ev.bpm;
      bestPhaseSec = ev.phase;
    }
  }

  // Final micro-polish (±0.12 BPM in 0.02 steps) using beat-grid alignment at 2ms phase resolution
  let polishedBpm = bestBpm;
  let polishedGrid = evalBeatGridPhase(bestBpm, 0.002);
  for (let b = bestBpm - 0.12; b <= bestBpm + 0.12; b += 0.02) {
    const g = evalBeatGridPhase(b, 0.002);
    if (g.bestOnBeatAvg > polishedGrid.bestOnBeatAvg * 1.005) {
      polishedGrid = g;
      polishedBpm = b;
    }
  }
  const snappedInt = Math.round(polishedBpm * 2) / 2;
  if (Math.abs(snappedInt - polishedBpm) <= 0.04) {
    const sg = evalBeatGridPhase(snappedInt, 0.002);
    if (sg.bestOnBeatAvg >= polishedGrid.bestOnBeatAvg * 0.994) {
      polishedBpm = snappedInt;
      polishedGrid = sg;
    }
  }

  bestBpm = Math.round(polishedBpm * 50) / 50;
  bestPhaseSec = polishedGrid.bestPhase;

  const beatSec = 60 / bestBpm;
  // +5ms compensates for frame-center sampling bias
  let bestOffsetMs = Math.round(bestPhaseSec * 1000) + 5;
  // Align beat 0 right onto the first audible beat (within 40ms before firstAudioSec)
  while (bestOffsetMs / 1000 < firstAudioSec - 0.04) {
    bestOffsetMs += Math.round(beatSec * 1000);
  }

  return {
    bpm: Math.round(bestBpm * 100) / 100,
    offsetMs: bestOffsetMs,
    durationSec,
    frameRate,
    onsetLow,
    onsetMid,
    onsetHigh,
    energyTotal,
  };
}

// Deterministic pseudo-random generator for consistent hand patterns
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateChartFromAnalysis(
  analysis: AudioAnalysisResult,
  difficulty: Difficulty,
  options: AutoChartOptions = {}
): Chart {
  const bpm = options.bpm ?? analysis.bpm;
  const offsetMs = options.offsetMs ?? analysis.offsetMs;
  const densityMult = options.densityMultiplier ?? 1.0;

  const presets: Record<
    Difficulty,
    {
      subdiv: number; // steps per beat (1 = quarter, 2 = 8th, 4 = 16th)
      quarterKeep: number; // fraction of active quarter beats kept (0..1)
      eighthKeep: number; // fraction of active 8th offbeats kept (0..1)
      sixteenthKeep: number; // fraction of active 16th steps kept (0..1)
      minGapBeats: number;
      allowOverlapWhileSlide: boolean;
      chordChance: number;
      chordOnEighth: boolean;
      chordOnSixteenth: number;
      tripleChordChance: number;
      flickChance: number;
      slideChance: number;
      critChance: number;
      defaultWidth: number;
      maxJumpLanes: number;
      level: number;
    }
  > = {
    easy: {
      subdiv: 2,
      quarterKeep: 0.78,
      eighthKeep: 0.14,
      sixteenthKeep: 0.0,
      minGapBeats: 0.5,
      allowOverlapWhileSlide: false,
      chordChance: 0.0,
      chordOnEighth: false,
      chordOnSixteenth: 0.0,
      tripleChordChance: 0.0,
      flickChance: 0.04,
      slideChance: 0.1,
      critChance: 0.08,
      defaultWidth: 4,
      maxJumpLanes: 4,
      level: 7,
    },
    normal: {
      subdiv: 2,
      quarterKeep: 0.98,
      eighthKeep: 0.68,
      sixteenthKeep: 0.0,
      minGapBeats: 0.5,
      allowOverlapWhileSlide: false,
      chordChance: 0.12,
      chordOnEighth: false,
      chordOnSixteenth: 0.0,
      tripleChordChance: 0.0,
      flickChance: 0.1,
      slideChance: 0.12,
      critChance: 0.1,
      defaultWidth: 3,
      maxJumpLanes: 5,
      level: 13,
    },
    hard: {
      subdiv: 4,
      quarterKeep: 1.0,
      eighthKeep: 0.92,
      sixteenthKeep: 0.34,
      minGapBeats: 0.25,
      allowOverlapWhileSlide: true,
      chordChance: 0.22,
      chordOnEighth: false,
      chordOnSixteenth: 0.0,
      tripleChordChance: 0.0,
      flickChance: 0.16,
      slideChance: 0.12,
      critChance: 0.12,
      defaultWidth: 3,
      maxJumpLanes: 7,
      level: 19,
    },
    expert: {
      subdiv: 4,
      quarterKeep: 1.0,
      eighthKeep: 0.98,
      sixteenthKeep: 0.66,
      minGapBeats: 0.25,
      allowOverlapWhileSlide: true,
      chordChance: 0.32,
      chordOnEighth: true,
      chordOnSixteenth: 0.0,
      tripleChordChance: 0.0,
      flickChance: 0.22,
      slideChance: 0.12,
      critChance: 0.14,
      defaultWidth: 3,
      maxJumpLanes: 9,
      level: 26,
    },
    master: {
      subdiv: 4,
      quarterKeep: 1.0,
      eighthKeep: 1.0,
      sixteenthKeep: 0.92,
      minGapBeats: 0.25,
      allowOverlapWhileSlide: true,
      chordChance: 0.5,
      chordOnEighth: true,
      chordOnSixteenth: 0.12,
      tripleChordChance: 0.0,
      flickChance: 0.26,
      slideChance: 0.11,
      critChance: 0.15,
      defaultWidth: 3,
      maxJumpLanes: 10,
      level: 31,
    },
    append: {
      subdiv: 4,
      quarterKeep: 1.0,
      eighthKeep: 1.0,
      sixteenthKeep: 0.99,
      minGapBeats: 0.25,
      allowOverlapWhileSlide: true,
      chordChance: 0.68,
      chordOnEighth: true,
      chordOnSixteenth: 0.24,
      tripleChordChance: 0.24,
      flickChance: 0.28,
      slideChance: 0.1,
      critChance: 0.17,
      defaultWidth: 3,
      maxJumpLanes: 11,
      level: 34,
    },
  };

  const cfg = presets[difficulty];
  const flickChance = options.flickRatio ?? cfg.flickChance;
  const slideChance = options.slideRatio ?? cfg.slideChance;

  const rand = mulberry32(Math.round(bpm * 100) + difficulty.length * 997);
  const notes: ChartNote[] = [];

  const totalBeats = Math.floor(((analysis.durationSec - offsetMs / 1000) * bpm) / 60);
  const stepBeat = 1 / cfg.subdiv;
  const totalSteps = Math.max(0, Math.floor(totalBeats * cfg.subdiv));

  const getFrameAtBeat = (beat: number): number => {
    const t = beatToTimeSec(beat, bpm, offsetMs);
    return Math.round(t * analysis.frameRate);
  };

  const sampleWindow = (arr: Float32Array, f: number, radius = 2): number => {
    let m = 0;
    for (let i = f - radius; i <= f + radius; i++) {
      if (i >= 0 && i < arr.length && arr[i] > m) m = arr[i];
    }
    return m;
  };

  // Pass 1: Score every grid step in non-silent sections so thresholds adapt to any song's dynamics
  interface CandidateStep {
    beat: number;
    frame: number;
    eTot: number;
    oLow: number;
    oMid: number;
    oHigh: number;
    score: number;
    kind: 'quarter' | 'eighth' | 'sixteenth';
  }
  const candidates: CandidateStep[] = [];
  const quarterScores: number[] = [];
  const eighthScores: number[] = [];
  const sixteenthScores: number[] = [];

  for (let s = 0; s < totalSteps - cfg.subdiv; s++) {
    const beat = Math.round(s * stepBeat * 1000) / 1000;
    const tSec = beatToTimeSec(beat, bpm, offsetMs);
    if (tSec < 0.35 || tSec > analysis.durationSec - 0.65) continue;

    const frame = getFrameAtBeat(beat);
    if (frame < 0 || frame >= analysis.energyTotal.length) continue;

    const eTot = sampleWindow(analysis.energyTotal, frame, 2);
    if (eTot < 0.06) continue; // skip silent intros/outros

    const isDownbeat = Math.abs(beat - Math.round(beat)) < 0.01;
    const isEighth = Math.abs(beat * 2 - Math.round(beat * 2)) < 0.01;
    const kind: CandidateStep['kind'] = isDownbeat ? 'quarter' : isEighth ? 'eighth' : 'sixteenth';

    // Tighter ±10ms onset window on subdivisions so 16ths don't steal downbeat transients
    const r = kind === 'quarter' ? 2 : 1;
    const oLow = sampleWindow(analysis.onsetLow, frame, r);
    const oMid = sampleWindow(analysis.onsetMid, frame, r);
    const oHigh = sampleWindow(analysis.onsetHigh, frame, r);
    const rawOnset = oLow * 0.52 + oMid * 0.34 + oHigh * 0.14;

    // Gate silent/quiet sections while allowing rich 8th & 16th melodies in active chorus/verse sections
    if (kind === 'quarter' && rawOnset < 0.02 && eTot < 0.16) continue;
    if (kind === 'eighth' && rawOnset < 0.016 && eTot < 0.17) continue;
    if (kind === 'sixteenth' && rawOnset < 0.014 && eTot < 0.24) continue;

    // Prioritize real drum/melody onsets over sustained loudness
    const beatNum = Math.round(beat);
    const measureAccent = isDownbeat && beatNum % 4 === 0 ? 0.07 : isDownbeat && beatNum % 2 === 0 ? 0.035 : 0;
    const score = oLow * 0.44 + oMid * 0.32 + oHigh * 0.16 + eTot * 0.08 + measureAccent;

    candidates.push({ beat, frame, eTot, oLow, oMid, oHigh, score, kind });
    if (kind === 'quarter') quarterScores.push(score);
    else if (kind === 'eighth') eighthScores.push(score);
    else sixteenthScores.push(score);
  }

  const quantileCutoff = (scores: number[], keepRatio: number): number => {
    const effKeep = Math.max(0, Math.min(1, keepRatio * densityMult));
    if (effKeep <= 0 || scores.length === 0) return Infinity;
    if (effKeep >= 1) return -1;
    const sorted = [...scores].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * (1 - effKeep));
    return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
  };

  // Gently normalize 16th density across slow (110 BPM) and very fast (190 BPM) tempos
  const tempoScale =
    difficulty === 'master' || difficulty === 'append'
      ? Math.min(1.06, Math.max(0.84, 158 / Math.max(85, bpm)))
      : Math.min(1.12, Math.max(0.78, 150 / Math.max(85, bpm)));

  const qCut = quantileCutoff(quarterScores, cfg.quarterKeep);
  const eCut = quantileCutoff(eighthScores, cfg.eighthKeep);
  const sCut = quantileCutoff(sixteenthScores, Math.min(1, cfg.sixteenthKeep * tempoScale));

  let lastNoteBeat = -10;
  let slideBusyUntilBeat = -10;
  let slideHoldHand: 'left' | 'right' = 'left';
  let lastLeftLane = 0;
  let lastRightLane = 6;
  let nextHand: 'left' | 'right' = 'left';
  const placedSlides: SlidePoint[][] = [];

  const isLaneClearOfSlides = (beat: number, lane: number, width: number): boolean =>
    !placedSlides.some((pts) => doesSpanOverlapSlide(beat, lane, width, pts, 0.16));

  // Snap notes cleanly onto the 4 lanes (0, 3, 6, 9) with width 3
  const pickLaneForHand = (hand: 'left' | 'right', _width: number): number => {
    if (hand === 'left') {
      const target = rand() < 0.55 ? (lastLeftLane === 0 ? 3 : 0) : lastLeftLane;
      lastLeftLane = target;
      return target;
    } else {
      const target = rand() < 0.55 ? (lastRightLane === 6 ? 9 : 6) : lastRightLane;
      lastRightLane = target;
      return target;
    }
  };

  const pickSafeLane = (beat: number, hand: 'left' | 'right', width: number): number | null => {
    const primary = pickLaneForHand(hand, width);
    if (isLaneClearOfSlides(beat, primary, width)) return primary;
    const altSameHand = hand === 'left' ? (primary === 0 ? 3 : 0) : primary === 6 ? 9 : 6;
    if (isLaneClearOfSlides(beat, altSameHand, width)) return altSameHand;
    return null;
  };

  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    const { beat, frame, eTot, oHigh, score, kind } = cand;
    const cut = kind === 'quarter' ? qCut : kind === 'eighth' ? eCut : sCut;
    if (score < cut) continue;

    // On Hard, keep 8th spacing smooth outside of intentional 16th bursts on strong beats
    if (difficulty === 'hard' && kind === 'sixteenth' && ci + 1 < candidates.length) {
      const nextCand = candidates[ci + 1];
      if (nextCand.kind === 'quarter' && nextCand.score >= qCut && nextCand.beat - beat <= 0.28 && rand() < 0.45) {
        continue;
      }
    }

    if (beat - lastNoteBeat < cfg.minGapBeats - 0.001) continue;

    const insideSlide = beat < slideBusyUntilBeat - 0.05;
    if (insideSlide && !cfg.allowOverlapWhileSlide) continue;

    const isDownbeat = kind === 'quarter';
    const isEighth = kind === 'quarter' || kind === 'eighth';
    const beatNum = Math.round(beat);

    const width = 3;

    const isCritical = isDownbeat && eTot > 0.38 && rand() < cfg.critChance;
    const hand: 'left' | 'right' = insideSlide
      ? slideHoldHand === 'left'
        ? 'right'
        : 'left'
      : nextHand;
    if (!insideSlide) {
      nextHand = nextHand === 'left' ? 'right' : 'left';
    }

    // Check if we can place a sustained Slide note (only when both hands are free)
    let canSlide = false;
    let slideBeats = 2;
    if (!insideSlide && beat >= slideBusyUntilBeat && rand() < slideChance && isEighth) {
      const f1 = getFrameAtBeat(beat + 1);
      const f2 = getFrameAtBeat(beat + 2);
      if (f2 < analysis.energyTotal.length) {
        const avgSustained =
          (analysis.energyTotal[frame] + analysis.energyTotal[f1] + analysis.energyTotal[f2]) / 3;
        if (avgSustained > 0.18) {
          canSlide = true;
          slideBeats = difficulty === 'easy' || difficulty === 'normal' ? 2 : rand() < 0.35 ? 3 : 2;
          if (beatToTimeSec(beat + slideBeats, bpm, offsetMs) > analysis.durationSec - 0.9) {
            canSlide = false;
          }
        }
      }
    }

    if (canSlide) {
      const startLane = pickSafeLane(beat, hand, width);
      if (startLane !== null) {
        const minHandLane = cfg.allowOverlapWhileSlide ? (hand === 'left' ? 0 : 6) : 0;
        const maxHandLane = cfg.allowOverlapWhileSlide ? (hand === 'left' ? 3 : 9) : 9;
        const clampHandLane = (l: number) => Math.max(minHandLane, Math.min(maxHandLane, l));

        const slideEase: SlidePoint['ease'] =
          difficulty === 'easy'
            ? 'linear'
            : rand() < 0.65
            ? 'sine'
            : rand() < 0.5
            ? 'in'
            : 'out';
        const points: SlidePoint[] = [
          {
            id: uid('sp'),
            beat,
            lane: startLane,
            width,
            ease: slideEase,
            kind: 'start',
          },
        ];

        if (slideBeats >= 2 && difficulty !== 'easy') {
          const midBeat = beat + slideBeats * 0.5;
          const shift = rand() < 0.78 ? (startLane === minHandLane ? 3 : -3) : 0;
          const midLane = clampHandLane(startLane + shift);
          points.push({
            id: uid('sp'),
            beat: midBeat,
            lane: midLane,
            width,
            ease: rand() < 0.7 ? 'sine' : 'out',
            kind: 'tick',
          });
        }

        const prevLane = points[points.length - 1].lane;
        const endShift =
          difficulty === 'easy'
            ? 0
            : rand() < 0.65
            ? prevLane === minHandLane
              ? 3
              : prevLane === maxHandLane
              ? -3
              : rand() < 0.5
              ? 3
              : -3
            : 0;
        const endLane = clampHandLane(prevLane + endShift);
        points.push({
          id: uid('sp'),
          beat: beat + slideBeats,
          lane: endLane,
          width,
          ease: 'sine',
          kind: 'end',
        });

        const endFlick: FlickDirection | null =
          difficulty !== 'easy' && rand() < flickChance * 1.1
            ? (difficulty === 'master' || difficulty === 'append') && rand() < 0.35
              ? rand() < 0.5
                ? 'left'
                : 'right'
              : 'up'
            : null;

        const slideNote: SlideNote = {
          id: uid('sl'),
          type: 'slide',
          critical: isCritical,
          points,
          endFlick,
        };
        notes.push(slideNote);
        placedSlides.push(points);
        slideHoldHand = hand;
        slideBusyUntilBeat = beat + slideBeats + (cfg.allowOverlapWhileSlide ? 0.35 : 0.55);
        lastNoteBeat = cfg.allowOverlapWhileSlide ? beat + 0.35 : beat + slideBeats;
        continue;
      }
    }

    const lane = pickSafeLane(beat, hand, width);
    if (lane === null) continue;

    // Decide Flick vs Trace vs Tap — align Flicks to snare backbeats (2 & 4) or sharp high transients
    const isBackbeat = isDownbeat && (beatNum % 4 === 1 || beatNum % 4 === 3);
    const isFlick =
      (isBackbeat && oHigh > 0.14 && rand() < flickChance * 1.7) ||
      (oHigh > 0.32 && rand() < flickChance * 1.35);
    const isTrace =
      !isFlick &&
      (difficulty === 'append' || difficulty === 'master') &&
      !isDownbeat &&
      rand() < (difficulty === 'append' ? 0.22 : 0.12);

    if (isFlick) {
      const dirs: FlickDirection[] =
        difficulty === 'append' || difficulty === 'master' || difficulty === 'expert'
          ? ['up', 'up', 'left', 'right']
          : ['up'];
      const dir = dirs[Math.floor(rand() * dirs.length)];
      notes.push({
        id: uid('fl'),
        type: 'flick',
        beat,
        lane,
        width,
        critical: isCritical,
        direction: dir,
      });
    } else if (isTrace) {
      notes.push({
        id: uid('tr'),
        type: 'trace',
        beat,
        lane,
        width: Math.max(2, width),
        critical: isCritical,
      });
    } else {
      notes.push({
        id: uid('tp'),
        type: 'tap',
        beat,
        lane,
        width,
        critical: isCritical,
      });
    }

    // Simultaneous 2-hand chords (downbeats, 8ths on Expert+, strong 16ths on Master/Append)
    const chordProb = isDownbeat
      ? cfg.chordChance
      : kind === 'eighth'
      ? cfg.chordOnEighth
        ? cfg.chordChance * 0.65
        : 0
      : cfg.chordOnSixteenth;

    if (
      !insideSlide &&
      beat >= slideBusyUntilBeat &&
      chordProb > 0 &&
      eTot > 0.18 &&
      rand() < chordProb
    ) {
      const otherHand = hand === 'left' ? 'right' : 'left';
      const otherLane = pickSafeLane(beat, otherHand, width);
      if (otherLane !== null) {
        const otherFlick = (difficulty === 'master' || difficulty === 'append') && rand() < 0.28;
        if (otherFlick) {
          notes.push({
            id: uid('fl'),
            type: 'flick',
            beat,
            lane: otherLane,
            width,
            critical: isCritical,
            direction: 'up',
          });
        } else {
          notes.push({
            id: uid('tp'),
            type: 'tap',
            beat,
            lane: otherLane,
            width,
            critical: isCritical,
          });
        }

        // Authentic Project SEKAI APPEND 3-finger chords on accented beats across 4 lanes
        if (
          cfg.tripleChordChance > 0 &&
          isDownbeat &&
          eTot > 0.32 &&
          rand() < cfg.tripleChordChance
        ) {
          const fourLanes = [0, 3, 6, 9];
          const freeLanes = fourLanes.filter(
            (l) => l !== lane && l !== otherLane && isLaneClearOfSlides(beat, l, 3)
          );
          if (freeLanes.length > 0) {
            const thirdLane = freeLanes[Math.floor(rand() * freeLanes.length)];
            notes.push({
              id: uid('tp'),
              type: 'tap',
              beat,
              lane: thirdLane,
              width: 3,
              critical: isCritical,
            });
          }
        }
      }
    }

    lastNoteBeat = beat;
  }

  const cleanNotes = sanitizeChartNotes(notes);

  // Compute realistic PJSK level from actual chart density (notes per second)
  const activeDur = Math.max(10, analysis.durationSec - Math.max(0, offsetMs / 1000));
  const nps = cleanNotes.length / activeDur;
  const clampLv = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  const dynamicLevel =
    difficulty === 'easy'
      ? clampLv(4 + nps * 2.1, 5, 9)
      : difficulty === 'normal'
      ? clampLv(9 + nps * 1.6, 11, 16)
      : difficulty === 'hard'
      ? clampLv(13 + nps * 1.35, 17, 23)
      : difficulty === 'expert'
      ? clampLv(18 + nps * 1.05, 24, 29)
      : difficulty === 'master'
      ? clampLv(22 + nps * 0.85, 28, 34)
      : clampLv(25 + nps * 0.72, 32, 37);

  return {
    difficulty,
    level: dynamicLevel,
    notes: cleanNotes,
  };
}

export function generateAllDifficulties(
  analysis: AudioAnalysisResult,
  bpm?: number,
  offsetMs?: number
): Record<Difficulty, Chart> {
  return {
    easy: generateChartFromAnalysis(analysis, 'easy', { bpm, offsetMs }),
    normal: generateChartFromAnalysis(analysis, 'normal', { bpm, offsetMs }),
    hard: generateChartFromAnalysis(analysis, 'hard', { bpm, offsetMs }),
    expert: generateChartFromAnalysis(analysis, 'expert', { bpm, offsetMs }),
    master: generateChartFromAnalysis(analysis, 'master', { bpm, offsetMs }),
    append: generateChartFromAnalysis(analysis, 'append', { bpm, offsetMs }),
  };
}
