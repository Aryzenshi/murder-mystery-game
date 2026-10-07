import type { CharacterDef } from '../types';

/**
 * ---------------------------------------------------------------------------
 * ORIGINAL CAST — isolated configuration
 * ---------------------------------------------------------------------------
 * These six characters are ORIGINAL creations written for this implementation.
 * They are *inspired by* the classic archetypes of the deduction board-game
 * genre (the heiress, the colonel, the housekeeper, the businessman, the
 * socialite and the scholar) — `archetype` documents that inspiration for
 * reference only. No trademarked names, likenesses or artwork are used.
 *
 * Because every name lives in this one file (and every colour lives next to
 * it), the whole cast can be re-themed by editing this file alone.
 * ---------------------------------------------------------------------------
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'vance',
    name: 'Miss Ruby Vance',
    short: 'Miss Vance',
    title: 'The Heiress',
    color: '#a02b33',
    shade: '#5f171d',
    token: 'heirloom',
    start: { row: 6, col: 23 },
    archetype: 'the scarlet heiress',
  },
  {
    id: 'kane',
    name: 'Colonel Bramwell Kane',
    short: 'Colonel Kane',
    title: 'The Colonel',
    color: '#b2822c',
    shade: '#6d4d13',
    token: 'colonel',
    start: { row: 12, col: 23 },
    archetype: 'the mustard colonel',
  },
  {
    id: 'whitmore',
    name: 'Mrs. Ivy Whitmore',
    short: 'Mrs. Whitmore',
    title: 'The Housekeeper',
    color: '#9aa39a',
    shade: '#5b635c',
    token: 'housekeeper',
    start: { row: 18, col: 23 },
    archetype: 'the woman in white',
  },
  {
    id: 'greenwood',
    name: 'Mr. Silas Greenwood',
    short: 'Mr. Greenwood',
    title: 'The Businessman',
    color: '#2f6b47',
    shade: '#173a26',
    token: 'businessman',
    start: { row: 24, col: 13 },
    archetype: 'the man in green',
  },
  {
    id: 'marlowe',
    name: 'Lady Ophelia Marlowe',
    short: 'Lady Marlowe',
    title: 'The Socialite',
    color: '#3c6c95',
    shade: '#1d3c56',
    token: 'socialite',
    start: { row: 18, col: 0 },
    archetype: 'the peacock socialite',
  },
  {
    id: 'plume',
    name: 'Professor Cassius Plume',
    short: 'Professor Plume',
    title: 'The Scholar',
    color: '#6b4a8f',
    shade: '#3a2650',
    token: 'scholar',
    start: { row: 6, col: 0 },
    archetype: 'the plum professor',
  },
];

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);

export const CHARACTER_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
);

export function getCharacter(id: string | null): CharacterDef | null {
  return id && CHARACTER_BY_ID[id] ? CHARACTER_BY_ID[id] : null;
}

/** Names handed to bots, so a table of bots still reads like a cast list. */
export const AI_NAMES = [
  'Inspector Hale',
  'Dr. Ambrose',
  'Madame Kestrel',
  'Sgt. Bramble',
  'Mr. Aldercott',
  'Miss Fenwick',
  'Constable Reid',
  'Lady Ashcomb',
];
