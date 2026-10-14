// Dialog logic. Bundled and inlined into interface.html by build.ts.
import { SCALES, ROOT_LABELS, buildChord, generate, noteNames, voice, type Harmony, type Step } from "../src/music/theory.ts";
import { STYLES, styleById, type Style } from "../src/music/styles.ts";
import { analyze, detectLoopKey, type Key, type Segment, type SourceNote } from "../src/analysis.ts";
import { BASS_DEFAULTS, BASS_PATTERNS, barOf, customPattern, generateBass, isPattern, type BassNote, type Register } from "../src/bass.ts";
import type { Cancelled, Init, Result, Settings, SourceOption } from "../src/protocol.ts";
import { applyTheme, closeDialog, fillSelect, radioGroup, slider, toggle } from "./2sl/ui.ts";

declare global {
  interface Window {
    __INIT__: Init | null;
  }
}

const init: Init = window.__INIT__ ?? demoInit();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const scaleKeys = Object.keys(SCALES);

// ---- state -----------------------------------------------------------------------

function defaults(styleId: string): Settings {
  const style = styleById(styleId);
  return {
    version: 1,
    style: style.id,
    bass: { ...(BASS_DEFAULTS[style.id] ?? BASS_DEFAULTS.functional) },
    resolution: 4,
    scratch: {
      root: init.live?.root ?? 9,
      scale: init.live && SCALES[init.live.name] ? init.live.name : style.scale,
      count: style.count,
      beatsPerChord: style.beatsPerChord,
    },
    hearChords: true,
    theme: "dark",
  };
}

function initialSettings(): Settings {
  const saved = init.saved;
  if (saved?.version !== 1) return defaults(STYLES[0].id);
  const s: Settings = { ...defaults(saved.style), ...saved, bass: { ...defaults(saved.style).bass, ...saved.bass } };
  if (!isPattern(s.bass.pattern)) s.bass.pattern = defaults(s.style).bass.pattern;
  if (!SCALES[s.scratch.scale]) s.scratch.scale = styleById(s.style).scale;
  return s;
}

let settings = initialSettings();
let sourceId = init.sources.some((s) => s.id === init.defaultSource) ? init.defaultSource : "scratch";
let target = init.defaultTarget ?? "new";
let seed = 1 + Math.floor(Math.random() * 1e9);

const source = (): SourceOption | null => init.sources.find((s) => s.id === sourceId) ?? null;

/** Key for a source: Live's Scale Mode key if it's on, else detected from the clip. */
function keyFor(src: SourceOption): Key {
  if (init.live && SCALES[init.live.name]) return { root: init.live.root, scale: init.live.name };
  return detectLoopKey(src.notes, src.length);
}
const sourceKeys = new Map(init.sources.map((s) => [s.id, keyFor(s)]));

function key(): Key {
  const src = source();
  return src ? sourceKeys.get(src.id)! : { root: settings.scratch.root, scale: settings.scratch.scale };
}

const harmony = (): Harmony => styleById(settings.style).harmony;
let scratchSteps: Step[] = newScratchSteps();
function newScratchSteps() {
  const st = styleById(settings.style);
  return generate(SCALES[settings.scratch.scale], settings.scratch.count, st.chord, harmony());
}

function scratchChords() {
  const st = styleById(settings.style);
  return scratchSteps.map((s) => buildChord(settings.scratch.root, SCALES[settings.scratch.scale], s, st.chord, st.harmony.movement));
}

/** The harmony the bass follows. */
function segments(): Segment[] {
  const src = source();
  if (src) return analyze(src.notes, src.length, key(), settings.resolution);
  const bpc = settings.scratch.beatsPerChord;
  return scratchChords().map((c, i) => ({
    start: i * bpc,
    end: (i + 1) * bpc,
    root: (settings.scratch.root + c.root) % 12,
    tones: c.tones,
    name: c.name,
    numeral: c.numeral,
  }));
}

const length = () => source()?.length ?? settings.scratch.count * settings.scratch.beatsPerChord;

function bassNotes(): BassNote[] {
  return generateBass(segments(), length(), key(), settings.bass, seed);
}

