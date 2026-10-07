# MYSTERY MANSION

An original, server-authoritative deduction board game for 3–6 players — any mix of
humans and bots, online or over one Wi-Fi network. It follows the classic
murder-mystery board-game formula: move through a mansion, suggest suspect +
weapon + room, privately disprove suggestions, and be the first to name the three
cards sealed in the envelope.

The names, characters, rooms, board layout, card art, pawn art, type and sound are
all original work produced for this project. This is a personal/educational
implementation and is not affiliated with, endorsed by, or derived from any
commercial board game or its artwork.

---

## Running it

```bash
npm install          # once, at the repo root (npm workspaces)
npm run build        # builds shared -> server -> client
npm start            # serves the built client + game server on port 3000
```

Then open **http://localhost:3000**.

For development (hot reload, Vite dev server on 5173 proxying to the game server):

```bash
npm run dev
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | 104 vitest specs (board, engine, AI, multiplayer, full-game simulations, security) |
| `npm run typecheck` | TypeScript across `shared`, `server`, `client` |
| `npm run build` | `tsc -b` for every workspace + `vite build` |

Configuration is via environment variables: `PORT` (default `3000`),
`HOST` (default `0.0.0.0`), `CLIENT_ORIGIN` (comma-separated origins allowed to
open a socket from another host; unset = same-origin only, which is what you
want when the client is served by this server).

---

## Joining a game: name, then seat

Identity is deliberately Skribbl-like — no account, no password, no email:

1. **You are asked for a name before anything else.** The home screen is a name
   gate ("What shall we call you?"). Nothing else appears until you pick one,
   and the name is remembered in that browser.
2. **The server issues your seat a session token** (192 random bits) which is
   kept in `localStorage`. Name + token is the whole identity: it is what lets
   you reclaim your seat — and your cards — after a dropped connection or a
   reload. Nothing is stored about you anywhere else.
3. **Names are unique per table**, compared case- and space-insensitively, and
   enforced on the server (not just in the form). If somebody else at the table
   is already "Alex", you get *"That name is already at the table."* inline and
   simply pick another — no `alert()`, no page reload. Renaming later is
   possible from the home screen, and the same rule applies.
4. Names are 2–18 characters, must contain a letter or number, and are stripped
   of anything else, so the shared case log can never be forged with newlines or
   markup.

## Artwork and the opening film

The game ships with original vector art for the board and every card, but every
picture is also an **optional slot**: drop your own file in with the same name
and it takes over on the next reload. Nothing needs rebuilding, and a missing
file simply falls back to the drawing underneath, so the table never looks
broken.

| What | Where (under `client/public/`) | Size |
| --- | --- | --- |
| Card art (21 files) | `art/cards/suspect-vance.png`, `weapon-rope.png`, `room-study.png`, … | 768 × 1024 (suspects), 1024 × 768 (weapons), 1024 × 1024 (rooms) |
| Room floors (9 files) | `art/rooms/study.png`, `hall.png`, … | 1024 × 1024 |
| Board surface | `art/board/board-bg.png` | 2080 × 2160 |
| Opening film | `cinematic/intro.mp4` | 1080p, ~8 s, with sound, under 5 MB |
| Background music | `audio/music.mp3` | looping, 15 s or longer, under 2 MB |

The filenames are listed in full in `client/public/art/README.md`, with a
prompt for each picture in `client/public/art/ART-BRIEF.md`; the film's
spec is in `client/public/cinematic/README.md` and the music's in
`client/public/audio/README.md`. **All four slots currently hold
placeholders** — the art is waiting to be generated, and `intro.mp4` does not
exist yet, so the built-in storyboard runs instead: title, the backstory typed
out, the six suspects in their colours, then "The envelope is sealed. The case
is open." Skippable with a click or Esc.

## Sound

Two independent switches, in the game's top bar and on the home screen, both
remembered between visits:

- **Sound** — the effects: dice, footsteps, cards, a suggestion, a card being
  shown, a wrong guess, the end of the case. They are synthesised in the browser
  at runtime (`client/src/audio/sfx.ts`), so there are no files to ship.
- **Music** — a looping track of your own in `client/public/audio/music.mp3`.
  It waits for the player's first click before starting (browsers insist),
  steps down while the opening film plays, pauses when the tab is hidden, and
  fades rather than cuts. With no file present the game is simply quiet.

## The table, on a laptop and on a phone

**Laptop / desktop (over 1000px wide).** The board owns the left of the screen;
a dossier rail on the right holds your cards, the detective notes and the case
log. The dice, **Roll dice** and **End turn** live in a strip directly under the
board, on the left — never under the dossier. Folding the rail away with
**Hide** gives the board the extra width back, with a smooth slide.

Cards in the dossier are small so a full hand fits; **click or tap one to lift
it out** at reading size (300px on a laptop, 280px on a phone). Click it again,
click away, or press **Esc** to put it back.

**Phone (1000px and under).** The board goes full width, and the cards, notes
and log move into a drawer under it: tap **Cards**, **Notes** or **Log** to open
one. The screen keeps a 10px margin at the bottom (plus the device's own safe
area) so the drawer tabs never sit under a swipe-home gesture bar.

## Playing with friends on Discord

The multiplayer itself is ready: create a table, press **Copy invite link**, and
paste it into your Discord channel. Anyone who opens it gets the code filled in,
picks a name, and sits down. Bots fill empty chairs, reconnection keeps seats
warm, and 3–6 players can mix humans and bots freely.

Two honest caveats:

- **It needs a host that stays up.** Rooms live in memory on the server, and the
  address in this sandbox's preview is temporary. For a real game night, run it
  somewhere your friends can reach — see the recipes below.
- **There is no in-game chat or voice.** Use a Discord voice channel for the
  banter; the game itself talks through the private card reveals and the shared
  case log.

Hosting recipes, in rough order of effort:

```bash
# 1. On your own machine, for one evening (tunnel, no router config):
npm run build && npm start                  # port 3000
npx cloudflared tunnel --url http://localhost:3000   # gives you an https URL to paste in Discord
#    (ngrok http 3000 works the same way)

