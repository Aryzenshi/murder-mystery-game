import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARD_BY_ID,
  ALL_CARDS,
  getPlayerView,
  type CardId,
  type PlayerView,
  type PublicGameState,
  type PrivateGameState,
  type PublicSuggestionRecord,
  type AiDifficulty,
  type AiPersonality,
} from '@mystery/shared';
import {
  createDeduction,
  observe,
  solutionCandidates,
  uncertainty,
  SOLUTION,
} from '../server/src/ai/deduction';
import { AIController } from '../server/src/ai/AIController';
import { Room } from '../server/src/game/Room';
import { createApp } from '../server/src/app';

/* ------------------------------------------------------------------ *
 * A hand-built case the solver must crack
 * ------------------------------------------------------------------ */

const ME = 'p0';
const PLAYERS = ['p0', 'p1', 'p2', 'p3'];
const HAND_SIZES = { p0: 5, p1: 5, p2: 4, p3: 4 };
const MY_HAND: CardId[] = [
  'weapon:dagger',
  'weapon:wrench',
  'suspect:kane',
  'room:kitchen',
  'room:hall',
];
const TRUTH = {
  suspect: 'suspect:vance',
  weapon: 'weapon:rope',
  room: 'room:library',
};

const record = (
  id: string,
  byId: string,
  suspect: CardId,
  weapon: CardId,
  room: CardId,
  passedIds: string[],
  disprovedBy: string | null,
): PublicSuggestionRecord => ({
  id,
  byId,
  suspect,
  weapon,
  room,
  passedIds,
  disprovedBy,
  resolved: true,
});

describe('AI deduction solver', () => {
  it('starts by knowing only its own hand', () => {
    const brain = createDeduction(ME, PLAYERS, HAND_SIZES, MY_HAND);
    for (const card of MY_HAND) expect(brain.known[card]).toBe(ME);
    for (const card of ALL_CARDS) {
      if (MY_HAND.includes(card.id)) continue;
      expect(brain.possible[card.id].has(ME)).toBe(false);
    }
    const solution = solutionCandidates(brain);
    expect(solution.certain).toBe(false);
    expect(solution.suspect).not.toContain('suspect:kane');
  });

  it('never claims to know the envelope before it has evidence', () => {
    const brain = createDeduction(ME, PLAYERS, HAND_SIZES, MY_HAND);
    expect(solutionCandidates(brain).probability).toBeLessThan(1);
  });

  it('converges on the true solution from legitimate information only', () => {
    const brain = createDeduction(ME, PLAYERS, HAND_SIZES, MY_HAND);

    // Cards physically shown to this detective over the course of the game.
    const seen: { fromId: string; card: CardId; turn: number }[] = [
      { fromId: 'p1', card: 'suspect:greenwood', turn: 1 },
      { fromId: 'p1', card: 'weapon:candlestick', turn: 2 },
      { fromId: 'p1', card: 'weapon:leadpipe', turn: 3 },
      { fromId: 'p1', card: 'room:study', turn: 4 },
      { fromId: 'p1', card: 'room:dining', turn: 5 },
      { fromId: 'p2', card: 'suspect:marlowe', turn: 6 },
      { fromId: 'p2', card: 'suspect:whitmore', turn: 7 },
      { fromId: 'p2', card: 'weapon:revolver', turn: 8 },
      { fromId: 'p3', card: 'suspect:plume', turn: 9 },
    ];

    // What the whole table watched happen (no card identities).
    const history: PublicSuggestionRecord[] = [
      record('r1', 'p1', 'suspect:plume', 'weapon:candlestick', 'room:conservatory', ['p2'], 'p3'),
      record('r2', 'p1', 'suspect:greenwood', 'weapon:rope', 'room:ballroom', ['p2'], 'p3'),
      record('r3', 'p1', 'suspect:vance', 'weapon:wrench', 'room:lounge', ['p2'], 'p3'),
      record('r4', 'p1', 'suspect:kane', 'weapon:dagger', 'room:library', ['p2', 'p3'], 'p0'),
    ];

    const pub = { history } as unknown as PublicGameState;
    const priv = { seenCards: seen, hand: MY_HAND } as unknown as PrivateGameState;
    observe(brain, pub, priv);
    observe(brain, pub, priv);

    const solution = solutionCandidates(brain);
    expect(solution.certain).toBe(true);
    expect(solution.best).toEqual(TRUTH);
    expect(brain.known['room:billiard']).toBe('p2');
    expect(brain.known['suspect:plume']).toBe('p3');
  });

  it('an "easy" brain that ignores the table stays imperfect', () => {
    const brain = createDeduction(ME, PLAYERS, HAND_SIZES, MY_HAND);
    const history: PublicSuggestionRecord[] = [
      record('r1', 'p1', 'suspect:plume', 'weapon:candlestick', 'room:conservatory', ['p2'], 'p3'),
    ];
    const pub = { history } as unknown as PublicGameState;
    const priv = { seenCards: [], hand: MY_HAND } as unknown as PrivateGameState;
    observe(brain, pub, priv, { useHistory: false });
    // Without the public history it only knows its own five cards.
    expect(solutionCandidates(brain).certain).toBe(false);
    expect(uncertainty(brain, 'weapon:rope')).toBeGreaterThan(1);
  });

  it('a card that nobody can hold must be the envelope', () => {
    const brain = createDeduction(ME, PLAYERS, HAND_SIZES, MY_HAND);
    // Every other suspect is handed out, leaving exactly one.
    const seen = [
      'suspect:kane',
      'suspect:greenwood',
      'suspect:marlowe',
      'suspect:plume',
      'suspect:whitmore',
    ].filter((c) => c !== 'suspect:kane');
    const priv = {
      seenCards: seen.map((card, i) => ({
        fromId: i < 2 ? 'p1' : i < 4 ? 'p2' : 'p3',
        card: card as CardId,
        turn: i,
      })),
      hand: MY_HAND,
    } as unknown as PrivateGameState;
    observe(brain, { history: [] } as unknown as PublicGameState, priv);
    expect(brain.known['suspect:vance']).toBe(SOLUTION);
  });
});

