import type { Card, CardId, CardCategory } from '../types';
import { CHARACTERS } from './characters';
import { ROOMS } from './board';

/**
 * ---------------------------------------------------------------------------
 * ORIGINAL CARD SET — isolated configuration
 * ---------------------------------------------------------------------------
 * Suspects mirror the original cast, weapons and rooms are original
 * equivalents of the classic deduction-game categories. Every string below is
 * safe to re-theme: the rules engine only ever handles `CardId`s.
 * ---------------------------------------------------------------------------
 */

/** One suspect card per playable character. */
export const SUSPECT_CARDS: Card[] = CHARACTERS.map((c) => ({
  id: `suspect:${c.id}`,
  name: c.short,
  category: 'suspect' as CardCategory,
  art: `suspect-${c.id}`,
}));

export const WEAPON_CARDS: Card[] = [
  { id: 'weapon:candlestick', name: 'Candlestick', category: 'weapon', art: 'weapon-candlestick' },
  { id: 'weapon:dagger', name: 'Dagger', category: 'weapon', art: 'weapon-dagger' },
  { id: 'weapon:leadpipe', name: 'Lead Pipe', category: 'weapon', art: 'weapon-leadpipe' },
  { id: 'weapon:revolver', name: 'Revolver', category: 'weapon', art: 'weapon-revolver' },
  { id: 'weapon:rope', name: 'Rope', category: 'weapon', art: 'weapon-rope' },
  { id: 'weapon:wrench', name: 'Wrench', category: 'weapon', art: 'weapon-wrench' },
];

export const ROOM_CARDS: Card[] = ROOMS.map((r) => ({
  id: `room:${r.id}`,
  name: r.name,
  category: 'room' as CardCategory,
  art: `room-${r.id}`,
}));

export const ALL_CARDS: Card[] = [...SUSPECT_CARDS, ...WEAPON_CARDS, ...ROOM_CARDS];

export const CARD_BY_ID: Record<CardId, Card> = Object.fromEntries(
  ALL_CARDS.map((c) => [c.id, c]),
);

export const CATEGORY_ORDER: CardCategory[] = ['suspect', 'weapon', 'room'];

export const CATEGORY_LABEL: Record<CardCategory, string> = {
  suspect: 'Suspects',
  weapon: 'Weapons',
  room: 'Rooms',
};

export function cardName(id: CardId): string {
  return CARD_BY_ID[id]?.name ?? id;
}

export function cardsOfCategory(category: CardCategory): Card[] {
  return ALL_CARDS.filter((c) => c.category === category);
}

/** "room:library" -> "library" */
export function shortId(id: CardId): string {
  return id.includes(':') ? id.split(':').slice(1).join(':') : id;
}