# 2. On your home network: npm start, then forward port 3000 to that machine.

# 3. On a small VPS / Fly.io / Railway / Render: clone, npm install, npm run build,
#    npm start (set PORT and HOST; put it behind Caddy or nginx for TLS).
```

Behind a proxy, keep the WebSocket upgrade headers (`Upgrade`, `Connection`) and
remember `CLIENT_ORIGIN` if the client is served from a different host.

## How to play

1. **Create game** (online) or **Host local game** (same Wi-Fi). You get a five
   character code such as `K7P4X`.
2. Everyone joins with the code. **Bots are per chair and entirely optional** —
   every empty chair has a little switch: flip it on to seat a bot, flip a
   seated bot's switch off to take it out again. **Fill with bots** /
   **Clear bots** do the same in one click, and you can play with no bots at
   all. Choose a character; the host can change or remove seats.
3. The host presses **Start game** (needs at least three players, human or bot,
   and every human ready).
4. On your turn: **roll**, click a highlighted square or room to walk (the board
   shows every legal destination), then either **make a suggestion**, **make an
   accusation**, or **end your turn**.
5. A suggestion names a suspect and a weapon *in the room you are standing in*.
   The suspect's pawn is summoned into that room. Starting with the player on your
   left, the first detective holding one of the three named cards shows **you** one
   card — privately. Everyone else only learns that a card was shown, and by whom.
6. Enter a corner room and you may slip through its **secret passage** to the
   opposite corner instead of rolling.
7. When you are certain, **accuse**. Correct: the envelope is opened and you win.
   Wrong: you are out of the case (you can no longer accuse) but you still take
   part in disproving other people's suggestions.
8. Keep notes in the **Detective notes** pad (Unknown → Possible → Confirmed →
   Eliminated). It is private to you and lives in your browser.
9. **Cards are small on purpose** — a whole hand has to fit beside the board.
   Click (or tap) any card in your hand to lift it out full size, then click it
   again, click anywhere off it, or press **Esc** to put it back.

---

## What is where

```
shared/    rules, data and types — imported by both server and client
  src/constants/   characters, cards, board layout (data, no behaviour)
  src/rules/       boardGraph, movement, deck, engine   ← ALL rules live here
  src/types.ts     GameState, PlayerView, Intent, …
server/    authority
  src/game/Room.ts        one table: intents in, PlayerViews out, AI scheduling
  src/rooms/RoomManager.ts rooms, codes, sessions, disconnects
  src/socket/handlers.ts  the socket event surface
  src/ai/                 AIController + AIDeductionState
client/    presentation only — it computes no dice, no solution, no legal moves
  src/board/  SVG mansion, pawns
  src/cards/  original card art
  src/game/   board screen, dice tray, pickers, victory
  src/notebook/ detective pad
  src/store/  zustand store wired to the socket
