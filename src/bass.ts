// Bassline generation: genre patterns of note *roles* resolved against the harmony.
import { SCALES } from "./music/theory.ts";
import type { Key, Segment } from "./analysis.ts";

export interface BassNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

/**
 * A one-bar, 16-step pattern. Each hit is a role, resolved per chord:
 *   R root   O octave   F fifth   T third   S seventh
 *   A approach: a semitone into the next chord's root
 *   P passing: a scale tone between this root and the next
 *   lowercase = ghost note   - hold the previous note   . rest
 */
export interface BassPattern {
  id: string;
  label: string;
  group: string;
  bar: string;
}

export const BASS_PATTERNS: BassPattern[] = [
  { id: "dub-sub", label: "sub on the one", group: "dub", bar: "R-------........" },
  { id: "dub-drone", label: "held sub", group: "dub", bar: "R---------------" },
  { id: "dub-steppers", label: "steppers", group: "dub", bar: "R--.R--.R--.R--." },
  { id: "dub-syncopated", label: "syncopated sub", group: "dub", bar: "R-----r-..R-----" },

  { id: "house-offbeat", label: "offbeat", group: "house", bar: "..R-..R-..R-..R-" },
  { id: "house-octave", label: "offbeat octaves", group: "house", bar: "..R-..O-..R-..O-" },
  { id: "deep-roll", label: "deep roll", group: "house", bar: "R..R..R...R..O.A" },
  { id: "classic-walk", label: "walking", group: "house", bar: "R..R..F.O..R..P." },
  { id: "classic-pump", label: "8th pump", group: "house", bar: "R.r.R.r.R.r.R.r." },

  { id: "detroit-8ths", label: "rolling 8ths", group: "detroit", bar: "R.R.O.R.R.R.O.R." },
  { id: "detroit-syncopated", label: "syncopated", group: "detroit", bar: "R..R..O.R..R..F." },

  { id: "techno-roll", label: "rolling 16ths", group: "techno", bar: ".RRR.RRR.RRR.RRR" },
  { id: "techno-gallop", label: "gallop", group: "techno", bar: "..RR..RR..RR..RR" },
  { id: "techno-octave-roll", label: "octave roll", group: "techno", bar: ".ROR.ROR.ROR.ROR" },
  { id: "techno-offbeat", label: "offbeat 8ths", group: "techno", bar: "..R...R...R...R." },

  { id: "roots", label: "roots", group: "simple", bar: "R---------------" },
  { id: "root-fifth", label: "root and fifth", group: "simple", bar: "R---F---R---F---" },
  { id: "quarters", label: "quarters", group: "simple", bar: "R--.R--.R--.R--." },
];

const BAR = /^[ROFTSAProftsap.\-]{16}$/;
const CUSTOM = "custom:";
export const customPattern = (bar: string) => CUSTOM + bar;
export const isPattern = (id: string) =>
  id.startsWith(CUSTOM) ? BAR.test(id.slice(CUSTOM.length)) : BASS_PATTERNS.some((p) => p.id === id);

/** One bar of any pattern id (built-in or custom) as 16 role steps. */
export function barOf(id: string): string {
  if (id.startsWith(CUSTOM) && BAR.test(id.slice(CUSTOM.length))) return id.slice(CUSTOM.length);
  return (BASS_PATTERNS.find((p) => p.id === id) ?? BASS_PATTERNS[0]).bar;
}

/** Root register: the bass root sits in [low, low + 11]. MIDI pitch; Live calls 36 "C1". */
export const REGISTERS = { sub: 28, low: 33, mid: 40 } as const;
export type Register = keyof typeof REGISTERS;

export interface BassSettings {
  pattern: string;
  register: Register;
  /** 0–100: octave swaps, fifths and ghost notes. */
  variation: number;
  /** Lead into each chord change with an approach note. */
  approach: boolean;
  /** Fill the last two beats to lead back to the top of the loop. */
  turnaround: boolean;
  /** Chord changes land a 16th early. */
  push: boolean;
  /** 16th swing, 50 = straight. */
  swing: number;
}

/** Bass defaults per chord-progressions style id. */
export const BASS_DEFAULTS: Record<string, BassSettings> = {
  "dub-techno": { pattern: "dub-sub", register: "sub", variation: 15, approach: false, turnaround: false, push: false, swing: 50 },
  "deep-house": { pattern: "house-octave", register: "low", variation: 35, approach: true, turnaround: true, push: true, swing: 58 },
  "classic-house": { pattern: "classic-walk", register: "low", variation: 30, approach: true, turnaround: true, push: true, swing: 54 },
  detroit: { pattern: "detroit-8ths", register: "low", variation: 30, approach: true, turnaround: false, push: false, swing: 50 },
  hypnotic: { pattern: "techno-roll", register: "sub", variation: 15, approach: false, turnaround: false, push: false, swing: 50 },
  functional: { pattern: "root-fifth", register: "low", variation: 20, approach: true, turnaround: true, push: false, swing: 50 },
};

