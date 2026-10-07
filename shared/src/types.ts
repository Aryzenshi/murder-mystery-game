/**
 * MYSTERY MANSION — shared type vocabulary
 *
 * Everything here is imported by BOTH the server (authoritative) and the
 * client (renderer). Nothing in this file may contain secret information
 * about a running game.
 */

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

export type CardCategory = 'suspect' | 'weapon' | 'room';

/** Stable card id, e.g. "suspect:plume", "weapon:rope", "room:library". */
export type CardId = string;

export interface Card {
  id: CardId;
  name: string;
  category: CardCategory;
  /** Key into the client's SVG art table. */
  art: string;
}

export interface Solution {
  suspect: CardId;
  weapon: CardId;
  room: CardId;
}

/* ------------------------------------------------------------------ *
 * Board
 * ------------------------------------------------------------------ */

export type RoomId = string;

export interface Cell {
  row: number;
  col: number;
}

export interface Rect {
  row: number;
  col: number;
  width: number;
  height: number;
}

export type Position =
  | { kind: 'corridor'; cell: Cell }
  | { kind: 'room'; roomId: RoomId };

/** "c:12,7" for corridor cells, "r:library" for rooms. */
export type NodeId = string;

export interface BoardNode {
  id: NodeId;
  kind: 'corridor' | 'room';
  /** Grid cells this node covers (rooms: whole footprint). */
  cells: Cell[];
  /** Centre cell — used for rendering + token placement. */
  anchor: Cell;
  roomId?: RoomId;
  neighbors: NodeId[];
  /** Corridor cells that act as doorways into this room. */
  doors: Cell[];
  /** Rooms reachable by secret passage from this room. */
  secretPassage?: RoomId;
}

export interface BoardGraph {
  width: number;
  height: number;
  nodes: Record<NodeId, BoardNode>;
  /** "row,col" -> owning node id (rooms own their whole footprint). */
  cellOwner: Record<string, NodeId>;
  /** True when the grid cell can be walked on. */
  walkable: boolean[][];
  rooms: RoomId[];
}

/* ------------------------------------------------------------------ *
 * Players / lobby
 * ------------------------------------------------------------------ */

export type CharacterId = string;

export interface CharacterDef {
  id: CharacterId;
  /** Full name, e.g. "Miss Ruby Vance". */
  name: string;
  /** Short name for tight UI, e.g. "Miss Vance". */
  short: string;
  title: string;
  /** Primary token colour. */
  color: string;
  /** Deeper shade for shadows / engraving. */
  shade: string;
  /** Token silhouette variant. */
  token: 'heirloom' | 'colonel' | 'housekeeper' | 'businessman' | 'socialite' | 'scholar';
  start: Cell;
  /** Classic archetype this character is inspired by (documentation only). */
  archetype: string;
}

export type AiDifficulty = 'easy' | 'medium' | 'hard';
export type AiPersonality = 'analytical' | 'aggressive' | 'careful' | 'random';

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  characterId: CharacterId | null;
  seat: number;
  difficulty: AiDifficulty;
  personality: AiPersonality;
  /** Server-only bookkeeping. */
  lastSeen: number;
  disconnectedAt: number | null;
}

/* ------------------------------------------------------------------ *
 * Game state (server-authoritative)
 * ------------------------------------------------------------------ */

export type GamePhase = 'lobby' | 'playing' | 'finished';

export type TurnStep =
  /** Waiting for the active player to roll (or use a secret passage). */
  | 'roll'
  /** Dice rolled, waiting for a legal destination. */
  | 'move'
  /** In a room (or finished moving) — may suggest, accuse or end turn. */
  | 'action'
  /** A suggestion is working its way around the table. */
  | 'suggestion'
  /** Waiting for a single player to privately pick a disproving card. */
  | 'reveal'
  | 'over';

export interface TurnState {
  dice: [number, number] | null;
  total: number;
  movesLeft: number;
  hasMoved: boolean;
  hasSuggested: boolean;
  usedPassage: boolean;
  /** Room the player occupied when the turn began (cannot re-enter this turn). */
  roomLeftThisTurn: RoomId | null;
}

export interface SuggestionRecord {
  id: string;
  byId: string;
  suspect: CardId;
  weapon: CardId;
  room: CardId;
  /** Players still owed a chance to disprove, in seating order. */
  order: string[];
  index: number;
  passedIds: string[];
  disprovedBy?: string;
  /** Server-only: the card that was shown. */
  shownCard?: CardId;
  resolved: boolean;
}

/**
 * A suggestion as the whole table may remember it: who asked, what was asked,
 * who could not help and who produced a card — but never WHICH card. This is
 * exactly what a human player may write in their notebook, which is why it is
 * safe for the AI to read too.
 */
export interface PublicSuggestionRecord {
  id: string;
  byId: string;
  suspect: CardId;
  weapon: CardId;
  room: CardId;
  passedIds: string[];
  disprovedBy: string | null;
  resolved: boolean;
}