/** What plays under the bass in the preview: the source clip, or the scratch chords voiced. */
function chordNotes(): SourceNote[] {
  const src = source();
  if (src) return src.notes;
  const st = styleById(settings.style);
  const bpc = settings.scratch.beatsPerChord;
  return voice(settings.scratch.root, scratchChords(), { center: 60, mode: st.voicing, bass: false, parallel: st.harmony.movement === "parallel" })
    .flatMap((v, i) => v.map((pitch) => ({ pitch, startTime: i * bpc, duration: bpc, velocity: 80 })));
}

// ---- controls ----------------------------------------------------------------

const syncs: (() => void)[] = [];

function dropdown(id: string, options: { value: string; label: string; group?: string; disabled?: boolean }[] | null, get: () => string, set: (v: string) => void) {
  const el = $<HTMLSelectElement>(id);
  if (options) {
    fillSelect(el, options);
    options.forEach((o, i) => { if (o.disabled) [...el.querySelectorAll("option")][i].disabled = true; });
  }
  el.classList.add("ui-select");
  el.onchange = () => set(el.value);
  syncs.push(() => (el.value = get()));
}

function setupControls() {
  // follow: source clips + scratch
  dropdown(
    "source",
    [...init.sources.map((s) => ({ value: s.id, label: s.label })), { value: "scratch", label: "nothing: from scratch" }],
    () => sourceId,
    (v) => {
      sourceId = v;
      changed(true);
    },
  );

  // key: edits the source's key, or the scratch key
  dropdown("root", ROOT_LABELS.map((label, i) => ({ value: String(i), label })), () => String(key().root), (v) => {
    const src = source();
    if (src) sourceKeys.set(src.id, { ...key(), root: Number(v) });
    else settings.scratch.root = Number(v);
    changed(true);
  });
  dropdown("scale", scaleKeys.map((k) => ({ value: k, label: k.toLowerCase() })), () => key().scale, (v) => {
    const src = source();
    if (src) sourceKeys.set(src.id, { ...key(), scale: v });
    else {
      const sameSize = SCALES[v].length === SCALES[settings.scratch.scale].length;
      settings.scratch.scale = v;
      if (!sameSize) scratchSteps = newScratchSteps();
    }
    changed(true);
  });

  syncs.push(
    radioGroup($("resolution"), [["2", "½ bar"], ["4", "1 bar"], ["8", "2 bars"]], () => String(settings.resolution), (v) => {
      settings.resolution = Number(v);
      changed(true);
    }),
    radioGroup($("length"), [["2", "2 beats"], ["4", "1 bar"], ["8", "2 bars"], ["16", "4 bars"]], () => String(settings.scratch.beatsPerChord), (v) => {
      settings.scratch.beatsPerChord = Number(v);
      changed(true);
    }),
  );
  dropdown("count", [1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: `${n} chord${n === 1 ? "" : "s"}` })), () => String(settings.scratch.count), (v) => {
    settings.scratch.count = Number(v);
    scratchSteps = newScratchSteps();
    changed(true);
  });
  $("new-chords").onclick = newChords;

  // style: bass defaults (and the scratch harmony)
  dropdown("style", STYLES.map((s) => ({ value: s.id, label: s.label.toLowerCase() })), () => settings.style, (v) => {
    const d = defaults(v);
    settings = { ...settings, style: v, bass: d.bass, scratch: { ...settings.scratch, scale: d.scratch.scale, count: d.scratch.count, beatsPerChord: d.scratch.beatsPerChord } };
    scratchSteps = newScratchSteps();
    changed(true);
  });

  const pattern = $<HTMLSelectElement>("pattern");
  fillSelect(pattern, BASS_PATTERNS.map((p) => ({ value: p.id, label: p.label, group: p.group })));
  const custom = new Option("custom (drawn)", "");
  pattern.append(custom);
  pattern.classList.add("ui-select");
  pattern.onchange = () => {
    if (pattern.value) settings.bass.pattern = pattern.value;
    changed();
  };
  syncs.push(() => {
    const isCustom = settings.bass.pattern.startsWith("custom:");
    custom.disabled = !isCustom;
    custom.value = isCustom ? settings.bass.pattern : "";
    pattern.value = settings.bass.pattern;
  });

  syncs.push(
    radioGroup($("register"), [["sub", "sub"], ["low", "low"], ["mid", "mid"]], () => settings.bass.register, (v) => {
      settings.bass.register = v as Register;
      changed();
    }),
    slider($("variation"), null, { min: 0, max: 100, step: 5, marks: [25, 50, 75], valueEl: $("variation-value"), format: (v) => (v === 0 ? "none" : `${v}%`) },
      () => settings.bass.variation, (v, final) => { settings.bass.variation = v; if (final) changed(); }),
    slider($("swing"), $("swing-presets"), { min: 50, max: 75, marks: [54, 58, 62, 66, 71], valueEl: $("swing-value"), format: (v) => (v === 50 ? "straight" : `${v}%`) },
      () => settings.bass.swing, (v, final) => { settings.bass.swing = v; if (final) changed(); }),
    toggle($("approach"), () => settings.bass.approach, (on) => { settings.bass.approach = on; changed(); }),
    toggle($("turnaround"), () => settings.bass.turnaround, (on) => { settings.bass.turnaround = on; changed(); }),
    toggle($("push"), () => settings.bass.push, (on) => { settings.bass.push = on; changed(); }),
    toggle($("hear-chords"), () => settings.hearChords, (on) => { settings.hearChords = on; restartPreview(); }),
    radioGroup($("theme"), [["dark", "dark"], ["light", "light"]], () => settings.theme ?? "dark", (v) => {
      settings.theme = v as "dark" | "light";
      applyTheme(settings.theme);
      renderRoll();
    }),
  );

  // where the clip goes
  if (init.targets) {
    dropdown("target", init.targets.map((t) => ({ value: t.id, label: t.disabled ? `${t.label} (${t.disabled})` : t.label, disabled: !!t.disabled })), () => target, (v) => (target = v));
    $("where").textContent = init.where;
  } else {
    $("target").classList.add("hidden");
    $("where").textContent = init.where;
  }

  syncs.forEach((f) => f());

  $("generate").onclick = regenerate;
  $("play").onclick = togglePreview;
  $("cancel").onclick = cancel;
  $("insert").onclick = insert;
  document.addEventListener("keydown", (e) => {
    if ((e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) && e.key !== "Escape") return;
    if (e.key === "Enter") insert();
    else if (e.key === "Escape") cancel();
    else if (e.key === " ") { e.preventDefault(); togglePreview(); }
    else if (e.key === "g" || e.key === "G") regenerate();
    else if ((e.key === "c" || e.key === "C") && !source()) newChords();
  });
  new ResizeObserver(() => renderRoll()).observe($("roll"));
}

