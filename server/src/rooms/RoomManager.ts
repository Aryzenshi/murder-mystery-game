import type { Server } from 'socket.io';
import type { GameSettings } from '@mystery/shared';
import { Room, DISCONNECT_GRACE_MS, type RoomOptions } from '../game/Room';
import { roomCode as randomRoomCode } from '../security';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const IDLE_ROOM_MS = 30 * 60 * 1000;
/** Hard ceiling on live rooms so one client cannot exhaust server memory. */
export const MAX_ROOMS = 500;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private lastActivity = new Map<string, number>();

  constructor(private io: Server, private roomOptions: RoomOptions = {}) {
    const timer = setInterval(() => this.sweep(), 60_000);
    timer.unref?.();
  }

  /** Cryptographically random, so codes cannot be predicted from earlier ones. */
  generateCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      const code = randomRoomCode(ALPHABET, CODE_LENGTH);
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a room code');
  }

  get isFull(): boolean {
    return this.rooms.size >= MAX_ROOMS;
  }

  create(settings?: Partial<GameSettings>): Room {
    const code = this.generateCode();
    const room = new Room(code, this.io, settings, this.roomOptions);
    this.rooms.set(code, room);
    this.lastActivity.set(code, Date.now());
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (room) this.lastActivity.set(room.code, Date.now());
    return room;
  }

  has(code: string): boolean {
    return this.rooms.has(String(code || '').toUpperCase());
  }

  remove(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.destroy();
    this.io.to(code).emit('room:closed', { code });
    this.rooms.delete(code);
    this.lastActivity.delete(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Drops rooms that everybody has abandoned. */
  sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.hasConnectedHumans()) {
        this.lastActivity.set(code, now);
        continue;
      }
      const last = this.lastActivity.get(code) ?? now;
      if (now - last > Math.min(IDLE_ROOM_MS, DISCONNECT_GRACE_MS + 60_000)) {
        this.remove(code);
      }
    }
  }
}
