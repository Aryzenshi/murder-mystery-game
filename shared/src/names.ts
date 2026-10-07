/**
 * Detective names.
 *
 * Identity here is deliberately Skribbl-like: no account, no password, no
 * email. You pick a name, the server hands your seat a session token, and the
 * two together are enough to reclaim that seat if your connection drops.
 *
 * Names are unique *within a table* (case- and whitespace-insensitive) so that
 * the log, the lobby and the "X showed a card to Y" lines are never ambiguous.
 */

/** Key used to compare two names for equality. */
export function normalizeNameKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

export const NAME_MIN = 2;
export const NAME_MAX = 18;

/** A name must contain something readable, not just punctuation. */
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

/** True when a name is long enough to sit down with. */
export function isNameValid(raw: unknown): boolean {
  const key = normalizeNameKey(raw);
  return key.length >= NAME_MIN && key.length <= NAME_MAX;
}

/** Why a name was refused, or null when it is fine. */
export function nameProblem(raw: unknown): string | null {
  // Anything that is not a string (numbers, objects, null) is not a name.
  if (typeof raw !== 'string') return 'Choose a name before you sit down.';
  const trimmed = raw.trim();
  if (!trimmed) return 'Choose a name before you sit down.';
  if (normalizeNameKey(trimmed).length < NAME_MIN) return 'That name is a little too short.';
  if (trimmed.length > NAME_MAX) return `Names are ${NAME_MAX} characters at most.`;
  if (!HAS_ALPHANUMERIC.test(trimmed)) return 'Names need at least one letter or number.';
  return null;
}
