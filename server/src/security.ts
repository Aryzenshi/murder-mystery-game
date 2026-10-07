/**
 * Security primitives for the table.
 *
 * Nothing here is exotic — the goal is that the server never trusts a byte from
 * a client, never hands out a guessable secret, and never lets one socket
 * exhaust the process.
 */
import { randomBytes, randomInt } from 'node:crypto';

/* ------------------------------------------------------------------ *
 * Randomness
 * ------------------------------------------------------------------ */

/**
 * A seat's reconnect token. This is the *only* secret standing between a
 * stranger and somebody else's hand of cards, so it gets 192 bits from the
 * system CSPRNG — never `Math.random`.
 */
export function sessionToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Cryptographically random room code drawn from an unambiguous alphabet. */
export function roomCode(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */

/** Coerces a value to one of `allowed`, falling back when it is not valid. */
export function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * The same check, but with no fallback: `undefined` means "not specified", so a
 * caller can leave the room's current setting alone instead of overwriting it.
 */
export function asEnumOrUndefined<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** The longest notebook we will store for one detective (characters). */
const NOTEBOOK_MAX_BYTES = 8 * 1024;
const NOTEBOOK_MAX_KEYS = 128;

/**
 * The detective pad lives in the browser; we only echo it back to its owner.
 * It is nonetheless untrusted input, so it is forced into a flat, small,
 * string-to-string shape before it is kept in memory.
 */
export function sanitizeNotebook(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  let size = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= NOTEBOOK_MAX_KEYS) break;
    if (typeof key !== 'string' || key.length > 64) continue;
    if (typeof value !== 'string') continue;
    const mark = value.slice(0, 16);
    size += key.length + mark.length;
    if (size > NOTEBOOK_MAX_BYTES) break;
    out[key] = mark;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

interface Rule {
  /** How many events are allowed inside the window. */
  limit: number;
  windowMs: number;
}

/**
 * Sliding-window limiter keyed by an arbitrary string (here: socket id plus
 * event name). Buckets are pruned on access and on a slow sweep, so a flood of
 * one-shot keys cannot grow the map without bound either.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private rules = new Map<string, Rule>();
  private lastSweep = Date.now();

  constructor(
    private defaults: Rule = { limit: 40, windowMs: 5_000 },
    private maxKeys = 10_000,
  ) {}

  /** Registers a stricter rule for one event name. */
  rule(event: string, rule: Rule): this {
    this.rules.set(event, rule);
    return this;
  }

  /** Returns false when the caller is over its limit. */
  allow(key: string, event: string): boolean {
    const now = Date.now();
    const { limit, windowMs } = this.rules.get(event) ?? this.defaults;
    const id = `${key}|${event}`;

    const recent = (this.hits.get(id) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      this.hits.set(id, recent);
      this.sweep(now);
      return false;
    }
    recent.push(now);
    this.hits.set(id, recent);
    this.sweep(now);
    return true;
  }

  /** Forgets a socket's buckets entirely (call on disconnect). */
  forget(key: string): void {
    for (const id of [...this.hits.keys()]) {
      if (id.startsWith(`${key}|`)) this.hits.delete(id);
    }
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 30_000) return;
    this.lastSweep = now;
    const windowMs = Math.max(
      this.defaults.windowMs,
      ...[...this.rules.values()].map((r) => r.windowMs),
    );
    for (const [id, at] of this.hits) {
      if (at.every((t) => now - t > windowMs)) this.hits.delete(id);
    }
    // Hard stop: if a client somehow mints keys forever, drop the oldest half.
    if (this.hits.size > this.maxKeys) {
      const excess = this.hits.size - Math.floor(this.maxKeys / 2);
      let removed = 0;
      for (const id of this.hits.keys()) {
        if (removed++ >= excess) break;
        this.hits.delete(id);
      }
    }
  }
}
