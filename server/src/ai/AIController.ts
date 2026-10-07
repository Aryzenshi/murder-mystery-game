import {
  cardIdsOfCategory,
  getBoard,
  roomNodeId,
  type AiDifficulty,
  type AiPersonality,
  type BoardGraph,
  type CardId,
  type Intent,
  type NodeId,
  type PlayerView,
} from '@mystery/shared';
import {
  createDeduction,
  observe,
  solutionCandidates,
  uncertainty,
  type DeductionState,
} from './deduction';

/**
 * ---------------------------------------------------------------------------
 * AI PLAYER CONTROLLER
 * ---------------------------------------------------------------------------
 * The bot is a client of the rules engine exactly like a human is: it is handed
 * a `PlayerView` (public projection + its own private projection) and answers
 * with an `Intent`. The intent is then validated by the very same
 * `applyIntent()` path a socket handler uses, so the bot cannot do anything a
 * human cannot, and cannot see anything a human cannot.
 *
 * Difficulty only changes how *well* it uses what it knows; personality only
 * changes what it *prefers*. Neither is ever granted extra information.
 * ---------------------------------------------------------------------------
 */

export interface AiDecision {
  intent: Intent | null;
  /** Short line shown in the "…is thinking" strip. */
  say?: string;
  delayMs: number;
}

interface Profile {
  /** chance of ignoring its own best judgement, 0..1 */
  noise: number;
  /** minimum confidence (0..1) before it will accuse */
  accuseAt: number;
  /** does it read the public suggestion history? */
  trackHistory: boolean;
  /** does it use secret passages? */
  passages: boolean;
  /** does it bother choosing the least informative card when answering? */
  cleverReveal: boolean;
  /**
   * Chance per turn of losing patience and accusing anyway, even though the
   * envelope is nowhere near proven. Only a weak detective does this; it is
   * "easy" not because it knows less, but because it acts far too soon — and
   * then sits out the rest of the case.
   */
  hunch: number;
  /** the earliest turn such a guess may happen */
  hunchFromTurn: number;
  delay: [number, number];
}

const PROFILES: Record<AiDifficulty, Profile> = {
  easy: {
    noise: 0.55,
    accuseAt: 1.01, // only ever accuses on real proof — or on a hunch
    trackHistory: false,
    passages: false,
    cleverReveal: false,
    // Without this an easy table grinds for a thousand turns: it never gathers
    // enough to be certain, so nothing ever ends. A beginner guesses and is
    // usually wrong, which is both truer to life and over much sooner.
    hunch: 0.05,
    hunchFromTurn: 15,
    delay: [500, 1100],
  },
  medium: {
    noise: 0.2,
    accuseAt: 0.5,
    trackHistory: true,
    passages: true,
    cleverReveal: true,
    hunch: 0,
    hunchFromTurn: 0,
    delay: [550, 1400],
  },
  hard: {
    noise: 0.05,
    accuseAt: 0.34,
    trackHistory: true,
    passages: true,
    cleverReveal: true,
    hunch: 0,
    hunchFromTurn: 0,
    delay: [600, 1800],
  },
};

interface Personality {
  accuseScale: number;
  minTurn: number;
  noiseScale: number;
  /** eagerness to re-examine rooms it has already asked about */
  curiosity: number;
}

const PERSONALITIES: Record<AiPersonality, Personality> = {
  analytical: { accuseScale: 1, minTurn: 2, noiseScale: 1, curiosity: 1 },
  aggressive: { accuseScale: 0.5, minTurn: 1, noiseScale: 1.1, curiosity: 0.8 },
  careful: { accuseScale: 1.6, minTurn: 4, noiseScale: 0.8, curiosity: 1.2 },
  random: { accuseScale: 1, minTurn: 1, noiseScale: 2.2, curiosity: 1 },
};

/* ------------------------------------------------------------------ *
 * Static board distances (the board never changes, so compute once)
 * ------------------------------------------------------------------ */

