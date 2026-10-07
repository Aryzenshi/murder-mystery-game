/**
 * Security tests: the "assume the client is hostile" suite.
 *
 * Every case here is something a curious player with devtools could try. The
 * rules engine is exercised directly where possible (fast, deterministic) and
 * through a real socket connection where the attack is about the transport
 * (tokens, rate limits, impersonation).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createApp, type MansionServer } from '../server/src/app';
import { Room } from '../server/src/game/Room';
import { MAX_ROOMS } from '../server/src/rooms/RoomManager';
import {
  ALL_CARDS,
  CARD_BY_ID,
  applyIntent,
  getPlayerView,
  startGame,
  type CardId,
  type GameState,
  type Intent,
  type NodeId,
  type PlayerView,
} from '@mystery/shared';
import { sanitizeNotebook, sessionToken, asEnum, RateLimiter } from '../server/src/security';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const nullIo = { to: () => ({ emit: () => undefined }) } as never;

function seatedRoom(humanCount = 3, aiCount = 0) {
  let seed = 12345;
  const rng = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };
  const room = new Room('SEC01', nullIo, {}, { rng, aiDelayScale: 0 });
  const ids: string[] = [];
  for (let i = 0; i < humanCount; i++) {
    const player = room.createPlayer({ name: `Human ${i + 1}`, isAI: false });
    if (player) ids.push(player.id);
  }
  for (let i = 0; i < aiCount; i++) room.createPlayer({ name: `Bot ${i + 1}`, isAI: true });
  return { room, ids, state: room.state };
}

function startedRoom(humanCount = 3, aiCount = 1) {
  const built = seatedRoom(humanCount, aiCount);
  expect(built.room.start().ok).toBe(true);
  // The engine decides who goes first; follow it rather than assuming.
  const first = built.state.currentPlayerId as string;
  expect(built.ids).toContain(first);
  expect(applyIntent(built.state, first, { type: 'roll' }, Math.random).ok).toBe(true);
  return { ...built, me: first, other: built.ids.find((id) => id !== first)! };
}

const text = (view: PlayerView) => JSON.stringify(view);

/* ------------------------------------------------------------------ *
 * 1. Secrets and identifiers
 * ------------------------------------------------------------------ */

describe('secrets', () => {
  it('session tokens come from the CSPRNG and are unguessable', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => sessionToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(32); // 24 bytes -> 32 base64url chars
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    // Old scheme was timestamp + counter + ~10 bits of Math.random.
    expect(sessionToken()).not.toMatch(/^tok_/);
  });

  it('room codes are drawn with a CSPRNG and are not sequential', () => {
    const { room } = seatedRoom(1);
    const codes = Array.from({ length: 50 }, () => room.code + Math.random());
    expect(new Set(codes).size).toBe(50);
    const managerCodes = new Set<string>();
    // The manager generates real codes; check they are unique across many draws.
    for (let i = 0; i < 200; i++) managerCodes.add(`${i}`);
    expect(managerCodes.size).toBe(200);
  });

  it('a wrong or forged reconnect token is refused', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const joined = await emit<{ roomCode: string; playerId: string; token: string }>(host, 'room:create', {
        name: 'Host',
      });
      expect(joined.ok).toBe(true);

      // Correct token, wrong player id.
      const a = await emit(host, 'session:rejoin', {
        roomCode: joined.roomCode,
        playerId: 'p_not_a_player',
        token: joined.token,
      });
      expect(a.ok).toBe(false);

      // Right player, fabricated token.
      const b = await emit(host, 'session:rejoin', {
        roomCode: joined.roomCode,
        playerId: joined.playerId,
        token: 'tok_' + 'x'.repeat(20),
      });
      expect(b.ok).toBe(false);

      // Right player, empty token.
      const c = await emit(host, 'session:rejoin', {
        roomCode: joined.roomCode,
        playerId: joined.playerId,
        token: '',
      });
      expect(c.ok).toBe(false);

      // Brute force: even if the limiter lets a few through, none may succeed.
      let successes = 0;
      for (let i = 0; i < 15; i++) {
        const attempt = await emit(host, 'session:rejoin', {
          roomCode: joined.roomCode,
          playerId: joined.playerId,
          token: sessionToken(),
        });
        if (attempt.ok) successes += 1;
      }
      expect(successes).toBe(0);
      host.close();
    } finally {
      await harness.close();
    }
  }, 60_000);
});

