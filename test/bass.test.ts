import { test } from "node:test";
import assert from "node:assert/strict";
import { BASS_DEFAULTS, BASS_PATTERNS, REGISTERS, barOf, customPattern, generateBass, isPattern, type BassSettings } from "../src/bass.ts";
import type { Key, Segment } from "../src/analysis.ts";

const seg = (root: number, start: number, end: number, tones = [0, 3, 7]): Segment => ({ root, start, end, tones, name: "", numeral: "" });
const A_MINOR: Key = { root: 9, scale: "Minor" };
// Am – F – C – G, one bar each
const PROG = [seg(9, 0, 4), seg(5, 4, 8, [0, 4, 7]), seg(0, 8, 12, [0, 4, 7]), seg(7, 12, 16, [0, 4, 7])];
const plain: BassSettings = { pattern: "roots", register: "low", variation: 0, approach: false, turnaround: false, push: false, swing: 50 };
const pc = (p: number) => ((p % 12) + 12) % 12;

test("all built-in patterns are 16 valid steps", () => {
  for (const p of BASS_PATTERNS) assert.ok(isPattern(p.id), p.id);
  assert.ok(isPattern(customPattern("R...O...R...F...")));
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

test("turnaround leads back to the first chord", () => {
  const notes = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: "quarters", turnaround: true, approach: true });
  const last = notes[notes.length - 1];
  assert.ok(last.startTime >= 15);
  const home = REGISTERS.low + ((9 - (REGISTERS.low % 12) + 12) % 12);
  assert.equal(Math.abs(last.pitch - home), 1);
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
  const s = { ...plain, pattern: "detroit-8ths", variation: 80 };
  const a = generateBass(PROG, 16, A_MINOR, s, 5);
  assert.deepEqual(generateBass(PROG, 16, A_MINOR, s, 5), a);
  assert.notDeepEqual(generateBass(PROG, 16, A_MINOR, s, 6), a);
  const none = generateBass(PROG, 16, A_MINOR, { ...s, variation: 0 }, 5);
  assert.notDeepEqual(none, a);
});

test("the first note of every chord is its root (no variation on the 1)", () => {
  for (const p of ["detroit-8ths", "classic-pump", "deep-roll", "root-fifth"]) {
    const notes = generateBass(PROG, 16, A_MINOR, { ...plain, pattern: p, variation: 100 }, 9);
    for (const s of PROG) {
      const first = notes.find((n) => n.startTime >= s.start - 1e-9)!;
      assert.equal(pc(first.pitch), s.root, `${p} @${s.start}`);
    }
  }
});
