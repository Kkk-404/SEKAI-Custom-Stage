import {
  BpmChange,
  Chart,
  ChartNote,
  Difficulty,
  FlickDirection,
  SlideEase,
  SlidePoint,
  uid,
} from '../types/game';

export interface ImportedChartData {
  bpm?: number;
  bpmChanges?: BpmChange[];
  offsetMs?: number;
  notes: ChartNote[];
}

// ======================================================
// 1. Native JSON Export / Import
// ======================================================
export function exportChartAsJSON(chart: Chart, songTitle: string, bpm: number, offsetMs: number): string {
  return JSON.stringify(
    {
      format: 'sekai-custom-stage-v1',
      title: songTitle,
      bpm,
      offsetMs,
      difficulty: chart.difficulty,
      level: chart.level,
      notes: chart.notes,
    },
    null,
    2
  );
}

// ======================================================
// 2. USC (Untitled Score Chart) Import / Export
// ======================================================
interface UscObject {
  type: string;
  beat?: number;
  bpm?: number;
  lane?: number;
  size?: number;
  critical?: boolean;
  trace?: boolean;
  direction?: 'up' | 'left' | 'right' | 'none';
  connections?: Array<{
    type: 'start' | 'tick' | 'attach' | 'end';
    beat: number;
    lane: number;
    size: number;
    ease?: 'linear' | 'in' | 'out';
    critical?: boolean;
    direction?: 'up' | 'left' | 'right' | 'none';
    judgeType?: string;
  }>;
}

function uscLaneTo011(uscLane: number, uscSize: number): { lane: number; width: number } {
  // USC lane is center in [-6..+6], size is half-width (e.g. 1.5 => width 3)
  const width = Math.max(1, Math.min(12, Math.round(uscSize * 2)));
  const leftEdge = Math.round(uscLane - width / 2 + 6);
  const lane = Math.max(0, Math.min(12 - width, leftEdge));
  return { lane, width };
}

function lane011ToUsc(lane: number, width: number): { uscLane: number; uscSize: number } {
  const uscSize = width / 2;
  const uscLane = lane + uscSize - 6;
  return { uscLane, uscSize };
}

export function importUSC(text: string): ImportedChartData {
  const parsed = JSON.parse(text);
  const root = parsed.usc ? parsed.usc : parsed;
  const offsetMs = typeof root.offset === 'number' ? Math.round(root.offset * 1000) : 0;
  const objects: UscObject[] = Array.isArray(root.objects) ? root.objects : [];

  let baseBpm = 120;
  const bpmChanges: BpmChange[] = [];
  const notes: ChartNote[] = [];

  for (const obj of objects) {
    if (obj.type === 'bpm' && typeof obj.bpm === 'number') {
      const b = obj.beat ?? 0;
      if (b === 0) {
        baseBpm = obj.bpm;
      } else {
        bpmChanges.push({ beat: b, bpm: obj.bpm });
      }
    } else if (obj.type === 'single' && typeof obj.beat === 'number') {
      const { lane, width } = uscLaneTo011(obj.lane ?? 0, obj.size ?? 1.5);
      const dir = obj.direction && obj.direction !== 'none' ? obj.direction : null;
      if (dir) {
        notes.push({
          id: uid('fl'),
          type: 'flick',
          beat: obj.beat,
          lane,
          width,
          critical: Boolean(obj.critical),
          direction: dir,
        });
      } else if (obj.trace) {
        notes.push({
          id: uid('tr'),
          type: 'trace',
          beat: obj.beat,
          lane,
          width,
          critical: Boolean(obj.critical),
        });
      } else {
        notes.push({
          id: uid('tp'),
          type: 'tap',
          beat: obj.beat,
          lane,
          width,
          critical: Boolean(obj.critical),
        });
      }
    } else if (obj.type === 'slide' && Array.isArray(obj.connections) && obj.connections.length >= 2) {
      const pts: SlidePoint[] = obj.connections.map((c, idx) => {
        const { lane, width } = uscLaneTo011(c.lane ?? 0, c.size ?? 1.5);
        const kind: SlidePoint['kind'] =
          idx === 0
            ? 'start'
            : idx === obj.connections!.length - 1
            ? 'end'
            : c.type === 'attach'
            ? 'attach'
            : 'tick';
        const ease: SlideEase = c.ease === 'in' || c.ease === 'out' ? c.ease : 'linear';
        return {
          id: uid('sp'),
          beat: c.beat,
          lane,
          width,
          ease,
          kind,
        };
      });
      pts.sort((a, b) => a.beat - b.beat);
      const lastConn = obj.connections[obj.connections.length - 1];
      const endFlick: FlickDirection | null =
        lastConn?.direction && lastConn.direction !== 'none' ? lastConn.direction : null;

      notes.push({
        id: uid('sl'),
        type: 'slide',
        critical: Boolean(obj.critical),
        points: pts,
        endFlick,
      });
    }
  }

  return {
    bpm: baseBpm,
    bpmChanges: bpmChanges.length > 0 ? bpmChanges : undefined,
    offsetMs,
    notes,
  };
}

