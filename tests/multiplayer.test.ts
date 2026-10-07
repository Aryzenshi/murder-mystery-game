import { describe, expect, it, afterAll } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/src/app';
import type { PlayerView } from '@mystery/shared';

const { server, manager, io } = createApp(0, { aiDelayScale: 0.002 });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const port = (server.address() as AddressInfo).port;
const URL = `http://127.0.0.1:${port}`;

afterAll(() => {
  io.close();
  server.close();
});

/**
 * A tiny test client that keeps every `sync` it receives, so a test can never
 * miss one by attaching its listener a moment too late.
 */
class Client {
  readonly socket: Socket;
  readonly views: PlayerView[] = [];
  private waiters: { predicate: (v: PlayerView) => boolean; resolve: (v: PlayerView) => void }[] = [];

  constructor() {
    this.socket = ioClient(URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    this.socket.on('sync', (view: PlayerView) => {
      this.views.push(view);
      const ready = this.waiters.filter((w) => w.predicate(view));
      this.waiters = this.waiters.filter((w) => !ready.includes(w));
      for (const waiter of ready) waiter.resolve(view);
    });
  }

  static async open(): Promise<Client> {
    const client = new Client();
    await new Promise<void>((resolve, reject) => {
      client.socket.once('connect', () => resolve());
      client.socket.once('connect_error', reject);
    });
    return client;
  }

  get view(): PlayerView {
    return this.views[this.views.length - 1];
  }

  waitFor(predicate: (v: PlayerView) => boolean, timeout = 6000): Promise<PlayerView> {
    const existing = [...this.views].reverse().find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timed out waiting for a matching sync')),
        timeout,
      );
      this.waiters.push({
        predicate,
        resolve: (view) => {
          clearTimeout(timer);
          resolve(view);
        },
      });
    });
  }

  /** Waits for a sync that arrives after this call. */
  nextSync(timeout = 6000): Promise<PlayerView> {
    const mark = this.views.length;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for sync')), timeout);
      this.waiters.push({
        predicate: () => this.views.length > mark,
        resolve: (view) => {
          clearTimeout(timer);
          resolve(view);
        },
      });
    });
  }

  ack<T = any>(event: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack from ${event}`)), 6000);
      this.socket.emit(event, payload, (response: T) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  send(event: string, payload?: unknown): void {
    this.socket.emit(event, payload);
  }

  close(): void {
    this.socket.close();
  }
}

type Seated = Client & { playerId: string; token: string };
type Host = Seated & { code: string };

async function createRoom(name: string): Promise<Host> {
  const host = await Client.open();
  const joined = new Promise<any>((resolve) => host.socket.once('joined', resolve));
  const res = await host.ack<any>('room:create', { name });
  await joined;
  return Object.assign(host, {
    code: res.roomCode as string,
    playerId: res.playerId as string,
    token: res.token as string,
  });
}

async function joinRoom(code: string, name: string): Promise<Seated> {
  const client = await Client.open();
  const joined = new Promise<any>((resolve) => client.socket.once('joined', resolve));
  const res = await client.ack<any>('room:join', { code, name });
  if (!res.ok) throw new Error(res.error);
  await joined;
  return Object.assign(client, {
    playerId: res.playerId as string,
    token: res.token as string,
  });
}

describe('bots are per chair and optional', () => {
  it('seats one bot at a time and takes it out again', async () => {
    const host = await createRoom('Host');
    const room = manager.get(host.code)!;

    host.send('room:addAI');
    await host.waitFor((v) => v.public.players.length === 2);
    const bot = host.view.public.players.find((p) => p.isAI)!;
    expect(bot).toBeTruthy();

    // A second switch seats a second bot; humans keep their chairs.
    host.send('room:addAI');
    const two = await host.waitFor((v) => v.public.players.length === 3);
    expect(two.public.players.filter((p) => p.isAI).length).toBe(2);
    expect(two.public.players[0].id).toBe(host.playerId);

    // Flipping one switch off removes only that bot.
    host.send('room:removePlayer', { playerId: bot.id });
    const one = await host.waitFor(
      (v) => v.public.players.length === 2 && v.public.players.every((p) => p.id !== bot.id),
    );
    expect(one.public.players.filter((p) => p.isAI).length).toBe(1);
    expect(room.state.players.find((p) => p.id === bot.id)).toBeUndefined();

    // And it can be emptied completely: a table of humans only is legal.
    host.send('room:removePlayer', { playerId: one.public.players.find((p) => p.isAI)!.id });
    const humans = await host.waitFor((v) => v.public.players.length === 1);
    expect(humans.public.players.some((p) => p.isAI)).toBe(false);
    expect(humans.public.players[0].id).toBe(host.playerId);

    host.close();
  });

  it('applies difficulty and personality to bots already seated', async () => {
    const host = await createRoom('Host');
    host.send('room:addAI');
    const seated = await host.waitFor((v) => v.public.players.length === 2);
    expect(seated.public.players.find((p) => p.isAI)!.difficulty).toBe('medium');

    // The client sends the canonical GameSettings field names.
    host.send('room:settings', { aiDifficulty: 'hard', aiPersonality: 'aggressive' });
    const changed = await host.waitFor((v) => {
      const bot = v.public.players.find((p) => p.isAI);
      return !!bot && bot.difficulty === 'hard' && bot.personality === 'aggressive';
    });
    const bot = changed.public.players.find((p) => p.isAI)!;
    expect(bot.difficulty).toBe('hard');
    expect(bot.personality).toBe('aggressive');
    expect(changed.public.settings.aiDifficulty).toBe('hard');
    expect(changed.public.settings.aiPersonality).toBe('aggressive');

    // A bot seated afterwards inherits the new setting.
    host.send('room:addAI');
    const later = await host.waitFor(
      (v) =>
        v.public.players.length === 3 &&
        v.public.players.filter((p) => p.isAI).every((p) => p.difficulty === 'hard'),
    );
    expect(later.public.players.filter((p) => p.isAI).every((p) => p.difficulty === 'hard')).toBe(
      true,
    );

    host.close();
  });

  it('lets a guest see the bots but not change them', async () => {
    const host = await createRoom('Host');
    host.send('room:addAI');
    await host.waitFor((v) => v.public.players.length === 2);
    const guest = await joinRoom(host.code, 'Guest');
    const seen = await guest.waitFor((v) => v.public.players.length === 3);
    expect(seen.public.players.filter((p) => p.isAI).length).toBe(1);

    guest.send('room:addAI');
    guest.send('room:removePlayer', {
      playerId: seen.public.players.find((p) => p.isAI)!.id,
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(guest.view.public.players.length).toBe(3);
    expect(guest.view.public.players.filter((p) => p.isAI).length).toBe(1);

    guest.close();
    host.close();
  });
});

describe('lobby over the wire', () => {
  it('creates a room with a five letter code', async () => {
    const host = await createRoom('Aaryav');
    expect(host.code).toMatch(/^[A-Z2-9]{5}$/);
    const view = await host.waitFor((v) => v.public.players.length === 1);
    expect(view.public.phase).toBe('lobby');
    expect(view.public.players[0].isHost).toBe(true);
    expect(view.public.players[0].name).toBe('Aaryav');
    host.close();
  });

  it('rejects an unknown code', async () => {
    const host = await createRoom('Host');
    const stranger = await Client.open();
    const res = await stranger.ack<any>('room:join', { code: 'ZZZZZ', name: 'Nobody' });
    expect(res.ok).toBe(false);
    expect(String(res.error)).toMatch(/no game found/i);
    stranger.close();
    host.close();
  });

  it('fills the remaining seats with AI and stops at six', async () => {
    const host = await createRoom('Solo');
    host.send('room:addAI');
    let view = await host.waitFor((v) => v.public.players.length === 2);
    expect(view.public.players[1].isAI).toBe(true);

    host.send('room:fillWithAI');
    view = await host.waitFor((v) => v.public.players.length === 6);
    expect(view.public.players.filter((p) => p.isAI)).toHaveLength(5);

    host.send('room:fillWithAI');
    await new Promise((r) => setTimeout(r, 120));
    expect(host.view.public.players).toHaveLength(6);
    host.close();
  });

  it('seats every human on a different character', async () => {
    const host = await createRoom('One');
    const b = await joinRoom(host.code, 'Two');
    const c = await joinRoom(host.code, 'Three');
    const view = await host.waitFor((v) => v.public.players.length === 3);
    const characters = view.public.players.map((p) => p.characterId);
    expect(new Set(characters).size).toBe(3);
    b.close();
    c.close();
    host.close();
  });

  it('refuses to start with fewer than three players and only lets the host start', async () => {
    const host = await createRoom('Lonely');
    const res = await host.ack<any>('room:start');
    expect(res.ok).toBe(false);
    expect(String(res.error)).toMatch(/at least 3/i);

    const guest = await joinRoom(host.code, 'Guest');
    const third = await joinRoom(host.code, 'Third');
    const guestStart = await guest.ack<any>('room:start');
    expect(guestStart.ok).toBe(false);

    const hostStart = await host.ack<any>('room:start');
    expect(hostStart.ok).toBe(true);
    third.close();
    guest.close();
    host.close();
  });
});

describe('state synchronisation', () => {
  it('gives every player the same board and turn, and only their own cards', async () => {
    const host = await createRoom('Aaryav');
    const b = await joinRoom(host.code, 'Sarah');
    const c = await joinRoom(host.code, 'John');
    await host.ack('room:start');
    const [viewA, viewB, viewC] = await Promise.all([
      host.waitFor((v) => v.public.phase === 'playing'),
      b.waitFor((v) => v.public.phase === 'playing'),
      c.waitFor((v) => v.public.phase === 'playing'),
    ]);

    for (const view of [viewB, viewC]) {
      expect(view.public.currentPlayerId).toBe(viewA.public.currentPlayerId);
      expect(view.public.turnNumber).toBe(viewA.public.turnNumber);
      expect(view.public.positions).toEqual(viewA.public.positions);
      expect(view.public.roomCode).toBe(host.code);
    }

    const hands = [viewA.private.hand, viewB.private.hand, viewC.private.hand];
    expect(hands.reduce((sum, h) => sum + h.length, 0)).toBe(18);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        expect(hands[i].some((card) => hands[j].includes(card))).toBe(false);
      }
    }
    // Public state carries counts, never identities.
    expect(JSON.stringify(viewA.public)).not.toContain(viewB.private.hand[0]);
    expect(viewA.public.players.find((p) => p.id === b.playerId)!.cardCount).toBe(
      viewB.private.hand.length,
    );
    host.close();
    b.close();
    c.close();
  });

  it('rolls on the server and shows the same dice to everybody', async () => {
    const host = await createRoom('Aaryav');
    const b = await joinRoom(host.code, 'Sarah');
    const c = await joinRoom(host.code, 'John');
    await host.ack('room:start');
    await Promise.all(
      [host, b, c].map((client) => client.waitFor((v) => v.public.phase === 'playing')),
    );
    const clients = new Map([
      [host.playerId, host],
      [b.playerId, b],
      [c.playerId, c],
    ]);
    const actor = clients.get(host.view.public.currentPlayerId as string)!;
    const watchers = [host, b, c].filter((client) => client !== actor);

    // Arm the listeners first, then ask the server for the roll.
    const [actorView, first, second] = [
      actor.waitFor((v) => !!v.public.dice),
      ...watchers.map((w) => w.waitFor((v) => !!v.public.dice)),
    ];
    const res = await actor.ack<any>('game:intent', { type: 'roll' });
    expect(res.ok).toBe(true);
    const [actorAfter, firstAfter, secondAfter] = await Promise.all([actorView, first, second]);
    expect(actorAfter.public.dice).toBeTruthy();
    const total = (actorAfter.public.dice as number[]).reduce((a, n) => a + n, 0);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(12);
    expect(firstAfter.public.dice).toEqual(actorAfter.public.dice);
    expect(secondAfter.public.dice).toEqual(actorAfter.public.dice);
    // The acting player is the only one who receives the legal destinations.
    for (const watcher of watchers) {
      expect(watcher.view.public.legalMoves).toEqual([]);
    }
    host.close();
    b.close();
    c.close();
  });
});

describe('private card reveals', () => {
  it('shows the card to the suggester and to nobody else', async () => {
    const host = await createRoom('Aaryav');
    const b = await joinRoom(host.code, 'Sarah');
    const c = await joinRoom(host.code, 'John');
    await host.ack('room:start');
    await host.waitFor((v) => v.public.phase === 'playing');

    const room = manager.get(host.code)!;
    const [p0, p1, p2] = [host.playerId, b.playerId, c.playerId];
    room.state.currentPlayerId = p0;
    room.state.turnStep = 'roll';
    room.state.turn.hasSuggested = false;
    room.state.positions[p0] = { kind: 'room', roomId: 'library' };
    // Sarah holds nothing relevant and must pass; John holds the Rope.
    room.state.hands[p0] = ['weapon:wrench'];
    room.state.hands[p1] = ['weapon:dagger'];
    room.state.hands[p2] = ['weapon:rope'];

    const suggest = await host.ack<any>('game:intent', {
      type: 'suggest',
      suspect: 'suspect:vance',
      weapon: 'weapon:rope',
    });
    expect(suggest.ok).toBe(true);

    // Sarah is skipped — the table watches her fail to disprove.
    const viewB = await b.waitFor(
      (v) => !!v.public.pendingSuggestion?.passedIds.includes(b.playerId),
    );
    expect(viewB.private.revealRequest).toBeNull();

    // John is the one who answers, and only he is offered his own cards.
    const viewC = await c.waitFor((v) => !!v.private.revealRequest);
    expect(viewC.private.revealRequest!.matching).toEqual(['weapon:rope']);
    expect(viewC.private.revealRequest!.room).toBe('room:library');

    const revealed = await c.ack<any>('game:intent', { type: 'reveal', card: 'weapon:rope' });
    expect(revealed.ok).toBe(true);

    const afterA = await host.waitFor((v) => !!v.private.lastReveal);
    const afterB = await b.waitFor((v) => v.public.pendingSuggestion?.resolved === true);

    expect(afterA.private.lastReveal).toEqual({ fromId: p2, card: 'weapon:rope' });
    expect(afterB.private.lastReveal).toBeNull();
    // The suggestion itself is public; the answer is not.
    const revealLinesB = afterB.public.log.filter((l) => l.kind === 'reveal').map((l) => l.text);
    expect(revealLinesB.join(' | ')).toMatch(/showed a card/i);
    expect(revealLinesB.join(' | ')).not.toMatch(/Rope/i);
    const revealLinesA = afterA.public.log.filter((l) => l.kind === 'reveal').map((l) => l.text);
    expect(revealLinesA.join(' | ')).toMatch(/showed you/i);
    expect(revealLinesA.join(' | ')).toMatch(/Rope/i);
    // Nothing in Sarah's *private* projection names the card that was shown:
    // the string only appears publicly because it was part of the suggestion.
    expect(JSON.stringify(afterB.private)).not.toContain('weapon:rope');
    expect(afterB.private.seenCards).toEqual([]);

    host.close();
    b.close();
    c.close();
  });
});

describe('server validation', () => {
  it('refuses actions from a player whose turn it is not', async () => {
    const host = await createRoom('Aaryav');
    const b = await joinRoom(host.code, 'Sarah');
    const c = await joinRoom(host.code, 'John');
    await host.ack('room:start');
    const [view] = await Promise.all(
      [host, b, c].map((client) => client.waitFor((v) => v.public.phase === 'playing')),
    );
    const clients = new Map([
      [host.playerId, host],
      [b.playerId, b],
      [c.playerId, c],
    ]);
    const actor = clients.get(view.public.currentPlayerId as string)!;
    const other = [host, b, c].find((client) => client !== actor)!;

    expect((await other.ack<any>('game:intent', { type: 'roll' })).ok).toBe(false);
    expect((await other.ack<any>('game:intent', { type: 'move', to: 'c:0,0' })).ok).toBe(false);

    await actor.ack('game:intent', { type: 'roll' });
    const actorView = await actor.waitFor((v) => v.private.legalMoves.length > 0);
    const illegal = 'r:kitchen';
    if (!actorView.private.legalMoves.includes(illegal)) {
      expect((await actor.ack<any>('game:intent', { type: 'move', to: illegal })).ok).toBe(false);
    }

    const forged = await other.ack<any>('game:intent', { type: 'reveal', card: 'weapon:rope' });
    expect(forged.ok).toBe(false);

    host.close();
    b.close();
    c.close();
  });

  it('ignores client supplied hands, positions and solutions', async () => {
    const host = await createRoom('Aaryav');
    const b = await joinRoom(host.code, 'Sarah');
    const c = await joinRoom(host.code, 'John');
    await host.ack('room:start');
    await host.waitFor((v) => v.public.phase === 'playing');
    const room = manager.get(host.code)!;
    const before = JSON.stringify(room.state.positions);
    const handBefore = [...room.state.hands[host.playerId]];

    await host.ack<any>('game:intent', {
      type: 'move',
      to: 'r:ballroom',
      position: { kind: 'room', roomId: 'ballroom' },
      hand: ['weapon:rope'],
      solution: { suspect: 'x', weapon: 'y', room: 'z' },
    });

    expect(room.state.hands[host.playerId]).toEqual(handBefore);
    expect(room.state.solution).not.toEqual({ suspect: 'x', weapon: 'y', room: 'z' });
    const after = JSON.stringify(room.state.positions);
    if (after !== before) {
      // only ever the result the engine itself produced
      expect(room.state.positions[host.playerId]).toEqual({
        kind: 'room',
        roomId: 'ballroom',
      });
      expect(room.state.turnStep).toBe('action');
    }
    host.close();
    b.close();
    c.close();
  });
});

describe('reconnection', () => {
  it('holds the seat, the hand and the character across a disconnect', async () => {
    const host = await createRoom('Aaryav');
    const b = await joinRoom(host.code, 'Sarah');
    const c = await joinRoom(host.code, 'John');
    await host.ack('room:start');
    await Promise.all([
      host.waitFor((v) => v.public.phase === 'playing'),
      b.waitFor((v) => v.private.hand.length > 0),
      c.waitFor((v) => v.private.hand.length > 0),
    ]);
    const sarahHand = [...b.view.private.hand];
    expect(sarahHand.length).toBeGreaterThan(0);
    const sarahCharacter = b.view.public.players.find((p) => p.id === b.playerId)!.characterId;

    b.close();
    const dropped = await host.waitFor(
      (v) => v.public.players.find((p) => p.id === b.playerId)?.connected === false,
    );
    expect(dropped.public.players.find((p) => p.id === b.playerId)!.characterId).toBe(
      sarahCharacter,
    );
    // Her cards stay in her hand, not in the room's discard pile.
    expect(manager.get(host.code)!.state.hands[b.playerId]).toEqual(sarahHand);

    const rejoined = await Client.open();
    const res = await rejoined.ack<any>('session:rejoin', {
      roomCode: host.code,
      playerId: b.playerId,
      token: b.token,
    });
    expect(res.ok).toBe(true);
    const back = await rejoined.waitFor((v) => v.private.hand.length === sarahHand.length);
    expect(back.private.hand).toEqual(sarahHand);
    expect(back.public.players.find((p) => p.id === b.playerId)!.connected).toBe(true);

    const forger = await Client.open();
    const bad = await forger.ack<any>('session:rejoin', {
      roomCode: host.code,
      playerId: b.playerId,
      token: 'not-the-token',
    });
    expect(bad.ok).toBe(false);
    forger.close();
    rejoined.close();
    c.close();
    host.close();
  });
});