function regenerate() {
  seed = 1 + Math.floor(Math.random() * 1e9);
  changed();
}

function newChords() {
  scratchSteps = newScratchSteps();
  changed();
}

/** Redraw after any change; `controls` re-syncs selects too. Restarts a running preview. */
function changed(controls = false) {
  if (controls) syncs.forEach((f) => f());
  render();
  restartPreview();
}

// ---- rendering ---------------------------------------------------------------------

function hueVar(hue: Style["hue"]) {
  return hue === "unlit" ? "var(--hue-grey)" : `var(--hue-${hue})`;
}

function keyName(k = key()) {
  return `${noteNames(k.root, SCALES[k.scale])[k.root]} ${k.scale.toLowerCase()}`;
}

function render() {
  applyTheme(settings.theme ?? "dark");
  document.documentElement.style.setProperty("--hue", hueVar(styleById(settings.style).hue));
  const src = source();
  $("source-harmony").classList.toggle("hidden", !src);
  $("scratch-harmony").classList.toggle("hidden", !!src);

  const bars = length() / 4;
  $("status").innerHTML = "<b></b><span></span><span></span>";
  const parts = $("status").querySelectorAll("b, span");
  parts[0].textContent = keyName();
  parts[1].textContent = `${bars} bar${bars === 1 ? "" : "s"}`;
  parts[2].textContent = src ? `following ${src.label}` : "from scratch";
  $("tempo").textContent = `${Math.round(init.tempo * 100) / 100} bpm`;

  renderSteps();
  renderRoll();
}

const CYCLE = [".", "R", "O", "F", "A", "r"];