let roomDistancesCache: Record<string, Record<NodeId, number>> | null = null;
let roomPairCache: Record<string, Record<string, number>> | null = null;

function roomDistances(graph: BoardGraph): Record<string, Record<NodeId, number>> {
  if (roomDistancesCache) return roomDistancesCache;
  const out: Record<string, Record<NodeId, number>> = {};
  for (const roomId of graph.rooms) {
    const start = roomNodeId(roomId);
    const dist: Record<NodeId, number> = { [start]: 0 };
    const queue: NodeId[] = [start];
    while (queue.length) {
      const node = queue.shift() as NodeId;
      for (const next of graph.nodes[node]?.neighbors ?? []) {
        if (dist[next] !== undefined) continue;
        dist[next] = dist[node] + 1;
        if (graph.nodes[next]?.kind === 'corridor') queue.push(next);
      }
    }
    out[roomId] = dist;
  }
  roomDistancesCache = out;
  return out;
}

function roomPairDistances(graph: BoardGraph): Record<string, Record<string, number>> {
  if (roomPairCache) return roomPairCache;
  const perRoom = roomDistances(graph);
  const out: Record<string, Record<string, number>> = {};
  for (const from of graph.rooms) {
    out[from] = {};
    for (const to of graph.rooms) {
      if (from === to) {
        out[from][to] = 0;
        continue;
      }
      let best = Number.POSITIVE_INFINITY;
      for (const door of graph.nodes[roomNodeId(to)]?.neighbors ?? []) {
        const d = perRoom[from][door];
        if (d !== undefined && d + 1 < best) best = d + 1;
      }
      out[from][to] = best;
    }
  }
  roomPairCache = out;
  return out;
}

/* ------------------------------------------------------------------ *
 * Controller
 * ------------------------------------------------------------------ */

export class AIController {
  readonly id: string;
  difficulty: AiDifficulty;
  personality: AiPersonality;
  private deduction: DeductionState | null = null;
  private rng: () => number;

  constructor(
    id: string,
    difficulty: AiDifficulty,
    personality: AiPersonality,
    rng: () => number = Math.random,
  ) {
    this.id = id;
    this.difficulty = difficulty;
    this.personality = personality;
    this.rng = rng;
  }

  private get profile(): Profile {
    return PROFILES[this.difficulty] ?? PROFILES.medium;
  }

  private get persona(): Personality {
    return PERSONALITIES[this.personality] ?? PERSONALITIES.analytical;
  }

  private pause(): number {
    const [min, max] = this.profile.delay;
    return Math.round(min + this.rng() * (max - min));
  }

  /** Exposed for tests and for the "AI never cheats" assertion. */
  getDeduction(): DeductionState | null {
    return this.deduction;
  }

  private brain(view: PlayerView): DeductionState {
    if (!this.deduction) {
      const handSizes: Record<string, number> = {};
      for (const player of view.public.players) handSizes[player.id] = player.cardCount;
      this.deduction = createDeduction(
        this.id,
        view.public.players.map((p) => p.id),
        handSizes,
        view.private.hand,
      );
    }
    observe(this.deduction, view.public, view.private, {
      useHistory: this.profile.trackHistory,
    });
    return this.deduction;
  }

  private noiseScale(): number {
    return Math.min(1, this.profile.noise * this.persona.noiseScale);
  }