export function exportUSC(chart: Chart, bpm: number, offsetMs: number): string {
  const objects: UscObject[] = [{ type: 'bpm', beat: 0, bpm }];

  for (const n of chart.notes) {
    if (n.type === 'tap') {
      const { uscLane, uscSize } = lane011ToUsc(n.lane, n.width);
      objects.push({
        type: 'single',
        beat: n.beat,
        lane: uscLane,
        size: uscSize,
        critical: n.critical,
      });
    } else if (n.type === 'trace') {
      const { uscLane, uscSize } = lane011ToUsc(n.lane, n.width);
      objects.push({
        type: 'single',
        beat: n.beat,
        lane: uscLane,
        size: uscSize,
        critical: n.critical,
        trace: true,
      });
    } else if (n.type === 'flick') {
      const { uscLane, uscSize } = lane011ToUsc(n.lane, n.width);
      objects.push({
        type: 'single',
        beat: n.beat,
        lane: uscLane,
        size: uscSize,
        critical: n.critical,
        direction: n.direction,
      });
    } else if (n.type === 'slide') {
      objects.push({
        type: 'slide',
        critical: n.critical,
        connections: n.points.map((p, idx) => {
          const { uscLane, uscSize } = lane011ToUsc(p.lane, p.width);
          const isEnd = idx === n.points.length - 1;
          return {
            type: p.kind,
            beat: p.beat,
            lane: uscLane,
            size: uscSize,
            ease: p.ease === 'sine' ? 'in' : p.ease,
            critical: n.critical,
            ...(isEnd && n.endFlick ? { direction: n.endFlick } : {}),
          };
        }),
      });
    }
  }

  return JSON.stringify(
    {
      usc: {
        offset: offsetMs / 1000,
        objects,
      },
      version: 2,
    },
    null,
    2
  );
}

