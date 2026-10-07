import type {
  CardId,
  SuggestionRecord,
  GameState,
  Intent,
  IntentResult,
  LogEntry,
  NodeId,
  Player,
  Position,
  PrivateGameState,
  PublicGameState,
  PublicPlayer,
  TurnStep,
  Solution,
} from '../types';
import {
  CHARACTER_BY_ID,
  CHARACTERS,
} from '../constants/characters';
import { CARD_BY_ID, cardName } from '../constants/cards';
import { ROOM_BY_ID } from '../constants/board';
import { dealGame, rollDice, type Rng } from './deck';
import { getBoard, corridorNodeId, roomNodeId, parseCell } from './boardGraph';
import { legalMovesFor, searchMoves } from './movement';

const board = getBoard();

let sequence = 0;
export function uid(prefix = 'id'): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}${sequence.toString(36)}${Math.floor(
    Math.random() * 1296,
  ).toString(36)}`;
}

/* ------------------------------------------------------------------ *
 * Position <-> node helpers
 * ------------------------------------------------------------------ */

export function positionToNode(pos: Position): NodeId {
  return pos.kind === 'room' ? roomNodeId(pos.roomId) : corridorNodeId(pos.cell.row, pos.cell.col);
}

export function nodeToPosition(nodeId: NodeId): Position {
  if (nodeId.startsWith('r:')) return { kind: 'room', roomId: nodeId.slice(2) };
  const { row, col } = parseCell(nodeId);
  return { kind: 'corridor', cell: { row, col } };
}

export function startPositionFor(characterId: string | null): Position {
  const character = characterId ? CHARACTER_BY_ID[characterId] : null;
  const start = character?.start ?? { row: 0, col: 0 };
  return { kind: 'corridor', cell: start };
}

/* ------------------------------------------------------------------ *
 * Creation / setup
 * ------------------------------------------------------------------ */

export function createGameState(opts: {
  gameId: string;
  roomCode: string;
  players: Player[];
  settings: GameState['settings'];
}): GameState {
  const state: GameState = {
    gameId: opts.gameId,
    roomCode: opts.roomCode,
    phase: 'lobby',
    settings: opts.settings,
    players: opts.players,
    currentPlayerId: null,
    turnNumber: 0,
    turnStep: 'roll',
    turn: {
      dice: null,
      total: 0,
      movesLeft: 0,
      hasMoved: false,
      hasSuggested: false,
      usedPassage: false,
      roomLeftThisTurn: null,
    },
    solution: null,
    hands: {},
    positions: {},
    eliminated: {},
    seen: {},
    shown: {},
    notebooks: {},
    pendingSuggestion: null,
    history: [],
    log: [],
    winnerId: null,
    revealedSolution: null,
    version: 0,
    startedAt: null,
    finishedAt: null,
  };
  for (const player of opts.players) {
    state.hands[player.id] = [];
    state.positions[player.id] = startPositionFor(player.characterId);
    state.eliminated[player.id] = false;
    state.seen[player.id] = [];
    state.shown[player.id] = [];
    state.notebooks[player.id] = {};
  }
  return state;
}

/**
 * Game setup, in the order the rules specify: choose one card of each
 * category for the envelope, shuffle and deal the rest, seat the tokens and
 * open the first turn.
 */
export function startGame(state: GameState, rng: Rng): void {
  const ids = state.players.map((p) => p.id);
  const { solution, hands } = dealGame(ids, rng);
  state.solution = solution;
  state.hands = hands;
  state.phase = 'playing';
  state.turnNumber = 0;
  state.startedAt = Date.now();
  state.log = [];
  for (const player of state.players) {
    state.positions[player.id] = startPositionFor(player.characterId);
    state.eliminated[player.id] = false;
  }
  pushLog(state, 'The case is opened. Nine rooms, six suspects, six weapons.', 'system');
  state.currentPlayerId = ids[ids.length - 1];
  nextTurn(state);
}

/* ------------------------------------------------------------------ *
 * Logging
 * ------------------------------------------------------------------ */

function pushLog(
  state: GameState,
  text: string,
  kind: LogEntry['kind'],
  forPlayerId?: string,
): LogEntry {
  const entry: LogEntry = {
    id: uid('log'),
    turn: state.turnNumber,
    text,
    kind,
    forPlayerId,
  };
  state.log.push(entry);
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
  return entry;
}

export function playerName(state: GameState, playerId: string): string {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 'Someone';
  const character = player.characterId ? CHARACTER_BY_ID[player.characterId] : null;
  return character ? character.short : player.name;
}

/* ------------------------------------------------------------------ *
 * Turn machinery
 * ------------------------------------------------------------------ */

function resetTurn(state: GameState): void {
  const pos = state.currentPlayerId ? state.positions[state.currentPlayerId] : null;
  state.turn = {
    dice: null,
    total: 0,
    movesLeft: 0,
    hasMoved: false,
    hasSuggested: false,
    usedPassage: false,
    roomLeftThisTurn: pos && pos.kind === 'room' ? pos.roomId : null,
  };
  state.turnStep = 'roll';
  state.version += 1;
}

function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => !state.eliminated[p.id]);
}

function finishGame(state: GameState, winnerId: string | null, reason: string): void {
  state.phase = 'finished';
  state.winnerId = winnerId;
  state.revealedSolution = state.solution;
  state.turnStep = 'over';
  state.finishedAt = Date.now();
  state.version += 1;
  pushLog(state, reason, 'system');
}

function checkGameOver(state: GameState): boolean {
  if (state.phase === 'finished') return true;
  const active = activePlayers(state);
  if (active.length === 0) {
    finishGame(state, null, 'Every detective has been eliminated — the case goes cold.');
    return true;
  }
  if (active.length === 1 && state.players.length > 1) {
    finishGame(
      state,
      active[0].id,
      `${playerName(state, active[0].id)} is the last detective standing and wins the case.`,
    );
    return true;
  }
  return false;
}

export function nextTurn(state: GameState): void {
  state.pendingSuggestion = null;
  if (checkGameOver(state)) return;
  const order = state.players.map((p) => p.id);
  if (!order.length) return;
  let index = state.currentPlayerId ? order.indexOf(state.currentPlayerId) : -1;
  let guard = 0;
  do {
    index = (index + 1) % order.length;
    guard += 1;
  } while (state.eliminated[order[index]] && guard <= order.length);

  if (state.eliminated[order[index]]) {
    finishGame(state, null, 'Every detective has been eliminated — the case goes cold.');
    return;
  }
  state.currentPlayerId = order[index];
  state.turnNumber += 1;
  resetTurn(state);
  pushLog(state, `${playerName(state, state.currentPlayerId)}'s turn.`, 'turn');
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export function legalMoves(state: GameState, playerId: string): NodeId[] {
  if (state.currentPlayerId !== playerId || state.turnStep !== 'move') return [];
  const pos = state.positions[playerId];
  if (!pos) return [];
  const { targets } = legalMovesFor(board, positionToNode(pos), state.turn.movesLeft);
  return targets;
}

