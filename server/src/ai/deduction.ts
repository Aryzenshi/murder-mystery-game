import {
  ALL_CARDS,
  CARD_BY_ID,
  type CardId,
  type PublicGameState,
  type PrivateGameState,
} from '@mystery/shared';

/**
 * ---------------------------------------------------------------------------
 * AI DEDUCTION STATE
 * ---------------------------------------------------------------------------
 * A private constraint solver. It is fed ONLY with things a human seated at
 * the table could also have written down:
 *
 *   • the cards in its own hand
 *   • how many cards everybody holds (public)
 *   • cards it has been shown, and by whom (private to it)
 *   • the public suggestion history: who asked what, who could not help and
 *     who produced a card — never WHICH card unless it was shown to this bot
 *
 * There is no reference to `GameState`, the envelope or any other player's
 * hand anywhere in this file, and the unit test `ai.test.ts` asserts it.
 * ---------------------------------------------------------------------------
 */

export const SOLUTION = 'SOLUTION';

export interface OneOfConstraint {
  playerId: string;
  cards: CardId[];
}

export interface DeductionState {
  myId: string;
  playerIds: string[];
  handSizes: Record<string, number>;
  /** card -> owners still possible (player ids and/or SOLUTION) */
  possible: Record<CardId, Set<string>>;
  /** card -> resolved owner, once proven */
  known: Record<CardId, string | null>;
  myCards: Set<CardId>;
  oneOf: OneOfConstraint[];
  /** how much of each public suggestion has already been folded in */
  applied: Record<string, { passed: number; disproved: boolean }>;
  /** cards this bot has already been shown (card -> who showed it) */
  seen: Record<CardId, string>;
  /** cards this bot has shown to others (player -> cards) */
  shownTo: Record<string, Set<CardId>>;
  /** "suspect|weapon" pairs already asked about, to avoid repeats */
  askedPairs: Set<string>;
  roomsVisited: Record<string, number>;
}

const CARD_IDS = ALL_CARDS.map((c) => c.id);
const BY_CATEGORY = {
  suspect: CARD_IDS.filter((id) => CARD_BY_ID[id].category === 'suspect'),
  weapon: CARD_IDS.filter((id) => CARD_BY_ID[id].category === 'weapon'),
  room: CARD_IDS.filter((id) => CARD_BY_ID[id].category === 'room'),
};

export function createDeduction(
  myId: string,
  playerIds: string[],
  handSizes: Record<string, number>,
  myCards: CardId[],
): DeductionState {
  const possible: Record<CardId, Set<string>> = {};
  const known: Record<CardId, string | null> = {};
  for (const card of CARD_IDS) {
    possible[card] = new Set<string>([...playerIds, SOLUTION]);
    known[card] = null;
  }
  const state: DeductionState = {
    myId,
    playerIds: [...playerIds],
    handSizes: { ...handSizes },
    possible,
    known,
    myCards: new Set(myCards),
    oneOf: [],
    applied: {},
    seen: {},
    shownTo: {},
    askedPairs: new Set(),
    roomsVisited: {},
  };

  // I hold my own cards; nobody else can, and they are not in the envelope.
  for (const card of myCards) {
    assign(state, card, myId);
  }
  // Anything I hold is unavailable to the other slots.
  for (const card of CARD_IDS) {
    if (!state.myCards.has(card)) state.possible[card].delete(myId);
  }
  propagate(state);
  return state;
}

function assign(state: DeductionState, card: CardId, owner: string): void {
  state.known[card] = owner;
  state.possible[card] = new Set([owner]);
}

function unassignedCards(state: DeductionState): CardId[] {
  return CARD_IDS.filter((c) => !state.known[c]);
}