// ======================================================
// 3. SUS (Sliding Universal Score) Importer
// ======================================================
export function importSUS(text: string): ImportedChartData {
  const lines = text.split(/\r?\n/);
  let waveOffsetSec = 0;
  const bpmDefs: Record<string, number> = {};
  let baseBpm = 120;
  const bpmChanges: BpmChange[] = [];
  const ticksPerBeat = 480;

  interface RawSusNote {
    measure: number;
    tickRatio: number; // 0..1 within measure
    lane: number; // 0..15 (2..13 are playable lanes 0..11)
    width: number;
    noteType: number;
    channel?: string;
    category: 'tap' | 'air' | 'slide' | 'bpm';
    valStr: string;
  }

  const measureLengths: Record<number, number> = {};
  const rawNotes: RawSusNote[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('#')) continue;

    if (line.startsWith('#WAVEOFFSET')) {
      const m = line.match(/#WAVEOFFSET\s+([-\d.]+)/);
      if (m) waveOffsetSec = parseFloat(m[1]) || 0;
      continue;
    }

    const bpmMatch = line.match(/^#BPM([0-9A-Za-z]{2}):\s*([\d.]+)/);
    if (bpmMatch) {
      bpmDefs[bpmMatch[1]] = parseFloat(bpmMatch[2]) || 120;
      continue;
    }

    const dataMatch = line.match(/^#(\d{3})([0-9A-Za-z]+):\s*(.+)$/);
    if (!dataMatch) continue;

    const measure = parseInt(dataMatch[1], 10);
    const header = dataMatch[2];
    const body = dataMatch[3].replace(/\s+/g, '');

    if (header === '02') {
      measureLengths[measure] = parseFloat(body) || 4;
      continue;
    }

    if (header === '08') {
      // BPM change
      const len = Math.floor(body.length / 2);
      for (let i = 0; i < len; i++) {
        const pair = body.slice(i * 2, i * 2 + 2);
        if (pair !== '00' && bpmDefs[pair]) {
          rawNotes.push({
            measure,
            tickRatio: i / Math.max(1, len),
            lane: 0,
            width: 0,
            noteType: 0,
            category: 'bpm',
            valStr: String(bpmDefs[pair]),
          });
        }
      }
      continue;
    }

    const len = Math.floor(body.length / 2);
    if (len === 0) continue;

    // 1x = Tap, 3xy = Slide, 5x = Air (Flick/Critical modifier)
    const kindChar = header[0];
    const laneChar = header[1];
    const lane = parseInt(laneChar, 36);
    const channel = header.length >= 3 ? header[2] : undefined;

    for (let i = 0; i < len; i++) {
      const pair = body.slice(i * 2, i * 2 + 2);
      if (pair === '00') continue;
      const nType = parseInt(pair[0], 36);
      const width = parseInt(pair[1], 36);
      if (isNaN(nType) || isNaN(width) || width <= 0) continue;

      rawNotes.push({
        measure,
        tickRatio: i / len,
        lane,
        width,
        noteType: nType,
        channel,
        category: kindChar === '1' ? 'tap' : kindChar === '5' ? 'air' : kindChar === '3' ? 'slide' : 'tap',
        valStr: pair,
      });
    }
  }

  // Compute measure start beats
  const maxMeasure = Math.max(
    0,
    ...rawNotes.map((r) => r.measure),
    ...Object.keys(measureLengths).map((k) => parseInt(k, 10))
  );
  const measureStartBeat: number[] = [0];
  for (let m = 0; m <= maxMeasure; m++) {
    const beatsInM = measureLengths[m] ?? 4;
    measureStartBeat[m + 1] = measureStartBeat[m] + beatsInM;
  }

  const getBeat = (m: number, ratio: number) => {
    const beatsInM = measureLengths[m] ?? 4;
    return Math.round((measureStartBeat[m] + ratio * beatsInM) * ticksPerBeat) / ticksPerBeat;
  };

  // Extract BPMs
  const bpmItems = rawNotes
    .filter((r) => r.category === 'bpm')
    .map((r) => ({ beat: getBeat(r.measure, r.tickRatio), bpm: parseFloat(r.valStr) }))
    .sort((a, b) => a.beat - b.beat);

  if (bpmItems.length > 0) {
    baseBpm = bpmItems[0].bpm;
    for (let i = 1; i < bpmItems.length; i++) {
      if (bpmItems[i].beat > 0) bpmChanges.push(bpmItems[i]);
    }
  } else if (Object.values(bpmDefs).length > 0) {
    baseBpm = Object.values(bpmDefs)[0];
  }

  // Air modifiers map: key = `${beat}_${lane}_${width}`
  const airMap = new Map<string, number>();
  for (const r of rawNotes) {
    if (r.category === 'air') {
      const b = getBeat(r.measure, r.tickRatio);
      airMap.set(`${b.toFixed(3)}_${r.lane}_${r.width}`, r.noteType);
    }
  }

  const notes: ChartNote[] = [];
  const slideGroups = new Map<string, Array<RawSusNote & { beat: number }>>();

  for (const r of rawNotes) {
    if (r.lane < 2 || r.lane > 13) continue; // playable PJSK lanes are 2..13 -> 0..11
    const beat = getBeat(r.measure, r.tickRatio);
    const playLane = Math.max(0, Math.min(11, r.lane - 2));
    const width = Math.max(1, Math.min(12 - playLane, r.width));

    if (r.category === 'tap') {
      const airType = airMap.get(`${beat.toFixed(3)}_${r.lane}_${r.width}`) ?? 0;
      const critical = r.noteType === 2;
      let flickDir: FlickDirection | null = null;
      if (airType === 1 || airType === 2 || airType === 5) flickDir = 'up';
      else if (airType === 3) flickDir = 'left';
      else if (airType === 4) flickDir = 'right';

      if (flickDir) {
        notes.push({
          id: uid('fl'),
          type: 'flick',
          beat,
          lane: playLane,
          width,
          critical,
          direction: flickDir,
        });
      } else {
        notes.push({
          id: uid('tp'),
          type: 'tap',
          beat,
          lane: playLane,
          width,
          critical,
        });
      }
    } else if (r.category === 'slide' && r.channel) {
      const list = slideGroups.get(r.channel) ?? [];
      list.push({ ...r, beat });
      slideGroups.set(r.channel, list);
    }
  }

  // Group slides into start..end sequences
  for (const [, pts] of slideGroups) {
    pts.sort((a, b) => a.beat - b.beat);
    let currentPts: SlidePoint[] = [];
    let endFlick: FlickDirection | null = null;

    for (const p of pts) {
      const playLane = Math.max(0, Math.min(11, p.lane - 2));
      const width = Math.max(1, Math.min(12 - playLane, p.width));
      const airType = airMap.get(`${p.beat.toFixed(3)}_${p.lane}_${p.width}`) ?? 0;

      if (p.noteType === 1) {
        // Start of slide
        currentPts = [
          {
            id: uid('sp'),
            beat: p.beat,
            lane: playLane,
            width,
            ease: 'linear',
            kind: 'start',
          },
        ];
        endFlick = null;
      } else if (p.noteType === 2 && currentPts.length > 0) {
        // End of slide
        currentPts.push({
          id: uid('sp'),
          beat: p.beat,
          lane: playLane,
          width,
          ease: 'linear',
          kind: 'end',
        });
        if (airType === 1 || airType === 5) endFlick = 'up';
        else if (airType === 3) endFlick = 'left';
        else if (airType === 4) endFlick = 'right';

        notes.push({
          id: uid('sl'),
          type: 'slide',
          critical: false,
          points: currentPts,
          endFlick,
        });
        currentPts = [];
      } else if ((p.noteType === 3 || p.noteType === 5) && currentPts.length > 0) {
        currentPts.push({
          id: uid('sp'),
          beat: p.beat,
          lane: playLane,
          width,
          ease: 'linear',
          kind: p.noteType === 5 ? 'attach' : 'tick',
        });
      }
    }
  }

  return {
    bpm: baseBpm,
    bpmChanges: bpmChanges.length > 0 ? bpmChanges : undefined,
    offsetMs: Math.round(-waveOffsetSec * 1000),
    notes,
  };
}

export function parseAnyChartFile(
  filename: string,
  content: string
): { chart?: Chart; imported: ImportedChartData } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.sus')) {
    return { imported: importSUS(content) };
  }
  const parsed = JSON.parse(content);
  if (parsed.usc || Array.isArray(parsed.objects)) {
    return { imported: importUSC(content) };
  }
  if (parsed.format === 'sekai-custom-stage-v1' && Array.isArray(parsed.notes)) {
    const diff: Difficulty = parsed.difficulty ?? 'expert';
    return {
      chart: {
        difficulty: diff,
        level: parsed.level ?? 25,
        notes: parsed.notes,
      },
      imported: {
        bpm: parsed.bpm,
        offsetMs: parsed.offsetMs,
        notes: parsed.notes,
      },
    };
  }
  throw new Error('Неизвестный формат чарта. Поддерживаются .json, .usc и .sus');
}
