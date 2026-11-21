import { SoundPack } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private seGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private soundPack: SoundPack = 'crystal';

  // Menu highlight preview state
  private previewSrc: AudioBufferSourceNode | null = null;
  private previewGain: GainNode | null = null;
  private previewFadeTimer: number | null = null;
  private previewLoopTimer: number | null = null;
  private previewSessionId = 0;

  public setSoundPack(pack: SoundPack) {
    this.soundPack = pack;
  }

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.seGain = this.ctx.createGain();
      this.seGain.gain.value = 0.75;
      this.seGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.85;
      this.musicGain.connect(this.ctx.destination);

      // Pre-generate short white noise buffer for flick whooshes / crisp transients
      const len = Math.floor(this.ctx.sampleRate * 0.12);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getMusicGain(): GainNode {
    this.getContext();
    return this.musicGain!;
  }

  public setVolumes(musicVol: number, seVol: number) {
    const ctx = this.getContext();
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, musicVol)), ctx.currentTime, 0.015);
    }
    if (this.seGain) {
      this.seGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, seVol)), ctx.currentTime, 0.015);
    }
  }

  public async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.getContext();
    // Copy buffer because decodeAudioData detaches the passed ArrayBuffer
    const copy = arrayBuffer.slice(0);
    return await ctx.decodeAudioData(copy);
  }

  public playTapSE(critical = false) {
    const ctx = this.getContext();
    if (!this.seGain) return;
    const now = ctx.currentTime;
    const pack = this.soundPack;

    if (pack === 'soft') {
      // Soft marimba / warm percussion tap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(critical ? 980 : 760, now);
      osc.frequency.exponentialRampToValueAtTime(critical ? 640 : 480, now + 0.055);
      gain.gain.setValueAtTime(critical ? 0.44 : 0.34, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(now);
      osc.stop(now + 0.09);
      return;
    }

    if (pack === 'arcade') {
      // Punchy arcade square/triangle pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(critical ? 1760 : 1320, now);
      osc.frequency.exponentialRampToValueAtTime(critical ? 880 : 540, now + 0.045);
      gain.gain.setValueAtTime(critical ? 0.28 : 0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(now);
      osc.stop(now + 0.07);
    } else {
      // Crisp percussive woodblock/synth transient (PJSK crystal tap)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = critical ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(critical ? 1560 : 1220, now);
      osc.frequency.exponentialRampToValueAtTime(critical ? 720 : 480, now + 0.045);

      gain.gain.setValueAtTime(critical ? 0.55 : 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(now);
      osc.stop(now + 0.075);
    }

    // Subtle high click transient
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(critical ? 4200 : 3200, now);
      filter.Q.value = 2.0;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(pack === 'arcade' ? 0.36 : 0.32, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.seGain);
      noise.start(now);
      noise.stop(now + 0.03);
    }

    // Golden critical sparkle harmonic
    if (critical) {
      const chime = ctx.createOscillator();
      const cGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(2340, now);
      chime.frequency.exponentialRampToValueAtTime(3120, now + 0.09);
      cGain.gain.setValueAtTime(0.28, now);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      chime.connect(cGain);
      cGain.connect(this.seGain);
      chime.start(now);
      chime.stop(now + 0.15);
    }
  }

  public playFlickSE(critical = false) {
    const ctx = this.getContext();
    if (!this.seGain) return;
    const now = ctx.currentTime;
    const pack = this.soundPack;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = pack === 'soft' ? 'sine' : pack === 'arcade' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(
      pack === 'soft' ? (critical ? 880 : 660) : critical ? 980 : 780,
      now
    );
    osc.frequency.exponentialRampToValueAtTime(
      pack === 'soft' ? (critical ? 1760 : 1320) : critical ? 2800 : 2100,
      now + 0.085
    );

    gain.gain.setValueAtTime(pack === 'soft' ? 0.32 : pack === 'arcade' ? 0.32 : 0.48, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(now);
    osc.stop(now + 0.12);

    if (this.noiseBuffer && pack !== 'soft') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(6000, now + 0.08);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.42, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.seGain);
      noise.start(now);
      noise.stop(now + 0.095);
    }
  }

  public playSlideTickSE(critical = false) {
    const ctx = this.getContext();
    if (!this.seGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = this.soundPack === 'arcade' ? 'triangle' : 'sine';
    const base = this.soundPack === 'soft' ? 1120 : 1480;
    osc.frequency.setValueAtTime(critical ? base + 360 : base, now);
    osc.frequency.exponentialRampToValueAtTime(critical ? base - 80 : base - 400, now + 0.03);
    gain.gain.setValueAtTime(this.soundPack === 'soft' ? 0.16 : 0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playMenuPreview(
    buffer: AudioBuffer,
    startSec: number,
    durationSec = 18,
    volume = 0.55
  ) {
    this.stopMenuPreview();
    const ctx = this.getContext();
    const sessionId = ++this.previewSessionId;
    const safeDur = Math.max(4, Math.min(durationSec, Math.max(4, buffer.duration - 0.5)));
    const safeStart = Math.max(0, Math.min(Math.max(0, buffer.duration - safeDur), startSec));

    const playCycle = () => {
      if (this.previewSessionId !== sessionId) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (this.previewSrc) {
        try {
          this.previewSrc.stop();
          this.previewSrc.disconnect();
        } catch {}
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(Math.max(0.02, Math.min(0.9, volume)), ctx.currentTime + 0.85);
      g.connect(ctx.destination);
      this.previewGain = g;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(g);
      src.start(ctx.currentTime, safeStart, safeDur);
      this.previewSrc = src;

      const fadeStartMs = Math.max(600, (safeDur - 1.2) * 1000);
      this.previewFadeTimer = window.setTimeout(() => {
        if (this.previewSessionId !== sessionId || !this.previewGain) return;
        try {
          this.previewGain.gain.setValueAtTime(this.previewGain.gain.value, ctx.currentTime);
          this.previewGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 1.1);
        } catch {}
      }, fadeStartMs);

      this.previewLoopTimer = window.setTimeout(() => {
        if (this.previewSessionId === sessionId) {
          playCycle();
        }
      }, safeDur * 1000 + 80);
    };

    playCycle();
  }

  public setMenuPreviewVolume(volume: number) {
    if (this.previewGain && this.ctx) {
      try {
        this.previewGain.gain.setTargetAtTime(
          Math.max(0.01, Math.min(0.9, volume)),
          this.ctx.currentTime,
          0.08
        );
      } catch {}
    }
  }

  public stopMenuPreview() {
    this.previewSessionId++;
    if (this.previewFadeTimer !== null) {
      window.clearTimeout(this.previewFadeTimer);
      this.previewFadeTimer = null;
    }
    if (this.previewLoopTimer !== null) {
      window.clearTimeout(this.previewLoopTimer);
      this.previewLoopTimer = null;
    }
    if (this.previewSrc) {
      try {
        this.previewSrc.stop();
        this.previewSrc.disconnect();
      } catch {}
      this.previewSrc = null;
    }
    if (this.previewGain) {
      try {
        this.previewGain.disconnect();
      } catch {}
      this.previewGain = null;
    }
  }

  public playEmptySE() {
    const ctx = this.getContext();
    if (!this.seGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.03);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playMetronomeClick(accent = false) {
    const ctx = this.getContext();
    if (!this.seGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1600 : 1000, now);
    gain.gain.setValueAtTime(accent ? 0.25 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playClearFanfare(kind: 'CLEAR' | 'FC' | 'AP', volume = 0.4) {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(0.65, volume));
    const notes =
      kind === 'AP'
        ? [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5, 1567.98] // C5 E5 G5 B5 C6 E6 G6
        : kind === 'FC'
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5] // C5 E5 G5 C6 E6
        : [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

    const step = kind === 'AP' ? 0.065 : 0.08;
    notes.forEach((freq, idx) => {
      const start = now + idx * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(vol * 0.26, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (idx === notes.length - 1 ? 0.72 : 0.42));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }
}

export const soundEngine = new SoundEngine();

export function computeWaveformPeaks(buffer: AudioBuffer, numBuckets = 2400): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const peaks = new Float32Array(numBuckets);
  if (length === 0 || numBuckets === 0) return peaks;

  const ch0 = buffer.getChannelData(0);
  const ch1 = channels > 1 ? buffer.getChannelData(1) : ch0;
  const blockSize = Math.max(1, Math.floor(length / numBuckets));

  for (let i = 0; i < numBuckets; i++) {
    const start = i * blockSize;
    const end = Math.min(length, start + blockSize);
    let maxVal = 0;
    const step = Math.max(1, Math.floor((end - start) / 64));
    for (let j = start; j < end; j += step) {
      const v = Math.abs((ch0[j] + ch1[j]) * 0.5);
      if (v > maxVal) maxVal = v;
    }
    peaks[i] = maxVal;
  }
  return peaks;
}

/** Find brightest chorus / highlight start time (in seconds) for menu preview */
export function findBestPreviewStart(buffer: AudioBuffer, windowSec = 18): number {
  const dur = buffer.duration;
  if (dur <= windowSec + 4) return 0;
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const minStart = Math.max(2, dur * 0.16);
  const maxStart = Math.max(minStart + 1, dur - windowSec - 2);
  let bestStart = dur * 0.3;
  let bestEnergy = -1;

  for (let t = minStart; t <= maxStart; t += 1.5) {
    const sIdx = Math.floor(t * sr);
    const eIdx = Math.min(ch.length, Math.floor((t + windowSec) * sr));
    const step = Math.max(1, Math.floor((eIdx - sIdx) / 900));
    let sumSq = 0;
    let cnt = 0;
    for (let i = sIdx; i < eIdx; i += step) {
      const v = ch[i];
      sumSq += v * v;
      cnt++;
    }
    const rms = cnt > 0 ? sumSq / cnt : 0;
    if (rms > bestEnergy) {
      bestEnergy = rms;
      bestStart = t;
    }
  }
  return Math.round(bestStart * 10) / 10;
}