  decide(view: PlayerView): AiDecision {
    const pub = view.public;
    const priv = view.private;
    if (pub.phase !== 'playing') return { intent: null, delayMs: 0 };

    const brain = this.brain(view);

    /* ---- 1. Answering somebody else's suggestion ---------------------- */
    if (priv.revealRequest) {
      const card = this.chooseReveal(priv.revealRequest.matching, priv.revealRequest.byId);
      return {
        intent: { type: 'reveal', card },
        say: 'is choosing a card to show',
        delayMs: this.pause(),
      };
    }

    if (pub.currentPlayerId !== this.id) return { intent: null, delayMs: 0 };
    if (pub.players.find((p) => p.id === this.id)?.eliminated) {
      return { intent: null, delayMs: 0 };
    }

    /* ---- 2. Accusation ------------------------------------------------ */
    if (priv.canAccuse) {
      const solution = solutionCandidates(brain);
      const threshold = Math.min(1, this.profile.accuseAt * this.persona.accuseScale);
      const patient = pub.turnNumber >= this.persona.minTurn;
      const certain = solution.probability >= threshold;
      // Losing patience: same information, acted on far too early.
      const hunch =
        !certain &&
        this.profile.hunch > 0 &&
        pub.turnNumber >= this.profile.hunchFromTurn &&
        this.rng() < this.profile.hunch;
      if (solution.best && ((certain && patient) || hunch)) {
        return {
          intent: {
            type: 'accuse',
            suspect: solution.best.suspect,
            weapon: solution.best.weapon,
            room: solution.best.room,
          },
          say: hunch ? 'has a hunch' : 'is preparing an accusation',
          delayMs: Math.round(this.pause() * 1.4),
        };
      }
    }

    const position = pub.positions[this.id];
    const roomId = position?.kind === 'room' ? position.roomId : null;

    /* ---- 3. Suggestion ------------------------------------------------ */
    if (priv.canSuggest && roomId) {
      const fresh = (brain.roomsVisited[roomId] ?? 0) === 0;
      const worthIt = fresh || this.rng() < 0.35 * this.persona.curiosity;
      if (worthIt || pub.turnStep === 'action') {
        const pickCard = this.chooseSuggestion(view, brain, roomId);
        brain.askedPairs.add(`${pickCard.suspect}|${pickCard.weapon}`);
        brain.roomsVisited[roomId] = (brain.roomsVisited[roomId] ?? 0) + 1;
        return {
          intent: { type: 'suggest', suspect: pickCard.suspect, weapon: pickCard.weapon },
          say: 'is making a suggestion',
          delayMs: Math.round(this.pause() * 1.2),
        };
      }
    }

    /* ---- 4. Secret passage -------------------------------------------- */
    if (priv.canUsePassage && this.profile.passages && roomId) {
      const graph = getBoard();
      const target = graph.nodes[roomNodeId(roomId)]?.secretPassage;
      if (target && this.roomScore(brain, target) > this.roomScore(brain, roomId) + 0.5) {
        return {
          intent: { type: 'usePassage' },
          say: 'is considering the secret passage',
          delayMs: this.pause(),
        };
      }
    }

    /* ---- 5. Roll ------------------------------------------------------- */
    if (pub.turnStep === 'roll') {
      return { intent: { type: 'roll' }, say: 'is rolling the dice', delayMs: this.pause() };
    }

    /* ---- 6. Move ------------------------------------------------------- */
    if (pub.turnStep === 'move') {
      const moves = priv.legalMoves;
      if (!moves.length) return { intent: { type: 'endTurn' }, delayMs: this.pause() };
      const choice = this.chooseMove(view, brain, moves);
      return {
        intent: { type: 'move', to: choice },
        say: 'is deciding where to move',
        delayMs: this.pause(),
      };
    }

    /* ---- 7. Nothing left to do ----------------------------------------- */
    if (pub.turnStep === 'action') {
      return { intent: { type: 'endTurn' }, say: 'ends the turn', delayMs: Math.round(this.pause() * 0.7) };
    }

    return { intent: null, delayMs: this.pause() };
  }

  /* ---------------------------------------------------------------- *
   * Decisions
   * ---------------------------------------------------------------- */

  private roomScore(brain: DeductionState, roomId: string): number {
    const card = `room:${roomId}` as CardId;
    let score = 1;
    if (brain.myCards.has(card)) score -= 1.5;
    else score += uncertainty(brain, card) * 0.5;
    score -= (brain.roomsVisited[roomId] ?? 0) * 0.8 * (1 / this.persona.curiosity);
    if (brain.known[card]) score -= 0.5;
    return score;
  }

