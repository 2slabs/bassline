// Bassline generation: genre riffs of note *roles*, resolved against the harmony.
//
// The riff repeats as written. Variation doesn't scatter notes everywhere: it makes a few
// changes to the riff (in its own vocabulary) and saves the bigger change for the end of
// each 4-bar phrase, the way a player would.
import { SCALES } from "./music/theory.ts";
import type { Key, Segment } from "./analysis.ts";

export interface BassNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

/**
 * A riff of one to four bars, 16 steps per bar. Each hit is a role, resolved per chord:
 *   R root   O octave   F fifth   D fifth below   T third   S seventh
 *   B the scale step below the root (the ♭7 in minor)
 *   A approach: a semitone into the next chord's root
 *   P passing: the scale tone between the notes either side of it
 *   lowercase = soft   - hold the previous note   . rest
 */
export interface BassPattern {
  id: string;
  label: string;
  group: string;
  bar: string;
}

// Grounded in transcriptions and production write-ups (see RESEARCH.md): basslines in these
// genres are ostinatos built on space, and they change at phrase ends, not every bar.
export const BASS_PATTERNS: BassPattern[] = [
  // dub techno: sub weight and space, notes between the beats, stepwise moves around the ♭7.
  // "rising steps" follows the shape of Rhythm & Sound's "Never Tell You": a 4-bar call and response.
  { id: "dub-steps", label: "rising steps", group: "dub", bar: "....D-P-B-........R-B-R-B-..........D-P-B-..............R-B-......" },
  { id: "dub-after", label: "after the kick", group: "dub", bar: "..R---------...." },
  { id: "dub-two", label: "two notes", group: "dub", bar: "..R-------........D-------..R-.." },
  { id: "dub-tresillo", label: "dotted sub", group: "dub", bar: "R-----R-------..R-----.........." },
  { id: "dub-drone", label: "held sub", group: "dub", bar: "R---------------" },

  // deep house: syncopated two-bar phrases, root / octave / fifth / seventh, room for the kick.
  { id: "deep-sync", label: "syncopated", group: "deep house", bar: "R-.R-...O-.R......R-..R-......S-" },
  { id: "deep-lazy", label: "lazy", group: "deep house", bar: "R-----.R-.................O-.R-." },
  { id: "deep-seventh", label: "seventh lift", group: "deep house", bar: "R-.S-.O-..........R-.....R-..F-." },
  { id: "deep-offbeat", label: "offbeat octaves", group: "deep house", bar: "..R-..O-..R-..O-" },

  // classic house: offbeat pump and jacking ostinatos.
  { id: "house-jack", label: "jack", group: "house", bar: "R..R..R...R.O..." },
  { id: "house-offbeat", label: "offbeat", group: "house", bar: "..R-..R-..R-..R-" },
  { id: "house-garage", label: "garage", group: "house", bar: "..R-..R-.R..R-....R-..O-.R..S-.." },

  // detroit: "dotted 8ths" is the rhythm of Inner City's "Good Life": a chain of dotted-8th
  // repeats, the pitch moving with the chords (often a 16th early, with push).
  { id: "detroit-dotted", label: "dotted 8ths", group: "detroit", bar: "R..R..R..R..R..R.R.R..R..R.RR.R." },
  { id: "detroit-stab", label: "stabs", group: "detroit", bar: "R..R..R.........R..R..O...R..F.." },
  { id: "detroit-electro", label: "electro", group: "detroit", bar: "R..R...R..R.....R..R...O..R...F." },
  { id: "detroit-8ths", label: "offbeat 8ths", group: "detroit", bar: "..R...R.O.R...R." },

  // hypnotic techno: one note in nearly every 16th except the kick's; the odd other note,
  // and the accents (map velocity to the filter), do the moving.
  { id: "techno-roll", label: "rolling 16ths", group: "techno", bar: ".Rrr.Rrr.Rrr.Rrr.Rrr.Rrr.Rrr.ROr" },
  { id: "techno-gallop", label: "gallop", group: "techno", bar: "..Rr..Rr..Rr..Rr" },
  { id: "techno-rumble", label: "between kicks", group: "techno", bar: ".R--.R--.R--.R--" },
  { id: "techno-3", label: "3 over 4", group: "techno", bar: "..R..R.....R..R..R.....R..R..R.." },
  { id: "techno-offbeat", label: "offbeat", group: "techno", bar: "..R...R...R...R." },

  { id: "roots", label: "roots", group: "simple", bar: "R---------------" },
  { id: "root-fifth", label: "root and fifth", group: "simple", bar: "R---F---R---F---" },
  { id: "quarters", label: "quarters", group: "simple", bar: "R--.R--.R--.R--." },
];