function renderSteps() {
  const grid = $("steps");
  const bar = barOf(settings.bass.pattern);
  grid.innerHTML = "";
  for (let beat = 1; beat <= 4; beat++) {
    const label = document.createElement("span");
    label.className = "beat";
    label.style.gridColumn = `${(beat - 1) * 4 + 1} / span 4`;
    label.textContent = String(beat);
    grid.append(label);
  }
  [...bar].forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    if (c === "-") b.className = "hold";
    else if (c !== ".") {
      b.className = c === c.toLowerCase() ? "x" : "X";
      b.textContent = c;
    }
    b.title = `step ${i + 1}`;
    b.onclick = () => {
      const cells = [...bar];
      const at = CYCLE.indexOf(c);
      const next = at < 0 ? "R" : CYCLE[(at + 1) % CYCLE.length];
      cells[i] = next;
      if (next === ".") for (let k = i + 1; k < 16 && cells[k] === "-"; k++) cells[k] = ".";
      settings.bass.pattern = customPattern(cells.join(""));
      changed(true);
    };
    grid.append(b);
  });
}

const SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag: string, attrs: Record<string, string | number>, text?: string) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
};
const PITCH_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** The focal point: chords as lit pads across the top, the bassline as a piano roll below. */
function renderRoll() {
  const box = $("roll");
  const { width, height } = box.getBoundingClientRect();
  if (!width || !height) return;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, "shape-rendering": "crispEdges" }) as SVGSVGElement;
  const total = length();
  const gutter = 30;
  const band = 22;
  const x = (beat: number) => gutter + (beat / total) * (width - gutter);

  for (const s of segments()) {
    svg.append(svgEl("rect", { class: "band", x: x(s.start), y: 0, width: x(s.end) - x(s.start), height: band }));
    if (x(s.end) - x(s.start) > 24) svg.append(svgEl("text", { class: "band-label", x: x(s.start) + 6, y: 15 }, x(s.end) - x(s.start) > 90 ? `${s.name}  ${s.numeral}` : s.name));
  }
  for (let b = 0; b <= total; b++) svg.append(svgEl("line", { class: b % 4 === 0 ? "bar" : "beat", x1: x(b), x2: x(b), y1: band, y2: height }));

  const notes = bassNotes();
  if (!notes.length) {
    svg.append(svgEl("text", { class: "empty", x: gutter + 8, y: band + 24 }, "no notes: draw some steps above"));
  } else {
    const lo = Math.min(...notes.map((n) => n.pitch)) - 2;
    const hi = Math.max(...notes.map((n) => n.pitch)) + 2;
    const range = Math.max(hi - lo, 14);
    const row = (height - band - 6) / range;
    const y = (p: number) => band + 3 + (lo + range - p - 1) * row;
    for (let p = lo; p < lo + range; p++) {
      if (p % 12 === 0 || (range <= 18 && p % 12 === 7)) {
        svg.append(svgEl("text", { class: "pitch", x: 2, y: y(p) + Math.min(row, 13) - 1 }, `${PITCH_NAMES[p % 12]}${Math.floor(p / 12) - 2}`));
      }
    }
    for (const n of notes) {
      svg.append(svgEl("rect", {
        class: n.velocity < 80 ? "note ghost" : "note",
        x: x(n.startTime) + 1, y: y(n.pitch), width: Math.max(2, x(n.startTime + n.duration) - x(n.startTime) - 1), height: Math.max(3, row - 1),
      }));
    }
  }
  const playhead = svgEl("line", { class: "playhead", x1: -10, x2: -10, y1: 0, y2: height, id: "playhead" });
  svg.append(playhead);
  box.replaceChildren(svg);
}

// ---- result --------------------------------------------------------------------------

function cancel() {
  stopPreview();
  const message: Cancelled = { cancelled: true, settings };
  closeDialog(JSON.stringify(message));
}

function insert() {
  stopPreview();
  if (init.targets?.find((t) => t.id === target)?.disabled) return;
  const segs = segments();
  const names = segs.slice(0, 6).map((s) => s.name).join(" ") + (segs.length > 6 ? " …" : "");
  const result: Result = { name: `bass · ${names}`, length: length(), notes: bassNotes(), target: init.targets ? target : undefined, settings };
  closeDialog(JSON.stringify(result));
}

// ---- preview -------------------------------------------------------------------------

let audio: AudioContext | null = null;
let playing: { stop(): void } | null = null;
const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

