import type { Server, Socket } from 'socket.io';
import { NAME_MAX, nameProblem, type Intent } from '@mystery/shared';
import { RoomManager } from '../rooms/RoomManager';
import { MAX_PLAYERS } from '../game/Room';
import { RateLimiter, asEnum, asEnumOrUndefined } from '../security';
import type { AiDifficulty, AiPersonality, GameSettings } from '@mystery/shared';

type Ack<T = unknown> = ((payload: T) => void) | undefined;

interface JoinedPayload {
  roomCode: string;
  playerId: string;
  token: string;
  isHost: boolean;
}

const ok = <T extends object>(ack: Ack<any>, payload: T = {} as T) => {
  ack?.({ ok: true, ...payload });
};
const fail = (ack: Ack<any>, error: string) => {
  ack?.({ ok: false, error });
};

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const PERSONALITIES = ['analytical', 'aggressive', 'careful', 'random'] as const;

/**
 * Names are echoed into the shared log, so strip everything but plain text and
 * cap the length. `stripped` is the validation form (empty when there is
 * nothing usable); `cleanName` is the seating form (never empty).
 */
function stripped(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N} .'-]/gu, '')
    .trim()
    .slice(0, NAME_MAX);
}

function cleanName(raw: unknown, fallback = 'Detective'): string {
  return stripped(raw) || fallback;
}

/**
 * Validates the name a client proposes: it must be a real string, and the
 * cleaned form must be a usable name. (Over-long input is trimmed to the cap
 * rather than refused, so a long name costs nothing but characters.)
 */
function nameRefusal(raw: unknown): string | null {
  if (typeof raw !== 'string') return 'Choose a name before you sit down.';
  return nameProblem(stripped(raw));
}

function difficulty(raw: unknown): AiDifficulty {
  return asEnum(raw, DIFFICULTIES, 'medium');
}

function personality(raw: unknown): AiPersonality {
  return asEnum(raw, PERSONALITIES, 'analytical');
}

/** `undefined` means "leave the table setting as it is". */
function maybeDifficulty(raw: unknown): AiDifficulty | undefined {
  return asEnumOrUndefined(raw, DIFFICULTIES);
}

function maybePersonality(raw: unknown): AiPersonality | undefined {
  return asEnumOrUndefined(raw, PERSONALITIES);
}

/**
 * One limiter per server, shared by every socket. A single client can still
 * play the game comfortably, but it cannot hammer the engine, mint rooms, or
 * grind through reconnect tokens.
 */
const limiter = new RateLimiter({ limit: 40, windowMs: 5_000 })
  .rule('game:intent', { limit: 30, windowMs: 5_000 })
  .rule('room:create', { limit: 6, windowMs: 60_000 })
  .rule('room:join', { limit: 20, windowMs: 60_000 })
  .rule('session:rejoin', { limit: 20, windowMs: 60_000 })
  .rule('notebook:save', { limit: 60, windowMs: 30_000 })
  .rule('room:addAI', { limit: 20, windowMs: 10_000 })
  .rule('room:fillWithAI', { limit: 20, windowMs: 10_000 });

/** Wraps a listener with a per-socket rate limit. */
function gated(
  socket: Socket,
  event: string,
  handler: (payload: any, ack: Ack) => void,
): void {
  socket.on(event, (payload: any, ack: Ack) => {
    if (!limiter.allow(socket.id, event)) {
      ack?.({ ok: false, error: 'Slow down a moment.' });
      if (!gated.warned.has(socket.id)) {
        gated.warned.add(socket.id);
        socket.emit('toast', {
          message: 'Slow down a moment — the table is catching its breath.',
          tone: 'error',
        });
        setTimeout(() => gated.warned.delete(socket.id), 5_000);
      }
      return;
    }
    handler(payload, ack);
  });
}
gated.warned = new Set<string>();