export function legalMovePaths(
  state: GameState,
  playerId: string,
): Record<NodeId, NodeId[]> {
  if (state.currentPlayerId !== playerId || state.turnStep !== 'move') return {};
  const pos = state.positions[playerId];
  if (!pos) return {};
  const { paths } = legalMovesFor(board, positionToNode(pos), state.turn.movesLeft);
  return paths;
}

export function currentRoom(state: GameState, playerId: string): string | null {
  const pos = state.positions[playerId];
  return pos && pos.kind === 'room' ? pos.roomId : null;
}

function matchingCards(state: GameState, playerId: string, cards: CardId[]): CardId[] {
  return (state.hands[playerId] ?? []).filter((c) => cards.includes(c));
}

/* ------------------------------------------------------------------ *
 * Intents — the single mutation surface (humans and AI share it)
 * ------------------------------------------------------------------ */

export function applyIntent(
  state: GameState,
  playerId: string,
  intent: Intent,
  rng: Rng,
) : IntentResult {
  if (state.phase !== 'playing') return { ok: false, error: 'The game is not in play.' };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: 'You are not seated at this table.' };
  // Intents arrive from the network: anything that is not a plain object with a
  // known type is dropped here rather than thrown (a throw inside a socket
  // listener would take the whole server down).
  if (!intent || typeof intent !== 'object' || typeof (intent as Intent).type !== 'string') {
    return { ok: false, error: 'That is not a legal action.' };
  }
  if (typeof (intent as { to?: unknown }).to === 'object' && (intent as { to?: unknown }).to !== null) {
    return { ok: false, error: 'That is not a legal action.' };
  }

  if (intent.type === 'reveal') {
    return typeof intent.card === 'string'
      ? doReveal(state, playerId, intent.card)
      : { ok: false, error: 'That is not a card.' };
  }

  if (state.eliminated[playerId]) {
    return { ok: false, error: 'A discredited detective may only answer suggestions.' };
  }
  if (state.currentPlayerId !== playerId) {
    return { ok: false, error: 'It is not your turn.' };
  }

  switch (intent.type) {
    case 'roll':
      return doRoll(state, playerId, rng);
    case 'move':
      return typeof intent.to === 'string'
        ? doMove(state, playerId, intent.to)
        : { ok: false, error: 'That is not a place on the board.' };
    case 'usePassage':
      return doPassage(state, playerId);
    case 'suggest':
      return typeof intent.suspect === 'string' && typeof intent.weapon === 'string'
        ? doSuggest(state, playerId, intent.suspect, intent.weapon)
        : { ok: false, error: 'A suggestion needs a suspect and a weapon.' };
    case 'accuse':
      return typeof intent.suspect === 'string' &&
        typeof intent.weapon === 'string' &&
        typeof intent.room === 'string'
        ? doAccuse(state, playerId, intent.suspect, intent.weapon, intent.room)
        : { ok: false, error: 'An accusation needs a suspect, a weapon and a room.' };
    case 'endTurn':
      return doEndTurn(state, playerId);
    default:
      return { ok: false, error: 'Unknown action.' };
  }
}

