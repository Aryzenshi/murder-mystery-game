import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MUSIC_SOURCES } from '../client/src/audio/music';

/**
 * The music lives outside the repository — this folder is a slot, like the art
 * and the film. These tests hold the slot itself steady: the names the game
 * asks for, and the note that tells whoever fills it what to put there.
 */

const PUBLIC = path.resolve(__dirname, '../client/public');

describe('the music slot', () => {
  it('looks for a file inside public/audio', () => {
    expect(MUSIC_SOURCES.length).toBeGreaterThan(0);
    for (const source of MUSIC_SOURCES) {
      expect(source.startsWith('/audio/'), `${source} is not under /audio/`).toBe(true);
    }
  });

  it('never asks for the same file twice', () => {
    expect(new Set(MUSIC_SOURCES).size).toBe(MUSIC_SOURCES.length);
  });

  it('explains itself to whoever brings the track', () => {
    expect(existsSync(path.join(PUBLIC, 'audio', 'README.md'))).toBe(true);
  });
});

describe('the film keeps its soundtrack', () => {
  it('does not mute the video in the source', () => {
    // The film's audio was wired up and then silently muted by an edit once;
    // this is the guard rail.
    const source = readFileSync(
      path.resolve(__dirname, '../client/src/game/Cinematic.tsx'),
      'utf8',
    );
    expect(source).toContain('video.muted = !soundOn');
    expect(source).not.toMatch(/\n\s+muted\n/);
  });
});
