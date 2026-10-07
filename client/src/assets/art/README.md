# Artwork slots

Every file here is a **placeholder**. Replace any of them with your own art,
keeping the exact filename, and it shows up on the next reload — no code change
and no rebuild needed. The server serves this folder directly (a copy also ends
up inside `client/dist` at build time, but that copy is not the one you get).

If a file is missing or broken the game silently falls back to the original
vector art it ships with, so nothing ever looks broken.

```
art/
  cards/    one picture per card            ->  card faces (the art window)
  rooms/    one picture per room            ->  painted inside each room on the board
  board/    board-bg.png                    ->  the board surface behind the grid
```

## Recommended sizes

| Slot | Recommended | Aspect | Notes |
| --- | --- | --- | --- |
| `cards/suspect-*.png` | 768 × 1024 | 3 : 4 portrait | People stand up; portrait suits them |
| `cards/weapon-*.png` | 1024 × 768 | 4 : 3 landscape | Objects lie down; landscape suits them |
| `cards/room-*.png` | 1024 × 1024 | 1 : 1 | Fills the window — **reuse the same file as the room floor** |
| `rooms/<room>.png` | 1024 × 1024 | 1 : 1 | Square floor texture; drawn at 55% opacity, multiplied over the room tint |
| `board/board-bg.png` | **2112 × 2200** | 24 : 25 | Full board surface — exactly one movement square per 88 px, so the grid lines up with the walkable squares |

**Nothing is cropped.** The art window is roughly square (836 × 826, or
836 × 975 on cards whose name is a single word), and the picture is fitted
inside it whole — the window's own ivory shows above and below anything that is
not square, like a plate mounted on the card. Room floors are the exception:
they are cropped to fill their room, which is why they want to be square.

PNG or WebP. Aim for **200–400 KB each**; a full set of 21 lands around
6–8 MB, which is fine — the table still loads quickly on a phone.

**For what each picture should actually show** — a prompt per card, per room
floor and for the board — see [`ART-BRIEF.md`](./ART-BRIEF.md).

## The board surface

`board/board-bg.png` is the only file with a hard geometric requirement. The
board is **24 columns × 25 rows** of movement squares, and the picture is laid
down at exactly that rectangle — so it must be **24:25** or the squares drift.
At 2112 × 2200 each square is a clean 88 px.

Two things the shipped picture does that a replacement should too:

- The grid is drawn **only on the 227 walkable squares**. Room fills are 16%
  opaque, so anything underneath shows through — a grid crossing a room floor
  looks like a mistake.
- The cloister court (rows 7–17, columns 8–15) is a separate paved panel; it is
  never walkable.

## The 21 card files

Suspects — `suspect-vance`, `suspect-kane`, `suspect-whitmore`,
`suspect-greenwood`, `suspect-marlowe`, `suspect-plume`

Weapons — `weapon-candlestick`, `weapon-dagger`, `weapon-leadpipe`,
`weapon-revolver`, `weapon-rope`, `weapon-wrench`

Rooms — `room-study`, `room-hall`, `room-lounge`, `room-library`, `room-dining`,
`room-billiard`, `room-kitchen`, `room-conservatory`, `room-ballroom`

## The 9 room files

`study`, `hall`, `lounge`, `library`, `dining`, `billiard`, `kitchen`,
`conservatory`, `ballroom`

## Palette

Warm ivory, aged paper, dark walnut, burgundy, forest green, muted brass,
charcoal. Muted and period; nothing neon, nothing glossy.
