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
- **style** sets the bass defaults per genre:

  | style | pattern | feel |
  |---|---|---|
  | dub techno | sub on the one | long sub notes, sub register |
  | deep house | offbeat octaves | approach notes, turnaround, 58% swing, push |
  | classic house | walking | approach notes, turnaround, 54% swing, push |
  | detroit techno | rolling 8ths | approach notes |
  | hypnotic techno | rolling 16ths | leaves the kick alone |
  | functional (pop) | root and fifth | approach notes, turnaround |

- **pattern**: 18 patterns in dub, house, detroit, techno and simple groups, or draw your own on the step grid. Each step is a *role*: `R` root, `O` octave, `F` fifth, `A` approach, lowercase = ghost (in custom patterns, also `T` third, `S` seventh, `P` passing tone).
- **register** (sub / low / mid), **variation** (octave swaps, fifths, ghost notes), **approach** (a semitone into each chord change), **turnaround** (last two beats lead back to the top), **push** (changes land a 16th early), **swing**.
- **generate** (g) rolls new variation; **preview** (space) plays the bass at your tempo, optionally with the chords quietly underneath.

The bass is always monophonic, held notes re-strike on chord changes, and the first note of each chord is its root.

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