  private chooseMove(view: PlayerView, brain: DeductionState, moves: NodeId[]): NodeId {
    const graph = getBoard();
    const perRoom = roomDistances(graph);
    const noise = this.noiseScale();
    if (this.rng() < noise) return moves[Math.floor(this.rng() * moves.length)];

    let best: NodeId = moves[0];
    let bestScore = -Number.POSITIVE_INFINITY;
    for (const move of moves) {
      let score: number;
      if (move.startsWith('r:')) {
        const room = move.slice(2);
        score = 12 * this.roomScore(brain, room);
      } else {
        // Value a corridor square by how close it puts us to a good room.
        let bestRoomScore = -Number.POSITIVE_INFINITY;
        for (const roomId of graph.rooms) {
          const d = perRoom[roomId]?.[move];
          if (d === undefined || !Number.isFinite(d)) continue;
          const value = (10 * this.roomScore(brain, roomId)) / (1 + d);
          if (value > bestRoomScore) bestRoomScore = value;
        }
        score = bestRoomScore;
      }
      score += this.rng() * noise * 4;
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  private chooseSuggestion(
    view: PlayerView,
    brain: DeductionState,
    roomId: string,
  ): { suspect: CardId; weapon: CardId } {
    const suspects = cardIdsOfCategory('suspect');
    const weapons = cardIdsOfCategory('weapon');
    const noise = this.noiseScale();

    const scoreCard = (card: CardId, seen: string): number => {
      let score = uncertainty(brain, card);
      if (brain.myCards.has(card)) score += 0.75; // classic "hold one" tactic
      if (brain.known[card] && brain.known[card] !== brain.myId) score += 0.5;
      if (seen.includes(card)) score -= 1.5; // already asked in this pairing
      return score;
    };

    if (this.rng() < noise * 0.8) {
      return {
        suspect: suspects[Math.floor(this.rng() * suspects.length)],
        weapon: weapons[Math.floor(this.rng() * weapons.length)],
      };
    }

    let bestSuspect = suspects[0];
    let bestWeapon = weapons[0];
    let bestScore = -Number.POSITIVE_INFINITY;
    for (const suspect of suspects) {
      const baseS = scoreCard(suspect, '');
      for (const weapon of weapons) {
        let score = baseS + scoreCard(weapon, '');
        if (brain.askedPairs.has(`${suspect}|${weapon}`)) score -= 6;
        score += this.rng() * noise * 3;
        if (score > bestScore) {
          bestScore = score;
          bestSuspect = suspect;
          bestWeapon = weapon;
        }
      }
    }
    void roomId;
    return { suspect: bestSuspect, weapon: bestWeapon };
  }

  private chooseReveal(matching: CardId[], askerId: string): CardId {
    if (matching.length === 1 || !this.profile.cleverReveal) {
      return matching[Math.floor(this.rng() * matching.length)];
    }
    const brain = this.deduction;
    const alreadyShown = brain?.shownTo[askerId];
    if (alreadyShown) {
      const repeat = matching.filter((c) => alreadyShown.has(c));
      if (repeat.length) return repeat[Math.floor(this.rng() * repeat.length)];
    }
    // Otherwise show the card the asker is most likely to work out anyway —
    // the room, since they can see where everybody is standing.
    const room = matching.find((c) => c.startsWith('room:'));
    if (room && this.rng() < 0.6) return room;
    return matching[Math.floor(this.rng() * matching.length)];
  }

  /** Called by the game room after the bot answers a suggestion. */
  rememberShown(askerId: string, card: CardId): void {
    if (!this.deduction) return;
    this.deduction.shownTo[askerId] ??= new Set();
    this.deduction.shownTo[askerId].add(card);
  }
}
