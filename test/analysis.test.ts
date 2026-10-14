import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, detectKey, detectLoopKey, polyphony, type SourceNote } from "../src/analysis.ts";
import { SCALES, buildChord, generate, voice, type ChordType, type Movement } from "../src/music/theory.ts";
import { STYLES } from "../src/music/styles.ts";

const block = (pitches: number[], start: number, duration: number, velocity = 90): SourceNote[] =>
  pitches.map((pitch) => ({ pitch, startTime: start, duration, velocity }));

/** What the chord-progressions tool would write for these degrees (sustained, 1 bar each). */
function progression(key: number, scale: string, degrees: number[], type: ChordType, movement: Movement = "diatonic", beats = 4) {
  const chords = degrees.map((degree) => buildChord(key, SCALES[scale], { degree, seventh: false }, type, movement));
  const voiced = voice(key, chords, { center: 60, mode: "smooth", bass: false, parallel: movement === "parallel" });
  return { chords, notes: voiced.flatMap((v, i) => block(v, i * beats, beats)), length: degrees.length * beats };
}

test("detects major and minor keys", () => {
  const cMajor = progression(0, "Major", [0, 5, 3, 4], "triad");
  assert.deepEqual(detectKey(cMajor.notes), { root: 0, scale: "Major" });
  const aMinor = progression(9, "Minor", [0, 3, 4, 0], "triad");
  assert.deepEqual(detectKey(aMinor.notes), { root: 9, scale: "Minor" });
});

test("finds the roots of a triad progression in any inversion", () => {
  const p = progression(0, "Major", [0, 5, 3, 4], "triad");
  const segs = analyze(p.notes, p.length, { root: 0, scale: "Major" });
  assert.deepEqual(segs.map((s) => s.name), ["C", "Am", "F", "G"]);
  assert.deepEqual(segs.map((s) => [s.start, s.end]), [[0, 4], [4, 8], [8, 12], [12, 16]]);
});

test("finds roots of 9th and 11th chords from the chord tool's styles", () => {
  const deep = progression(2, "Dorian", [0, 3, 6, 0], "ninth");
  const segs = analyze(deep.notes, deep.length, { root: 2, scale: "Minor" });
  assert.deepEqual(segs.map((s) => s.root), deep.chords.map((c) => (2 + c.root) % 12));
});

test("follows parallel (chord memory) movement out of the key", () => {
  const dub = progression(9, "Minor", [0, 2, 0, 6], "eleventh", "parallel");
  const segs = analyze(dub.notes, dub.length, { root: 9, scale: "Minor" });
  assert.deepEqual(segs.map((s) => s.root), [9, 0, 9, 7]); // Am11 Cm11 Am11 Gm11
});

test("matches the chord tool's own output across styles and seeds", () => {
  let right = 0, total = 0;
  let seed = 1;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (const style of STYLES) {
    for (let k = 0; k < 20; k++) {
      const key = Math.floor(rng() * 12);
      const steps = generate(SCALES[style.scale], 4, style.chord, style.harmony, rng);
      const p = progression(key, style.scale, steps.map((s) => s.degree), style.chord, style.harmony.movement);
      const segs = analyze(p.notes, p.length, detectKey(p.notes));
      for (let i = 0; i < 4; i++) {
        total++;
        const at = segs.find((s) => s.start <= i * 4 && s.end > i * 4)!;
        if (at.root === (key + p.chords[i].root) % 12) right++;
      }
    }
  }
  assert.ok(right / total > 0.9, `root accuracy ${right}/${total}`);
});

test("merges repeated chords and splits at half-bar changes", () => {
  const notes = [...block([57, 60, 64], 0, 2), ...block([57, 60, 64], 2, 2), ...block([55, 59, 62], 4, 2), ...block([53, 57, 60], 6, 2)];
  const segs = analyze(notes, 8, { root: 9, scale: "Minor" }, 2);
  assert.deepEqual(segs.map((s) => [s.name, s.start, s.end]), [["Am", 0, 4], ["G", 4, 6], ["F", 6, 8]]);
});

test("stab rhythms and pushed changes still read as one chord per bar", () => {
  const stabs = (pitches: number[], bar: number) =>
    [0, 0.75, 1.5, 2.5, 3.25].flatMap((t) => block(pitches, bar * 4 + t - (bar > 0 && t === 0 ? 0.25 : 0), 0.22));
  const notes = [...stabs([62, 65, 69, 72], 0), ...stabs([67, 71, 74, 77], 1)]; // Dm7, G7
  const segs = analyze(notes, 8, { root: 2, scale: "Dorian" });
  assert.deepEqual(segs.map((s) => s.root), [2, 7]);
});

test("a melody is harmonised with in-key chords, one per bar", () => {
  // A minor melody: A C E (bar 1), G B D (bar 2), F A C (bar 3), E G# B (bar 4 → not in A natural minor)
  const line = [[69, 72, 76], [67, 71, 74], [65, 69, 72], [64, 67, 71]].flatMap((ps, bar) => ps.map((p, i) => ({ pitch: p, startTime: bar * 4 + i, duration: 1, velocity: 90 })));
  assert.equal(polyphony(line), 1);
  const segs = analyze(line, 16, { root: 9, scale: "Minor" }, 2);
  assert.deepEqual(segs.map((s) => s.root), [9, 7, 5, 4]);
  for (const s of segs) assert.equal(s.end - s.start, 4);
});

test("silence continues the previous chord; an empty clip sits on the tonic", () => {
  const notes = block([57, 60, 64], 0, 2);
  const segs = analyze(notes, 8, { root: 9, scale: "Minor" });
  assert.deepEqual(segs.map((s) => [s.root, s.start, s.end]), [[9, 0, 8]]);
  assert.equal(analyze([], 8, { root: 2, scale: "Minor" })[0].root, 2);
});

test("loop key: tonic from the first chord, mode from the notes", () => {
  const dorian = progression(2, "Dorian", [0, 3, 0, 3], "ninth"); // Dm9 G9: the Dorian IV
  assert.deepEqual(detectLoopKey(dorian.notes, dorian.length), { root: 2, scale: "Dorian" });
  const minor = progression(9, "Minor", [0, 5, 6, 0], "seventh");
  assert.deepEqual(detectLoopKey(minor.notes, minor.length), { root: 9, scale: "Minor" });
});
