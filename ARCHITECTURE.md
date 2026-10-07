# MYSTERY MANSION — System Architecture

An original, server-authoritative deduction board game inspired by the classic
murder-mystery board-game formula. Original artwork, original character and
location names where required, no affiliation with or endorsement by any
commercial board game.

---

## 1. System architecture

```
                      ┌────────────────────────────────────────────┐
   Browser (human) ───▶│  React + TypeScript + Vite client          │
   Phone / tablet   ──▶│  • renders board (SVG), cards, notebook    │
                      │  • holds NO rules logic                    │
                      │  • receives public state + own private only │
                      └───────────────┬────────────────────────────┘
                                      │  Socket.IO  (same origin)
                                      │
              ┌───────────────────────▼────────────────────────────────┐
              │  Node + Express + Socket.IO server                      │
              │                                                         │
              │  RoomManager  ─ rooms, players, sessions, reconnection  │
              │      │                                                  │
              │      ├── GameEngine  (shared/rules — pure, deterministic)│
              │      │      deck / solution / movement / suggestions /   │
              │      │      accusations / turn order / victory          │
              │      │                                                  │
              │      ├── PlayerView  getPublicState(room, playerId)     │
              │      │               getPrivateState(room, playerId)    │
              │      │                                                  │
              │      └── AIController — one per bot, consumes a         │
              │             *PlayerView only* (literally the same data  │
              │             a human client receives). No engine hooks,  │
              │             no solution access.                          │
              └─────────────────────────────────────────────────────────┘
```

Key properties

* **Server-authoritative.** Dice, solution, hands, legal moves, suggestion
  resolution, accusation outcome and the winner are all produced by the server.
  The client sends *intents* (`game:move {to}`), never results.
* **Single rules implementation.** Human and AI actions both go through
  `GameEngine`. The AI is just another caller that never sees more than a
  `PlayerView`.
* **In-memory rooms** (v1) behind a `RoomStore` interface so Postgres/Redis can
  be dropped in later without touching the engine.

## 2. Folder structure

```
mystery-mansion/
├── shared/                    # rules + constants, imported by BOTH sides
│   └── src/
│       ├── constants/  cards.ts, characters.ts, board.ts, config.ts
│       ├── rules/      boardGraph.ts, movement.ts, deck.ts, engine.ts
│       └── types.ts, index.ts
├── server/
│   └── src/
│       ├── index.ts           express + socket.io bootstrap, static client
│       ├── rooms/             RoomManager, PlayerSession
│       ├── socket/            handlers.ts  (validation + emit)
│       ├── game/              GameRoom.ts (engine + timers + AI driving)
│       ├── ai/                AIController.ts, deduction.ts, strategy.ts
│       └── services/          network.ts (LAN IP + QR), ids.ts
├── client/
│   └── src/
│       ├── net/socket.ts      typed socket wrapper
│       ├── store/gameStore.ts zustand (public + private + local notebook)
│       ├── board/             Board.tsx, Rooms.tsx, Tokens.tsx, art.tsx
│       ├── cards/             Card.tsx (SVG faces + backs)
│       ├── lobby/             Home, Lobby, CharacterSelect, LocalHost
│       ├── game/              GameScreen, Dice, Controls, SuggestionModal,
│       │                      AccusationModal, RevealModal, Log, Victory
│       ├── notebook/          Notebook.tsx
│       └── styles/            theme.css, board.css, cards.css, ui.css
└── tests/                     engine, movement, deck, ai, multiplayer, security
```

## 3. Game-state model

```ts
GameState {
  gameId, roomCode, phase: 'lobby' | 'playing' | 'finished'
  players: Player[]              // seat order == turn order
  currentPlayerId, turnNumber
  solution: { suspect, weapon, room }   // NEVER leaves the server except at game end
  hands: Record<playerId, CardId[]>     // NEVER broadcast wholesale
  positions: Record<playerId, Position> // {kind:'corridor', cell} | {kind:'room', roomId}
  turn: TurnState                       // dice, movesLeft, flags
  pendingSuggestion?: PendingSuggestion
  log: LogEntry[]                       // public log
  winner?, solutionRevealed?
  settings: GameSettings
}
```

Public / private split:

* `getPublicState(room, playerId)` → players (name, character, card **count**,
  position, connection, eliminated), turn, dice, board, public log, and
  `legalMoves` **only** for the acting player.
* `getPrivateState(room, playerId)` → own hand, own notebook blob, cards shown
  to you, cards you were asked to reveal, private log lines.

## 4. Board representation

The board is authored as an ASCII map (24 × 25) in `shared/src/constants/board.ts`
and compiled once into a graph:

```ts
BoardNode {
  id            // 'c:12,7' corridor cell | 'r:library' room
  kind: 'corridor' | 'room'
  row, col      // anchor cell (rooms: centre)
  cells         // grid cells occupied
  roomId?
  neighbors: NodeId[]
  doors: { cell: Cell; from: NodeId }[]
  secretPassage?: RoomId
}
```