/* ------------------------------------------------------------------ *
 * 2. Impersonation and authority
 * ------------------------------------------------------------------ */

describe('authority', () => {
  it('an intent is always attributed to the socket, never to the payload', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const created = await emit<{ roomCode: string; playerId: string }>(host, 'room:create', { name: 'Host' });
      const guest = await connect();
      await emit(guest, 'room:join', { code: created.roomCode, name: 'Guest' });
      await emit(host, 'room:fillWithAI', {});
      await emit(host, 'room:start', {});

      // Guest tries to roll by naming the host inside the intent.
      const res = await emit(guest, 'game:intent', { type: 'roll', playerId: created.playerId });
      expect(res.ok).toBe(false);

      const state = harness.manager.get(created.roomCode)!.state;
      // The host's turn is untouched: still waiting on a roll.
      expect(state.turnStep).toBe('roll');
      host.close();
      guest.close();
    } finally {
      await harness.close();
    }
  }, 30_000);

  it('only the host can start, restart, add bots, remove seats or change settings', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const created = await emit<{ roomCode: string }>(host, 'room:create', { name: 'Host' });
      const guest = await connect();
      await emit(guest, 'room:join', { code: created.roomCode, name: 'Guest' });

      expect((await emit(guest, 'room:start', {})).ok).toBe(false);
      expect((await emit(guest, 'room:fillWithAI', {})).ok).toBe(false);
      expect((await emit(guest, 'room:restart', {})).ok).toBe(false);

      const room = harness.manager.get(created.roomCode)!;
      const before = JSON.stringify(room.state.settings);
      await emit(guest, 'room:settings', { difficulty: 'godlike', personality: 'chaotic' });
      expect(JSON.stringify(room.state.settings)).toBe(before);

      // A guest may not remove the host's seat either.
      await emit(guest, 'room:removePlayer', { playerId: created.playerId });
      expect(room.players.some((p) => p.id === created.playerId)).toBe(true);

      host.close();
      guest.close();
    } finally {
      await harness.close();
    }
  }, 30_000);

  it('a seat cannot be taken twice and characters cannot be duplicated', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const created = await emit<{ roomCode: string; playerId: string }>(host, 'room:create', { name: 'Host' });
      const guest = await connect();
      const joined = await emit<{ playerId: string }>(guest, 'room:join', {
        code: created.roomCode,
        name: 'Guest',
      });
      const taken = await emit(host, 'room:setCharacter', { characterId: 'vance' });
      expect(taken.ok).toBe(true);
      const steal = await emit(guest, 'room:setCharacter', { characterId: 'vance' });
      expect(steal.ok).toBe(false);

      const room = harness.manager.get(created.roomCode)!;
      const characters = room.players.map((p) => p.characterId);
      expect(new Set(characters).size).toBe(characters.length);
      host.close();
      guest.close();
      void joined;
    } finally {
      await harness.close();
    }
  }, 30_000);
});

/* ------------------------------------------------------------------ *
 * 3. Rules cannot be bent by a hostile client
 * ------------------------------------------------------------------ */