export type Rng = () => number;

/** Small seeded PRNG so a given seed always gives the same variation. */
export function seeded(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const STEP = 0.25;
const GATE = 0.02;
const NORMAL = 100;
const GHOST = 64;

function segmentAt(segments: Segment[], t: number, length: number): Segment {
  const time = ((t % length) + length) % length;
  return segments.find((s) => time >= s.start - 1e-9 && time < s.end - 1e-9) ?? segments[segments.length - 1];
}

function rootPitch(pc: number, register: Register): number {
  const low = REGISTERS[register];
  return low + ((pc - (low % 12) + 12) % 12);
}

const fifthOf = (tones: number[]) => (tones.includes(7) ? 7 : tones.includes(6) ? 6 : tones.includes(8) ? 8 : 7);
const thirdOf = (tones: number[]) => (tones.includes(4) ? 4 : tones.includes(3) ? 3 : fifthOf(tones));
const seventhOf = (tones: number[], minorKey: boolean) =>
  tones.includes(10) ? 10 : tones.includes(11) ? 11 : minorKey ? 10 : 12;

/** A semitone into `target`, from below unless that leaves the register. */
function approachInto(target: number, register: Register): number {
  return target - 1 >= REGISTERS[register] - 2 ? target - 1 : target + 1;
}

/** The scale tone nearest the midpoint between two pitches (excluding both). */
function passing(from: number, to: number, keyRoot: number, intervals: number[]): number {
  const inScale = (p: number) => intervals.includes((((p - keyRoot) % 12) + 12) % 12);
  const mid = (from + to) / 2;
  let best = from + (to >= from ? 2 : -2);
  let dist = Infinity;
  for (let p = Math.min(from, to) - 2; p <= Math.max(from, to) + 2; p++) {
    if (p === from || p === to || !inScale(p)) continue;
    if (Math.abs(p - mid) < dist) {
      dist = Math.abs(p - mid);
      best = p;
    }
  }
  return best;
}

interface Hit { at: number; len: number; role: string }

function parse(bar: string): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < 16; i++) {
    const c = bar[i];
    if (c === ".") continue;
    if (c === "-") {
      const last = hits[hits.length - 1];
      if (last && last.at + last.len === i) last.len++;
      continue;
    }
    hits.push({ at: i, len: 1, role: c });
  }
  return hits;
}