const BAR = /^([ROFDTSBAProfdtsbap.\-]{16}){1,4}$/;
const CUSTOM = "custom:";
export const customPattern = (bar: string) => CUSTOM + bar;
export const isPattern = (id: string) =>
  id.startsWith(CUSTOM) ? BAR.test(id.slice(CUSTOM.length)) : BASS_PATTERNS.some((p) => p.id === id);

/** The riff of any pattern id (built-in or custom): 16 to 64 role steps. */
export function barOf(id: string): string {
  if (id.startsWith(CUSTOM) && BAR.test(id.slice(CUSTOM.length))) return id.slice(CUSTOM.length);
  return (BASS_PATTERNS.find((p) => p.id === id) ?? BASS_PATTERNS[0]).bar;
}

/** Root register: the bass root sits in [low, low + 11]. MIDI pitch; Live calls 36 "C1". */
export const REGISTERS = { sub: 28, low: 33, mid: 40 } as const;
export type Register = keyof typeof REGISTERS;

/** What the root follows: every chord change, only the chord on each bar, or the key (a drone). */
export type Follow = "chord" | "bar" | "drone";

export interface BassSettings {
  pattern: string;
  register: Register;
  /** 0–100: how far the riff strays, mostly at the end of each 4-bar phrase. */
  variation: number;
  follow: Follow;
  /** Lead into each chord change with an approach note. */
  approach: boolean;
  /** One pickup note at the end of the loop leading back to the top. */
  turnaround: boolean;
  /** Chord changes land a 16th early. */
  push: boolean;
  /** 16th swing, 50 = straight. */
  swing: number;
}