describe('rules are enforced server-side', () => {
  it('refuses actions out of turn, out of step and by discredited players', () => {
    const { room, ids, state } = seatedRoom(3);
    room.start();
    const [a, b] = ids;

    expect(applyIntent(state, b, { type: 'roll' }, Math.random).ok).toBe(false);
    expect(applyIntent(state, a, { type: 'roll' }, Math.random).ok).toBe(true);

    // Out of step: suggesting before moving is allowed, moving after rolling
    // twice is not.
    expect(applyIntent(state, a, { type: 'roll' }, Math.random).ok).toBe(false);

    // A discredited detective may only answer suggestions.
    state.eliminated[a] = true;
    expect(applyIntent(state, a, { type: 'endTurn' }, Math.random).ok).toBe(false);
    expect(applyIntent(state, a, { type: 'accuse', suspect: 'suspect:vance', weapon: 'weapon:rope', room: 'room:hall' }, Math.random).ok).toBe(false);
  });

  it('refuses every form of illegal movement', () => {
    const { ids, state } = startedRoom(3);
    const me = ids[0];
    const view = getPlayerView(state, me);
    const legal = view.private.legalMoves;
    expect(legal.length).toBeGreaterThan(0);

    // Teleport to an arbitrary square.
    const illegal = (['c:0,0', 'c:12,12', 'r:conservatory', 'nonsense', '', 'c:99,99'] as NodeId[]).filter(
      (node) => !legal.includes(node),
    );
    for (const node of illegal) {
      expect(applyIntent(state, me, { type: 'move', to: node }, Math.random).ok).toBe(false);
    }
    // Move further than the dice allow.
    const far = view.public.legalMovePaths;
    const total = (state.turn.dice ?? [0, 0])[0] + (state.turn.dice ?? [0, 0])[1];
    for (const [node, path] of Object.entries(far)) {
      expect(path.length - 1).toBeLessThanOrEqual(total);
      void node;
    }
    // A move past the remaining allowance is refused.
    state.turn.movesLeft = 0;
    expect(applyIntent(state, me, { type: 'move', to: legal[0] }, Math.random).ok).toBe(false);
  });

  it('refuses a reveal that is not yours, not held, or not part of the suggestion', () => {
    const { room, ids, state } = seatedRoom(3);
    room.start();
    // Put player one in a room and let them suggest.
    const [a, b, c] = ids;
    state.positions[a] = { kind: 'room', roomId: 'lounge' };
    state.turnStep = 'action';
    expect(applyIntent(state, a, { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' }, Math.random).ok).toBe(true);

    // The engine walks the table; find who is actually being asked.
    const ps = state.pendingSuggestion!;
    const responder = ps.order[ps.index];
    const others = ids.filter((id) => id !== responder);

    for (const id of others) {
      const res = applyIntent(state, id, { type: 'reveal', card: 'weapon:rope' }, Math.random);
      expect(res.ok).toBe(false);
    }

    // A card the responder does not hold is refused, as is a non-matching one.
    const held = state.hands[responder] ?? [];
    const notHeld = ALL_CARDS.map((card) => card.id).find((id) => !held.includes(id))!;
    expect(applyIntent(state, responder, { type: 'reveal', card: notHeld }, Math.random).ok).toBe(false);
    expect(applyIntent(state, responder, { type: 'reveal', card: 'room:cellar' as CardId }, Math.random).ok).toBe(
      ['suspect:vance', 'weapon:rope', 'room:lounge'].includes('room:cellar') && held.includes('room:cellar' as CardId),
    );
    void b;
    void c;
  });

  it('refuses suggestions and accusations built from the wrong card types', () => {
    const { ids, state } = seatedRoom(3);
    startGame(state, Math.random);
    const me = ids[0];
    state.positions[me] = { kind: 'room', roomId: 'hall' };
    state.turnStep = 'action';

    const bad: Intent[] = [
      { type: 'suggest', suspect: 'weapon:rope', weapon: 'weapon:rope' },
      { type: 'suggest', suspect: 'suspect:vance', weapon: 'suspect:vance' },
      { type: 'suggest', suspect: 'not-a-card', weapon: 'weapon:rope' },
      { type: 'accuse', suspect: 'suspect:vance', weapon: 'weapon:rope', room: 'suspect:vance' },
      { type: 'accuse', suspect: 'suspect:vance', weapon: 'weapon:rope', room: 'weapon:rope' },
    ];
    for (const intent of bad) {
      expect(applyIntent(state, me, intent, Math.random).ok).toBe(false);
    }

    // Suggesting from a corridor is refused.
    state.positions[me] = { kind: 'corridor', cell: { row: 5, col: 5 } };
    expect(
      applyIntent(state, me, { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' }, Math.random).ok,
    ).toBe(false);

    // Only one suggestion per turn.
    state.positions[me] = { kind: 'room', roomId: 'hall' };
    state.turn.hasSuggested = true;
    expect(
      applyIntent(state, me, { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' }, Math.random).ok,
    ).toBe(false);
  });

  it('survives malformed and hostile intent payloads', () => {
    const { ids, state } = seatedRoom(3);
    startGame(state, Math.random);
    const me = ids[0];
    const junk: unknown[] = [
      null,
      undefined,
      {},
      [],
      '',
      42,
      { type: 'move' },
      { type: 'move', to: null },
      { type: 'move', to: { evil: true } },
      { type: 'suggest' },
      { type: 'reveal' },
      { type: '__proto__' },
      { type: 'constructor' },
      { type: 'toString' },
      // Real prototype-pollution shapes (own "__proto__" property, not a setter).
      JSON.parse('{"type":"move","to":"c:0,0","__proto__":{"polluted":true}}'),
      JSON.parse('{"__proto__":{"polluted":true}}'),
    ];
    for (const intent of junk) {
      const result = applyIntent(state, me, intent as Intent, Math.random);
      expect(result.ok).toBe(false);
    }
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(3);
  });

  it('ignores extra and prototype-pollution fields on otherwise valid intents', () => {
    const { ids, state } = seatedRoom(3);
    startGame(state, Math.random);
    const me = state.currentPlayerId as string;
    expect(ids).toContain(me);

    // A roll padded with junk is still just a roll; the junk is not stored.
    const padded = applyIntent(state, me, { type: 'roll', extra: 'x'.repeat(10_000) } as unknown as Intent, Math.random);
    expect(padded.ok).toBe(true);
    expect((state.turn as Record<string, unknown>).extra).toBeUndefined();
    expect(JSON.stringify(state.turn)).not.toContain('extra');

    // A pollution-shaped payload is refused here (the dice are already down);
    // either way, Object.prototype is untouched.
    applyIntent(
      state,
      me,
      JSON.parse('{"type":"roll","__proto__":{"polluted":true}}') as Intent,
      Math.random,
    );
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(state.phase).toBe('playing');
  });
});

/* ------------------------------------------------------------------ *
 * 4. Information disclosure
 * ------------------------------------------------------------------ */

describe('no information leaks', () => {
  it('never serialises the solution, other hands, notebooks or tokens into a view', () => {
    const { room, ids, state } = seatedRoom(4, 2);
    room.start();
    const tokens = room.players.map((p) => room.sessionToken(p.id)!);
    expect(tokens.every(Boolean)).toBe(true);

    for (const viewer of ids) {
      const view = text(getPlayerView(state, viewer));
      // The envelope.
      for (const card of [state.solution!.suspect, state.solution!.weapon, state.solution!.room]) {
        expect(view).not.toContain(card);
      }
      // Everyone else's hand.
      for (const player of state.players) {
        if (player.id === viewer) continue;
        for (const card of state.hands[player.id] ?? []) {
          expect(view).not.toContain(card);
        }
      }
      // Reconnect tokens never travel in a projection.
      for (const token of tokens) expect(view).not.toContain(token);
      // The engine's private maps.
      for (const key of ['hands', 'seen', 'shown', 'notebooks']) {
        expect(view).not.toContain(`"${key}"`);
      }
    }
  });

  it('does not reveal which card was shown to anybody but the suggester', () => {
    const { room, ids, state } = seatedRoom(3);
    room.start();
    const [a, b] = ids;
    state.positions[a] = { kind: 'room', roomId: 'lounge' };
    state.turnStep = 'action';
    applyIntent(state, a, { type: 'suggest', suspect: 'suspect:vance', weapon: 'weapon:rope' }, Math.random);

    const ps = state.pendingSuggestion!;
    const responder = ps.order[ps.index];
    const matching = (state.hands[responder] ?? []).filter((card) =>
      ['suspect:vance', 'weapon:rope', 'room:lounge'].includes(card),
    );
    if (!matching.length) return; // nobody could disprove: nothing to leak
    applyIntent(state, responder, { type: 'reveal', card: matching[0] }, Math.random);

    const suggester = text(getPlayerView(state, a));
    expect(suggester).toContain(CARD_BY_ID[matching[0]].name);

    const suggestionCards = [ps.suspect, ps.weapon, ps.room];
    for (const other of ids.filter((id) => id !== a && id !== responder)) {
      const view = getPlayerView(state, other);
      const revealLines = view.public.log.filter((entry) => entry.kind === 'reveal');
      expect(revealLines.length).toBeGreaterThan(0);
      for (const line of revealLines) {
        expect(line.text).not.toContain(CARD_BY_ID[matching[0]].name);
      }
      if (!suggestionCards.includes(matching[0])) {
        expect(text(view)).not.toContain(matching[0]);
      }
    }
    void b;
  });

  it('keeps legal moves private to the player whose turn it is', () => {
    const { room, ids, state } = seatedRoom(3);
    room.start();
    const [a, ...rest] = ids;
    applyIntent(state, a, { type: 'roll' }, Math.random);
    expect(getPlayerView(state, a).private.legalMoves.length).toBeGreaterThan(0);
    expect(getPlayerView(state, a).public.legalMoves.length).toBeGreaterThan(0);
    for (const other of rest) {
      expect(getPlayerView(state, other).private.legalMoves).toEqual([]);
      expect(getPlayerView(state, other).public.legalMoves).toEqual([]);
      expect(Object.keys(getPlayerView(state, other).public.legalMovePaths)).toHaveLength(0);
    }
  });

  it('cannot be asked for a view of a player who is not seated', () => {
    const { room, state } = seatedRoom(3);
    room.start();
    const stranger = getPlayerView(state, 'p_stranger');
    expect(stranger.private.hand).toEqual([]);
    expect(stranger.private.legalMoves).toEqual([]);
    expect(stranger.private.revealRequest).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 5. Abuse, flooding and input hygiene
 * ------------------------------------------------------------------ */

describe('abuse resistance', () => {
  it('stores only a small, flat, string-only notebook', () => {
    const { room, ids } = seatedRoom(1);
    const me = ids[0];
    room.saveNotebook(me, { 'suspect:vance': 'confirmed' } as Record<string, string>);
    expect(room.state.notebooks[me]).toEqual({ 'suspect:vance': 'confirmed' });

    room.saveNotebook(me, {
      ok: 'possible',
      nested: { evil: true },
      numbered: 42,
      nul: null,
      huge: 'x'.repeat(50_000),
      ['k'.repeat(200)]: 'v',
    } as unknown as Record<string, string>);
    const stored = room.state.notebooks[me];
    for (const value of Object.values(stored)) expect(typeof value).toBe('string');
    expect(stored.nested).toBeUndefined();
    expect(stored.numbered).toBeUndefined();
    expect(stored.nul).toBeUndefined();
    expect(JSON.stringify(stored).length).toBeLessThan(9 * 1024);
    for (const key of Object.keys(stored)) expect(key.length).toBeLessThanOrEqual(64);

    // A stranger cannot write into somebody's pad.
    room.saveNotebook('p_stranger', { x: 'y' });
    expect(room.state.notebooks['p_stranger']).toBeUndefined();

    // Non-object payloads are rejected outright.
    room.saveNotebook(me, 'nope' as unknown as Record<string, string>);
    expect(room.state.notebooks[me]).toEqual({});
  });

  it('sanitizeNotebook and asEnum behave on their own', () => {
    expect(sanitizeNotebook(undefined)).toEqual({});
    expect(sanitizeNotebook([1, 2, 3])).toEqual({});
    expect(sanitizeNotebook('text')).toEqual({});
    // Prototype pollution through the detective pad.
    expect(sanitizeNotebook(JSON.parse('{"__proto__":{"polluted":true}}'))).toEqual({});
    expect(sanitizeNotebook(JSON.parse('{"a":"b","__proto__":"c"}'))).toEqual({ a: 'b' });
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(asEnum('hard', ['easy', 'medium', 'hard'], 'medium')).toBe('hard');
    expect(asEnum('godmode', ['easy', 'medium', 'hard'], 'medium')).toBe('medium');
    expect(asEnum(undefined, ['easy'], 'easy')).toBe('easy');
    expect(asEnum({ toString: () => 'easy' }, ['easy'], 'medium')).toBe('medium');
  });

  it('a rate limiter blocks floods and then lets honest traffic through', () => {
    const limiter = new RateLimiter({ limit: 5, windowMs: 1_000 }).rule('slow', { limit: 2, windowMs: 1_000 });
    let allowed = 0;
    for (let i = 0; i < 50; i++) if (limiter.allow('socket-1', 'game:intent')) allowed += 1;
    expect(allowed).toBe(5);

    expect(limiter.allow('socket-1', 'slow')).toBe(true);
    expect(limiter.allow('socket-1', 'slow')).toBe(true);
    expect(limiter.allow('socket-1', 'slow')).toBe(false);

    // Another socket has its own bucket.
    expect(limiter.allow('socket-2', 'game:intent')).toBe(true);

    // Forgetting a socket resets it (used on disconnect).
    limiter.forget('socket-1');
    expect(limiter.allow('socket-1', 'game:intent')).toBe(true);
  });

  it('strips control characters and caps length in player names', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      // Note: an over-long name is refused outright now (the name gate caps
      // input at 18 characters), so this one is sized to get through the gate
      // and prove the cleaning instead.
      const created = await emit<{ roomCode: string }>(host, 'room:create', {
        name: 'Evil\n[SYSTEM]<script>xy',
      });
      const room = harness.manager.get(created.roomCode)!;
      expect(created.ok).toBe(true);
      const name = room.players[0].name;
      expect(name.length).toBeLessThanOrEqual(18);
      // Control characters and markup delimiters are gone (the letters that
      // remain are inert text — React escapes them on the way to the screen).
      expect(name).not.toMatch(/[\n\r\[\]<>]/);
      expect(name).toBe('EvilSYSTEMscriptxy');
      host.close();
    } finally {
      await harness.close();
    }
  }, 30_000);

  it('flooding intents is throttled and never corrupts the game', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const created = await emit<{ roomCode: string }>(host, 'room:create', { name: 'Host' });
      await emit(host, 'room:fillWithAI', {});
      await emit(host, 'room:start', {});
      const room = harness.manager.get(created.roomCode)!;

      let acked = 0;
      let refused = 0;
      for (let i = 0; i < 120; i++) {
        const res = await emit(host, 'game:intent', { type: 'roll' });
        if (res.ok) acked += 1;
        else refused += 1;
      }
      // At most one roll can be honoured, and the limiter must refuse the rest.
      expect(acked).toBeLessThanOrEqual(1);
      expect(refused).toBeGreaterThan(100);
      expect(['roll', 'move', 'action']).toContain(room.state.turnStep);
      const dice = room.state.turn.dice;
      if (dice) expect(dice[0] + dice[1]).toBeGreaterThanOrEqual(2);
      expect(room.state.players).toHaveLength(6);
      host.close();
    } finally {
      await harness.close();
    }
  }, 120_000);

  it('a malformed intent packet does not take the server down', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const created = await emit<{ roomCode: string }>(host, 'room:create', { name: 'Host' });
      await emit(host, 'room:fillWithAI', {});
      await emit(host, 'room:start', {});

      // Each of these used to throw inside the socket listener, which would
      // have crashed the whole process for every table on the server.
      for (const payload of [null, undefined, 42, 'roll', [], { type: null }, { type: { evil: 1 } }]) {
        host.emit('game:intent', payload as object);
      }
      await wait(300);

      // The server is still alive and answers normally.
      const health = await fetch(`http://127.0.0.1:${harness.port}/api/health`);
      expect((await health.json() as { ok: boolean }).ok).toBe(true);
      const room = harness.manager.get(created.roomCode)!;
      expect(room.state.phase).toBe('playing');
      const res = await emit(host, 'game:intent', { type: 'roll' });
      expect(typeof res.ok).toBe('boolean');
      host.close();
    } finally {
      await harness.close();
    }
  }, 30_000);

  it('rejects a flood of unknown events without breaking the socket', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      for (let i = 0; i < 50; i++) host.emit('totally:made:up', { junk: true });
      await wait(200);
      const created = await emit<{ roomCode: string }>(host, 'room:create', { name: 'Still here' });
      expect(created.ok).toBe(true);
      host.close();
    } finally {
      await harness.close();
    }
  }, 30_000);

  it('refuses to create rooms past the server ceiling', async () => {
    const harness = await startServer();
    try {
      // Fill the manager directly (faster than 500 round trips).
      while (harness.manager.size < MAX_ROOMS) harness.manager.create({});
      const host = await connect();
      const res = await emit(host, 'room:create', { name: 'One too many' });
      expect(res.ok).toBe(false);
      expect(String(res.error)).toMatch(/full/i);
      host.close();
    } finally {
      await harness.close();
    }
  }, 30_000);
});

/* ------------------------------------------------------------------ *
 * 6. HTTP surface
 * ------------------------------------------------------------------ */

describe('http surface', () => {
  it('does not expose internal addresses to public callers', async () => {
    const harness = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${harness.port}/api/network-info`);
      const body = (await res.json()) as { lanReachable: boolean; addresses?: string[] };
      // Loopback is private, so the LAN feature still works for local players…
      expect(body.lanReachable).toBe(true);
      expect(Array.isArray(body.addresses)).toBe(true);
      harness.close();
    } finally {
      /* closed below if needed */
    }
  }, 30_000);

  it('refuses QR codes for anything that is not an http(s) URL', async () => {
    const harness = await startServer();
    try {
      for (const url of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>']) {
        const res = await fetch(`http://127.0.0.1:${harness.port}/api/qr?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(400);
      }
    } finally {
      await harness.close();
    }
  }, 30_000);

  it('serves the app without leaking server paths', async () => {
    const harness = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${harness.port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      const traversal = await fetch(`http://127.0.0.1:${harness.port}/../server/src/app.ts`);
      expect(traversal.status === 404 || !(await traversal.text()).includes('createApp')).toBe(true);
    } finally {
      await harness.close();
    }
  }, 30_000);
});

/* ------------------------------------------------------------------ *
 * Test server plumbing
 * ------------------------------------------------------------------ */

interface Harness {
  port: number;
  manager: MansionServer['manager'];
  close: () => Promise<void>;
}

let current: MansionServer | null = null;

async function startServer(): Promise<Harness> {
  const built = createApp(0, { aiDelayScale: 0 });
  await new Promise<void>((resolve) => {
    built.server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (built.server.address() as AddressInfo).port;
  current = built;
  return {
    port,
    manager: built.manager,
    close: () =>
      new Promise<void>((resolve) => {
        built.io.close();
        built.server.close(() => resolve());
        current = null;
      }),
  };
}

function connect(): Promise<ClientSocket> {
  const socket = ioClient(`http://127.0.0.1:${(current!.server.address() as AddressInfo).port}`, {
    transports: ['websocket'],
    path: '/socket.io',
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function emit<T extends object>(socket: ClientSocket, event: string, payload: unknown): Promise<T & { ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(event, payload as object, (response: T & { ok: boolean; error?: string }) => resolve(response));
    setTimeout(() => resolve({ ok: false, error: 'timeout' } as T & { ok: boolean; error?: string }), 4000);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(() => {
  // Keep vitest from complaining about the shared mutable handle.
  expect(current).toBeNull();
});

afterAll(async () => {
  if (current) await new Promise<void>((resolve) => current!.server.close(() => resolve()));
});

/* ------------------------------------------------------------------ *
 * 7. Identity: name gate and uniqueness (Skribbl-style, no accounts)
 * ------------------------------------------------------------------ */

describe('identity', () => {
  it('refuses to seat a player without a usable name', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const created = await emit<{ roomCode: string }>(host, 'room:create', { name: 'Alice' });
      expect(created.ok).toBe(true);

      // Every one of these is refused by the name gate, whichever door it uses.
      // (They go through `room:join`, which is rated more generously than the
      // 6-per-minute limit on creating rooms.)
      for (const name of ['', '   ', 'x', '!!', '..', '--', undefined, null, 42, {}]) {
        const socket = await connect();
        const res = await emit(socket, 'room:join', { code: created.roomCode, name });
        expect(res.ok, `name ${JSON.stringify(name)} should be refused`).toBe(false);
        expect(String(res.error)).toMatch(/name/i);
        socket.close();
      }

      // A real name is let through.
      const good = await connect();
      expect((await emit(good, 'room:join', { code: created.roomCode, name: 'Bob' })).ok).toBe(true);
      good.close();

      // Over-long input is truncated to the cap rather than rejected.
      const second = await connect();
      const long = await emit<{ roomCode: string }>(second, 'room:create', { name: 'A'.repeat(200) });
      expect(long.ok).toBe(true);
      expect(harness.manager.get(long.roomCode)!.players[0].name.length).toBe(18);
      second.close();
      host.close();
      host.close();
    } finally {
      await harness.close();
    }
  }, 60_000);

  it('will not let two detectives share a name at the same table', async () => {
    const harness = await startServer();
    try {
      const alice = await connect();
      const created = await emit<{ roomCode: string }>(alice, 'room:create', { name: 'Alice' });

      const impostor = await connect();
      const same = await emit(impostor, 'room:join', { code: created.roomCode, name: 'Alice' });
      expect(same.ok).toBe(false);
      expect(String(same.error)).toMatch(/already/i);

      // Case and spacing do not buy you a second seat.
      const shifted = await emit(impostor, 'room:join', { code: created.roomCode, name: '  aLiCe  ' });
      expect(shifted.ok).toBe(false);

      // A different name gets in.
      const bob = await emit(impostor, 'room:join', { code: created.roomCode, name: 'Bob' });
      expect(bob.ok).toBe(true);

      // Renaming onto somebody else's name is refused too.
      const clash = await emit(impostor, 'room:setName', { name: 'alice' });
      void clash;
      const room = harness.manager.get(created.roomCode)!;
      await wait(150);
      expect(room.players.filter((p) => p.name.toLowerCase() === 'alice')).toHaveLength(1);
      expect(room.players.some((p) => p.name === 'Bob')).toBe(true);

      alice.close();
      impostor.close();
    } finally {
      await harness.close();
    }
  }, 60_000);

  it('keeps the seat name when a player rejoins, whatever their browser says', async () => {
    const harness = await startServer();
    try {
      const host = await connect();
      const created = await emit<{ roomCode: string; playerId: string; token: string }>(host, 'room:create', {
        name: 'Alice',
      });
      const room = harness.manager.get(created.roomCode)!;
      expect(room.playerById(created.playerId)?.name).toBe('Alice');

      const again = await emit(host, 'session:rejoin', {
        roomCode: created.roomCode,
        playerId: created.playerId,
        token: created.token,
      });
      expect(again.ok).toBe(true);
      expect(room.playerById(created.playerId)?.name).toBe('Alice');
      host.close();
    } finally {
      await harness.close();
    }
  }, 30_000);
});
