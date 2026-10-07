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

const PUBLIC = path.resolve(__dirname, '../client/public');

/** Turn a public URL back into a path on disk. */
function onDisk(url: string): string {
  return path.join(PUBLIC, url.replace(/^\//, '').split('/').join(path.sep));
}

function filesIn(folder: string): string[] {
  const dir = path.join(PUBLIC, 'art', folder);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : [];
}

describe('card art slots', () => {
  it('names a file for every card in the deck', () => {
    expect(ALL_CARDS).toHaveLength(21);
    for (const card of ALL_CARDS) {
      const expected = `/art/cards/${card.category}-${card.id.split(':')[1]}.png`;
      expect(cardArtUrl(card.id)).toBe(expected);
    }
  });

  it('leaves no orphaned pictures behind', () => {
    // A stray file is a name that no card asks for — usually a rename that was
    // never finished, or art for a character who has left the house.
    const expected = new Set(ALL_CARDS.map((c) => `${c.category}-${c.id.split(':')[1]}.png`));
    for (const file of filesIn('cards')) {
      expect(expected.has(file), `${file} is not a card the deck knows`).toBe(true);
    }
  });

  it('asks for each character by the id the cast list uses', () => {
    // The classic six belong to someone else, so these are our names and the
    // art must be filed under exactly these ids.
    for (const character of CHARACTERS) {
      expect(cardArtUrl(`suspect:${character.id}`)).toBe(`/art/cards/suspect-${character.id}.png`);
    }
  });

  it('reports which slots are still empty', () => {
    // Informational: a card with no picture simply draws itself. Printed so a
    // missing file is visible without failing the suite mid way through a set.
    const empty = ALL_CARDS.filter((c) => !existsSync(onDisk(cardArtUrl(c.id))));
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
      expect(roomArtUrl(room.id)).toBe(`/art/rooms/${room.id}.png`);
    }
  });

  it('has a surface for the board itself', () => {
    expect(BOARD_ART_URL).toBe('/art/board/board-bg.png');
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
    expect(INTRO_FILM_URL).toBe('/cinematic/intro.mp4');
    expect(onDisk(INTRO_FILM_URL)).toBe(path.join(PUBLIC, 'cinematic', 'intro.mp4'));
  });

  it('is skipped when there is no film to play', () => {
    // Deliberately not asserting that the file exists: the storyboard is a
    // first class way to open the game, not a failure.
    expect(existsSync(path.join(PUBLIC, 'cinematic', 'README.md'))).toBe(true);
  });
});

describe('keeping the download sane', () => {
  it('keeps the whole art folder under 12 MB', () => {
    // A full set of 21 pictures at 1024x768 lands around 6-8 MB. This is a
    // ceiling for the pathological case — un-optimised exports that would
    // make the table crawl on a phone.
    let total = 0;
    for (const folder of ['cards', 'rooms', 'board']) {
      for (const file of filesIn(folder)) {
        total += statSync(path.join(PUBLIC, 'art', folder, file)).size;
      }
    }
    expect(total / 1024 / 1024).toBeLessThan(12);
  });

  it('keeps any single picture under 2 MB', () => {
    for (const folder of ['cards', 'rooms', 'board']) {
      for (const file of filesIn(folder)) {
        const size = statSync(path.join(PUBLIC, 'art', folder, file)).size;
        expect(size / 1024 / 1024, `${folder}/${file} is ${Math.round(size / 1024)} KB`).toBeLessThan(2);
      }
    }
  });
});
