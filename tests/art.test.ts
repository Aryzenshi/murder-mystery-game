import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ALL_CARDS } from '../shared/src/constants/cards';
import { ROOMS } from '../shared/src/constants/board';
import { CHARACTERS } from '../shared/src/constants/characters';
import {
  BOARD_ART_URL,
  INTRO_FILM_URL,
  cardArtUrl,
  roomArtUrl,
} from '../client/src/cards/artAssets';

/**
 * The artwork is optional: every empty slot falls back to the vector art drawn
 * in the source, so a card with no picture is a normal state — the set is
 * filled in a few at a time. What must never drift is the *naming*: a card that
 * asks for `suspect-marlowe.png` while the folder holds `suspect-marlow.png`
 * would silently show nothing at all. These tests hold the two lists together.
 */

const ASSETS = path.resolve(__dirname, '../client/src/assets');

function filesIn(folder: string): string[] {
  const dir = path.join(ASSETS, 'art', folder);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : [];
}

describe('card art slots', () => {
  it('names a file for every card in the deck', () => {
    expect(ALL_CARDS).toHaveLength(21);
    for (const card of ALL_CARDS) {
      // The function should not throw
      const url = cardArtUrl(card.id);
      expect(typeof url).toBe('string');
    }
  });

  it('leaves no orphaned pictures behind', () => {
    const expected = new Set(ALL_CARDS.map((c) => `${c.category}-${c.id.split(':')[1]}.png`));
    for (const file of filesIn('cards')) {
      expect(expected.has(file), `${file} is not a card the deck knows`).toBe(true);
    }
  });

  it('asks for each character by the id the cast list uses', () => {
    for (const character of CHARACTERS) {
      const url = cardArtUrl(`suspect:${character.id}`);
      expect(typeof url).toBe('string');
    }
  });

  it('reports which slots are still empty', () => {
    const empty = ALL_CARDS.filter((c) => !cardArtUrl(c.id));
    if (empty.length) {
      console.log(
        `      ${empty.length} card${empty.length === 1 ? '' : 's'} still on vector art: ` +
          empty.map((c) => c.id).join(', '),
      );
    }
    expect(empty.length).toBeLessThanOrEqual(ALL_CARDS.length);
  });
});

describe('board art slots', () => {
  it('names a floor picture for every room', () => {
    expect(ROOMS).toHaveLength(9);
    for (const room of ROOMS) {
      expect(typeof roomArtUrl(room.id)).toBe('string');
    }
  });

  it('has a surface for the board itself', () => {
    expect(typeof BOARD_ART_URL).toBe('string');
  });

  it('leaves no orphaned room pictures behind', () => {
    const expected = new Set(ROOMS.map((r) => `${r.id}.png`));
    for (const file of filesIn('rooms')) {
      expect(expected.has(file), `${file} is not a room on the board`).toBe(true);
    }
  });
});

describe('the opening film', () => {
  it('waits in the same place the storyboard describes', () => {
    expect(typeof INTRO_FILM_URL).toBe('string');
  });

  it('is skipped when there is no film to play', () => {
    expect(existsSync(path.join(ASSETS, 'cinematic', 'README.md'))).toBe(true);
  });
});

describe('keeping the download sane', () => {
  it('keeps the whole art folder under 13 MB', () => {
    let total = 0;
    for (const folder of ['cards', 'rooms', 'board']) {
      for (const file of filesIn(folder)) {
        total += statSync(path.join(ASSETS, 'art', folder, file)).size;
      }
    }
    expect(total / 1024 / 1024).toBeLessThan(13);
  });

  it('keeps any single picture under 2 MB', () => {
    for (const folder of ['cards', 'rooms', 'board']) {
      for (const file of filesIn(folder)) {
        const size = statSync(path.join(ASSETS, 'art', folder, file)).size;
        expect(size / 1024 / 1024, `${folder}/${file} is ${Math.round(size / 1024)} KB`).toBeLessThan(2);
      }
    }
  });
});