tests/     71 specs
```

The design rationale — the eight-part architecture (system, folders, state model,
board representation, rules engine, socket events, AI, sync strategy) — is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Server authority (the short version)

The client never decides anything that matters. It sends **intents**
(`roll`, `move`, `usePassage`, `suggest`, `reveal`, `accuse`, `endTurn`); the
server runs them through `applyIntent()` on the one true `GameState`, and sends
back a per-player projection:

- `getPublicGameState(viewerId)` — everything on the table, plus legal moves
  *only for the player whose turn it is*.
- `getPrivatePlayerState(viewerId)` — that player's hand, cards they have been
  shown, any card they owe someone, and their notebook.

The solution, other players' hands, other players' notebooks and the identity of a
privately shown card are never serialised into a view that is not their owner's.
`tests/multiplayer.test.ts` and `tests/fullgame.test.ts` assert this on every
simulated game: after each seat's full projection is stringified, no card id or
card name appears that the seat could not legitimately know.

Dice are rolled on the server. Movement is path-based over the board graph — a
client cannot teleport, because it can only ask for a node the server already
listed as reachable.

---

## The bots

`AIController` receives exactly the same `PlayerView` a human client does — no
engine hooks, no solution, no other hands. Its own `AIDeductionState` records what
it has seen: cards it holds, cards it has been shown, who passed on what, and what
that implies. Difficulty only changes how well it uses that information
(Easy/Medium/Hard), personality changes its taste in moves and risks
(Analytical/Aggressive/Careful/Random). It thinks for 500–2000 ms per decision and
the table is told what it is doing ("Professor Plume is deciding where to move…").

An easy bot has no patience either: from turn fifteen it may accuse on a
**hunch** — the same information, acted on far too soon. It is usually wrong and
sits out the rest of the case. Without that, a table of easy bots used to grind
for a thousand turns, because an easy bot never gathers enough to be *certain*
and so never accused at all. Medium and hard bots keep their nerve; hard bots
finish a case in roughly twenty to thirty turns, easy ones in forty to a
hundred.

Bots are optional and controlled one chair at a time: the host flips a switch on
an empty chair to seat one, or flips a seated bot's switch off to remove it
(**Fill with bots** / **Clear bots** do it in bulk). Any mix works — six humans,
six bots, or anything between, and a table with no bots at all is perfectly
normal. Changing difficulty or personality in the lobby re-seats the bots that
are already in their chairs.

Bots do not get special rules. `tests/fullgame.test.ts` plays complete six-bot
cases and asserts, among other things, that hard analytical bots solve cases in
fewer turns than easy random ones.

---

## Security model

The client is treated as hostile: it is a renderer, never an authority. Every
test in `tests/security.test.ts` (27 of them) is an attack a curious player
could actually attempt with devtools.

**What the server never sends.** The envelope, other players' hands, other
players' notebooks, session tokens and the identity of a privately shown card
are never serialised into a view that is not their owner's. Legal moves are
projected only for the player whose turn it is, so a client cannot even *see*
someone else's options. Tests stringify every seat's full projection after
complete games and assert no card id, card name or internal key appears that the
seat could not legitimately know.

**What the server never trusts.** Intents are attributed to the socket's own
seat (`socket.data`, set server-side) — never to anything in the payload, so
"roll as the host" is refused. Turn order, step order, dice, movement legality,
card ownership, suggestion resolution and accusation outcomes are all
recomputed server-side; a client can only ask for things the server had already
offered.

| Control | How |
| --- | --- |
| Seat secrets | Reconnect tokens are 192-bit `crypto.randomBytes`, and room codes come from `crypto.randomInt` |
| Forged rejoin | Wrong player id, fabricated, empty and brute-forced tokens are all refused |
| Malformed packets | A null/primitive/oversized intent is refused, never thrown — a throw inside a socket listener would have crashed the server for everyone |
| Prototype pollution | `__proto__` payloads reach nothing assignable; `Object.prototype` is asserted clean after the attempt |
| Text injection | Player names keep only letters, digits, space, `.`, `'`, `-`, capped at 18 chars — no newlines, no markup, so the shared log cannot be forged |
| Enumeration | Difficulty/personality are whitelisted; unknown values fall back instead of reaching the AI |
| Flooding | Per-socket, per-event sliding-window limits (30 intents / 5 s, 6 rooms / min, 20 joins / min, …) with an immediate ack so honest clients never hang |
| Capacity | Hard ceiling of 500 live rooms; idle rooms are swept; the detective pad is capped at 128 small string entries (~8 KB) |
| Cross-origin | Socket CORS is **off** unless you list origins in `CLIENT_ORIGIN`; it never reflects an arbitrary origin back with credentials |
| Static/HTTP | `nosniff`, no path traversal, `/api/qr` accepts only `http(s)` URLs (it encodes text — it never fetches), `/api/network-info` discloses LAN addresses only to private-range callers |

**Residual risks, stated plainly.** There is no authentication beyond a name and
a room code: anyone with the code can take a seat, so treat a code like a shared
secret (names are unique per table, which stops impersonation *inside* a game,
but not a stranger joining from a leaked link). State is
in-memory, so a restart clears every table. There is no TLS and no per-IP rate
limit here — for anything public, run it behind a reverse proxy that terminates
TLS, caps connections per IP, and sets a CSP (the app uses inline styles, so a
CSP needs `style-src 'unsafe-inline'`; it uses no inline scripts and no
external assets).

## Reconnection

Each seat gets a session token stored in the browser. Close the tab, lose Wi-Fi,
or reload: the seat is kept (others see **Disconnected**), and the home screen
offers **Rejoin game**. Bots stand in for disconnected humans only if the table
has enabled it (host setting), so a dropped player never blocks the game.

---

## Notes on the artwork

Everything visible was drawn for this project: the mansion board is a hand-authored
SVG with per-room floor patterns, the six pawns are vector portraits with their own
palettes, the cards are generated SVG scenes, and the WebAudio sound effects are
synthesised at runtime (no audio files). Fonts (Cormorant Garamond, Playfair
Display, Spectral) are self-hosted under `client/src/assets/fonts`, so the game
renders identically offline.

The visual language is deliberately that of a physical game: warm ivory paper,
dark walnut, burgundy, forest green and muted brass, with restrained motion — no
glass, no neon, no gradients-by-the-bucket.