export type LogVisibility = 'public' | 'private';

export interface LogEntry {
  id: string;
  turn: number;
  text: string;
  /** Present for entries that only one player may see. */
  forPlayerId?: string;
  kind: 'turn' | 'roll' | 'move' | 'suggest' | 'reveal' | 'accuse' | 'system' | 'passage';
}

export interface GameSettings {
  aiDifficulty: AiDifficulty;
  aiPersonality: AiPersonality;
  /** Host may let the server babysit a dropped human seat. */
  autoPlayDisconnected: boolean;
  minPlayers: number;
  maxPlayers: number;
}

export interface GameState {
  gameId: string;
  roomCode: string;
  phase: GamePhase;
  settings: GameSettings;
  players: Player[];
  currentPlayerId: string | null;
  turnNumber: number;
  turnStep: TurnStep;
  turn: TurnState;
  /** SERVER ONLY — never included in a PlayerView unless the game is over. */
  solution: Solution | null;
  /** SERVER ONLY. */
  hands: Record<string, CardId[]>;
  positions: Record<string, Position>;
  eliminated: Record<string, boolean>;
  /** SERVER ONLY — cards each player has been shown (private to that player). */
  seen: Record<string, { fromId: string; card: CardId; turn: number }[]>;
  /** SERVER ONLY — cards each player has shown to others. */
  shown: Record<string, { toId: string; card: CardId; turn: number }[]>;
  /** SERVER ONLY — opaque notebook blobs, echoed back to their owner only. */
  notebooks: Record<string, Record<string, string>>;
  pendingSuggestion: SuggestionRecord | null;
  /** Publicly observable suggestion history (no card identities). */
  history: PublicSuggestionRecord[];
  log: LogEntry[];
  winnerId: string | null;
  /** Set when the case is solved (or goes cold) — safe to broadcast. */
  revealedSolution: Solution | null;
  version: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/* ------------------------------------------------------------------ *
 * Projections
 * ------------------------------------------------------------------ */

export interface PublicPlayer {
  id: string;
  name: string;
  isAI: boolean;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  characterId: CharacterId | null;
  seat: number;
  cardCount: number;
  position: Position;
  eliminated: boolean;
  difficulty: AiDifficulty;
  personality: AiPersonality;
}

export interface PublicGameState {
  gameId: string;
  roomCode: string;
  phase: GamePhase;
  players: PublicPlayer[];
  currentPlayerId: string | null;
  turnNumber: number;
  turnStep: TurnStep;
  dice: [number, number] | null;
  movesLeft: number;
  positions: Record<string, Position>;
  /** Only populated for the acting player. */
  legalMoves: NodeId[];
  /** Only populated for the acting player. */
  legalMovePaths: Record<NodeId, NodeId[]>;
  pendingSuggestion: {
    id: string;
    byId: string;
    suspect: CardId;
    weapon: CardId;
    room: CardId;
    respondingPlayerId: string | null;
    passedIds: string[];
    resolved: boolean;
  } | null;
  log: LogEntry[];
  /** Every suggestion so far, as any attentive player could have noted it. */
  history: PublicSuggestionRecord[];
  winnerId: string | null;
  revealedSolution: Solution | null;
  settings: GameSettings;
  version: number;
}

export interface RevealRequest {
  suggestionId: string;
  byId: string;
  suspect: CardId;
  weapon: CardId;
  room: CardId;
  matching: CardId[];
}

export interface PrivateGameState {
  hand: CardId[];
  notebook: Record<string, string>;
  /** Cards this player has been shown, and by whom. */
  seenCards: { fromId: string; card: CardId; turn: number }[];
  /** Cards this player has shown to others. */
  shownHistory: { toId: string; card: CardId; turn: number }[];
  revealRequest: RevealRequest | null;
  /** Result of the last suggestion this player made. */
  lastReveal: { fromId: string; card: CardId } | null;
  legalMoves: NodeId[];
  canAccuse: boolean;
  canSuggest: boolean;
  canUsePassage: boolean;
}

export interface PlayerView {
  public: PublicGameState;
  private: PrivateGameState;
}

/* ------------------------------------------------------------------ *
 * Intents (the ONLY way state changes)
 * ------------------------------------------------------------------ */

export type Intent =
  | { type: 'roll' }
  | { type: 'move'; to: NodeId }
  | { type: 'usePassage' }
  | { type: 'suggest'; suspect: CardId; weapon: CardId }
  | { type: 'reveal'; card: CardId }
  | { type: 'accuse'; suspect: CardId; weapon: CardId; room: CardId }
  | { type: 'endTurn' };

export interface IntentResult {
  ok: boolean;
  error?: string;
  /** Short human-readable effect used for AI pacing / client animation. */
  effect?: string;
}
