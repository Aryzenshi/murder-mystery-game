import type { CardId, Solution } from '../types';
import { ALL_CARDS, CARD_BY_ID } from '../constants/cards';

export type Rng = () => number;

/** Deterministic RNG so tests can replay exact deals. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(rng() * 6);
}

export function rollDice(rng: Rng): [number, number] {
  return [rollDie(rng), rollDie(rng)];
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

export function fullDeck(): CardId[] {
  return ALL_CARDS.map((c) => c.id);
}

export function cardIdsOfCategory(category: 'suspect' | 'weapon' | 'room'): CardId[] {
  return ALL_CARDS.filter((c) => c.category === category).map((c) => c.id);
}

/**
 * Draws the secret solution and deals the remaining cards as evenly as
 * possible, in seating order. Returns brand new arrays — the caller's deck is
 * never mutated.
 */
export function dealGame(
  playerIds: string[],
  rng: Rng,
): { solution: Solution; hands: Record<string, CardId[]> } {
  if (playerIds.length < 3 || playerIds.length > 6) {
    throw new Error('A game needs between 3 and 6 players');
  }
  const suspects = shuffle(cardIdsOfCategory('suspect'), rng);
  const weapons = shuffle(cardIdsOfCategory('weapon'), rng);
  const rooms = shuffle(cardIdsOfCategory('room'), rng);

  const solution: Solution = { suspect: suspects[0], weapon: weapons[0], room: rooms[0] };
  const envelope = new Set<CardId>([solution.suspect, solution.weapon, solution.room]);

  const rest = shuffle(
    ALL_CARDS.map((c) => c.id).filter((id) => !envelope.has(id)),
    rng,
  );

  const hands: Record<string, CardId[]> = {};
  for (const id of playerIds) hands[id] = [];
  rest.forEach((card, i) => {
    hands[playerIds[i % playerIds.length]].push(card);
  });

  return { solution, hands };
}

export function categoryOf(cardId: CardId) {
  return CARD_BY_ID[cardId]?.category ?? 'room';
}
