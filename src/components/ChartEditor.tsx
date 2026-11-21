import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Download,
  Magnet,
  MousePointer,
  Play,
  Pause,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import { analyzeAudioBuffer, generateChartFromAnalysis } from '../audio/analyzer';
import { exportChartAsJSON, exportUSC, parseAnyChartFile } from '../audio/chartFormats';
import { computeWaveformPeaks, soundEngine } from '../audio/soundEngine';
import {
  Chart,
  ChartNote,
  DIFFICULTY_META,
  Difficulty,
  FlickDirection,
  SlideEase,
  SlideNote,
  SlidePoint,
  SongItem,
  beatToTimeSec,
  timeSecToBeat,
  uid,
} from '../types/game';

interface ChartEditorProps {
  song: SongItem;
  difficulty: Difficulty;
  audioBuffer: AudioBuffer;
  onSaveSong: (updatedSong: SongItem) => Promise<void>;
  onTestPlay: (song: SongItem, difficulty: Difficulty, startFromSec: number) => void;
  onBack: () => void;
}

type EditorTool = 'select' | 'tap' | 'trace' | 'flick' | 'slide';

function easeVal(t: number, ease: SlideEase): number {
  const c = Math.max(0, Math.min(1, t));
  if (ease === 'in') return c * c;
  if (ease === 'out') return 1 - (1 - c) * (1 - c);
  if (ease === 'sine') return 0.5 - 0.5 * Math.cos(Math.PI * c);
  return c;
}

