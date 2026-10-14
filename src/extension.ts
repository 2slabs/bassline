import * as fs from "node:fs";
import * as path from "node:path";
import {
  initialize,
  ClipSlot,
  DataModelObject,
  MidiClip,
  MidiTrack,
  TakeLane,
  Track,
  type ActivationContext,
  type ArrangementSelection,
  type ExtensionContext,
  type Handle,
} from "@ableton-extensions/sdk";

// build.ts inlines this HTML (with the bundled ui/app.ts, styles and fonts) as a string.
import dialogHtml from "../ui/interface.html";
import type { SourceNote } from "./analysis.ts";
import type { Cancelled, Init, Result, Settings, SourceOption, TargetOption } from "./protocol.ts";

type V = "1.0.0";
type Context = ExtensionContext<V>;
type Clip = MidiClip<V>;

const TITLE = "Generate Bassline…";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand("bassline.clip", (arg) => run(() => fromClip(context, arg as Handle)));
  context.commands.registerCommand("bassline.slot", (arg) => run(() => fromSlot(context, arg as Handle)));
  context.commands.registerCommand("bassline.arrangement", (arg) => run(() => fromArrangement(context, arg as ArrangementSelection)));

  const menus = [
    ["MidiClip", "bassline.clip"],
    ["ClipSlot", "bassline.slot"],
    ["MidiTrack.ArrangementSelection", "bassline.arrangement"],
  ] as const;
  for (const [scope, command] of menus) {
    context.ui.registerContextMenuAction(scope, TITLE, command).then(
      () => console.log(`bassline: menu registered for ${scope}`),
      (err) => console.error(`bassline: couldn't register menu for ${scope}:`, err),
    );
  }
}

function run(task: () => Promise<void>) {
  task().catch((err) => console.error("bassline:", err));
}

// ---- reading clips ---------------------------------------------------------------

/** Notes sounding in clip time [from, to), cut to it and made relative to `from`. */
function notesIn(clip: Clip, from: number, to: number): SourceNote[] {
  return clip.notes
    .filter((n) => !n.muted && n.startTime < to && n.startTime + n.duration > from)
    .map((n) => {
      const start = Math.max(n.startTime, from);
      return { pitch: n.pitch, startTime: start - from, duration: Math.min(n.startTime + n.duration, to) - start, velocity: n.velocity ?? 100 };
    });
}

/** A session clip's loop (or start–end when not looping) as one source. */
function sessionSource(clip: Clip, id: string, label: string): SourceOption {
  const [from, to] = clip.looping ? [clip.loopStart, clip.loopEnd] : [clip.startMarker, clip.endMarker];
  return { id, label, notes: notesIn(clip, from, to), length: to - from };
}

/** An arrangement clip's notes on the timeline (honouring its loop), within [from, to), relative to `from`. */
function arrangementNotes(clip: Clip, from: number, to: number): SourceNote[] {
  const placed: SourceNote[] = [];
  const place = (contentFrom: number, contentTo: number, at: number) => {
    for (const n of notesIn(clip, contentFrom, contentTo)) placed.push({ ...n, startTime: n.startTime + at });
  };
  if (!clip.looping) {
    place(clip.startMarker, clip.endMarker, clip.startTime);
  } else {
    let at = clip.startTime;
    place(clip.startMarker, clip.loopEnd, at);
    at += clip.loopEnd - clip.startMarker;
    const loop = clip.loopEnd - clip.loopStart;
    while (loop > 0 && at < clip.endTime - 1e-9) {
      place(clip.loopStart, clip.loopEnd, at);
      at += loop;
    }
  }
  const end = Math.min(to, clip.endTime);
  return placed
    .filter((n) => n.startTime < end && n.startTime + n.duration > from)
    .map((n) => {
      const start = Math.max(n.startTime, from);
      return { ...n, startTime: start - from, duration: Math.min(n.startTime + n.duration, end) - start };
    });
}