/** Bass defaults per chord-progressions style id. */
export const BASS_DEFAULTS: Record<string, BassSettings> = {
  "dub-techno": { pattern: "dub-steps", register: "sub", variation: 20, follow: "chord", approach: false, turnaround: false, push: false, swing: 50 },
  "deep-house": { pattern: "deep-sync", register: "low", variation: 25, follow: "chord", approach: false, turnaround: true, push: false, swing: 56 },
  "classic-house": { pattern: "house-jack", register: "low", variation: 30, follow: "chord", approach: false, turnaround: true, push: true, swing: 54 },
  detroit: { pattern: "detroit-dotted", register: "low", variation: 20, follow: "chord", approach: false, turnaround: false, push: true, swing: 50 },
  hypnotic: { pattern: "techno-roll", register: "sub", variation: 10, follow: "drone", approach: false, turnaround: false, push: false, swing: 50 },
  functional: { pattern: "root-fifth", register: "low", variation: 20, follow: "chord", approach: true, turnaround: true, push: false, swing: 50 },
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
const SOFT = 76;
const PHRASE = 64; // steps: 4 bars (8 for a 4-bar riff)

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

/** The nearest scale tone below `root` (the ♭7 in minor, the leading tone in major). */
function stepBelow(root: number, keyRoot: number, intervals: number[]): number {
  for (let p = root - 1; p >= root - 3; p--) if (intervals.includes((((p - keyRoot) % 12) + 12) % 12)) return p;
  return root - 2;
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

/** The harmony the bass follows, per the `follow` setting. */
export function followed(segments: Segment[], length: number, key: Key, follow: Follow): Segment[] {
  if (follow === "drone") {
    const iv = SCALES[key.scale] ?? SCALES.Minor;
    const tones = [0, iv.includes(3) && !iv.includes(4) ? 3 : 4, iv.includes(7) ? 7 : 6];
    return [{ start: 0, end: length, root: key.root, tones, name: "", numeral: "i" }];
  }
  if (follow === "chord" || length <= 4) return segments;
  // per bar: the chord that covers most of each bar holds for the whole bar
  const out: Segment[] = [];
  for (let b = 0; b < length; b += 4) {
    const end = Math.min(length, b + 4);
    let best = segments[0];
    let most = -1;
    for (const s of segments) {
      const overlap = Math.min(end, s.end) - Math.max(b, s.start);
      if (overlap > most + 1e-9) { most = overlap; best = s; }
    }
    const prev = out[out.length - 1];
    if (prev && prev.root === best.root) prev.end = end;
    else out.push({ ...best, start: b, end });
  }
  return out;
}

// ---- riffs as step arrays, and how they vary ------------------------------------------

type Steps = string[];

const hitsOf = (riff: Steps) => riff.flatMap((c, i) => (c !== "." && c !== "-" ? [i] : []));
const isKick = (i: number) => i % 4 === 0;

/** Remove the hit at i and its holds. */
function drop(riff: Steps, i: number) {
  riff[i] = ".";
  for (let k = i + 1; k < riff.length && riff[k] === "-"; k++) riff[k] = ".";
}

/**
 * One change to the riff, inside `from..to`, in the riff's own vocabulary:
 * swap a note to another role the riff already uses, drop a note, flip an accent,
 * or (only when `add`) put a short note into a gap that isn't on the kick.
 */
function mutate(riff: Steps, rng: Rng, vocab: string[], from: number, to: number, add: boolean, kickFree: boolean) {
  const hits = hitsOf(riff).filter((i) => i > 0 && i >= from && i < to);
  const gaps: number[] = [];
  for (let i = Math.max(1, from); i < to; i++) if (riff[i] === "." && !(kickFree && isKick(i))) gaps.push(i);
  const kinds: string[] = [];
  if (hits.length && vocab.length > 1) kinds.push("swap", "swap");
  if (hits.length > 1) kinds.push("drop");
  if (hits.length) kinds.push("accent");
  if (add && gaps.length) kinds.push("add", "add");
  if (!kinds.length) return;
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const kind = pick(kinds);
  if (kind === "swap") {
    const i = pick(hits);
    const soft = riff[i] !== riff[i].toUpperCase();
    const others = vocab.filter((r) => r !== riff[i].toUpperCase());
    const r = pick(others);
    riff[i] = soft ? r.toLowerCase() : r;
  } else if (kind === "drop") {
    drop(riff, pick(hits));
  } else if (kind === "accent") {
    const i = pick(hits);
    riff[i] = riff[i] === riff[i].toUpperCase() ? riff[i].toLowerCase() : riff[i].toUpperCase();
  } else {
    const i = pick(gaps);
    riff[i] = vocab.length > 1 && rng() < 0.5 ? pick(vocab.filter((r) => r !== "R")) : "R";
    if (i + 1 < to && riff[i + 1] === "." && rng() < 0.5) riff[i + 1] = "-";
  }
}

/**
 * The riff as played (with a few changes at higher variation) and the phrase ending
 * (the riff with its last half bar reworked), used on the last bar(s) of each 4-bar phrase.
 */
export function riffs(bar: string, variation: number, rng: Rng): { main: Steps; ending: Steps | null } {
  const v = Math.max(0, Math.min(100, variation)) / 100;
  const base = [...bar];
  const vocab = [...new Set(base.filter((c) => /[A-Za-z]/.test(c)).map((c) => c.toUpperCase()))].filter((r) => r !== "A" && r !== "P");
  if (!vocab.includes("R")) vocab.unshift("R");
  // patterns that leave the kick alone keep leaving it alone
  const kickFree = hitsOf(base).every((i) => !isKick(i));
  const main = [...base];
  const changes = Math.floor(v * 2.5 * rng() + v * 0.5);
  for (let k = 0; k < changes; k++) mutate(main, rng, vocab, 0, main.length, false, kickFree);
  if (v === 0) return { main, ending: null };
  const ending = [...main];
  const from = ending.length - 8;
  const fills = 1 + Math.floor(v * 2 * rng());
  for (let k = 0; k < fills; k++) mutate(ending, rng, vocab, from, ending.length, true, kickFree);
  return { main, ending: ending.join("") === main.join("") ? null : ending };
}

interface Hit { at: number; len: number; role: string }

function parse(riff: Steps): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < riff.length; i++) {
    const c = riff[i];
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
  harmony: Segment[],
  length: number,
  key: Key,
  settings: BassSettings,
  seed = 1,
): BassNote[] {
  if (!harmony.length || length <= 0) return [];
  const segments = followed(harmony, length, key, settings.follow ?? "chord");
  const rng = seeded(seed);
  const intervals = SCALES[key.scale] ?? SCALES.Minor;
  const minorKey = intervals.includes(3) && !intervals.includes(4);
  const { main, ending } = riffs(barOf(settings.pattern), settings.variation, rng);
  const riffLen = main.length;
  const perPhrase = Math.max(2, PHRASE / riffLen);
  const count = Math.ceil(length / (riffLen * STEP));

  // Every hit in time order, so A/P can look ahead to the next one.
  const timeline: { t: number; hit: Hit }[] = [];
  for (let r = 0; r < count; r++) {
    const phraseEnd = (r % perPhrase === perPhrase - 1 || r === count - 1) && count >= 2;
    const start = r * riffLen * STEP;
    for (const hit of parse(phraseEnd && ending ? ending : main)) {
      const t = start + hit.at * STEP;
      if (t < length - 1e-9) timeline.push({ t, hit });
    }
  }

  // The first note in each chord is a chord tone: anything else becomes the root.
  const firsts = new Set<number>();
  for (const s of segments) {
    const first = timeline.findIndex(({ t }) => t >= s.start - 1e-9 && t < s.end - 1e-9);
    if (first >= 0) firsts.add(first);
  }

  let notes: BassNote[] = timeline.map(({ t, hit }, i) => {
    const seg = segmentAt(segments, t, length);
    const root = rootPitch(seg.root, settings.register);
    const nextT = i + 1 < timeline.length ? timeline[i + 1].t : length + (timeline[0]?.t ?? 0);
    const next = segmentAt(segments, nextT, length);
    const nextRoot = rootPitch(next.root, settings.register);
    const written = hit.role.toUpperCase();
    const role = firsts.has(i) && !"ROFDT".includes(written) ? "R" : written;
    let pitch: number;
    switch (role) {
      case "O": pitch = root + 12; break;
      case "F": pitch = root + fifthOf(seg.tones); break;
      case "D": pitch = root + fifthOf(seg.tones) - 12; break;
      case "T": pitch = root + thirdOf(seg.tones); break;
      case "S": pitch = root + seventhOf(seg.tones, minorKey); break;
      case "A": pitch = next.root !== seg.root ? approachInto(nextRoot, settings.register) : root + 12; break;
      case "B": pitch = stepBelow(root, key.root, intervals); break;
      case "P": pitch = NaN; break; // resolved below, once its neighbours are known
      default: pitch = root;
    }
    // a fifth below can't drop under the register floor: take the fifth above instead
    if (pitch < REGISTERS[settings.register] - 4) pitch += 12;
    const soft = hit.role !== hit.role.toUpperCase();
    const step = Math.round(t / STEP) % riffLen;
    return {
      pitch,
      startTime: t,
      duration: hit.len * STEP - (hit.len >= 4 ? GATE : GATE + 0.02),
      velocity: soft ? SOFT : step === 0 || step === 16 ? NORMAL + 6 : NORMAL,
    };
  });

  // Passing notes: the scale tone between the notes either side.
  notes.forEach((n, i) => {
    if (!Number.isNaN(n.pitch)) return;
    const seg = segmentAt(segments, n.startTime, length);
    const root = rootPitch(seg.root, settings.register);
    const prev = i > 0 && !Number.isNaN(notes[i - 1].pitch) ? notes[i - 1].pitch : root;
    const after = notes.slice(i + 1).find((m) => !Number.isNaN(m.pitch));
    const next = after?.pitch ?? root;
    n.pitch = passing(prev, next, key.root, intervals);
  });

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

  // Approach notes into chord changes.
  if (settings.approach) {
    const targets = changes.filter((c) => segmentAt(segments, c, length).root !== segmentAt(segments, c - 0.01, length).root);
    for (const c of targets) {
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

  // Turnaround: one pickup on the last 8th, leading back to the top of the loop.
  if (settings.turnaround && length >= 4) {
    const at = length - 0.5;
    const last = rootPitch(segmentAt(segments, at, length).root, settings.register);
    const home = rootPitch(segments[0].root, settings.register);
    notes = notes.filter((n) => n.startTime < at - 1e-9);
    const pitch = last === home ? home + 12 : approachInto(home, settings.register);
    notes.push({ pitch, startTime: at, duration: 0.5 - GATE - 0.08, velocity: NORMAL - 8 });
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