function requireStep(state: GameState, ...steps: TurnStep[]): IntentResult | null {
  if (steps.includes(state.turnStep)) return null;
  return { ok: false, error: 'That move is not allowed right now.' };
}

function doRoll(state: GameState, playerId: string, rng: Rng): IntentResult {
  const blocked = requireStep(state, 'roll');
  if (blocked) return blocked;
  const dice = rollDice(rng);
  const total = dice[0] + dice[1];
  state.turn.dice = dice;
  state.turn.total = total;
  state.turn.movesLeft = total;
  state.turnStep = 'move';
  state.version += 1;
  pushLog(
    state,
    `${playerName(state, playerId)} rolled ${total} (${dice[0]} + ${dice[1]}).`,
    'roll',
  );
  if (legalMoves(state, playerId).length === 0) {
    pushLog(state, `${playerName(state, playerId)} has nowhere to go.`, 'move');
    state.turnStep = 'action';
  }
  return { ok: true, effect: 'roll' };
}

function doMove(state: GameState, playerId: string, to: NodeId): IntentResult {
  const blocked = requireStep(state, 'move');
  if (blocked) return blocked;
  const moves = legalMoves(state, playerId);
  if (!moves.includes(to)) return { ok: false, error: 'That is not a legal move.' };
  const { paths, dist } = searchMoves(
    board,
    positionToNode(state.positions[playerId]),
    state.turn.movesLeft,
  );
  const path = paths[to] ?? [to];
  const cost = dist[to] ?? 0;
  state.positions[playerId] = nodeToPosition(to);
  state.turn.movesLeft = Math.max(0, state.turn.movesLeft - cost);
  state.turn.hasMoved = true;
  state.version += 1;

  if (to.startsWith('r:')) {
    const roomId = to.slice(2);
    pushLog(state, `${playerName(state, playerId)} entered the ${ROOM_BY_ID[roomId]?.name}.`, 'move');
    state.turn.movesLeft = 0;
    state.turnStep = 'action';
  } else {
    pushLog(
      state,
      state.turn.movesLeft === 0
        ? `${playerName(state, playerId)} moved ${state.turn.total} squares.`
        : `${playerName(state, playerId)} moved ${cost} squares — ${state.turn.movesLeft} left.`,
      'move',
    );
    if (state.turn.movesLeft === 0) state.turnStep = 'action';
  }
  return { ok: true, effect: 'move' };
}