export function registerHandlers(io: Server, manager: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    socket.emit('hello', { socketId: socket.id });

    /* ---------------------------------------------------------------- */
    /* Lobby                                                             */
    /* ---------------------------------------------------------------- */

    gated(socket, 'room:create', (payload: any, ack: Ack) => {
      const problem = nameRefusal(payload?.name);
      if (problem) return fail(ack, problem);
      try {
        if (manager.isFull) return fail(ack, 'This server is full at the moment. Try again shortly.');
        const room = manager.create({
          aiDifficulty: difficulty(payload?.difficulty),
          aiPersonality: personality(payload?.personality),
        });
        // An empty room cannot clash, but check anyway: it costs nothing.
        if (room.nameTaken(payload?.name)) {
          manager.remove(room.code);
          return fail(ack, 'That name is already at the table.');
        }
        const player = room.createPlayer({ name: cleanName(payload?.name), isAI: false });
        if (!player) {
          manager.remove(room.code);
          return fail(ack, 'Could not seat you at the table.');
        }
        socket.join(room.code);
        socket.data.roomCode = room.code;
        socket.data.playerId = player.id;
        const token = room.sessionToken(player.id) as string;
        room.attachSocket(player.id, socket.id, token);
        const joined: JoinedPayload = {
          roomCode: room.code,
          playerId: player.id,
          token,
          isHost: true,
        };
        socket.emit('joined', joined);
        room.syncAll();
        ok(ack, joined);
      } catch (error) {
        fail(ack, 'The parlour could not be opened.');
      }
    });

    gated(socket, 'room:join', (payload: any, ack: Ack) => {
      const code = String(payload?.code ?? '').toUpperCase().trim();
      if (!code) return fail(ack, 'Enter a game code.');
      const problem = nameRefusal(payload?.name);
      if (problem) return fail(ack, problem);
      const room = manager.get(code);
      if (!room) return fail(ack, 'No game found with that code.');
      if (room.state.phase !== 'lobby') return fail(ack, 'That game has already begun.');
      if (room.players.length >= MAX_PLAYERS) return fail(ack, 'That table is full.');
      // No two detectives share a name at the same table.
      if (room.nameTaken(payload?.name)) return fail(ack, 'That name is already at the table.');

      const player = room.createPlayer({ name: cleanName(payload?.name), isAI: false });
      if (!player) return fail(ack, 'That table is full.');
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      const token = room.sessionToken(player.id) as string;
      room.attachSocket(player.id, socket.id, token);
      const joined: JoinedPayload = {
        roomCode: room.code,
        playerId: player.id,
        token,
        isHost: player.isHost,
      };
      // The handshake must land before the first snapshot: otherwise the client
      // applies room state while it still thinks it is on the home screen.
      socket.emit('joined', joined);
      room.syncAll();
      ok(ack, joined);
    });

    gated(socket, 'session:rejoin', (payload: any, ack: Ack) => {
      const code = String(payload?.roomCode ?? '').toUpperCase().trim();
      const playerId = String(payload?.playerId ?? '');
      const token = String(payload?.token ?? '');
      const room = manager.get(code);
      if (!room) return fail(ack, 'That game is no longer running.');
      const player = room.playerById(playerId);
      if (!player) return fail(ack, 'Your seat was given up.');
      if (player.isAI) return fail(ack, 'That seat belongs to a bot.');
      const expected = room.sessionToken(playerId);
      if (!expected || expected !== token) return fail(ack, 'Your invitation is no longer valid.');
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      room.attachSocket(playerId, socket.id, token);
      const joined: JoinedPayload = {
        roomCode: room.code,
        playerId,
        token,
        isHost: player.isHost,
      };
      socket.emit('joined', joined);
      room.syncAll();
      room.syncPlayer(playerId);
      room.toast(null, `${player.name} has rejoined the table.`, 'success');
      ok(ack, joined);
    });

    gated(socket, 'room:setName', (payload: any) => withRoom(socket, manager, (room, playerId) => {
      const problem = nameRefusal(payload?.name);
      if (problem) return room.toast(playerId, problem, 'error');
      if (room.nameTaken(payload?.name, playerId)) {
        return room.toast(playerId, 'That name is already at the table.', 'error');
      }
      room.setName(playerId, cleanName(payload?.name, room.playerById(playerId)?.name ?? 'Detective'));
      room.syncAll();
    }));

    gated(socket, 'room:setCharacter', (payload: any, ack: Ack) => withRoom(socket, manager, (room, playerId) => {
      const characterId = payload?.characterId ? String(payload.characterId) : null;
      if (!room.setCharacter(playerId, characterId)) {
        return fail(ack, 'That character is already taken.');
      }
      room.syncAll();
      ok(ack);
    }));

    gated(socket, 'room:ready', (payload: any) => withRoom(socket, manager, (room, playerId) => {
      room.setReady(playerId, !!payload?.ready);
      room.syncAll();
    }));

    gated(socket, 'room:addAI', (payload: any) => withRoom(socket, manager, (room, playerId) => {
      if (!requireHost(room, playerId)) return;
      if (room.players.length >= MAX_PLAYERS) {
        return room.toast(playerId, 'The table already has six detectives.', 'error');
      }
      room.addAI(maybeDifficulty(payload?.difficulty), maybePersonality(payload?.personality));
      room.syncAll();
    }));

    gated(socket, 'room:fillWithAI', () => withRoom(socket, manager, (room, playerId) => {
      if (!requireHost(room, playerId)) return;
      const added = room.fillWithAI();
      room.syncAll();
      if (added === 0) room.toast(playerId, 'The table is already full.', 'info');
    }));

    gated(socket, 'room:removePlayer', (payload: any) => withRoom(socket, manager, (room, playerId) => {
      const target = String(payload?.playerId ?? '');
      if (target !== playerId && !requireHost(room, playerId)) return;
      if (!room.removePlayer(target)) {
        return room.toast(playerId, 'That seat cannot be removed mid-case.', 'error');
      }
      room.syncAll();
      for (const socketId of io.sockets.adapter.rooms.get(room.code) ?? []) {
        const other = io.sockets.sockets.get(socketId);
        if (other && other.data.playerId === target) {
          other.leave(room.code);
          other.data.roomCode = null;
          other.data.playerId = null;
          other.emit('kicked', { roomCode: room.code });
        }
      }
    }));

    gated(socket, 'room:settings', (payload: any) => withRoom(socket, manager, (room, playerId) => {
      if (!requireHost(room, playerId)) return;
      const settings: Partial<GameSettings> = {};
      // canonical field names; the short ones are accepted for older clients
      const rawDifficulty = payload?.aiDifficulty ?? payload?.difficulty;
      const rawPersonality = payload?.aiPersonality ?? payload?.personality;
      if (rawDifficulty) settings.aiDifficulty = difficulty(rawDifficulty);
      if (rawPersonality) settings.aiPersonality = personality(rawPersonality);
      if (typeof payload?.autoPlayDisconnected === 'boolean') {
        settings.autoPlayDisconnected = payload.autoPlayDisconnected;
      }
      room.updateSettings(settings);
      room.syncAll();
    }));

    gated(socket, 'room:start', (_payload: any, ack: Ack) => withRoom(socket, manager, (room, playerId) => {
      if (!requireHost(room, playerId)) return fail(ack, 'Only the host can deal the cards.');
      const result = room.start();
      if (!result.ok) return fail(ack, result.error ?? 'The game could not start.');
      ok(ack);
    }));

    gated(socket, 'room:restart', () => withRoom(socket, manager, (room, playerId) => {
      if (!requireHost(room, playerId)) return;
      room.restart();
    }));

    gated(socket, 'room:leave', () => withRoom(socket, manager, (room, playerId) => {
      if (room.state.phase === 'lobby') {
        room.removePlayer(playerId);
        room.syncAll();
      }
      socket.leave(room.code);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      socket.emit('left', { roomCode: room.code });
    }));

    /* ---------------------------------------------------------------- */
    /* Play                                                              */
    /* ---------------------------------------------------------------- */

    gated(socket, 'game:intent', (intent: Intent, ack: Ack) => withRoom(socket, manager, (room, playerId) => {
      const result = room.handleIntent(playerId, intent);
      ack?.({ ok: result.ok, error: result.error, effect: result.effect });
    }));

    gated(socket, 'notebook:save', (payload: any) => withRoom(socket, manager, (room, playerId) => {
      room.saveNotebook(playerId, payload?.notebook ?? {});
    }));

    /* ---------------------------------------------------------------- */

    socket.on('disconnect', () => {
      limiter.forget(socket.id);
      const code = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!code || !playerId) return;
      const room = manager.get(code);
      if (!room) return;
      room.detachSocket(playerId, socket.id);
      socket.data.roomCode = null;
      socket.data.playerId = null;
    });
  });
}

function withRoom(
  socket: Socket,
  manager: RoomManager,
  fn: (room: NonNullable<ReturnType<RoomManager['get']>>, playerId: string) => void,
): void {
  const code = socket.data.roomCode as string | undefined;
  const playerId = socket.data.playerId as string | undefined;
  if (!code || !playerId) {
    socket.emit('toast', { message: 'You are not seated at a table.', tone: 'error' });
    return;
  }
  const room = manager.get(code);
  if (!room) {
    socket.emit('toast', { message: 'That game is no longer running.', tone: 'error' });
    return;
  }
  fn(room, playerId);
}

function requireHost(room: NonNullable<ReturnType<RoomManager['get']>>, playerId: string): boolean {
  const player = room.playerById(playerId);
  if (!player?.isHost) {
    room.toast(playerId, 'Only the host can do that.', 'error');
    return false;
  }
  return true;
}
