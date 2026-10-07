# The opening film

Drop a file called **`intro.mp4`** in this folder and it plays, full screen and
**with sound**, before the first turn. The background music drops to a whisper
while the film has the floor, then fades back in.

```
cinematic/
  intro.mp4     <- you supply this (not in the repo yet)
```

- **8 seconds** is the length the built-in storyboard is timed to; the film
  plays for exactly as long as the file is, then hands over to the table.
- H.264 / MP4, `yuv420p`, with an AAC audio track — 1920 × 1080 at ~5 Mbps is
  plenty. Keep it under ~5 MB.

Its sound is switched on and off with everything else: the `Sound` switch in the
game's top bar silences the film too. If the browser refuses to play audio
because the player has not touched the page yet, the film plays silently rather
than not at all.
- It is skippable: clicking anywhere, pressing Esc, or pressing Skip ends it
  immediately, whether it is the film or the storyboard.

**Until that file exists**, the game shows the same story as an animated title
card: the crest and title, the backstory typed out one character at a time, the
six suspects appearing in their colours, then *"The envelope is sealed. The
case is open."* Same beats, same 8 seconds.

The story (original, written for this game — no trademarked characters):

> Saturday evening, a quarter to nine. Sir Cornelius Ashgrove lies dead at the
> foot of the cellar stairs, on a spot the housekeeper has marked with a
> trembling X. Miss Ruby Vance found him — her screams carried as far as the
> village. Six guests remain in the house for the weekend. All are anxious to
> talk. One of them is lying.

It plays once per case (tracked in `sessionStorage`), so a refresh or a
reconnect does not force it on anybody. `prefers-reduced-motion` skips the
typing and closes after a moment.