function doPassage(state: GameState, playerId: string): IntentResult {
  const blocked = requireStep(state, 'roll');
  if (blocked) return blocked;
  const pos = state.positions[playerId];
  if (pos.kind !== 'room') return { ok: false, error: 'You are not inside a room.' };
  const target = ROOM_BY_ID[pos.roomId]?.secretPassage;
  if (!target) return { ok: false, error: 'This room has no secret passage.' };
  state.positions[playerId] = { kind: 'room', roomId: target };
  state.turn.usedPassage = true;
  state.turn.movesLeft = 0;
  state.turnStep = 'action';
  state.version += 1;
  pushLog(
    state,
    `${playerName(state, playerId)} slipped through the secret passage to the ${
      ROOM_BY_ID[target]?.name
    }.`,
    'passage',
  );
  return { ok: true, effect: 'passage' };
}

function doSuggest(
  state: GameState,
  playerId: string,
  suspect: CardId,
  weapon: CardId,
): IntentResult {
  const blocked = requireStep(state, 'roll', 'action');
  if (blocked) return blocked;
  if (state.turn.hasSuggested) {
    return { ok: false, error: 'You may only make one suggestion per turn.' };
  }
  const pos = state.positions[playerId];
  if (pos.kind !== 'room') return { ok: false, error: 'You must be inside a room to suggest.' };
  if (CARD_BY_ID[suspect]?.category !== 'suspect') {
    return { ok: false, error: 'That is not a suspect.' };
  }
  if (CARD_BY_ID[weapon]?.category !== 'weapon') {
    return { ok: false, error: 'That is not a weapon.' };
  }

  const roomCard = `room:${pos.roomId}` as CardId;

  // The suggested suspect is summoned to the room.
  const suspectCharacter = suspect.startsWith('suspect:') ? suspect.slice('suspect:'.length) : '';
  const summoned = state.players.find((p) => p.characterId === suspectCharacter);
  if (summoned && summoned.id !== playerId) {
    state.positions[summoned.id] = { kind: 'room', roomId: pos.roomId };
  }

  const order = state.players
    .filter((p) => p.id !== playerId)
    .map((p) => p.id)
    .sort((a, b) => seatOf(state, a) - seatOf(state, b));

  const suggestionId = uid('sug');
  state.pendingSuggestion = {
    id: suggestionId,
    byId: playerId,
    suspect,
    weapon,
    room: roomCard,
    order,
    index: 0,
    passedIds: [],
    resolved: false,
  };
  state.history.push({
    id: suggestionId,
    byId: playerId,
    suspect,
    weapon,
    room: roomCard,
    passedIds: [],
    disprovedBy: null,
    resolved: false,
  });
  state.turn.hasSuggested = true;
  state.version += 1;
  pushLog(
    state,
    `${playerName(state, playerId)} suggests ${cardName(suspect)} with the ${cardName(
      weapon,
    )} in the ${ROOM_BY_ID[pos.roomId]?.name}.`,
    'suggest',
  );
  advanceSuggestion(state);
  return { ok: true, effect: 'suggest' };
}

function seatOf(state: GameState, playerId: string): number {
  const index = state.players.findIndex((p) => p.id === playerId);
  const current = state.players.findIndex((p) => p.id === state.currentPlayerId);
  if (index < 0 || current < 0) return index;
  return (index - current + state.players.length) % state.players.length;
}

/** Mirrors the pending suggestion into the public history (card identity kept out). */
function syncHistory(state: GameState, ps: SuggestionRecord): void {
  const record = state.history.find((h) => h.id === ps.id);
  if (!record) return;
  record.passedIds = [...ps.passedIds];
  record.disprovedBy = ps.disprovedBy ?? null;
  record.resolved = ps.resolved;
}

