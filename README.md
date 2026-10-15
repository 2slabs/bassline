# bassline

A bassline generator for Ableton Live, the companion to [chord-progressions](../chord-progressions). It follows a chord or melody clip, or starts from scratch, and writes a genre-shaped bass clip for techno, dub techno and house.

A [2sl](https://2sl.to) project. Built on Ableton's Extensions SDK (public beta).

## Use it

Right-click → **Generate Bassline…**

| where | what it follows | where the bass goes |
|---|---|---|
| a MIDI clip | that clip (chords or a melody) | a new "Bass" track or another MIDI track, same scene slot (or the same arrangement position). Takes the source clip's colour. |
| an empty clip slot | a MIDI clip in the same scene, or nothing (from scratch) | that slot |
| a time selection on a MIDI track | other tracks' clips under the selection, or nothing | that track, at the selection |

In the dialog:

- **follow / key**: the source, and its key. The key comes from Live's Scale Mode when it's on; otherwise it's detected (tonic from the first chord, mode from the notes). Change it if it's wrong.
- **chords**: how often the source's chords may change (½ bar, 1 bar, 2 bars). From scratch: how many chords, how long, and **c** for new ones (same engine and styles as chord-progressions).
- **style** sets the bass defaults per genre (what they're based on: [RESEARCH.md](RESEARCH.md)):

  | style | pattern | feel |
  |---|---|---|
  | dub techno | rising steps | sub register, ~3 notes a bar, stepwise around the ♭7, 4-bar call and response |
  | deep house | syncopated | 2-bar riff on root / octave / seventh, pickup, 56% swing |
  | classic house | jack | jacking ostinato, pickup, push, 54% swing |
  | detroit | dotted 8ths | a hit every third 16th, following the chords a 16th early |
  | hypnotic techno | rolling 16ths | one note between the kicks, drone on the key |
  | functional (pop) | root and fifth | approach notes, pickup |

- **pattern**: riffs of one to four bars in dub, deep house, house, detroit, techno and simple groups, or draw your own on the step grid. Each step is a *role*: `R` root, `O` octave, `F` fifth, `D` fifth below, `B` scale step below (the ♭7 in minor), `S` seventh, lowercase = soft (custom patterns can also use `T` third, `A` approach, `P` passing).
- **register** (sub / low / mid); **moves** with every **chord**, once a **bar**, or drones on the **key**.
- **variation**: at 0 the riff repeats exactly. Higher values make one or two changes in the riff's own notes and rework the end of each phrase.
- **approach** (a semitone into each chord change), **pickup** (one note at the end of the loop leading back to the top), **push** (changes land a 16th early), **swing**.
- Accents come out as two velocities: map velocity to your bass synth's filter for movement.
- **generate** (g) rolls new variation; **preview** (space) plays the bass at your tempo, optionally with the chords quietly underneath.

The bass is always monophonic, held notes re-strike on chord changes, and the first note of each chord is a chord tone.

## Install

Requires **Ableton Live 12 Suite, 12.4.5 or later, with Extensions** (currently the Live beta). Drop the `.ablx` onto **Settings → Extensions**.

If the right-click item doesn't appear, turn off **Settings → Extensions → Developer Mode**: while it's on, Live waits for a development host and installed extensions' menus don't show.

## Develop

Setup is the same as chord-progressions (Node ≥ 24.16; copy the SDK `.tgz` files into `vendor/`, write `.env`, `npm install`; the SDK can't be redistributed so it isn't in the repo).

```sh
npm test            # analysis + bass engine
npm run ui          # the dialog in a browser, with a sample source clip
npm start           # run in Live on its own
../dev-all.sh       # run chord-progressions AND bassline in one host
npm run package     # → bassline-<version>.ablx
```

Live's Developer Mode accepts one Extension Host at a time, so run companions together with `../dev-all.sh` (it builds each and starts one host with both).

| path | what |
|---|---|
| `src/analysis.ts` | key detection, chord-per-window detection from any MIDI |
| `src/bass.ts` | bass patterns (role strings), style defaults, generation |
| `src/extension.ts` | Live side: the three entry points, finding sources and targets, writing the clip |
| `src/music/` | the music core from chord-progressions (`scripts/sync-music.sh`; edit it there) |
| `ui/` | the dialog; `ui/2sl/` is the 2sl-ui design system (synced; edit in 2sl-ui) |

## Credits

UI: 2sl-ui. Font: [Cozette](https://github.com/slavfox/Cozette) (MIT). Ableton and Live are trademarks of Ableton AG; this project isn't affiliated with or endorsed by Ableton.

## License

MIT, see [LICENSE](LICENSE). That covers this repo's code. The Ableton Extensions SDK isn't included and is under Ableton's own licence. Fonts and other bundled assets keep their own licences (Cozette: MIT).