const midiTracks = (context: Context) =>
  context.application.song.tracks.filter((t): t is MidiTrack<V> => t instanceof MidiTrack);

const clipLabel = (track: Track<V>, clip: Clip) => `${track.name} · ${clip.name || "clip"}`;

function slotIndex(track: Track<V>, slot: ClipSlot<V>): number {
  return track.clipSlots.findIndex((s) => s.handle.id === slot.handle.id);
}

// ---- entry points ----------------------------------------------------------------

/** Right-click a MIDI clip: follow it, put the bass on another track. */
async function fromClip(context: Context, handle: Handle) {
  const clip = context.getObjectFromHandle(handle, MidiClip);
  const parent = clip.parent;

  if (parent instanceof ClipSlot) {
    const track = parent.parent as Track<V>;
    const scene = slotIndex(track, parent);
    const source = sessionSource(clip, "clip", clipLabel(track, clip));
    const others = midiTracks(context).filter((t) => t.handle.id !== track.handle.id);
    const targets: TargetOption[] = [
      { id: "new", label: "new track: bass" },
      ...others.map((t) => ({
        id: String(t.handle.id),
        label: t.name,
        disabled: t.clipSlots[scene]?.clip ? "slot taken" : undefined,
      })),
    ];
    const result = await openDialog(context, {
      mode: "clip",
      sources: [source],
      defaultSource: "clip",
      targets,
      defaultTarget: targets.find((t) => !t.disabled && /bass/i.test(t.label) && t.id !== "new")?.id ?? "new",
      where: `scene ${scene + 1}`,
    });
    if (!result) return;
    const target = result.target === "new" || !result.target
      ? await newBassTrack(context)
      : others.find((t) => String(t.handle.id) === result.target)!;
    const slot = target.clipSlots[scene];
    if (!slot || slot.clip) return console.warn("bassline: that slot is taken now.");
    fill(context, await slot.createMidiClip(result.length), result, clip.color);
    return;
  }

  // Arrangement clip (on a track or a take lane).
  const track = (parent instanceof TakeLane ? parent.parent : parent) as Track<V>;
  const from = clip.startTime;
  const length = clip.endTime - clip.startTime;
  const source: SourceOption = { id: "clip", label: clipLabel(track, clip), notes: arrangementNotes(clip, from, clip.endTime), length };
  const others = midiTracks(context).filter((t) => t.handle.id !== track.handle.id);
  const targets: TargetOption[] = [
    { id: "new", label: "new track: bass" },
    ...others.map((t) => ({
      id: String(t.handle.id),
      label: t.arrangementClips.some((c) => c.startTime < from + length && c.endTime > from) ? `${t.name} (replaces clips here)` : t.name,
    })),
  ];
  const result = await openDialog(context, {
    mode: "clip",
    sources: [source],
    defaultSource: "clip",
    targets,
    defaultTarget: targets.find((t) => /bass/i.test(t.label) && t.id !== "new")?.id ?? "new",
    where: `bar ${Math.floor(from / 4) + 1} in the arrangement`,
  });
  if (!result) return;
  const target = result.target === "new" || !result.target
    ? await newBassTrack(context)
    : others.find((t) => String(t.handle.id) === result.target)!;
  fill(context, await target.createMidiClip(from, result.length), result, clip.color);
}

/** Right-click an empty slot: follow a clip in the same scene, or start from scratch. */
async function fromSlot(context: Context, handle: Handle) {
  const slot = context.getObjectFromHandle(handle, ClipSlot);
  const track = slot.parent;
  if (!(track instanceof MidiTrack)) return console.warn("bassline: right-click a slot on a MIDI track.");
  if (slot.clip) return console.warn("bassline: that slot already has a clip; right-click a clip to follow it instead.");
  const scene = slotIndex(track, slot);
  const sources: SourceOption[] = [];
  for (const t of midiTracks(context)) {
    const c = t.clipSlots[scene]?.clip;
    if (t.handle.id !== track.handle.id && c instanceof MidiClip) sources.push(sessionSource(c, String(c.handle.id), clipLabel(t, c)));
  }
  const result = await openDialog(context, {
    mode: "slot",
    sources,
    defaultSource: sources[0]?.id ?? "scratch",
    targets: null,
    where: `${track.name}, scene ${scene + 1}`,
  });
  if (!result) return;
  fill(context, await slot.createMidiClip(result.length), result);
}