/** Walks the suggestion around the table until someone can disprove it. */
function advanceSuggestion(state: GameState): void {
  const ps = state.pendingSuggestion;
  if (!ps) return;
  const cards = [ps.suspect, ps.weapon, ps.room];
  while (ps.index < ps.order.length) {
    const responderId = ps.order[ps.index];
    if (matchingCards(state, responderId, cards).length > 0) {
      state.turnStep = 'reveal';
      state.version += 1;
      return;
    }
    ps.passedIds.push(responderId);
    syncHistory(state, ps);
    pushLog(
      state,
      `${playerName(state, responderId)} could not disprove the suggestion.`,
      'suggest',
    );
    ps.index += 1;
  }
  ps.resolved = true;
  syncHistory(state, ps);
  state.turnStep = 'action';
  state.version += 1;
  pushLog(state, 'No one could disprove the suggestion.', 'suggest');
}

function doReveal(state: GameState, playerId: string, card: CardId): IntentResult {
  const ps = state.pendingSuggestion;
  if (!ps || ps.resolved) return { ok: false, error: 'There is no suggestion to answer.' };
  if (state.turnStep !== 'reveal') return { ok: false, error: 'Nothing is waiting on you.' };
  if (ps.order[ps.index] !== playerId) {
    return { ok: false, error: 'It is not your turn to answer.' };
  }
  const cards = [ps.suspect, ps.weapon, ps.room];
  const matching = matchingCards(state, playerId, cards);
  if (!matching.includes(card)) {
    return { ok: false, error: 'You cannot show that card.' };
  }

  ps.shownCard = card;
  ps.disprovedBy = playerId;
  ps.resolved = true;
  syncHistory(state, ps);
  state.seen[ps.byId] = state.seen[ps.byId] ?? [];
  state.seen[ps.byId].push({ fromId: playerId, card, turn: state.turnNumber });
  state.shown[playerId] = state.shown[playerId] ?? [];
  state.shown[playerId].push({ toId: ps.byId, card, turn: state.turnNumber });

  // Public: who showed a card. Private: which card.
  pushLog(
    state,
    `${playerName(state, playerId)} showed a card to ${playerName(state, ps.byId)}.`,
    'reveal',
  );
  pushLog(
    state,
    `${playerName(state, playerId)} showed you: ${cardName(card)}.`,
    'reveal',
    ps.byId,
  );
  state.turnStep = 'action';
  state.version += 1;
  return { ok: true, effect: 'reveal' };
}

function doAccuse(
  state: GameState,
  playerId: string,
  suspect: CardId,
  weapon: CardId,
  room: CardId,
): IntentResult {
  const blocked = requireStep(state, 'roll', 'action');
  if (blocked) return blocked;
  if (CARD_BY_ID[suspect]?.category !== 'suspect') return { ok: false, error: 'Not a suspect.' };
  if (CARD_BY_ID[weapon]?.category !== 'weapon') return { ok: false, error: 'Not a weapon.' };
  if (CARD_BY_ID[room]?.category !== 'room') return { ok: false, error: 'Not a room.' };
  const solution = state.solution;
  if (!solution) return { ok: false, error: 'The case has not been opened.' };

  const correct =
    suspect === solution.suspect && weapon === solution.weapon && room === solution.room;

  pushLog(
    state,
    `${playerName(state, playerId)} accuses ${cardName(suspect)} with the ${cardName(
      weapon,
    )} in the ${cardName(room)}.`,
    'accuse',
  );

  if (correct) {
    finishGame(
      state,
      playerId,
      `${playerName(state, playerId)} solved the case. The envelope is opened.`,
    );
    return { ok: true, effect: 'accuse-correct' };
  }

  state.eliminated[playerId] = true;
  pushLog(
    state,
    `The accusation was wrong — ${playerName(state, playerId)} is out of the investigation.`,
    'accuse',
  );
  state.version += 1;
  if (!checkGameOver(state)) nextTurn(state);
  return { ok: true, effect: 'accuse-wrong' };
}

function doEndTurn(state: GameState, playerId: string): IntentResult {
  const blocked = requireStep(state, 'action', 'move');
  if (blocked) return blocked;
  const ps = state.pendingSuggestion;
  if (ps && !ps.resolved) return { ok: false, error: 'Finish the suggestion first.' };
  nextTurn(state);
  return { ok: true, effect: 'endTurn' };
}

/* ------------------------------------------------------------------ *
 * Projections — the ONLY way clients see the game
 * ------------------------------------------------------------------ */