/* ------------------------------------------------------------------ *
 * The bot may not read the envelope
 * ------------------------------------------------------------------ */

describe('AI cannot cheat', () => {
  it('the AI source never touches hidden server state', () => {
    const dir = path.resolve(__dirname, '../server/src/ai');
    for (const file of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      const withoutPublicTypes = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/PublicGameState/g, 'View')
        .replace(/PrivateGameState/g, 'View')
        .replace(/PlayerView/g, 'View');
      expect(withoutPublicTypes).not.toMatch(/\.solution\b/);
      expect(withoutPublicTypes).not.toMatch(/\bhands\[/);
      expect(withoutPublicTypes).not.toMatch(/GameState/);
      expect(withoutPublicTypes).not.toMatch(/revealedSolution/);
      expect(withoutPublicTypes).not.toMatch(/getPublicState\(/);
    }
  });

  it('the view handed to a bot contains no envelope, hands or answers', () => {
    const { manager } = createApp(0, { aiDelayScale: 0.001 });
    const room = manager.create({ aiDifficulty: 'hard' });
    for (let i = 0; i < 4; i++) room.addAI('hard', 'analytical');
    room.start();
    const bot = room.players[1];
    const blob = JSON.stringify(getPlayerView(room.state, bot.id));
    expect(blob).not.toMatch(/"solution"/);
    expect(blob).not.toMatch(/"hands"/);
    expect(blob).not.toMatch(/"shownCard"/);
    // revealedSolution is a public field, but it stays empty until the end
    expect(blob).not.toMatch(/"revealedSolution":\s*\{/);
    // ...but it does contain what any human at the table could see.
    expect(blob).toMatch(/"cardCount"/);
    expect(blob).toMatch(/"history"/);
    expect(blob).toMatch(/"positions"/);
    manager.remove(room.code);
  });
});

/* ------------------------------------------------------------------ *
 * Bots actually play
 * ------------------------------------------------------------------ */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Socket.io stand-in: the room talks to it, nobody listens. */
const nullIo = { to: () => ({ emit: () => undefined }) } as never;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A seeded RNG, so any case that misbehaves can be replayed exactly. */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/**
 * Plays a whole case out with the "thinking" pauses scaled to zero.
 *
 * Deliberately not wall-clock bound: a slow machine or a busy CI box used to
 * run the game out of time and fail for no reason. The pump below finishes
 * when the case closes, and gives up only if the table stops making progress
 * — in which case it says so, with the tail of the log.
 */
async function playOut(
  difficulty: AiDifficulty,
  personality: AiPersonality,
  bots: number,
  seed = 7,
) {
  const room = new Room(
    'AISIM',
    nullIo,
    { aiDifficulty: difficulty, aiPersonality: personality },
    { rng: seededRng(seed), aiDelayScale: 0 },
  );
  for (let i = 0; i < bots; i++) room.addAI(difficulty, personality);
  expect(room.players.length).toBe(bots);
  const started = room.start();
  expect(started.ok).toBe(true);

  let iterations = 0;
  let lastTurn = -1;
  let stalled = 0;
  while (room.state.phase !== 'finished' && iterations < 200_000) {
    iterations += 1;
    await tick();
    if (room.state.turnNumber === lastTurn) {
      stalled += 1;
    } else {
      stalled = 0;
      lastTurn = room.state.turnNumber;
    }
    if (stalled > 20_000) break;
  }

  const state = room.state;
  if (state.phase !== 'finished') {
    const tail = state.log
      .slice(-6)
      .map((entry) => `    · ${entry.text}`)
      .join('\n');
    throw new Error(
      `the case never closed after ${state.turnNumber} turns ` +
        `(seed ${seed}, ${iterations} pump iterations, step "${state.turnStep}").\n${tail}`,
    );
  }
  expect(state.turnNumber).toBeGreaterThan(3);
  expect(state.log.length).toBeGreaterThan(5);
  return state;
}

describe('AI plays full games', () => {
  it('a table of six hard bots finishes a case', async () => {
    const state = await playOut('hard', 'analytical', 6, 3);
    expect(state.revealedSolution).toBeTruthy();
    expect(state.solution).toEqual(state.revealedSolution);
    expect(state.log.some((l) => /solved|last detective|cold/i.test(l.text))).toBe(true);
  }, 60_000);

  it('a table of easy bots finishes a case', async () => {
    const state = await playOut('easy', 'random', 4, 7);
    expect(state.phase).toBe('finished');
  }, 60_000);

  it('bots only make legal moves', async () => {
    const { manager, io } = createApp(0, { aiDelayScale: 0.002 });
    const room = manager.create({});
    for (let i = 0; i < 5; i++) room.addAI('medium', 'aggressive');
    room.start();
    const board = (await import('@mystery/shared')).getBoard();
    const deadline = Date.now() + 15_000;
    while (room.state.phase !== 'finished' && Date.now() < deadline) {
      for (const player of room.players) {
        const pos = room.state.positions[player.id];
        if (!pos) continue;
        if (pos.kind === 'room') {
          expect(board.nodes[`r:${pos.roomId}`]).toBeTruthy();
        } else {
          const node = board.cellOwner[`${pos.cell.row},${pos.cell.col}`];
          expect(node).toBeTruthy();
        }
      }
      await sleep(30);
    }
    manager.remove(room.code);
    io.close();
  }, 30_000);

  it('a bot asked to disprove only ever shows a card it holds', async () => {
    const { manager, io } = createApp(0, { aiDelayScale: 0.002 });
    const room = manager.create({});
    for (let i = 0; i < 4; i++) room.addAI('medium', 'analytical');
    room.start();
    const deadline = Date.now() + 25_000;
    while (room.state.phase !== 'finished' && Date.now() < deadline) await sleep(20);

    let reveals = 0;
    for (const [viewer, entries] of Object.entries(room.state.seen)) {
      for (const entry of entries) {
        expect(room.state.hands[entry.fromId], `${entry.fromId} showed ${entry.card}`).toContain(
          entry.card,
        );
        expect(entry.fromId).not.toBe(viewer);
        reveals += 1;
      }
    }
    for (const [owner, entries] of Object.entries(room.state.shown)) {
      for (const entry of entries) {
        expect(room.state.hands[owner]).toContain(entry.card);
      }
    }
    expect(reveals).toBeGreaterThan(0);
    manager.remove(room.code);
    io.close();
  }, 40_000);
});

describe('AI decisions', () => {
  it('answers a reveal request with one of its matching cards', () => {
    const view: PlayerView = {
      public: {
        phase: 'playing',
        players: [],
        turnStep: 'reveal',
        history: [],
      } as unknown as PublicGameState,
      private: {
        hand: ['weapon:rope', 'room:library'],
        revealRequest: {
          suggestionId: 's1',
          byId: 'p1',
          suspect: 'suspect:vance',
          weapon: 'weapon:rope',
          room: 'room:library',
          matching: ['weapon:rope', 'room:library'],
        },
        seenCards: [],
        shownHistory: [],
        notebook: {},
        lastReveal: null,
        legalMoves: [],
        canAccuse: false,
        canSuggest: false,
        canUsePassage: false,
      },
    } as PlayerView;
    for (const difficulty of ['easy', 'medium', 'hard'] as AiDifficulty[]) {
      const controller = new AIController('p0', difficulty, 'analytical', () => 0.5);
      const decision = controller.decide(view);
      expect(decision.intent?.type).toBe('reveal');
      const card = (decision.intent as { card: CardId }).card;
      expect(['weapon:rope', 'room:library']).toContain(card);
      expect(CARD_BY_ID[card]).toBeTruthy();
    }
  });

  it('rolls when it is its turn and the dice have not been cast', () => {
    const view: PlayerView = {
      public: {
        phase: 'playing',
        players: [{ id: 'p0', cardCount: 4 }],
        currentPlayerId: 'p0',
        turnStep: 'roll',
        positions: {},
        history: [],
      } as unknown as PublicGameState,
      private: {
        hand: ['weapon:rope'],
        revealRequest: null,
        seenCards: [],
        shownHistory: [],
        notebook: {},
        lastReveal: null,
        legalMoves: [],
        canAccuse: false,
        canSuggest: false,
        canUsePassage: false,
      },
    } as PlayerView;
    const controller = new AIController('p0', 'hard', 'analytical', () => 0.5);
    expect(controller.decide(view).intent).toEqual({ type: 'roll' });
  });
});