/** Right-click a time selection on a MIDI track: follow other tracks' clips there, or scratch. */
async function fromArrangement(context: Context, selection: ArrangementSelection) {
  const lane = selection.selected_lanes
    .map((h) => context.getObjectFromHandle(h, DataModelObject))
    .find((o) => o instanceof MidiTrack || (o instanceof TakeLane && o.parent instanceof MidiTrack)) as MidiTrack<V> | TakeLane<V> | undefined;
  if (!lane) return console.warn("bassline: select a time range on a MIDI track.");
  const track = (lane instanceof TakeLane ? lane.parent : lane) as Track<V>;
  const from = selection.time_selection_start;
  const to = selection.time_selection_end;
  const sources: SourceOption[] = [];
  for (const t of midiTracks(context)) {
    if (t.handle.id === track.handle.id) continue;
    const clips = t.arrangementClips.filter((c): c is Clip => c instanceof MidiClip && c.startTime < to && c.endTime > from);
    if (!clips.length) continue;
    const notes = clips.flatMap((c) => arrangementNotes(c, from, to));
    sources.push({ id: String(t.handle.id), label: `${t.name} (arrangement)`, notes, length: to - from });
  }
  const result = await openDialog(context, {
    mode: "arrangement",
    sources,
    defaultSource: sources[0]?.id ?? "scratch",
    targets: null,
    where: `${track.name}, bar ${Math.floor(from / 4) + 1}`,
  });
  if (!result) return;
  fill(context, await lane.createMidiClip(from, result.length), result);
}

// ---- writing ------------------------------------------------------------------------

async function newBassTrack(context: Context): Promise<MidiTrack<V>> {
  const track = await context.application.song.createMidiTrack();
  track.name = "Bass";
  return track;
}

function fill(context: Context, clip: Clip, result: Result, color?: number) {
  context.withinTransaction(() => {
    clip.name = result.name;
    clip.notes = result.notes;
    if (color !== undefined) clip.color = color;
  });
}

// ---- dialog ---------------------------------------------------------------------------

async function openDialog(context: Context, partial: Omit<Init, "live" | "tempo" | "saved">): Promise<Result | null> {
  const song = context.application.song;
  const init: Init = {
    ...partial,
    live: song.scaleMode ? { root: song.rootNote, name: song.scaleName, intervals: song.scaleIntervals } : null,
    tempo: song.tempo,
    saved: loadSettings(context),
  };
  // Escape "<" so the JSON can't close the <script> it's embedded in.
  const json = JSON.stringify(init).replace(/</g, "\\u003c");
  const html = dialogHtml.replace("window.__INIT__ = null;", () => `window.__INIT__ = ${json};`);
  const raw = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 720, 600);
  if (!raw) return null; // window closed
  const reply = JSON.parse(raw) as Result | Cancelled;
  saveSettings(context, reply.settings);
  return "cancelled" in reply ? null : reply;
}

function settingsFile(context: Context): string | null {
  const dir = context.environment.storageDirectory;
  return dir ? path.join(dir, "settings.json") : null;
}

function loadSettings(context: Context): Settings | null {
  const file = settingsFile(context);
  try {
    return file ? (JSON.parse(fs.readFileSync(file, "utf8")) as Settings) : null;
  } catch {
    return null;
  }
}

function saveSettings(context: Context, settings: Settings) {
  const file = settingsFile(context);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.warn("bassline: couldn't save settings:", err);
  }
}
