import { ChartNote, SlideEase, SlideNote, SlidePoint } from '../types/game';

function easeValue(t: number, ease: SlideEase): number {
  const c = Math.max(0, Math.min(1, t));
  if (ease === 'in') return c * c;
  if (ease === 'out') return 1 - (1 - c) * (1 - c);
  if (ease === 'sine') return 0.5 - 0.5 * Math.cos(Math.PI * c);
  return c;
}

function sortedSlidePoints(slide: SlideNote): SlidePoint[] {
  return [...slide.points].sort((a, b) => a.beat - b.beat);
}

export function getSlideRangeAtBeat(
  pts: SlidePoint[],
  beat: number
): { lane: number; width: number } {
  if (pts.length === 0) return { lane: 0, width: 3 };
  const startBeat = pts[0].beat;
  const endBeat = pts[pts.length - 1].beat;
  const clamped = Math.max(startBeat, Math.min(endBeat, beat));

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (clamped >= a.beat && clamped <= b.beat) {
      const dur = Math.max(0.0001, b.beat - a.beat);
      const f = easeValue((clamped - a.beat) / dur, a.ease);
      return {
        lane: a.lane + (b.lane - a.lane) * f,
        width: a.width + (b.width - a.width) * f,
      };
    }
  }
  const last = pts[pts.length - 1];
  return { lane: last.lane, width: last.width };
}

function lanesOverlap(l1: number, w1: number, l2: number, w2: number): boolean {
  return Math.min(l1 + w1, l2 + w2) - Math.max(l1, l2) > 0.25;
}

export function doesSpanOverlapSlide(
  beat: number,
  lane: number,
  width: number,
  slidePts: SlidePoint[],
  beatMargin = 0.14
): boolean {
  if (slidePts.length < 2) return false;
  const startBeat = slidePts[0].beat;
  const endBeat = slidePts[slidePts.length - 1].beat;
  if (beat < startBeat - beatMargin || beat > endBeat + beatMargin) return false;

  const sampleBeats = [
    Math.max(startBeat, Math.min(endBeat, beat - 0.06)),
    Math.max(startBeat, Math.min(endBeat, beat)),
    Math.max(startBeat, Math.min(endBeat, beat + 0.06)),
  ];

  for (const sb of sampleBeats) {
    const seg = getSlideRangeAtBeat(slidePts, sb);
    if (lanesOverlap(lane, width, seg.lane, seg.width)) {
      return true;
    }
  }
  return false;
}

function doSlidesOverlap(ptsA: SlidePoint[], ptsB: SlidePoint[]): boolean {
  if (ptsA.length < 2 || ptsB.length < 2) return false;
  const a0 = ptsA[0].beat;
  const a1 = ptsA[ptsA.length - 1].beat;
  const b0 = ptsB[0].beat;
  const b1 = ptsB[ptsB.length - 1].beat;
  if (b1 < a0 - 0.12 || b0 > a1 + 0.12) return false;

  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  const checks = [lo, (lo + hi) * 0.5, hi];
  for (const c of checks) {
    const ra = getSlideRangeAtBeat(ptsA, c);
    const rb = getSlideRangeAtBeat(ptsB, c);
    if (lanesOverlap(ra.lane, ra.width, rb.lane, rb.width)) {
      return true;
    }
  }
  return false;
}

/**
 * Removes duplicate same-lane single notes and any notes/overlapping slides
 * stacked directly on top of an active long slide note's lane & beat window.
 */
export function sanitizeChartNotes(notes: ChartNote[]): ChartNote[] {
  const acceptedSlides: Array<{ note: SlideNote; pts: SlidePoint[] }> = [];
  const singles: Exclude<ChartNote, SlideNote>[] = [];

  const sortedSlides = notes
    .filter((n): n is SlideNote => n.type === 'slide' && n.points.length >= 2)
    .sort((a, b) => {
      const pa = sortedSlidePoints(a);
      const pb = sortedSlidePoints(b);
      return pa[0].beat - pb[0].beat;
    });

  for (const sl of sortedSlides) {
    const pts = sortedSlidePoints(sl);
    const overlapsExisting = acceptedSlides.some((ex) => doSlidesOverlap(ex.pts, pts));
    if (!overlapsExisting) {
      acceptedSlides.push({ note: { ...sl, points: pts }, pts });
    }
  }

  const rawSingles = notes
    .filter((n): n is Exclude<ChartNote, SlideNote> => n.type !== 'slide')
    .sort((a, b) => a.beat - b.beat);

  for (const n of rawSingles) {
    // Drop any single note sitting on top of any active slide's lane/time window
    const hitsSlide = acceptedSlides.some((sl) =>
      doesSpanOverlapSlide(n.beat, n.lane, n.width, sl.pts, 0.14)
    );
    if (hitsSlide) continue;

    // Deduplicate overlapping single notes at the exact same beat & lane
    const dupIdx = singles.findIndex(
      (prev) =>
        Math.abs(prev.beat - n.beat) < 0.04 &&
        lanesOverlap(prev.lane, prev.width, n.lane, n.width)
    );
    if (dupIdx !== -1) {
      // Keep flick over tap/trace, or critical over non-critical
      const prev = singles[dupIdx];
      const rank = (x: Exclude<ChartNote, SlideNote>) =>
        (x.type === 'flick' ? 3 : x.type === 'tap' ? 2 : 1) + (x.critical ? 0.5 : 0);
      if (rank(n) > rank(prev)) {
        singles[dupIdx] = n;
      }
      continue;
    }

    singles.push(n);
  }

  return [...singles, ...acceptedSlides.map((s) => s.note)];
}
