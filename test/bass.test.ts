import { test } from "node:test";
import assert from "node:assert/strict";
import { BASS_DEFAULTS, BASS_PATTERNS, REGISTERS, barOf, customPattern, followed, generateBass, isPattern, riffs, seeded, type BassSettings } from "../src/bass.ts";
import type { Key, Segment } from "../src/analysis.ts";

const seg = (root: number, start: number, end: number, tones = [0, 3, 7]): Segment => ({ root, start, end, tones, name: "", numeral: "" });
const A_MINOR: Key = { root: 9, scale: "Minor" };
// Am – F – C – G, one bar each
const PROG = [seg(9, 0, 4), seg(5, 4, 8, [0, 4, 7]), seg(0, 8, 12, [0, 4, 7]), seg(7, 12, 16, [0, 4, 7])];
const plain: BassSettings = { pattern: "roots", register: "low", variation: 0, follow: "chord", approach: false, turnaround: false, push: false, swing: 50 };
const pc = (p: number) => ((p % 12) + 12) % 12;

test("all built-in patterns are one or two bars of valid steps", () => {
  for (const p of BASS_PATTERNS) assert.ok(isPattern(p.id), p.id);
  assert.ok(isPattern(customPattern("R...O...R...F...")));
  assert.ok(isPattern(customPattern("R...O...R...F...".repeat(2))));
  assert.ok(isPattern(customPattern("R...O...R...F...".repeat(4))));
  assert.ok(!isPattern(customPattern("R...O...R...F...R...")));
  assert.ok(!isPattern("custom:R..."));
  assert.equal(barOf("custom:nope"), BASS_PATTERNS[0].bar);
});

test("every style default points at a real pattern", () => {
  for (const [style, d] of Object.entries(BASS_DEFAULTS)) assert.ok(isPattern(d.pattern), style);
});

test("roots: one held root per chord, in the register", () => {
  const notes = generateBass(PROG, 16, A_MINOR, plain);
  assert.deepEqual(notes.map((n) => pc(n.pitch)), [9, 5, 0, 7]);
  assert.deepEqual(notes.map((n) => n.startTime), [0, 4, 8, 12]);
  for (const n of notes) assert.ok(n.pitch >= REGISTERS.low && n.pitch <= REGISTERS.low + 11);
});

test("every pattern × style stays monophonic, inside the clip, in a sane range", () => {
  for (const p of BASS_PATTERNS) {
    for (const [style, d] of Object.entries(BASS_DEFAULTS)) {
      for (const length of [8, 16, 32]) {
        const segs = length === 8 ? [seg(9, 0, 2), seg(5, 2, 6), seg(7, 6, 8)] : PROG.map((s) => ({ ...s, start: (s.start * length) / 16, end: (s.end * length) / 16 }));
        const notes = generateBass(segs, length, A_MINOR, { ...d, pattern: p.id, variation: 100 }, 42);
        assert.ok(notes.length > 0, `${p.id}/${style}`);
        for (let i = 0; i < notes.length; i++) {
          const n = notes[i];
          assert.ok(n.startTime >= 0 && n.startTime + n.duration <= length + 1e-9, `${p.id}/${style}: outside clip`);
          assert.ok(n.duration > 0, `${p.id}/${style}: empty note`);
          assert.ok(n.pitch >= 24 && n.pitch <= 72, `${p.id}/${style}: pitch ${n.pitch}`);
          assert.ok(n.velocity >= 1 && n.velocity <= 127);
          if (i > 0) assert.ok(notes[i - 1].startTime + notes[i - 1].duration <= n.startTime + 1e-9, `${p.id}/${style}: overlap at ${n.startTime}`);
        }
      }
    }
  }
});

test("held notes are re-struck on the new root at a chord change", () => {
  const notes = generateBass([seg(9, 0, 2), seg(5, 2, 4, [0, 4, 7])], 4, A_MINOR, { ...plain, pattern: "dub-drone" });
  assert.deepEqual(notes.map((n) => [pc(n.pitch), n.startTime]), [[9, 0], [5, 2]]);
});

test("approach notes lead a semitone into each change", () => {
  const notes = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: "quarters", approach: true });
  for (const change of [4, 8, 12]) {
    const before = notes.filter((n) => n.startTime < change && n.startTime >= change - 1).pop()!;
    const after = notes.find((n) => n.startTime === change)!;
    assert.equal(Math.abs(after.pitch - before.pitch), 1, `into beat ${change}`);
  }
});

test("pickup: one note on the last 8th leads back to the first chord", () => {
  const notes = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: "quarters", turnaround: true });
  const tail = notes.filter((n) => n.startTime > 15);
  assert.equal(tail.length, 1);
  assert.equal(tail[0].startTime, 15.5);
  const home = REGISTERS.low + ((9 - (REGISTERS.low % 12) + 12) % 12);
  assert.equal(Math.abs(tail[0].pitch - home), 1);
});

test("rolling techno bass leaves the kick (each beat's 1) empty", () => {
  const notes = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: "techno-roll" });
  assert.ok(notes.every((n) => Math.abs(n.startTime % 1) > 1e-6));
  assert.equal(notes.length, 48);
});

test("push moves chord-change notes a 16th early", () => {
  const notes = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: "quarters", push: true });
  const starts = notes.map((n) => n.startTime);
  assert.ok(starts.includes(3.75) && starts.includes(7.75) && starts.includes(11.75));
  assert.ok(starts.includes(0));
});

