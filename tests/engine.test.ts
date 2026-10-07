import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  CARD_BY_ID,
  CHARACTERS,
  applyIntent,
  createGameState,
  getPrivateState,
  getPublicState,
  legalMoves,
  mulberry32,
  startGame,
  startPositionFor,
  type GameSettings,
  type GameState,
  type Player,
  type Solution,
} from '@mystery/shared';
import { ROOMS } from '../shared/src/constants/board';
import { dealGame, shuffle } from '../shared/src/rules/deck';
import { getBoard, roomNodeId, corridorNodeId } from '../shared/src/rules/boardGraph';
import { searchMoves } from '../shared/src/rules/movement';

const settings: GameSettings = {
  aiDifficulty: 'medium',
  aiPersonality: 'analytical',
  autoPlayDisconnected: true,
  minPlayers: 3,
  maxPlayers: 6,
};

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    isAI: false,
    isHost: i === 0,
    ready: true,
    connected: true,
    characterId: CHARACTERS[i].id,
    seat: i,
    difficulty: 'medium' as const,
    personality: 'analytical' as const,
    lastSeen: 0,
    disconnectedAt: null,
  }));
}

function newGame(count = 4, seed = 7): GameState {
  const state = createGameState({
    gameId: 'g1',
    roomCode: 'ABCDE',
    players: makePlayers(count),
    settings,
  });
  startGame(state, mulberry32(seed));
  return state;
}

