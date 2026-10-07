# Background music

There is no music in the repository — this folder is an empty slot. Drop a
looping track in here and it plays during the game, quietly, until the player
switches it off.

## Where to put it

```
client/public/audio/music.mp3
```

That is the first name the game looks for. If you would rather use another, any
of these will do — the game tries them in this order and plays the first one
that loads:

1. `music.mp3`
2. `music.ogg`
3. `music.m4a`
4. `ambience.mp3`
5. `bgm.mp3`

If none of them exist, the game stays silent. A missing file is not an error:
nothing is logged as a failure and nothing in the interface changes, because a
switch that does nothing would be worse than no switch at all.

## What to aim for

| | |
| --- | --- |
| Length | 15–60 seconds, seamless loop (your 15 s piece is exactly right) |
| Level | Plays back at 32% volume; master it a little loud, not compressed flat |
| Format | MP3 or OGG; M4A works in most browsers |
| Size | Under 2 MB |

It loops forever, so the seam matters more than the length. Fade the last beat
into the first if you can.

## How it behaves

- **It never starts on its own.** Browsers refuse to play audio before the
  player has clicked or tapped something, so the music begins with the player's
  first gesture.
- **It steps aside for the opening film.** While `intro.mp4` is playing the
  music drops to a whisper, then fades back when the film ends.
- **It pauses when the tab is hidden** and resumes when you come back.
- **Fades, never cuts.** Switching it off takes about half a second, and the
  `Music: On/Off` switch in the game's top bar (and on the home screen)
  remembers its choice between visits.

## Sound effects are separate

The clicks, dice, footsteps and cards are synthesised in the browser at
runtime — see `client/src/audio/sfx.ts`. They need no files and are controlled
by the `Sound` switch, independently of the music.