test("swing delays off-16ths only", () => {
  const notes = generateBass(PROG, 4, A_MINOR, { ...plain, pattern: "techno-roll", swing: 58 });
  assert.ok(notes.some((n) => Math.abs(n.startTime - 0.29) < 1e-9));
  assert.ok(notes.some((n) => Math.abs(n.startTime - 0.5) < 1e-9));
});

test("variation is deterministic per seed and changes things", () => {
  const s = { ...plain, pattern: "deep-sync", variation: 80 };
  const a = generateBass(PROG, 16, A_MINOR, s, 5);
  assert.deepEqual(generateBass(PROG, 16, A_MINOR, s, 5), a);
  const seeds = new Set([5, 6, 7, 8, 9].map((n) => JSON.stringify(generateBass(PROG, 16, A_MINOR, s, n))));
  assert.ok(seeds.size > 1);
  const none = generateBass(PROG, 16, A_MINOR, { ...s, variation: 0 }, 5);
  assert.notDeepEqual(none, a);
});

test("no variation: the riff repeats exactly", () => {
  const notes = generateBass([seg(9, 0, 32)], 32, A_MINOR, { ...plain, pattern: "deep-sync" });
  const shape = (from: number) => notes.filter((n) => n.startTime >= from && n.startTime < from + 8).map((n) => [n.startTime - from, n.pitch]);
  assert.deepEqual(shape(8), shape(0));
  assert.deepEqual(shape(24), shape(16));
  assert.deepEqual(shape(16), shape(0));
});

test("variation stays in the riff's vocabulary, and most changes land at the phrase end", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { main, ending } = riffs(barOf("techno-roll"), 100, seeded(seed));
    for (const c of [...main, ...(ending ?? [])]) assert.ok("RrOo.-".includes(c), `techno-roll grew a ${c}`);
    if (ending) assert.deepEqual(ending.slice(0, 8), main.slice(0, 8), "the ending only reworks the last half bar");
  }
});

test("rolling and offbeat techno never land on the kick, even at full variation", () => {
  for (const p of ["techno-roll", "techno-gallop", "techno-3", "techno-offbeat", "house-offbeat"]) {
    for (let seed = 1; seed <= 20; seed++) {
      const notes = generateBass([seg(9, 0, 32)], 32, A_MINOR, { ...plain, pattern: p, variation: 100 }, seed);
      assert.ok(notes.every((n) => Math.abs(n.startTime % 1) > 1e-6), `${p} seed ${seed}`);
    }
  }
});

test("style defaults are sparse: notes per bar", () => {
  const limits: Record<string, number> = { "dub-techno": 3.5, "deep-house": 5, "classic-house": 6, detroit: 7, hypnotic: 12.5, functional: 5 };
  for (const [style, d] of Object.entries(BASS_DEFAULTS)) {
    for (let seed = 1; seed <= 10; seed++) {
      const notes = generateBass(PROG.map((s) => ({ ...s, start: s.start * 2, end: s.end * 2 })), 32, A_MINOR, d, seed);
      assert.ok(notes.length / 8 <= limits[style], `${style}: ${notes.length / 8} notes a bar`);
    }
  }
});

test("follow: drone stays on the key's tonic; bars change only on the bar line", () => {
  const drone = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: "techno-roll", follow: "drone" });
  assert.ok(drone.every((n) => pc(n.pitch) === 9));
  const halfBars = [seg(9, 0, 2), seg(5, 2, 4), seg(0, 4, 7), seg(7, 7, 8)];
  assert.deepEqual(followed(halfBars, 8, A_MINOR, "bar").map((s) => [s.root, s.start, s.end]), [[9, 0, 4], [0, 4, 8]]);
});

test("the first note of every chord is its root (no variation on the 1)", () => {
  for (const p of ["detroit-8ths", "house-jack", "deep-sync", "deep-offbeat", "root-fifth"]) {
    const notes = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: p, variation: 100 }, 9);
    for (const s of PROG) {
      const first = notes.find((n) => n.startTime >= s.start - 1e-9)!;
      assert.equal(pc(first.pitch), s.root, `${p} @${s.start}`);
    }
  }
});

test("rising steps: the dub line walks fifth below → passing → ♭7, then answers root ↔ ♭7", () => {
  const notes = generateBass([seg(9, 0, 16)], 16, A_MINOR, { ...plain, pattern: "dub-steps", register: "sub" });
  const names = notes.map((n) => pc(n.pitch));
  // E F G | A G A G | E F G | A G  (Rhythm & Sound, "Never Tell You", in A minor)
  assert.deepEqual(names, [4, 5, 7, 9, 7, 9, 7, 4, 5, 7, 9, 7]);
  assert.ok(notes.every((n) => Math.abs(n.startTime % 4) > 1e-6), "never on a bar's downbeat");
});

test("dotted 8ths: Good Life's rhythm, a hit every third 16th", () => {
  const notes = generateBass([seg(9, 0, 8)], 8, A_MINOR, { ...plain, pattern: "detroit-dotted" });
  assert.deepEqual(notes.slice(0, 6).map((n) => n.startTime), [0, 0.75, 1.5, 2.25, 3, 3.75]);
});