/** Generate a monophonic bassline over `segments` for a clip `length` beats long. */
export function generateBass(
  segments: Segment[],
  length: number,
  key: Key,
  settings: BassSettings,
  seed = 1,
): BassNote[] {
  if (!segments.length || length <= 0) return [];
  const rng = seeded(seed);
  const intervals = SCALES[key.scale] ?? SCALES.Minor;
  const minorKey = intervals.includes(3) && !intervals.includes(4);
  const hits = parse(barOf(settings.pattern));
  const v = Math.max(0, Math.min(100, settings.variation)) / 100;
  const out: (BassNote & { role: string })[] = [];

  // Every hit in time order, so A/P can look ahead to the next one.
  const timeline: { t: number; hit: Hit }[] = [];
  for (let barStart = 0; barStart < length; barStart += 4) {
    for (const hit of hits) {
      const t = barStart + hit.at * STEP;
      if (t < length - 1e-9) timeline.push({ t, hit });
    }
  }

  timeline.forEach(({ t, hit }, i) => {
    const seg = segmentAt(segments, t, length);
    const root = rootPitch(seg.root, settings.register);
    const nextT = i + 1 < timeline.length ? timeline[i + 1].t : length + (timeline[0]?.t ?? 0);
    const next = segmentAt(segments, nextT, length);
    const nextRoot = rootPitch(next.root, settings.register);
    const role = hit.role.toUpperCase();
    let pitch: number;
    switch (role) {
      case "O": pitch = root + 12; break;
      case "F": pitch = root + fifthOf(seg.tones); break;
      case "T": pitch = root + thirdOf(seg.tones); break;
      case "S": pitch = root + seventhOf(seg.tones, minorKey); break;
      case "A": pitch = next.root !== seg.root ? approachInto(nextRoot, settings.register) : passing(root, root + 12, key.root, intervals); break;
      case "P": pitch = next.root !== seg.root ? passing(root, nextRoot, key.root, intervals) : root + fifthOf(seg.tones); break;
      default: pitch = root;
    }
    const ghost = hit.role !== role;
    const onBeat = hit.at % 4 === 0;

    // Variation: octave swaps and fifths off the beat (never on the 1 of a chord).
    let r = role;
    if (!onBeat && (role === "R" || role === "O") && t !== seg.start) {
      const x = rng();
      if (x < 0.3 * v) { pitch = role === "R" ? root + 12 : root; r = role === "R" ? "O" : "R"; }
      else if (x < 0.45 * v) { pitch = root + fifthOf(seg.tones); r = "F"; }
    }
    out.push({
      pitch,
      startTime: t,
      duration: hit.len * STEP - (hit.len >= 4 ? GATE : GATE + 0.02),
      velocity: ghost ? GHOST : onBeat ? NORMAL + 8 : NORMAL,
      role: r,
    });
  });

  // Ghost notes in the gaps, more with more variation.
  if (v > 0) {
    const taken = new Set(out.map((n) => Math.round(n.startTime / STEP)));
    for (const n of [...out]) {
      const step = Math.round(n.startTime / STEP) + 1;
      const t = step * STEP;
      if (t >= length || taken.has(step) || n.duration > STEP + 1e-9 || step % 4 === 0) continue;
      if (rng() < 0.22 * v) {
        out.push({ pitch: n.pitch, startTime: t, duration: STEP * 0.6, velocity: GHOST - 6, role: "g" });
        taken.add(step);
      }
    }
  }

  let notes: BassNote[] = out.sort((a, b) => a.startTime - b.startTime);

  // Held notes never ring over a chord change: re-strike them on the new root.
  const changes = segments.map((s) => s.start).filter((s) => s > 0);
  notes = notes.flatMap((n) => {
    const parts: BassNote[] = [];
    let cur = { ...n };
    for (const c of changes) {
      if (cur.startTime < c - 1e-9 && cur.startTime + cur.duration > c + 1e-9) {
        const seg = segmentAt(segments, c, length);
        const shift = rootPitch(seg.root, settings.register) - rootPitch(segmentAt(segments, cur.startTime, length).root, settings.register);
        parts.push({ ...cur, duration: c - cur.startTime - GATE });
        cur = { ...cur, startTime: c, duration: cur.startTime + cur.duration - c, pitch: cur.pitch + shift, velocity: NORMAL };
      }
    }
    parts.push(cur);
    return parts;
  });

  // Approach notes into chord changes (and back to the top, with the turnaround).
  const approachTargets = [...changes.filter((c) => segmentAt(segments, c, length).root !== segmentAt(segments, c - 0.01, length).root)];
  if (settings.turnaround && segments[0].root !== segmentAt(segments, length - 0.01, length).root) approachTargets.push(length);
  if (settings.approach) {
    for (const c of approachTargets) {
      const target = rootPitch(segmentAt(segments, c, length).root, settings.register);
      const before = notes.filter((n) => n.startTime >= c - 1 - 1e-9 && n.startTime < c - 1e-9);
      const pitch = approachInto(target, settings.register);
      if (before.length) {
        const last = before[before.length - 1];
        last.pitch = pitch;
        last.duration = Math.min(last.duration, c - last.startTime - GATE);
      } else {
        notes.push({ pitch, startTime: c - STEP, duration: STEP - GATE, velocity: 84 });
      }
    }
  }

  // Turnaround: the last two beats become a short run leading back to the 1.
  if (settings.turnaround && length >= 4) {
    const from = length - 2;
    const seg = segmentAt(segments, from, length);
    const root = rootPitch(seg.root, settings.register);
    const home = rootPitch(segments[0].root, settings.register);
    notes = notes.filter((n) => n.startTime < from - 1e-9);
    const run = [root, root + 12, root + fifthOf(seg.tones), approachInto(home, settings.register)];
    run.forEach((pitch, i) => notes.push({ pitch, startTime: from + i * 0.5, duration: 0.5 - GATE - 0.02, velocity: i === 0 ? NORMAL + 8 : NORMAL - 6 }));
  }

  // Swing: delay the 2nd and 4th 16th of each beat.
  const delay = ((settings.swing ?? 50) / 100 - 0.5) * 0.5;
  if (delay) for (const n of notes) if (Math.abs((n.startTime % 0.5) - 0.25) < 1e-6) n.startTime += delay;

  // Push: notes on a chord change (after the first) land a 16th early.
  if (settings.push) {
    for (const c of changes) {
      for (const n of notes) {
        if (Math.abs(n.startTime - c) < 1e-6) {
          n.startTime -= STEP;
          n.duration += STEP;
        }
      }
    }
  }

  // Monophonic: each note ends where the next begins; nothing past the clip.
  notes.sort((a, b) => a.startTime - b.startTime || b.velocity - a.velocity);
  const mono: BassNote[] = [];
  for (const n of notes) {
    const prev = mono[mono.length - 1];
    if (prev && Math.abs(prev.startTime - n.startTime) < 1e-6) continue; // first wins at the same time
    if (prev && prev.startTime + prev.duration > n.startTime) prev.duration = n.startTime - prev.startTime - 0.01;
    mono.push({ ...n, duration: Math.min(n.duration, length - n.startTime) });
  }
  return mono.filter((n) => n.duration > 0.01 && n.startTime >= 0 && n.startTime < length);
}