export function propagate(state: DeductionState): void {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 60) {
    changed = false;

    // 1. A card with a single possible home is resolved.
    for (const card of CARD_IDS) {
      if (state.known[card]) continue;
      const set = state.possible[card];
      if (set.size === 0) {
        // Contradiction (should not happen) — fall back to "somebody else".
        set.add(SOLUTION);
      }
      if (set.size === 1) {
        assign(state, card, [...set][0]);
        changed = true;
      }
    }

    // 2. Hand bookkeeping: a full hand owns nothing else; a hand whose
    //    remaining slots exactly match its remaining candidates owns them all.
    for (const pid of state.playerIds) {
      const held = CARD_IDS.filter((c) => state.known[c] === pid);
      const remaining = (state.handSizes[pid] ?? 0) - held.length;
      const candidates = unassignedCards(state).filter((c) => state.possible[c].has(pid));
      if (remaining <= 0) {
        for (const card of candidates) {
          state.possible[card].delete(pid);
          changed = true;
        }
      } else if (candidates.length === remaining && candidates.length > 0) {
        for (const card of candidates) {
          assign(state, card, pid);
          changed = true;
        }
      }
    }

    // 3. Exactly one card of each category sits in the envelope.
    for (const category of ['suspect', 'weapon', 'room'] as const) {
      const cards = BY_CATEGORY[category];
      const decided = cards.filter((c) => state.known[c] === SOLUTION);
      if (decided.length > 0) {
        for (const card of cards) {
          if (state.known[card] === null && state.possible[card].has(SOLUTION)) {
            state.possible[card].delete(SOLUTION);
            changed = true;
          }
        }
        continue;
      }
      const candidates = cards.filter(
        (c) => !state.known[c] && state.possible[c].has(SOLUTION),
      );
      if (candidates.length === 1) {
        assign(state, candidates[0], SOLUTION);
        changed = true;
      }
    }

    // 4. "At least one of these three belongs to P" constraints. The
    //    constraint tells us nothing more once a card we can already place
    //    in P's hand satisfies it.
    for (const constraint of state.oneOf) {
      const satisfied = constraint.cards.some((c) => state.known[c] === constraint.playerId);
      if (satisfied) continue;
      const remaining = constraint.cards.filter(
        (c) => state.known[c] !== constraint.playerId && state.possible[c].has(constraint.playerId),
      );
      if (remaining.length === 1 && !state.known[remaining[0]]) {
        assign(state, remaining[0], constraint.playerId);
        changed = true;
      }
    }

    // 5. If the number of unassigned cards equals the number of free slots
    //    plus the three envelope slots, nothing is certain — but if a card
    //    has lost every player it must be in the envelope.
    for (const card of CARD_IDS) {
      if (state.known[card]) continue;
      const owners = [...state.possible[card]].filter((o) => o !== SOLUTION);
      if (owners.length === 0 && !state.possible[card].has(SOLUTION)) {
        state.possible[card].add(SOLUTION);
      }
    }
  }
}

/**
 * Folds everything the bot has legitimately learned since its last look at
 * the table into the constraint solver.
 */
export function observe(
  state: DeductionState,
  pub: PublicGameState,
  priv: PrivateGameState,
  opts: { useHistory?: boolean } = {},
): void {
  // Cards shown to me: exact knowledge.
  for (const entry of priv.seenCards) {
    if (!state.seen[entry.card]) {
      state.seen[entry.card] = entry.fromId;
      if (!state.known[entry.card]) {
        assign(state, entry.card, entry.fromId);
      }
    }
  }

  if (opts.useHistory === false) {
    propagate(state);
    return;
  }

  for (const record of pub.history) {
    const applied = (state.applied[record.id] ??= { passed: 0, disproved: false });
    const cards = [record.suspect, record.weapon, record.room];

    for (let i = applied.passed; i < record.passedIds.length; i++) {
      const passer = record.passedIds[i];
      for (const card of cards) {
        if (state.known[card]) continue;
        state.possible[card].delete(passer);
      }
      applied.passed = i + 1;
    }

    if (record.disprovedBy && !applied.disproved) {
      applied.disproved = true;
      if (record.disprovedBy !== state.myId) {
        state.oneOf.push({ playerId: record.disprovedBy, cards });
      }
    }
    // Note: if *I* was the one shown a card, priv.seenCards already told me
    // exactly which one — and nothing at all if I was not.
  }
  propagate(state);
}

export interface SolutionCandidates {
  suspect: CardId[];
  weapon: CardId[];
  room: CardId[];
  certain: boolean;
  /** 1 / (|S|·|W|·|R|) — the bot's own confidence in a single triple. */
  probability: number;
  best: { suspect: CardId; weapon: CardId; room: CardId } | null;
}

export function solutionCandidates(state: DeductionState): SolutionCandidates {
  const pick = (category: 'suspect' | 'weapon' | 'room'): CardId[] => {
    const cards = BY_CATEGORY[category];
    const decided = cards.filter((c) => state.known[c] === SOLUTION);
    if (decided.length) return [decided[0]];
    return cards.filter((c) => !state.known[c] && state.possible[c].has(SOLUTION));
  };
  const suspect = pick('suspect');
  const weapon = pick('weapon');
  const room = pick('room');
  const combos = suspect.length * weapon.length * room.length;
  const certain = suspect.length === 1 && weapon.length === 1 && room.length === 1;
  return {
    suspect,
    weapon,
    room,
    certain,
    probability: combos > 0 ? 1 / combos : 0,
    best:
      suspect.length && weapon.length && room.length
        ? { suspect: suspect[0], weapon: weapon[0], room: room[0] }
        : null,
  };
}

/** How many homes a card could still have — the AI's "uncertainty" measure. */
export function uncertainty(state: DeductionState, card: CardId): number {
  if (state.known[card]) return 0;
  return state.possible[card].size;
}

export function isKnownNotMine(state: DeductionState, card: CardId): boolean {
  return !!state.known[card] && state.known[card] !== state.myId;
}

export function ownerKnownAs(state: DeductionState, card: CardId): string | null {
  return state.known[card];
}