export const ChartEditor: React.FC<ChartEditorProps> = ({
  song,
  difficulty,
  audioBuffer,
  onSaveSong,
  onTestPlay,
  onBack,
}) => {
  const initialChart: Chart = song.charts[difficulty] ?? {
    difficulty,
    level: DIFFICULTY_META[difficulty].defaultLevel,
    notes: [],
  };

  const [bpm, setBpm] = useState<number>(song.bpm);
  const [offsetMs, setOffsetMs] = useState<number>(song.offsetMs);
  const [level, setLevel] = useState<number>(initialChart.level);
  const [notes, setNotes] = useState<ChartNote[]>(() =>
    JSON.parse(JSON.stringify(initialChart.notes))
  );
  const [undoStack, setUndoStack] = useState<ChartNote[][]>([]);
  const [redoStack, setRedoStack] = useState<ChartNote[][]>([]);

  const [tool, setTool] = useState<EditorTool>('tap');
  const [noteWidth, setNoteWidth] = useState<number>(3);
  const [isCritical, setIsCritical] = useState<boolean>(false);
  const [flickDir, setFlickDir] = useState<FlickDirection>('up');
  const [slideEase, setSlideEase] = useState<SlideEase>('sine');
  const [snapDiv, setSnapDiv] = useState<number>(4); // 4 = 1/16 note (4 per beat)
  const [zoomPxPerBeat, setZoomPxPerBeat] = useState<number>(84);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftSlidePts, setDraftSlidePts] = useState<SlidePoint[]>([]);

  // Audio playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(false);
  const [hitPreviewOn, setHitPreviewOn] = useState<boolean>(true);
  const [autoDensity, setAutoDensity] = useState<number>(1.0);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'tools' | 'timing'>('none');
  const touchScrollYRef = useRef<number | null>(null);

  // Tap BPM state
  const tapTimesRef = useRef<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileImportRef = useRef<HTMLInputElement | null>(null);
  const scrollBeatRef = useRef<number>(0);
  const [scrollBeat, setScrollBeat] = useState<number>(0);

  const waveform = useMemo(() => computeWaveformPeaks(audioBuffer, 3200), [audioBuffer]);

  const audioSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartCtxRef = useRef<number>(0);
  const playStartSongRef = useRef<number>(0);
  const lastSoundedTimeRef = useRef<number>(-1);
  const lastMetronomeBeatRef = useRef<number>(-999);

  const maxBeat = useMemo(
    () => Math.ceil(timeSecToBeat(audioBuffer.duration + 1, bpm, offsetMs, song.bpmChanges)),
    [audioBuffer.duration, bpm, offsetMs, song.bpmChanges]
  );

  const pushHistory = useCallback((nextNotes: ChartNote[]) => {
    setUndoStack((u) => [...u.slice(-29), notes]);
    setRedoStack([]);
    setNotes(nextNotes);
  }, [notes]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, notes]);
    setUndoStack((u) => u.slice(0, -1));
    setNotes(prev);
  }, [undoStack, notes]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, notes]);
    setRedoStack((r) => r.slice(0, -1));
    setNotes(next);
  }, [redoStack, notes]);

  const stopAudio = useCallback(() => {
    if (audioSrcRef.current) {
      try {
        audioSrcRef.current.stop();
        audioSrcRef.current.disconnect();
      } catch {}
      audioSrcRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startAudio = useCallback(
    (fromSec: number) => {
      stopAudio();
      const ctx = soundEngine.getContext();
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.playbackRate.value = playbackRate;
      src.connect(soundEngine.getMusicGain());
      const clamped = Math.max(0, Math.min(audioBuffer.duration - 0.05, fromSec));
      src.start(0, clamped);
      audioSrcRef.current = src;
      playStartCtxRef.current = ctx.currentTime;
      playStartSongRef.current = clamped;
      lastSoundedTimeRef.current = clamped;
      lastMetronomeBeatRef.current = Math.floor(
        timeSecToBeat(clamped, bpm, offsetMs, song.bpmChanges)
      );
      setIsPlaying(true);
    },
    [audioBuffer, playbackRate, stopAudio, bpm, offsetMs, song.bpmChanges]
  );

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopAudio();
    } else {
      startAudio(currentTime >= audioBuffer.duration - 0.1 ? 0 : currentTime);
    }
  }, [isPlaying, stopAudio, startAudio, currentTime, audioBuffer.duration]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        pushHistory(notes.filter((n) => n.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, handleUndo, handleRedo, selectedId, notes, pushHistory]);

  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  // Animation loop for playback & hit-sound preview
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (isPlaying) {
        const ctx = soundEngine.getContext();
        const t =
          playStartSongRef.current +
          (ctx.currentTime - playStartCtxRef.current) * playbackRate;
        if (t >= audioBuffer.duration) {
          stopAudio();
          setCurrentTime(0);
        } else {
          setCurrentTime(t);
          const curBeat = timeSecToBeat(t, bpm, offsetMs, song.bpmChanges);
          // Auto-follow scroll
          const nextScroll = Math.max(0, curBeat - 2);
          scrollBeatRef.current = nextScroll;
          setScrollBeat(nextScroll);

          // Metronome
          if (metronomeOn) {
            const bInt = Math.floor(curBeat);
            if (bInt > lastMetronomeBeatRef.current) {
              lastMetronomeBeatRef.current = bInt;
              soundEngine.playMetronomeClick(bInt % 4 === 0);
            }
          }

          // Hit sound preview
          if (hitPreviewOn) {
            const prevT = lastSoundedTimeRef.current;
            for (const n of notes) {
              if (n.type === 'tap' || n.type === 'flick' || n.type === 'trace') {
                const nt = beatToTimeSec(n.beat, bpm, offsetMs, song.bpmChanges);
                if (nt > prevT && nt <= t) {
                  if (n.type === 'flick') soundEngine.playFlickSE(n.critical);
                  else if (n.type === 'trace') soundEngine.playSlideTickSE(n.critical);
                  else soundEngine.playTapSE(n.critical);
                }
              } else if (n.type === 'slide') {
                for (let idx = 0; idx < n.points.length; idx++) {
                  const pt = n.points[idx];
                  const ptTime = beatToTimeSec(pt.beat, bpm, offsetMs, song.bpmChanges);
                  if (ptTime > prevT && ptTime <= t) {
                    if (idx === 0) soundEngine.playTapSE(n.critical);
                    else if (idx === n.points.length - 1 && n.endFlick)
                      soundEngine.playFlickSE(n.critical);
                    else soundEngine.playSlideTickSE(n.critical);
                  }
                }
              }
            }
            lastSoundedTimeRef.current = t;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    isPlaying,
    playbackRate,
    audioBuffer.duration,
    stopAudio,
    bpm,
    offsetMs,
    song.bpmChanges,
    metronomeOn,
    hitPreviewOn,
    notes,
  ]);

  // Render Editor Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background — deep gradient with an aurora tint
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a0d20');
    bgGrad.addColorStop(0.55, '#111636');
    bgGrad.addColorStop(1, '#080b1c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const laneAreaW = Math.min(W - 96, 520);
    const laneLeft = Math.max(58, (W - laneAreaW) * 0.5);
    const laneRight = laneLeft + laneAreaW;
    const laneW = laneAreaW / 12;
    const playheadY = H - 86;

    const beatToY = (beat: number) => playheadY - (beat - scrollBeat) * zoomPxPerBeat;

    // Lane columns
    const laneGrad = ctx.createLinearGradient(laneLeft, 0, laneRight, 0);
    laneGrad.addColorStop(0, 'rgba(19, 23, 50, 0.95)');
    laneGrad.addColorStop(0.5, 'rgba(23, 29, 62, 0.95)');
    laneGrad.addColorStop(1, 'rgba(19, 23, 50, 0.95)');
    ctx.fillStyle = laneGrad;
    ctx.fillRect(laneLeft, 0, laneAreaW, H);

    // Waveform behind lanes
    const visibleMinBeat = Math.max(0, scrollBeat - 2);
    const visibleMaxBeat = scrollBeat + H / zoomPxPerBeat + 2;
    ctx.save();
    ctx.fillStyle = 'rgba(51, 230, 204, 0.16)';
    const centerX = laneLeft + laneAreaW / 2;
    for (let y = 0; y < H; y += 3) {
      const b = scrollBeat + (playheadY - y) / zoomPxPerBeat;
      if (b < 0) continue;
      const t = beatToTimeSec(b, bpm, offsetMs, song.bpmChanges);
      if (t < 0 || t > audioBuffer.duration) continue;
      const idx = Math.floor((t / audioBuffer.duration) * (waveform.length - 1));
      const amp = waveform[idx] || 0;
      const half = amp * laneAreaW * 0.48;
      ctx.fillRect(centerX - half, y, half * 2, 2);
    }
    ctx.restore();

    // Vertical 12 lane dividers — outer rails glow
    for (let i = 0; i <= 12; i++) {
      const x = laneLeft + i * laneW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      const isEdge = i === 0 || i === 12;
      if (isEdge) {
        ctx.shadowColor = 'rgba(51,230,204,0.75)';
        ctx.shadowBlur = 8;
      }
      ctx.strokeStyle = isEdge
        ? 'rgba(51,230,204,0.65)'
        : i % 2 === 0
        ? 'rgba(255,255,255,0.17)'
        : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = isEdge ? 2 : 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Horizontal beat & snap lines
    const firstStep = Math.floor(visibleMinBeat * snapDiv);
    const lastStep = Math.ceil(visibleMaxBeat * snapDiv);
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let s = firstStep; s <= lastStep; s++) {
      const b = s / snapDiv;
      if (b < 0) continue;
      const y = beatToY(b);
      if (y < -10 || y > H + 10) continue;
      const isBeat = s % snapDiv === 0;
      const isMeasure = s % (snapDiv * 4) === 0;

      ctx.beginPath();
      ctx.moveTo(laneLeft, y);
      ctx.lineTo(laneRight, y);
      ctx.strokeStyle = isMeasure
        ? 'rgba(255,255,255,0.45)'
        : isBeat
        ? 'rgba(255,255,255,0.18)'
        : 'rgba(56,189,248,0.1)';
      ctx.lineWidth = isMeasure ? 1.8 : isBeat ? 1 : 0.7;
      ctx.stroke();

      if (isMeasure) {
        const mNum = Math.round(b / 4) + 1;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`#${mNum}`, laneLeft - 10, y);
      }
    }

    // Draw Slide Notes
    const drawSlide = (pts: SlidePoint[], critical: boolean, endFlick: FlickDirection | null, selected: boolean) => {
      if (pts.length === 0) return;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const steps = 16;
        const leftPts: Array<{ x: number; y: number }> = [];
        const rightPts: Array<{ x: number; y: number }> = [];
        for (let k = 0; k <= steps; k++) {
          const f = easeVal(k / steps, p0.ease);
          const b = p0.beat + (p1.beat - p0.beat) * (k / steps);
          const l = p0.lane + (p1.lane - p0.lane) * f;
          const w = p0.width + (p1.width - p0.width) * f;
          const y = beatToY(b);
          leftPts.push({ x: laneLeft + l * laneW, y });
          rightPts.push({ x: laneLeft + (l + w) * laneW, y });
        }
        ctx.beginPath();
        ctx.moveTo(leftPts[0].x, leftPts[0].y);
        for (let k = 1; k < leftPts.length; k++) ctx.lineTo(leftPts[k].x, leftPts[k].y);
        for (let k = rightPts.length - 1; k >= 0; k--) ctx.lineTo(rightPts[k].x, rightPts[k].y);
        ctx.closePath();
        ctx.fillStyle = critical ? 'rgba(250, 204, 21, 0.45)' : 'rgba(52, 211, 153, 0.45)';
        ctx.fill();
        ctx.strokeStyle = selected ? '#ffffff' : critical ? '#fde047' : '#6ee7b7';
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.stroke();
      }

      pts.forEach((pt, idx) => {
        const x = laneLeft + pt.lane * laneW;
        const w = pt.width * laneW;
        const y = beatToY(pt.beat);
        if (idx === 0 || idx === pts.length - 1) {
          ctx.fillStyle = critical
            ? '#facc15'
            : idx === pts.length - 1 && endFlick
            ? '#ff5599'
            : '#34d399';
          ctx.strokeStyle = selected ? '#ffffff' : '#ecfdf5';
          ctx.lineWidth = selected ? 2.5 : 1.5;
          ctx.fillRect(x + 1, y - 6, w - 2, 12);
          ctx.strokeRect(x + 1, y - 6, w - 2, 12);
          if (idx === pts.length - 1 && endFlick) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(endFlick === 'left' ? '↖' : endFlick === 'right' ? '↗' : '↑', x + w / 2, y - 12);
          }
        } else {
          const cx = x + w / 2;
          ctx.save();
          ctx.translate(cx, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = pt.kind === 'attach' ? '#94a3b8' : '#a7f3d0';
          ctx.fillRect(-5, -5, 10, 10);
          ctx.restore();
        }
      });
    };

    for (const n of notes) {
      const isSel = n.id === selectedId;
      if (n.type === 'slide') {
        drawSlide(n.points, n.critical, n.endFlick ?? null, isSel);
      } else {
        if (n.beat < visibleMinBeat - 1 || n.beat > visibleMaxBeat + 1) continue;
        const x = laneLeft + n.lane * laneW;
        const w = n.width * laneW;
        const y = beatToY(n.beat);
        if (n.type === 'trace') {
          ctx.fillStyle = n.critical ? '#fde047' : '#a7f3d0';
          ctx.strokeStyle = isSel ? '#ffffff' : '#0f766e';
          ctx.lineWidth = isSel ? 3 : 1.5;
          ctx.fillRect(x + 2, y - 3, w - 4, 6);
          ctx.strokeRect(x + 2, y - 3, w - 4, 6);
          const cx = x + w / 2;
          ctx.save();
          ctx.translate(cx, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = n.critical ? '#facc15' : '#34d399';
          ctx.fillRect(-5, -5, 10, 10);
          ctx.restore();
        } else {
          ctx.fillStyle = n.critical ? '#facc15' : n.type === 'flick' ? '#ff5599' : '#22d3ee';
          ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.8)';
          ctx.lineWidth = isSel ? 3 : 1.5;
          ctx.fillRect(x + 1, y - 6, w - 2, 12);
          ctx.strokeRect(x + 1, y - 6, w - 2, 12);

          if (n.type === 'flick') {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            const sym = n.direction === 'left' ? '↖' : n.direction === 'right' ? '↗' : '↑';
            ctx.fillText(sym, x + w / 2, y - 13);
          }
        }
      }
    }

    // Draw in-progress draft slide
    if (draftSlidePts.length > 0) {
      drawSlide(draftSlidePts, isCritical, null, true);
    }

    // Current audio playhead line
    const playBeat = timeSecToBeat(currentTime, bpm, offsetMs, song.bpmChanges);
    const curY = beatToY(playBeat);
    ctx.beginPath();
    ctx.moveTo(laneLeft - 14, curY);
    ctx.lineTo(laneRight + 14, curY);
    ctx.strokeStyle = '#ff5599';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
  }, [
    notes,
    selectedId,
    draftSlidePts,
    isCritical,
    scrollBeat,
    zoomPxPerBeat,
    snapDiv,
    bpm,
    offsetMs,
    song.bpmChanges,
    audioBuffer.duration,
    waveform,
    currentTime,
  ]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const deltaBeats = (-e.deltaY / zoomPxPerBeat) * 0.85;
    const next = Math.max(0, Math.min(maxBeat, scrollBeatRef.current + deltaBeats));
    scrollBeatRef.current = next;
    setScrollBeat(next);
  };

  const getGridCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const laneAreaW = Math.min(W - 96, 520);
    const laneLeft = Math.max(58, (W - laneAreaW) * 0.5);
    const laneW = laneAreaW / 12;
    const playheadY = H - 86;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const rawLane = Math.floor((x - laneLeft) / laneW);
    const rawBeat = scrollBeat + (playheadY - y) / zoomPxPerBeat;
    const snappedBeat = Math.max(0, Math.round(rawBeat * snapDiv) / snapDiv);
    return { rawLane, rawBeat, snappedBeat, insideRoad: x >= laneLeft && x <= laneLeft + laneAreaW };
  };

  const findNoteAt = (rawBeat: number, rawLane: number): ChartNote | null => {
    const beatTol = 14 / zoomPxPerBeat;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.type === 'tap' || n.type === 'flick' || n.type === 'trace') {
        if (Math.abs(n.beat - rawBeat) <= beatTol && rawLane >= n.lane && rawLane < n.lane + n.width) {
          return n;
        }
      } else {
        for (const pt of n.points) {
          if (
            Math.abs(pt.beat - rawBeat) <= beatTol &&
            rawLane >= pt.lane &&
            rawLane < pt.lane + pt.width
          ) {
            return n;
          }
        }
      }
    }
    return null;
  };

  const finishDraftSlide = () => {
    if (draftSlidePts.length >= 2) {
      const sorted = [...draftSlidePts].sort((a, b) => a.beat - b.beat);
      sorted.forEach((p, idx) => {
        p.kind = idx === 0 ? 'start' : idx === sorted.length - 1 ? 'end' : 'tick';
      });
      const sl: SlideNote = {
        id: uid('sl'),
        type: 'slide',
        critical: isCritical,
        points: sorted,
        endFlick: null,
      };
      pushHistory([...notes, sl]);
      setSelectedId(sl.id);
    }
    setDraftSlidePts([]);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getGridCoords(e.clientX, e.clientY);
    if (!pos) return;
    if (!pos.insideRoad) {
      // Clicking left of road jumps playhead
      const jumpSec = Math.max(
        0,
        Math.min(audioBuffer.duration - 0.1, beatToTimeSec(pos.snappedBeat, bpm, offsetMs, song.bpmChanges))
      );
      setCurrentTime(jumpSec);
      if (isPlaying) startAudio(jumpSec);
      return;
    }

    const lane = Math.max(0, Math.min(12 - noteWidth, pos.rawLane));

    if (tool === 'select') {
      const hit = findNoteAt(pos.rawBeat, pos.rawLane);
      setSelectedId(hit ? hit.id : null);
      return;
    }

    if (tool === 'tap') {
      const n: ChartNote = {
        id: uid('tp'),
        type: 'tap',
        beat: pos.snappedBeat,
        lane,
        width: noteWidth,
        critical: isCritical,
      };
      pushHistory([...notes, n]);
      setSelectedId(n.id);
      soundEngine.playTapSE(isCritical);
    } else if (tool === 'trace') {
      const n: ChartNote = {
        id: uid('tr'),
        type: 'trace',
        beat: pos.snappedBeat,
        lane,
        width: noteWidth,
        critical: isCritical,
      };
      pushHistory([...notes, n]);
      setSelectedId(n.id);
      soundEngine.playSlideTickSE(isCritical);
    } else if (tool === 'flick') {
      const n: ChartNote = {
        id: uid('fl'),
        type: 'flick',
        beat: pos.snappedBeat,
        lane,
        width: noteWidth,
        critical: isCritical,
        direction: flickDir,
      };
      pushHistory([...notes, n]);
      setSelectedId(n.id);
      soundEngine.playFlickSE(isCritical);
    } else if (tool === 'slide') {
      const pt: SlidePoint = {
        id: uid('sp'),
        beat: pos.snappedBeat,
        lane,
        width: noteWidth,
        ease: slideEase,
        kind: draftSlidePts.length === 0 ? 'start' : 'tick',
      };
      setDraftSlidePts((prev) => [...prev, pt]);
      soundEngine.playSlideTickSE(isCritical);
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (draftSlidePts.length >= 2) {
      finishDraftSlide();
      return;
    }
    const pos = getGridCoords(e.clientX, e.clientY);
    if (!pos) return;
    const hit = findNoteAt(pos.rawBeat, pos.rawLane);
    if (hit) {
      pushHistory(notes.filter((n) => n.id !== hit.id));
      if (selectedId === hit.id) setSelectedId(null);
    }
  };

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  const updateSelectedNote = (updater: (n: ChartNote) => ChartNote) => {
    if (!selectedId) return;
    pushHistory(notes.map((n) => (n.id === selectedId ? updater(n) : n)));
  };

  const handleAutoDetectTiming = () => {
    const analysis = analyzeAudioBuffer(audioBuffer);
    setBpm(analysis.bpm);
    setOffsetMs(analysis.offsetMs);
    setSaveNotice(`Определено: ${analysis.bpm} BPM, Offset ${analysis.offsetMs} мс`);
    setTimeout(() => setSaveNotice(null), 2600);
  };

  const handleAutoGenerate = () => {
    const analysis = analyzeAudioBuffer(audioBuffer);
    const gen = generateChartFromAnalysis(analysis, difficulty, {
      bpm,
      offsetMs,
      densityMultiplier: autoDensity,
    });
    pushHistory(gen.notes);
    setSelectedId(null);
    setSaveNotice('Сгенерирован новый черновик нот!');
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const buildUpdatedSong = (): SongItem => ({
    ...song,
    bpm,
    offsetMs,
    analyzerVersion: 4,
    chartEdited: true,
    charts: {
      ...song.charts,
      [difficulty]: {
        difficulty,
        level,
        notes,
      },
    },
  });

  const handleSave = async () => {
    await onSaveSong(buildUpdatedSong());
    setSaveNotice('Чарт сохранён!');
    setTimeout(() => setSaveNotice(null), 2200);
  };

  const handleTapBpm = () => {
    const now = performance.now();
    const arr = tapTimesRef.current.filter((t) => now - t < 2500);
    arr.push(now);
    tapTimesRef.current = arr;
    if (arr.length >= 3) {
      let sum = 0;
      for (let i = 1; i < arr.length; i++) sum += arr[i] - arr[i - 1];
      const avgMs = sum / (arr.length - 1);
      const calcBpm = Math.round((60000 / avgMs) * 10) / 10;
      if (calcBpm >= 40 && calcBpm <= 300) setBpm(calcBpm);
    }
  };

  const handleImportChart = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = parseAnyChartFile(file.name, text);
      if (res.imported.bpm) setBpm(res.imported.bpm);
      if (typeof res.imported.offsetMs === 'number') setOffsetMs(res.imported.offsetMs);
      pushHistory(res.imported.notes);
      setSaveNotice(`Импортировано ${res.imported.notes.length} нот`);
      setTimeout(() => setSaveNotice(null), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка импорта файла');
    }
    e.target.value = '';
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pjsk-editor-root w-full h-full flex flex-col bg-[#0d1022] text-white overflow-hidden">
      {/* Top Toolbar (responsive on PC & mobile) */}
      <div className="pjsk-editor-toolbar relative min-h-14 py-1.5 px-2.5 sm:px-4 bg-gradient-to-r from-[#141834] via-[#181d3e] to-[#141834] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Prism edge on the toolbar */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#39C5BB]/55 via-50% to-transparent" />
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              stopAudio();
              onBack();
            }}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/15 transition"
            title="Назад"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{song.title}</div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span style={{ color: DIFFICULTY_META[difficulty].color }} className="font-bold">
                {DIFFICULTY_META[difficulty].label} LV.{level}
              </span>
              <span>· {notes.length} нот</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setMobilePanel((p) => (p === 'tools' ? 'none' : 'tools'))}
            className={`lg:hidden px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
              mobilePanel === 'tools'
                ? 'bg-cyan-400/25 border-cyan-400 text-cyan-200'
                : 'bg-white/10 border-white/15 text-slate-200'
            }`}
          >
            Ноты
          </button>
          <button
            onClick={() => setMobilePanel((p) => (p === 'timing' ? 'none' : 'timing'))}
            className={`lg:hidden px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
              mobilePanel === 'timing'
                ? 'bg-pink-400/25 border-pink-400 text-pink-200'
                : 'bg-white/10 border-white/15 text-slate-200'
            }`}
          >
            BPM
          </button>
          {saveNotice && (
            <span className="hidden sm:inline px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-semibold">
              {saveNotice}
            </span>
          )}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-35 transition"
            title="Отменить (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-35 transition"
            title="Повторить (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            className="px-2.5 sm:px-3.5 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Save className="w-4 h-4" /> <span className="hidden sm:inline">Сохранить</span>
          </button>
          <button
            onClick={async () => {
              stopAudio();
              const updated = buildUpdatedSong();
              await onSaveSong(updated);
              onTestPlay(updated, difficulty, Math.max(0, currentTime - 0.5));
            }}
            className="px-2.5 sm:px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 hover:brightness-110 transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> <span className="hidden sm:inline">Тест с позиции</span>
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Tool Palette (drawer on mobile, docked on PC) */}
        <div
          className={`${
            mobilePanel === 'tools'
              ? 'flex absolute left-0 top-0 bottom-0 z-30 shadow-2xl'
              : 'hidden'
          } lg:flex lg:static pjsk-editor-sidebar w-56 bg-[#121630] border-r border-white/10 p-3 flex-col gap-4 overflow-y-auto shrink-0`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Инструмент
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'select', label: 'Выбор', icon: MousePointer },
                { id: 'tap', label: 'Tap (Тап)', icon: Square },
                { id: 'trace', label: 'Trace', icon: Sparkles },
                { id: 'flick', label: 'Flick', icon: ArrowUp },
                { id: 'slide', label: 'Slide', icon: Plus },
              ].map((t) => {
                const Icon = t.icon;
                const active = tool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTool(t.id as EditorTool)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
                      active
                        ? 'bg-cyan-400/20 border-cyan-400 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {draftSlidePts.length > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs space-y-2">
              <div className="font-bold text-emerald-300">
                Рисуется слайд ({draftSlidePts.length} тчк.)
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={finishDraftSlide}
                  disabled={draftSlidePts.length < 2}
                  className="flex-1 py-1.5 rounded-lg bg-emerald-400 text-slate-950 font-bold disabled:opacity-40"
                >
                  Завершить
                </button>
                <button
                  onClick={() => setDraftSlidePts([])}
                  className="px-2 py-1.5 rounded-lg bg-white/10 text-slate-300"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Note Properties */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Ширина ноты</span>
                <span className="font-mono font-bold text-cyan-300">{noteWidth} / 12</span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={noteWidth}
                onChange={(e) => setNoteWidth(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <label className="flex items-center justify-between text-xs cursor-pointer p-2 rounded-lg bg-white/5 border border-white/10">
              <span className="flex items-center gap-1.5 font-semibold text-amber-300">
                <Sparkles className="w-3.5 h-3.5" /> Золотая (Critical)
              </span>
              <input
                type="checkbox"
                checked={isCritical}
                onChange={(e) => setIsCritical(e.target.checked)}
                className="accent-amber-400 w-4 h-4"
              />
            </label>

            {tool === 'flick' && (
              <div>
                <div className="text-[11px] text-slate-400 mb-1">Направление Flick</div>
                <div className="grid grid-cols-3 gap-1">
                  {(['left', 'up', 'right'] as FlickDirection[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setFlickDir(d)}
                      className={`py-1.5 rounded text-xs font-bold border ${
                        flickDir === d
                          ? 'bg-pink-500/25 border-pink-400 text-pink-200'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      {d === 'left' ? '↖' : d === 'right' ? '↗' : '↑'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tool === 'slide' && (
              <div>
                <div className="text-[11px] text-slate-400 mb-1">Кривая слайда</div>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'sine', label: 'S-кривая' },
                      { id: 'linear', label: 'Прямая' },
                      { id: 'in', label: 'Плавн. старт' },
                      { id: 'out', label: 'Плавн. финиш' },
                    ] as Array<{ id: SlideEase; label: string }>
                  ).map((es) => (
                    <button
                      key={es.id}
                      onClick={() => setSlideEase(es.id)}
                      className={`py-1.5 rounded text-[11px] font-bold border ${
                        slideEase === es.id
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      {es.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Grid Snap & Zoom */}
          <div className="space-y-3 border-t border-white/10 pt-3">
            <div>
              <div className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                <Magnet className="w-3 h-3" /> Привязка сетки
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 4, 6, 8, 12].map((d) => (
                  <button
                    key={d}
                    onClick={() => setSnapDiv(d)}
                    className={`py-1 rounded text-xs font-mono border ${
                      snapDiv === d
                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    1/{d * 4}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Масштаб</span>
                <span className="font-mono text-slate-300">{zoomPxPerBeat}px</span>
              </div>
              <input
                type="range"
                min={36}
                max={180}
                value={zoomPxPerBeat}
                onChange={(e) => setZoomPxPerBeat(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          {/* Selected Note Inspector */}
          {selectedNote && (
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="text-[11px] font-bold text-cyan-300 uppercase">Выбранная нота</div>
              <div className="flex gap-1.5">
                <button
                  onClick={() =>
                    updateSelectedNote((n) => ({ ...n, critical: !n.critical }))
                  }
                  className="flex-1 py-1.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-semibold"
                >
                  {selectedNote.critical ? 'Обычная' : 'Золотая'}
                </button>
                <button
                  onClick={() => {
                    pushHistory(notes.filter((n) => n.id !== selectedNote.id));
                    setSelectedId(null);
                  }}
                  className="p-1.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-200"
                  title="Удалить (Del)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {selectedNote.type === 'slide' && (
                <button
                  onClick={() =>
                    updateSelectedNote((n) =>
                      n.type === 'slide'
                        ? { ...n, endFlick: n.endFlick ? null : 'up' }
                        : n
                    )
                  }
                  className="w-full py-1.5 rounded bg-pink-500/20 border border-pink-400/40 text-pink-200 text-xs font-semibold"
                >
                  {selectedNote.endFlick ? 'Убрать Flick в конце' : 'Добавить Flick в конце'}
                </button>
              )}
            </div>
          )}

          <div className="mt-auto text-[11px] text-slate-400 leading-relaxed border-t border-white/10 pt-2">
            ЛКМ по дорожке — поставить ноту. ПКМ по ноте — удалить. Клик слева от дорожки — перемотать музыку.
          </div>
        </div>

        {/* Center Timeline Canvas */}
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            onWheel={handleWheel}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                touchScrollYRef.current = e.touches[0].clientY;
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1 && touchScrollYRef.current !== null) {
                const dy = e.touches[0].clientY - touchScrollYRef.current;
                touchScrollYRef.current = e.touches[0].clientY;
                const next = Math.max(0, Math.min(maxBeat, scrollBeatRef.current + dy / zoomPxPerBeat));
                scrollBeatRef.current = next;
                setScrollBeat(next);
              }
            }}
            onTouchEnd={() => {
              touchScrollYRef.current = null;
            }}
            onClick={handleCanvasClick}
            onDoubleClick={() => {
              if (tool === 'slide' && draftSlidePts.length >= 2) finishDraftSlide();
            }}
            onContextMenu={handleCanvasContextMenu}
            className="w-full h-full block cursor-crosshair touch-none"
          />
          {/* Floating Bottom Transport Bar (responsive) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] px-3 sm:px-4 py-2 rounded-2xl bg-[#151936]/95 border border-white/15 shadow-xl flex flex-wrap items-center justify-center gap-2 sm:gap-3 backdrop-blur-md">
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 flex items-center justify-center hover:brightness-110 transition"
              title="Старт / Пауза (Space)"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            <div className="font-mono text-xs text-slate-200 w-24 text-center">
              {currentTime.toFixed(2)}s / {audioBuffer.duration.toFixed(1)}s
            </div>
            <div className="flex items-center gap-1">
              {[0.5, 0.75, 1.0].map((r) => (
                <button
                  key={r}
                  onClick={() => setPlaybackRate(r)}
                  className={`px-2 py-1 rounded text-xs font-mono ${
                    playbackRate === r ? 'bg-cyan-400/25 text-cyan-200' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
            <button
              onClick={() => setMetronomeOn((m) => !m)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                metronomeOn
                  ? 'bg-amber-400/20 border-amber-400/50 text-amber-200'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              Метроном
            </button>
            <button
              onClick={() => setHitPreviewOn((h) => !h)}
              className={`p-1.5 rounded-lg border ${
                hitPreviewOn
                  ? 'bg-cyan-400/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
              title="Звуки нот при проигрывании"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Song & Auto-Gen Panel (drawer on mobile, docked on PC) */}
        <div
          className={`${
            mobilePanel === 'timing'
              ? 'flex absolute right-0 top-0 bottom-0 z-30 shadow-2xl'
              : 'hidden'
          } lg:flex lg:static pjsk-editor-sidebar w-64 bg-[#121630] border-l border-white/10 p-3 flex-col gap-4 overflow-y-auto shrink-0`}
        >
          <div className="space-y-2.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Тайминг песни
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[11px] text-slate-400 block mb-1">BPM</label>
                <input
                  type="number"
                  step="0.5"
                  min={40}
                  max={300}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value) || 120)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-sm font-mono"
                />
              </div>
              <button
                onClick={handleTapBpm}
                className="mt-5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold"
                title="Нажимайте в ритм музыки"
              >
                Tap BPM
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Offset (мс)</label>
                <input
                  type="number"
                  step="10"
                  value={offsetMs}
                  onChange={(e) => setOffsetMs(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Уровень</label>
                <input
                  type="number"
                  min={1}
                  max={38}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 15)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Auto-Generate Draft */}
          <div className="border-t border-white/10 pt-3 space-y-2.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Автогенерация по аудио
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Плотность нот</span>
                <span className="font-mono text-cyan-300">{Math.round(autoDensity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.5}
                step={0.05}
                value={autoDensity}
                onChange={(e) => setAutoDensity(Number(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>
            <button
              onClick={handleAutoDetectTiming}
              className="w-full py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5 transition"
              title="Пересчитать точный BPM и Offset Beat-0 по аудиодорожке"
            >
              <Sparkles className="w-3.5 h-3.5" /> Авто BPM и Offset
            </button>
            <button
              onClick={handleAutoGenerate}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-pink-500/80 to-purple-500/80 hover:brightness-110 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
            >
              <Wand2 className="w-3.5 h-3.5" /> Сгенерировать черновик
            </button>
          </div>

          {/* Import / Export */}
          <div className="border-t border-white/10 pt-3 space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Импорт / Экспорт (.usc / .sus)
            </div>
            <input
              ref={fileImportRef}
              type="file"
              accept=".json,.usc,.sus"
              onChange={handleImportChart}
              className="hidden"
            />
            <button
              onClick={() => fileImportRef.current?.click()}
              className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Импорт чарта (.sus/.usc/.json)
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() =>
                  downloadFile(
                    `${song.title}_${difficulty}.json`,
                    exportChartAsJSON({ difficulty, level, notes }, song.title, bpm, offsetMs)
                  )
                }
                className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center justify-center gap-1"
              >
                <Download className="w-3 h-3" /> .JSON
              </button>
              <button
                onClick={() =>
                  downloadFile(
                    `${song.title}_${difficulty}.usc`,
                    exportUSC({ difficulty, level, notes }, bpm, offsetMs)
                  )
                }
                className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center justify-center gap-1"
              >
                <Download className="w-3 h-3" /> .USC
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              if (confirm('Очистить все ноты на этой сложности?')) {
                pushHistory([]);
              }
            }}
            className="mt-auto py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-xs font-semibold"
          >
            Очистить дорожку
          </button>
        </div>
      </div>
    </div>
  );
};
