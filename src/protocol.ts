// Data passed between the extension and the dialog.
import type { SourceNote } from "./analysis.ts";
import type { BassNote, BassSettings } from "./bass.ts";

/** A clip the bassline can follow. Notes are relative to `length` beats starting at 0. */
export interface SourceOption {
  id: string;
  label: string;
  notes: SourceNote[];
  length: number;
}

/** Somewhere the bass clip can go (only when started from a clip). */
export interface TargetOption {
  id: string;
  label: string;
  /** Why it can't be used, shown greyed out. */
  disabled?: string;
}

export interface Settings {
  /** Bumped when the shape changes, so stale saved settings are ignored. */
  version: 2;
  /** A chord-progressions STYLES id: sets the bass defaults (and the scratch harmony). */
  style: string;
  bass: BassSettings;
  /** Harmony detection window in beats. */
  resolution: number;
  /** From-scratch harmony. */
  scratch: { root: number; scale: string; count: number; beatsPerChord: number };
  /** Play the source chords quietly under the bass preview. */
  hearChords: boolean;
  theme?: "dark" | "light";
}

export interface Init {
  /** Where the dialog was opened from. */
  mode: "clip" | "slot" | "arrangement";
  /** Live's current scale, when Scale Mode is on. */
  live: { root: number; name: string; intervals: number[] } | null;
  tempo: number;
  saved: Settings | null;
  sources: SourceOption[];
  /** A source id, or "scratch". */
  defaultSource: string;
  /** Choices of destination, or null when the clip goes where the user clicked. */
  targets: TargetOption[] | null;
  defaultTarget?: string;
  /** Plain description of where the clip will go, e.g. "slot 3 on Bass". */
  where: string;
}

export interface Result {
  name: string;
  /** Clip length in beats. */
  length: number;
  notes: BassNote[];
  /** A TargetOption id, when targets were offered. */
  target?: string;
  settings: Settings;
}

/** Sent when the dialog is cancelled, so settings still stick. */
export interface Cancelled {
  cancelled: true;
  settings: Settings;
}
