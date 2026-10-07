/**
 * End-to-end table simulations.
 *
 * These drive the real server `Room` (rules engine + AI controllers + intent
 * plumbing) with the AI "thinking" pauses scaled to zero, so a whole case can
 * be played out in milliseconds. They answer the questions unit tests cannot:
 * does a full game actually finish, does the deck stay sound from deal to
 * verdict, do humans and bots share a table without deadlocking, and does any
 * card identity ever escape into a public projection?
 */
import { describe, expect, it } from 'vitest';
import { Room } from '../server/src/game/Room';
import {
  ALL_CARDS,
  CARD_BY_ID,
  getPlayerView,
  type AiDifficulty,
  type AiPersonality,
  type CardId,
  type PlayerView,
} from '@mystery/shared';

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

/** Socket.io stand-in: the room talks to it, nobody listens. */
const nullIo = {
  to: () => ({ emit: () => undefined }),
} as never;

const DIFFICULTIES: AiDifficulty[] = ['easy', 'medium', 'hard'];
const PERSONALITIES: AiPersonality[] = ['analytical', 'aggressive', 'careful', 'random'];

interface TableOptions {
  humans?: number;
  bots?: number;
  difficulty?: AiDifficulty;
  personality?: AiPersonality;
  seed?: number;
}

function makeTable(options: TableOptions = {}) {
  const humans = options.humans ?? 0;
  const bots = options.bots ?? 6;
  let seed = options.seed ?? 1;
  const rng = () => {
    // xorshift32 keeps a simulation reproducible without touching global Math.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };

  const room = new Room('SIM01', nullIo, {}, { rng, aiDelayScale: 0 });
  const humanIds: string[] = [];
  for (let i = 0; i < bots; i++) {
    room.createPlayer({
      name: `Bot ${i + 1}`,
      isAI: true,
      difficulty: options.difficulty ?? DIFFICULTIES[i % DIFFICULTIES.length],
      personality: options.personality ?? PERSONALITIES[i % PERSONALITIES.length],
    });
  }
  for (let i = 0; i < humans; i++) {
    const player = room.createPlayer({ name: `Human ${i + 1}`, isAI: false });
    if (player) humanIds.push(player.id);
  }
  return { room, humanIds };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A very dumb but legal human: roll, walk, suggest whatever, pass the turn. */
function driveHuman(room: Room, playerId: string): boolean {
  const view = getPlayerView(room.state, playerId);
  const { public: pub, private: priv } = view;

  if (pub.turnStep === 'reveal') {
    if (!priv.revealRequest) return false; // waiting for somebody else to answer
    const card = priv.revealRequest.matching[0];
    if (!card) return false;
    return room.handleIntent(playerId, { type: 'reveal', card }).ok;
  }
  if (pub.currentPlayerId !== playerId) return false;

  if (pub.turnStep === 'roll') return room.handleIntent(playerId, { type: 'roll' }).ok;

  if (pub.turnStep === 'move') {
    const moves = priv.legalMoves;
    if (!moves.length) return room.handleIntent(playerId, { type: 'endTurn' }).ok;
    const roomMove = moves.find((node) => node.startsWith('r:')) ?? moves[0];
    return room.handleIntent(playerId, { type: 'move', to: roomMove }).ok;
  }

  if (pub.turnStep === 'action') {
    // A real player eventually commits to an accusation. The bots lose their
    // patience on their own; a scripted human has to be told to, or a table
    // where every bot has been eliminated could never close at all.
    if (priv.canAccuse && pub.turnNumber > 60) {
      const guess = (category: (typeof ALL_CARDS)[number]['category']) =>
        ALL_CARDS.find((c) => c.category === category && !priv.hand.includes(c.id))?.id ??
        ALL_CARDS.find((c) => c.category === category)!.id;
      return room.handleIntent(playerId, {
        type: 'accuse',
        suspect: guess('suspect'),
        weapon: guess('weapon'),
        room: guess('room'),
      }).ok;
    }
    if (priv.canSuggest) {
      const suspects = ALL_CARDS.filter((c) => c.category === 'suspect');
      const weapons = ALL_CARDS.filter((c) => c.category === 'weapon');
      const suspect = suspects[room.state.turnNumber % suspects.length].id;
      const weapon = weapons[(room.state.turnNumber * 3) % weapons.length].id;
      if (room.handleIntent(playerId, { type: 'suggest', suspect, weapon }).ok) return true;
    }
    return room.handleIntent(playerId, { type: 'endTurn' }).ok;
  }

  return room.handleIntent(playerId, { type: 'endTurn' }).ok;
}

interface SimulationResult {
  finished: boolean;
  turns: number;
  iterations: number;
  winnerId: string | null;
  log: string[];
  views: Record<string, PlayerView>;
}

async function playOut(
  room: Room,
  humanIds: string[],
  { maxTurns = 400, maxIterations = 200_000 } = {},
): Promise<SimulationResult> {
  const start = room.start();
  expect(start.ok).toBe(true);

  let iterations = 0;
  let lastTurn = -1;
  let stalled = 0;

  while (room.state.phase !== 'finished' && iterations < maxIterations) {
    iterations += 1;
    const pending = room.state.pendingSuggestion;

    if (room.state.turnStep === 'reveal' && pending && !pending.resolved) {
      // Somebody owes an answer. If it is a human seat, answer it; if it is a
      // bot, the room's own scheduler will run it.
      const responder = pending.order[pending.index];
      if (responder && humanIds.includes(responder)) driveHuman(room, responder);
      await tick();
    } else {
      const current = room.state.currentPlayerId;
      if (current && humanIds.includes(current)) {
        if (!driveHuman(room, current)) await tick();
      } else {
        await tick();
      }
    }

    if (room.state.turnNumber === lastTurn) {
      stalled += 1;
    } else {
      stalled = 0;
      lastTurn = room.state.turnNumber;
    }
    if (stalled > 20_000) break;
    if (room.state.turnNumber > maxTurns) break;
  }

  const views: Record<string, PlayerView> = {};
  for (const player of room.state.players) {
    views[player.id] = getPlayerView(room.state, player.id);
  }

  return {
    finished: room.state.phase === 'finished',
    turns: room.state.turnNumber,
    iterations,
    winnerId: room.state.winnerId,
    log: room.state.log.map((entry) => entry.text),
    views,
  };
}

/* ------------------------------------------------------------------ *
 * Assertions shared by every simulation
 * ------------------------------------------------------------------ */

function expectSoundTable(room: Room) {
  const solution = room.state.solution;
  expect(solution).toBeTruthy();
  const envelope = [solution!.suspect, solution!.weapon, solution!.room];

  const dealt: CardId[] = [];
  for (const player of room.state.players) {
    const hand = room.state.hands[player.id] ?? [];
    expect(hand.length).toBeGreaterThan(0);
    for (const card of hand) {
      expect(dealt).not.toContain(card); // no duplicates across hands
      expect(envelope).not.toContain(card); // the envelope is never dealt
    }
    dealt.push(...hand);
  }
  expect(dealt.slice().sort()).toEqual(
    ALL_CARDS.map((c) => c.id).filter((id) => !envelope.includes(id)).sort(),
  );
}

/**
 * Everything a player is allowed to know: their hand, what they have been
 * shown, what they have shown, and every card named in a public suggestion.
 */
function knownCards(view: PlayerView): Set<CardId> {
  const known = new Set<CardId>([
    ...view.private.hand,
    ...view.private.seenCards.map((entry) => entry.card),
    ...view.private.shownHistory.map((entry) => entry.card),
    ...(view.private.revealRequest?.matching ?? []),
  ]);
  if (view.private.lastReveal) known.add(view.private.lastReveal.card);
  const live = view.public.pendingSuggestion;
  if (live) [live.suspect, live.weapon, live.room].forEach((id) => known.add(id));
  for (const record of view.public.history) {
    [record.suspect, record.weapon, record.room].forEach((id) => known.add(id));
  }
  const revealed = view.public.revealedSolution;
  if (revealed) [revealed.suspect, revealed.weapon, revealed.room].forEach((id) => known.add(id));
  return known;
}

function expectNoLeaks(views: Record<string, PlayerView>) {
  for (const [playerId, view] of Object.entries(views)) {
    const known = knownCards(view);

    // 1. The public projection must not carry a card this seat cannot know.
    const publicText = JSON.stringify(view.public);
    for (const card of ALL_CARDS) {
      if (known.has(card.id)) continue;
      expect(publicText.includes(card.id)).toBe(false);
    }

    // 2. No other player's hand may appear, in whole or in part, in the private
    //    projection outside the cards they were legitimately shown.
    const privateText = JSON.stringify({
      hand: view.private.hand,
      notebook: view.private.notebook,
      legalMoves: view.private.legalMoves,
    });
    for (const [otherId, other] of Object.entries(views)) {
      if (otherId === playerId) continue;
      for (const card of other.private.hand) {
        if (known.has(card)) continue;
        expect(privateText.includes(card)).toBe(false);
      }
    }

    // 3. The shared log may announce that a card was shown, never which one —
    //    except to the detective who was shown it.
    for (const entry of view.public.log) {
      if (entry.kind !== 'reveal') continue;
      expect(entry.text).toMatch(/showed a card|showed you|could not disprove|no one could disprove/i);
      for (const card of ALL_CARDS) {
        if (known.has(card.id)) continue;
        if (entry.text.includes(CARD_BY_ID[card.id].name)) {
          throw new Error(`Leaked "${CARD_BY_ID[card.id].name}" to ${playerId}: ${entry.text}`);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * The simulations
 * ------------------------------------------------------------------ */

describe('full table simulations', () => {
  it('six bots play a complete case to a verdict', async () => {
    const { room, humanIds } = makeTable({ bots: 6, seed: 7 });
    const result = await playOut(room, humanIds);

    expect(result.finished).toBe(true);
    expect(result.turns).toBeGreaterThan(5);
    expectSoundTable(room);
    expectNoLeaks(result.views);

    // Someone won, or everyone was eliminated and the case went cold.
    const winner = room.state.winnerId;
    if (winner) {
      expect(room.state.revealedSolution).toEqual(room.state.solution);
      expect(room.state.players.some((p) => p.id === winner)).toBe(true);
    } else {
      expect(room.state.players.every((p) => room.state.eliminated[p.id])).toBe(true);
    }
  }, 60_000);

  it('a mixed table of humans and bots never deadlocks', async () => {
    const { room, humanIds } = makeTable({ humans: 2, bots: 4, seed: 21 });
    expect(humanIds).toHaveLength(2);

    const result = await playOut(room, humanIds);
    expect(result.finished).toBe(true);
    expectSoundTable(room);
    expectNoLeaks(result.views);

    // Humans really did take turns: their tokens should have left their start.
    for (const id of humanIds) {
      const view = result.views[id];
      expect(view.private.hand.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('hard bots solve cases faster than random bots', async () => {
    const sample = async (difficulty: AiDifficulty, personality: AiPersonality, seed: number) => {
      const { room, humanIds } = makeTable({ bots: 6, difficulty, personality, seed });
      const result = await playOut(room, humanIds, { maxTurns: 250 });
      return result.turns;
    };

    const hard: number[] = [];
    const random: number[] = [];
    for (const seed of [3, 11, 29, 47]) {
      hard.push(await sample('hard', 'analytical', seed));
      random.push(await sample('easy', 'random', seed));
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    expect(mean(hard)).toBeLessThan(mean(random));
  }, 120_000);

  it('a solved case reveals the envelope and a cold case reveals nothing else', async () => {
    const { room, humanIds } = makeTable({ bots: 6, seed: 99 });
    await playOut(room, humanIds);

    for (const player of room.state.players) {
      const view = getPlayerView(room.state, player.id);
      expect(view.public.phase).toBe('finished');
      if (room.state.winnerId) {
        expect(view.public.revealedSolution).toEqual(room.state.solution);
      }
    }
  }, 60_000);

  it('restarting a table deals a fresh, sound case', async () => {
    const { room, humanIds } = makeTable({ bots: 6, seed: 5 });
    await playOut(room, humanIds);
    const firstSolution = { ...room.state.solution! };

    room.restart();
    expect(room.state.phase).toBe('lobby');
    expect(room.state.solution).toBeNull();
    expect(room.state.log).toHaveLength(0);

    const restart = room.start();
    expect(restart.ok).toBe(true);
    expectSoundTable(room);
    expect(room.state.log.length).toBeGreaterThan(0);
    // Not a guarantee in principle, but a decent sanity check on the shuffle.
    const different =
      JSON.stringify(room.state.solution) !== JSON.stringify(firstSolution) ||
      JSON.stringify(room.state.hands) !== '{}';
    expect(different).toBe(true);
  }, 60_000);
});