describe('deal and solution', () => {
  it('draws one card of each category for the envelope', () => {
    const rng = mulberry32(1);
    for (let seed = 0; seed < 40; seed++) {
      const { solution } = dealGame(['a', 'b', 'c', 'd'], rng);
      expect(CARD_BY_ID[solution.suspect].category).toBe('suspect');
      expect(CARD_BY_ID[solution.weapon].category).toBe('weapon');
      expect(CARD_BY_ID[solution.room].category).toBe('room');
    }
  });

  it('deals every remaining card exactly once', () => {
    const rng = mulberry32(99);
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const { solution, hands } = dealGame(ids, rng);
    const dealt = Object.values(hands).flat();
    expect(dealt).toHaveLength(ALL_CARDS.length - 3);
    expect(new Set(dealt).size).toBe(dealt.length);
    for (const id of [solution.suspect, solution.weapon, solution.room]) {
      expect(dealt).not.toContain(id);
    }
  });

  it('deals as evenly as possible', () => {
    const { hands } = dealGame(['a', 'b', 'c'], mulberry32(5));
    const sizes = Object.values(hands).map((h) => h.length).sort();
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('rejects games outside 3-6 players', () => {
    expect(() => dealGame(['a', 'b'], mulberry32(1))).toThrow();
    expect(() => dealGame(['a', 'b', 'c', 'd', 'e', 'f', 'g'], mulberry32(1))).toThrow();
  });

  it('shuffling does not lose or duplicate cards', () => {
    const rng = mulberry32(3);
    const deck = ALL_CARDS.map((c) => c.id);
    const out = shuffle(deck, rng);
    expect(out).toHaveLength(deck.length);
    expect(new Set(out).size).toBe(deck.length);
  });

  it('seats every token on its own start square', () => {
    const state = newGame(6, 11);
    const seen = new Set<string>();
    for (const player of state.players) {
      const pos = state.positions[player.id];
      expect(pos.kind).toBe('corridor');
      const expected = startPositionFor(player.characterId);
      expect(pos).toEqual(expected);
      if (pos.kind === 'corridor') seen.add(`${pos.cell.row},${pos.cell.col}`);
    }
    expect(seen.size).toBe(6);
  });
});

describe('turn order', () => {
  it('opens with player one and advances in seat order', () => {
    const state = newGame(4, 21);
    expect(state.currentPlayerId).toBe('p0');
    expect(state.turnNumber).toBe(1);
    applyIntent(state, 'p0', { type: 'roll' }, mulberry32(2));
    expect(applyIntent(state, 'p0', { type: 'endTurn' }, mulberry32(2)).ok).toBe(true);
    expect(state.currentPlayerId).toBe('p1');
    applyIntent(state, 'p1', { type: 'roll' }, mulberry32(2));
    applyIntent(state, 'p1', { type: 'endTurn' }, mulberry32(2));
    expect(state.currentPlayerId).toBe('p2');
  });

  it('refuses actions from a player whose turn it is not', () => {
    const state = newGame(4, 22);
    expect(applyIntent(state, 'p2', { type: 'roll' }, mulberry32(2)).ok).toBe(false);
  });

  it('skips eliminated detectives', () => {
    const state = newGame(4, 23);
    state.eliminated.p1 = true;
    applyIntent(state, 'p0', { type: 'roll' }, mulberry32(2));
    applyIntent(state, 'p0', { type: 'endTurn' }, mulberry32(2));
    expect(state.currentPlayerId).toBe('p2');
  });
});

describe('dice and movement', () => {
  it('only produces legal destinations inside the step budget', () => {
    const state = newGame(4, 31);
    applyIntent(state, 'p0', { type: 'roll' }, mulberry32(31));
    const moves = legalMoves(state, 'p0');
    expect(moves.length).toBeGreaterThan(0);
    const board = getBoard();
    const from = corridorNodeId(
      state.positions.p0.kind === 'corridor' ? state.positions.p0.cell.row : 0,
      state.positions.p0.kind === 'corridor' ? state.positions.p0.cell.col : 0,
    );
    const { dist } = searchMoves(board, from, state.turn.total);
    for (const move of moves) expect(dist[move]).toBeLessThanOrEqual(state.turn.total);
  });

  it('refuses a move that is not reachable', () => {
    const state = newGame(4, 32);
    applyIntent(state, 'p0', { type: 'roll' }, mulberry32(32));
    const far = roomNodeId(
      ROOMS.map((r) => r.id).find((id) => id !== 'study') as string,
    );
    const before = JSON.stringify(state.positions.p0);
    applyIntent(state, 'p0', { type: 'move', to: far }, mulberry32(1));
    const reachable = legalMoves(state, 'p0');
    if (!reachable.includes(far)) {
      expect(JSON.stringify(state.positions.p0)).toBe(before);
    }
  });

  it('accepts a legal move and spends the movement', () => {
    const state = newGame(4, 33);
    applyIntent(state, 'p0', { type: 'roll' }, mulberry32(33));
    const moves = legalMoves(state, 'p0');
    const corridorMove = moves.find((m) => m.startsWith('c:')) ?? moves[0];
    const before = state.turn.movesLeft;
    const result = applyIntent(state, 'p0', { type: 'move', to: corridorMove }, mulberry32(1));
    expect(result.ok).toBe(true);
    expect(state.turn.movesLeft).toBeLessThanOrEqual(before);
  });

  it('ends the move when a room is entered', () => {
    const state = newGame(4, 34);
    // walk the player next to a doorway first
    state.positions.p0 = { kind: 'corridor', cell: { row: 6, col: 2 } };
    applyIntent(state, 'p0', { type: 'roll' }, mulberry32(34));
    const study = roomNodeId('study');
    if (legalMoves(state, 'p0').includes(study)) {
      applyIntent(state, 'p0', { type: 'move', to: study }, mulberry32(1));
      expect(state.positions.p0).toEqual({ kind: 'room', roomId: 'study' });
      expect(state.turnStep).toBe('action');
      expect(state.turn.movesLeft).toBe(0);
    }
  });
});

describe('secret passages', () => {
  it('moves between the paired rooms and costs the turn', () => {
    const state = newGame(4, 41);
    state.positions.p0 = { kind: 'room', roomId: 'study' };
    const result = applyIntent(state, 'p0', { type: 'usePassage' }, mulberry32(1));
    expect(result.ok).toBe(true);
    expect(state.positions.p0).toEqual({ kind: 'room', roomId: 'kitchen' });
    expect(state.turnStep).toBe('action');
    // rolling is no longer allowed this turn
    expect(applyIntent(state, 'p0', { type: 'roll' }, mulberry32(1)).ok).toBe(false);
  });

  it('refuses a passage from a room that has none', () => {
    const state = newGame(4, 42);
    state.positions.p0 = { kind: 'room', roomId: 'hall' };
    expect(applyIntent(state, 'p0', { type: 'usePassage' }, mulberry32(1)).ok).toBe(false);
  });
});

describe('suggestions', () => {
  it('requires the suggester to be inside a room', () => {
    const state = newGame(4, 51);
    expect(
      applyIntent(state, 'p0', { type: 'suggest', suspect: 'suspect:plume', weapon: 'weapon:rope' }, mulberry32(1)).ok,
    ).toBe(false);
  });

  it('summons the suggested suspect into the room', () => {
    const state = newGame(4, 52);
    state.positions.p0 = { kind: 'room', roomId: 'library' };
    const other = state.players[1];
    const suspectCard = `suspect:${other.characterId}`;
    state.positions[other.id] = { kind: 'corridor', cell: { row: 0, col: 0 } };
    applyIntent(
      state,
      'p0',
      { type: 'suggest', suspect: suspectCard, weapon: 'weapon:rope' },
      mulberry32(1),
    );
    expect(state.positions[other.id]).toEqual({ kind: 'room', roomId: 'library' });
  });

  it('walks the suggestion round the table until someone can disprove it', () => {
    const state = newGame(4, 53);
    state.positions.p0 = { kind: 'room', roomId: 'library' };
    // Give p3 the only matching card so p1 and p2 are skipped.
    state.hands.p1 = ['weapon:wrench'];
    state.hands.p2 = ['weapon:dagger'];
    state.hands.p3 = ['weapon:rope'];
    applyIntent(
      state,
      'p0',
      { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' },
      mulberry32(1),
    );
    const ps = state.pendingSuggestion!;
    expect(ps.room).toBe('room:library');
    expect(state.turnStep).toBe('reveal');
    expect(ps.order[ps.index]).toBe('p3');
    expect(ps.passedIds).toEqual(['p1', 'p2']);
  });

  it('reports when nobody can disprove', () => {
    const state = newGame(4, 54);
    state.positions.p0 = { kind: 'room', roomId: 'library' };
    state.hands.p1 = ['weapon:wrench'];
    state.hands.p2 = ['weapon:dagger'];
    state.hands.p3 = ['weapon:candlestick'];
    applyIntent(
      state,
      'p0',
      { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' },
      mulberry32(1),
    );
    expect(state.pendingSuggestion!.resolved).toBe(true);
    expect(state.log.at(-1)?.text).toMatch(/No one could disprove/i);
  });

  it('only allows one suggestion per turn', () => {
    const state = newGame(4, 55);
    state.positions.p0 = { kind: 'room', roomId: 'library' };
    const intent = { type: 'suggest' as const, suspect: 'suspect:vance', weapon: 'weapon:rope' };
    expect(applyIntent(state, 'p0', intent, mulberry32(1)).ok).toBe(true);
    // resolve the first one
    const ps = state.pendingSuggestion!;
    if (!ps.resolved) {
      const responder = ps.order[ps.index];
      const matching = state.hands[responder].filter((c) =>
        [ps.suspect, ps.weapon, ps.room].includes(c),
      );
      applyIntent(state, responder, { type: 'reveal', card: matching[0] }, mulberry32(1));
    }
    expect(applyIntent(state, 'p0', intent, mulberry32(1)).ok).toBe(false);
  });
});

describe('private card reveals', () => {
  function setup(seed = 61): { state: GameState; responder: string; card: string } {
    const state = newGame(4, seed);
    state.positions.p0 = { kind: 'room', roomId: 'library' };
    // p1 and p3 hold nothing relevant, so p2 is the one who must answer.
    state.hands.p0 = ['weapon:candlestick'];
    state.hands.p1 = ['weapon:wrench'];
    state.hands.p2 = ['weapon:rope'];
    state.hands.p3 = ['weapon:dagger'];
    applyIntent(
      state,
      'p0',
      { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' },
      mulberry32(1),
    );
    return { state, responder: 'p2', card: 'weapon:rope' };
  }

  it('lets only the suggester learn which card was shown', () => {
    const { state, responder, card } = setup();
    expect(applyIntent(state, responder, { type: 'reveal', card }, mulberry32(1)).ok).toBe(true);

    const suggester = getPublicState(state, 'p0');
    const bystander = getPublicState(state, 'p1');
    const privateSuggester = getPrivateState(state, 'p0');

    expect(privateSuggester.lastReveal).toMatchObject({ fromId: responder, card });
    // The suggester's own log carries the private line naming the card...
    const suggesterText = suggester.log.filter((l) => l.kind === 'reveal').map((l) => l.text).join(' ');
    expect(suggesterText).toMatch(/showed a card/i);
    expect(suggesterText).toMatch(/Rope/i);

    // ...while everyone else only learns that a card changed hands. The
    // suggestion itself (Rope) is public; the answer is not.
    const bystanderReveals = bystander.log.filter((l) => l.kind === 'reveal').map((l) => l.text);
    expect(bystanderReveals.length).toBe(1);
    expect(bystanderReveals[0]).toMatch(/showed a card to/i);
    expect(bystanderReveals[0]).not.toMatch(/showed you/i);
    expect(bystanderReveals[0]).not.toMatch(/Rope/i);
  });

  it('never puts the solution or other hands into a player projection', () => {
    const { state, responder, card } = setup();
    applyIntent(state, responder, { type: 'reveal', card }, mulberry32(1));
    const solution = state.solution!;
    for (const viewer of ['p0', 'p1', 'p2', 'p3']) {
      const pub = JSON.stringify(getPublicState(state, viewer));
      const priv = JSON.stringify(getPrivateState(state, viewer));
      // No envelope, no hands, no "which card" bookkeeping outside its owner.
      for (const blob of [pub, priv]) {
        expect(blob).not.toMatch(/"solution"/);
        expect(blob).not.toMatch(/"hands"/);
        expect(blob).not.toMatch(/"shownCard"/);
      }
      // Only p0 was told that p2 holds the Rope.
      if (viewer === 'p0') {
        expect(priv).toContain('weapon:rope');
      } else if (viewer !== 'p2') {
        const hand = JSON.stringify(getPrivateState(state, viewer).hand);
        expect(hand).not.toContain('weapon:rope');
      }
    }
    expect(solution.suspect).toBeTruthy();
  });

  it('refuses to show a card the player does not hold', () => {
    const { state, responder } = setup();
    expect(
      applyIntent(state, responder, { type: 'reveal', card: 'weapon:wrench' }, mulberry32(1)).ok,
    ).toBe(false);
  });

  it('refuses a reveal from somebody who was not asked', () => {
    const { state, card } = setup();
    expect(applyIntent(state, 'p1', { type: 'reveal', card }, mulberry32(1)).ok).toBe(false);
  });

  it('offers the responder only their matching cards', () => {
    const { state, responder, card } = setup();
    const request = getPrivateState(state, responder).revealRequest;
    expect(request).toBeTruthy();
    expect(request!.matching).toContain(card);
    expect(request!.room).toBe('room:library');
  });
});

describe('accusations and victory', () => {
  it('ends the game when the envelope is matched', () => {
    const state = newGame(4, 71);
    const solution = state.solution as Solution;
    const result = applyIntent(
      state,
      'p0',
      { type: 'accuse', ...solution },
      mulberry32(1),
    );
    expect(result.ok).toBe(true);
    expect(result.effect).toBe('accuse-correct');
    expect(state.phase).toBe('finished');
    expect(state.winnerId).toBe('p0');
    expect(state.revealedSolution).toEqual(solution);
  });

  it('eliminates the accuser on a wrong accusation and passes the turn', () => {
    const state = newGame(4, 72);
    const wrong = {
      suspect: 'suspect:vance',
      weapon: 'weapon:rope',
      room: 'room:library',
    };
    const sameAsSolution =
      wrong.suspect === state.solution!.suspect &&
      wrong.weapon === state.solution!.weapon &&
      wrong.room === state.solution!.room;
    if (sameAsSolution) return; // seed dependent, skip
    const result = applyIntent(state, 'p0', { type: 'accuse', ...wrong }, mulberry32(1));
    expect(result.ok).toBe(true);
    expect(result.effect).toBe('accuse-wrong');
    expect(state.eliminated.p0).toBe(true);
    expect(state.currentPlayerId).toBe('p1');
    expect(state.phase).toBe('playing');
  });

  it('still asks an eliminated detective to disprove suggestions', () => {
    const state = newGame(4, 73);
    state.eliminated.p2 = true;
    state.positions.p0 = { kind: 'room', roomId: 'library' };
    state.hands.p2 = ['weapon:rope'];
    state.hands.p1 = ['weapon:wrench'];
    state.hands.p3 = ['weapon:dagger'];
    applyIntent(
      state,
      'p0',
      { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' },
      mulberry32(1),
    );
    const ps = state.pendingSuggestion!;
    expect(ps.order[ps.index]).toBe('p2');
    expect(applyIntent(state, 'p2', { type: 'reveal', card: 'weapon:rope' }, mulberry32(1)).ok).toBe(true);
  });

  it('ends the case when only one detective is left standing', () => {
    const state = newGame(3, 74);
    state.eliminated.p1 = true;
    state.eliminated.p2 = true;
    state.currentPlayerId = 'p0';
    applyIntent(state, 'p0', { type: 'roll' }, mulberry32(1));
    applyIntent(state, 'p0', { type: 'endTurn' }, mulberry32(1));
    expect(state.phase).toBe('finished');
    expect(state.winnerId).toBe('p0');
  });
});