* Corridor cells link orthogonally to walkable neighbours.
* A corridor cell touching a room may be declared a **door**; stepping through a
  door enters the room (entering a room always ends movement).
* Rooms are single nodes for movement, so "walking around inside a room" is not
  a rule; tokens are laid out inside the room footprint for display.
* Two **secret passages** (Study ↔ Kitchen, Lounge ↔ Conservatory) are extra
  room↔room edges usable once per turn instead of rolling.

Board rules are data + pure functions; the SVG renderer only reads the graph.

## 5. Rules engine design

`shared/src/rules/engine.ts` exports pure reducers, each returning
`{ state, events }`:

```
createGame(players, settings)      deal deck, pick solution, seat tokens
startTurn(state)                   reset TurnState, skip eliminated
rollDice(state, rng)               authoritative 2×d6, compute legal moves
getLegalMoves(state, playerId)     BFS over graph w/ Cluedo movement rules
movePlayer(state, playerId, to)    validate path + remaining movement
useSecretPassage(state, playerId)  validate room has a passage, consume turn
makeSuggestion(state, p, s, w)     must be in room; moves suspect token
resolveSuggestion(state, ...)      ordered private disprove chain
revealCard(state, responder, card) private to suggester only
makeAccusation(state, p, s, w, r)  server compares to solution
nextTurn(state)
```

Movement rules implemented: no diagonals, no re-entering the room you left this
turn, no passing *through* a room, doors only, entering a room ends the move,
`movesLeft` accounting, "must use the roll (rooms excepted)" with a bounce
parity fallback so a player can never be trapped.

## 6. Socket event architecture

Client → server

```
room:create  room:join  room:leave  room:ready  room:setName
room:setCharacter  room:addAI  room:removePlayer  room:fillWithAI
room:setSettings  room:start  room:kick
game:roll  game:move  game:usePassage  game:endMove
game:suggest  game:reveal  game:accuse  game:endTurn
notebook:save  session:rejoin
```

Server → client

```
sync            { public, private }  — full state for THIS player
toast           styled in-game notification (errors never use alert())
ai:status       "Professor Plum is thinking…"
room:closed     room:lanInfo
game:over       { winner, solution }
connection      { status: 'reconnecting' | 'connected' }
```

Every handler runs through `assertPlayer / assertTurn / assertPhase` helpers and
returns a typed error that surfaces as a styled toast.

## 7. AI architecture

```
AIController(botId, difficulty, personality)
  view  : PlayerView        // same object a human gets — no solution, no hands
  brain : AIDeductionState  // per-bot private constraint solver
  act()  → roll → move → suggest → (accuse) → endTurn, with 500–2000ms delays
```

`AIDeductionState`

```ts
{
  myHand: Set<CardId>
  cardOwners: Map<CardId, { possible: Set<Owner>, status }>   // Owner = playerId | 'SOLUTION'
  handSizes: Map<playerId, number>
  seenReveals: { from, card }[]
  suggestionHistory: { by, suspect, weapon, room, disprovedBy?, shownToMe? }[]
  accusationHistory: []
}
```

Propagation rules: own hand ⇒ owner known; a card shown ⇒ owner known; "could
not disprove" ⇒ that player is struck from the possible-owners set; a hand whose
known cards fill it ⇒ the owner holds nothing else; when only three cards can
still be `SOLUTION` ⇒ accusation candidate. Difficulty tunes *how much* of this
is used and how much noise is added; personality tunes thresholds
(`analytical` waits for certainty, `aggressive` accuses on a strong hunch,
`careful` requires more evidence, `random` adds noise). Nothing in the solver
reads hidden state — a test asserts the AI view never contains `solution`.

## 8. Multiplayer synchronisation strategy

* One authoritative `GameState` per room; every mutation produces a new version
  counter (`version`).
* After each mutation the server calls `broadcast(room)`: each socket receives
  `sync` with **its own** public+private projection. Private data is emitted to
  a single socket, never to a room.
* Clients are dumb renderers: they keep the last `sync`, plus purely local UI
  state (notebook glyphs in progress, drawer open/closed, sound on/off).
* Optimistic UI is deliberately avoided for dice/moves: the client shows a
  pending state and waits for the server echo, which keeps every client in
  lockstep (same dice, same position, same turn).
* Reconnection: `playerId` + `reconnectToken` are persisted in
  `localStorage`; on load the client emits `session:rejoin`. Seats are held for
  a grace period (`DISCONNECT_GRACE_MS`), the player shows as DISCONNECTED, and
  an AI / auto-play stand-in can be enabled by the host for that seat.
* LAN: the same server binds `0.0.0.0`; `GET /api/network-info` returns the host
  LAN address, and the host screen renders a QR code of that URL. LAN mode and
  online mode are presented as separate, clearly-labelled choices because a
  hosted/cloud deployment cannot expose the player's own Wi-Fi.