function ctx(): AudioContext {
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

/** A simple sub + saw bass through a lowpass. */
function bassVoice(ac: AudioContext, out: AudioNode, n: BassNote, start: number, dur: number) {
  const peak = 0.22 * (n.velocity / 110);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.005);
  g.gain.setTargetAtTime(peak * 0.7, start + 0.005, 0.08);
  g.gain.setValueAtTime(peak * 0.7, start + Math.max(0.01, dur - 0.02));
  g.gain.linearRampToValueAtTime(0, start + dur + 0.02);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, start);
  lp.frequency.exponentialRampToValueAtTime(260, start + Math.max(0.05, dur));
  lp.connect(g).connect(out);
  for (const [type, gain] of [["sine", 1], ["sawtooth", 0.35]] as const) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = hz(n.pitch);
    const og = ac.createGain();
    og.gain.value = gain;
    osc.connect(og).connect(lp);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

/** Quiet triangle pad for the chords underneath. */
function chordVoice(ac: AudioContext, out: AudioNode, n: SourceNote, start: number, dur: number) {
  const g = ac.createGain();
  const peak = 0.025 * (n.velocity / 100);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.01);
  g.gain.setTargetAtTime(peak * 0.6, start + 0.01, 0.2);
  g.gain.linearRampToValueAtTime(0, start + dur + 0.03);
  g.connect(out);
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = hz(n.pitch);
  osc.connect(g);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function togglePreview() {
  if (playing) return stopPreview();
  startPreview();
}

function startPreview() {
  const ac = ctx();
  const spb = 60 / init.tempo;
  const master = ac.createGain();
  master.connect(ac.destination);
  const lead = 0.05 + 0.25 * spb; // room for a pushed first note
  const t0 = ac.currentTime + lead;
  const total = length();
  for (const n of bassNotes()) bassVoice(ac, master, n, t0 + n.startTime * spb, n.duration * spb);
  if (settings.hearChords) for (const n of chordNotes()) chordVoice(ac, master, n, t0 + n.startTime * spb, n.duration * spb);

  const playhead = () => document.getElementById("playhead");
  const cells = [...$("steps").querySelectorAll("button")];
  let frame = 0;
  const tick = () => {
    const beat = (ac.currentTime - t0) / spb;
    const { width } = $("roll").getBoundingClientRect();
    const px = beat >= 0 && beat < total ? 30 + (beat / total) * (width - 30) : -10;
    playhead()?.setAttribute("x1", String(px));
    playhead()?.setAttribute("x2", String(px));
    const step = beat >= 0 && beat < total ? Math.floor(beat * 4) % 16 : -1;
    cells.forEach((c, i) => c.classList.toggle("now", i === step));
    if (beat > total + 0.5) return stopPreview();
    frame = requestAnimationFrame(tick);
  };
  tick();
  $("play").querySelector("span")!.textContent = "stop";
  playing = {
    stop: () => {
      cancelAnimationFrame(frame);
      master.gain.setTargetAtTime(0, ac.currentTime, 0.03);
      playhead()?.setAttribute("x1", "-10");
      playhead()?.setAttribute("x2", "-10");
      cells.forEach((c) => c.classList.remove("now"));
      $("play").querySelector("span")!.textContent = "preview";
    },
  };
}

function restartPreview() {
  if (!playing) return;
  stopPreview();
  startPreview();
}

function stopPreview() {
  playing?.stop();
  playing = null;
}

// ---- outside Live (npm run ui): a sample source so there's something to see ---------

function demoInit(): Init {
  const chord = (ps: number[], t: number): SourceNote[] => [0, 0.75, 1.5, 2.5, 3.25].flatMap((o) => ps.map((p) => ({ pitch: p, startTime: t + o, duration: 0.22, velocity: 96 })));
  const notes = [...chord([62, 65, 69, 72], 0), ...chord([67, 71, 74, 77], 4), ...chord([62, 65, 69, 72], 8), ...chord([60, 64, 67, 71], 12)];
  return {
    mode: "clip", live: null, tempo: 124, saved: null,
    sources: [{ id: "clip", label: "Chords · deep stabs", notes, length: 16 }],
    defaultSource: "clip",
    targets: [{ id: "new", label: "new track: bass" }, { id: "1", label: "Bass" }, { id: "2", label: "Lead", disabled: "slot taken" }],
    defaultTarget: "1",
    where: "scene 1",
  };
}

void document.fonts.ready.then(() => {
  setupControls();
  render();
});