export function getPublicState(state: GameState, viewerId: string | null): PublicGameState {
  const isViewerTurn = !!viewerId && state.currentPlayerId === viewerId;
  const ps = state.pendingSuggestion;
  return {
    gameId: state.gameId,
    roomCode: state.roomCode,
    phase: state.phase,
    players: state.players.map<PublicPlayer>((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      isHost: p.isHost,
      ready: p.ready,
      connected: p.connected,
      characterId: p.characterId,
      seat: p.seat,
      cardCount: (state.hands[p.id] ?? []).length,
      position: state.positions[p.id],
      eliminated: !!state.eliminated[p.id],
      difficulty: p.difficulty,
      personality: p.personality,
    })),
    currentPlayerId: state.currentPlayerId,
    turnNumber: state.turnNumber,
    turnStep: state.turnStep,
    dice: state.turn.dice,
    movesLeft: state.turn.movesLeft,
    positions: { ...state.positions },
    legalMoves: isViewerTurn ? legalMoves(state, viewerId as string) : [],
    legalMovePaths: isViewerTurn ? legalMovePaths(state, viewerId as string) : {},
    pendingSuggestion: ps
      ? {
          id: ps.id,
          byId: ps.byId,
          suspect: ps.suspect,
          weapon: ps.weapon,
          room: ps.room,
          respondingPlayerId:
            state.turnStep === 'reveal' && !ps.resolved ? ps.order[ps.index] ?? null : null,
          passedIds: ps.passedIds,
          resolved: ps.resolved,
        }
      : null,
    log: state.log.filter((entry) => !entry.forPlayerId || entry.forPlayerId === viewerId),
    history: state.history.slice(),
    winnerId: state.winnerId,
    revealedSolution: state.revealedSolution,
    settings: state.settings,
    version: state.version,
  };
}

export function getPrivateState(state: GameState, viewerId: string): PrivateGameState {
  const pos = state.positions[viewerId];
  const roomId = pos && pos.kind === 'room' ? pos.roomId : null;
  const ps = state.pendingSuggestion;
  const isRevealer =
    !!ps && state.turnStep === 'reveal' && !ps.resolved && ps.order[ps.index] === viewerId;
  const isViewerTurn = state.currentPlayerId === viewerId;
  const eliminated = !!state.eliminated[viewerId];

  return {
    hand: (state.hands[viewerId] ?? []).slice(),
    notebook: state.notebooks[viewerId] ?? {},
    seenCards: state.seen[viewerId] ?? [],
    shownHistory: state.shown[viewerId] ?? [],
    revealRequest: isRevealer
      ? {
          suggestionId: ps!.id,
          byId: ps!.byId,
          suspect: ps!.suspect,
          weapon: ps!.weapon,
          room: ps!.room,
          matching: matchingCards(state, viewerId, [ps!.suspect, ps!.weapon, ps!.room]),
        }
      : null,
    lastReveal:
      ps && ps.byId === viewerId && ps.resolved && ps.shownCard && ps.disprovedBy
        ? { fromId: ps.disprovedBy, card: ps.shownCard }
        : null,
    legalMoves: isViewerTurn ? legalMoves(state, viewerId) : [],
    canAccuse:
      isViewerTurn && !eliminated && state.phase === 'playing' && (state.turnStep === 'roll' || state.turnStep === 'action'),
    canSuggest:
      isViewerTurn &&
      !eliminated &&
      state.phase === 'playing' &&
      !!roomId &&
      !state.turn.hasSuggested &&
      (state.turnStep === 'action' || state.turnStep === 'roll') &&
      !(ps && !ps.resolved),
    canUsePassage:
      isViewerTurn &&
      !eliminated &&
      state.turnStep === 'roll' &&
      !!roomId &&
      !!ROOM_BY_ID[roomId]?.secretPassage,
  };
}

export function getPlayerView(state: GameState, viewerId: string) {
  return {
    public: getPublicState(state, viewerId),
    private: getPrivateState(state, viewerId),
  };
}

/** Used by the victory screen and by nothing else. */
export function revealSolution(state: GameState): Solution | null {
  return state.revealedSolution;
}

export function allCharacters() {
  return CHARACTERS;
}
