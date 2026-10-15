# What the bass engine is based on

The patterns and rules in `src/bass.ts` come from transcriptions and production write-ups, not guesswork. This file lists the sources and what was taken from each, so the next round of tuning can start from evidence.

## Transcriptions

Ableton's [Learning Music](https://learningmusic.ableton.com) lessons include real basslines entered into their piano-roll widgets (the note data is in each page's `data-defaultState`).

**Rhythm & Sound, "Never Tell You"** ([lesson](https://learningmusic.ableton.com/make-basslines/never-tell-you.html)), 127 bpm, 4 bars, 8th notes, A minor:

```
bar 1   beat 2: E  F  G            (fifth below → passing → ♭7)
bar 2   and of 1: A  G  A  G       (root ↔ ♭7)
bar 3   = bar 1
bar 4   and of 2: A  G
```

- 12 notes in 4 bars. It never plays on a bar's downbeat, and it rests on the ♭7 rather than the root.
- It's a 4-bar call and response: A B A B′.
- From the lesson: "most of the pattern is empty space, and when notes do occur, they're mostly in unusual rhythmic spaces 'in between' the beats."
- In the engine this is the **rising steps** pattern (dub). It's also why the `B` (scale step below) role exists, why `P` is a passing note between its neighbours, and why the first note of a chord only has to be a chord tone, not necessarily the root.

**Inner City, "Good Life"** ([lesson](https://learningmusic.ableton.com/make-basslines/good-life.html)), 121 bpm, 2 bars, 16ths:

```
steps  0 3 6 | 9 12 | 15 17 19 | 22 25 27 | 28 30
pitch  1 1 1 | 2 2  | 3  3  3  | 4  4  4  | 1  1
```

- It's a chain of dotted 8ths (one hit every third 16th), with each pitch repeated 2–3 times.
- The pitch follows the chords, often changing a 16th early (step 15 is already in bar 2's chord).
- In the engine this is the **dotted 8ths** pattern (detroit's default, with push on).

## Write-ups

- **Attack Magazine, ["Low-End Theory: Exploring Eight Common Bassline Styles"](https://www.attackmagazine.com/technique/tutorials/low-end-theory-exploring-eight-common-bassline-styles/)**
  - Off-beat bass sits between the kicks.
  - In root-rhythm lines like "Good Life", "the notes generally follow the chords, and it does the same thing all the way through".
  - Changing the bass note early, or holding off, creates tension (Nathan Fake).
  - "Leaving gaps and avoiding too many notes on the downbeat adds a sense of anticipation. What you leave out is as important as what you leave in."
  - Jacking-house ostinatos repeat while the arrangement changes around them (House Nation).
  - In "Acid Tracks" the notes stay the same and the sound is tweaked instead.
  - Dub techno can let the kick carry the low end (Maurizio, "Eleye").
- **Attack Magazine, ["Basic Channel-Style Dub Techno"](https://www.attackmagazine.com/technique/beat-dissected/basic-channel-style-dub-techno/)**: the sub riff is one sample at two pitches a fourth apart, sidechained to the kick. This is the **two notes** pattern.
- **Studio Brootle, ["Rolling Techno Bassline"](https://www.studiobrootle.com/rolling-techno-bassline-ableton/)** and **["Dub Techno Tutorial"](https://www.studiobrootle.com/dub-techno-tutorial-ableton/)**:
  - Leave the first 16th of every beat empty so the bass doesn't clash with the kick.
  - One note in almost every 16th, "with some other notes thrown in".
- **Loopcloud, ["Ultimate Basslines"](https://www.loopcloud.com/cloud/blog/4825-Ultimate-Basslines-how-to-program-and-produce-the-best-low-end-lines)**:
  - "Silence can be a bassline's most powerful asset."
  - Play just behind the kick.
  - Vary velocity the way a player would.
- **Roots reggae grooves**: [one drop](https://en.wikipedia.org/wiki/One_drop_rhythm), steppers and rockers, the lineage dub techno borrows from.

## The rules this adds up to

1. **Ostinato first.** The riff repeats as written. Variation makes one or two changes in the riff's own vocabulary, and the bigger change goes at the end of the phrase (bar 4, or bar 8 for 4-bar riffs).
2. **Space.** Dub: 1–3 notes a bar. Deep house: ~4. Hypnotic techno is the exception: it's busy, but on one note.
3. **Respect the kick.** Off-beat and rolling patterns never land on a beat, even with variation.
4. **Follow the chords, sometimes early.** Push anticipates changes by a 16th. Detroit and house follow every chord. Hypnotic techno drones on the key.
5. **Movement comes from sound.** Accents (soft vs normal velocity) are there to map to filter cutoff or envelope amount on the bass synth.

## Gaps

There are still no note-level transcriptions for deep house (Larry Heard, Kerri Chandler) or Basic Channel. Those patterns follow the descriptions above (syncopated, root, fifth and octave, octave-spanning, sparse), not transcriptions. Transcribing a few reference tracks into MIDI would be the next improvement.
