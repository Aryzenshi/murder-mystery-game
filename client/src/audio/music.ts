/**
 * Background music.
 *
 * One looping file, played through a plain `<audio>` element so the browser can
 * keep it alive without holding a decoding buffer in JavaScript. There is no
 * music in the repository — drop your own loop into `client/public/audio/` and
 * it starts on the next reload. If no file is there, nothing happens and
 * nothing breaks; the game simply stays quiet.
 *
 * Three rules shape this module:
 *
 * 1. **Never play before a gesture.** Browsers refuse, and a page that makes
 *    noise the moment it loads is rude. `unlockMusic()` is called from the
 *    first real click or tap.
 * 2. **Nothing is ever abrupt.** Volume moves in steps toward a target rather
 *    than snapping, so the music can fade under the opening film and back
 *    again.
 * 3. **A missing file is not an error.** Each candidate is tried once; when the
 *    list runs out the music gives up quietly for the rest of the session.
 */

const audioFiles = import.meta.glob('../assets/audio/*.{mp3,ogg,m4a}', { eager: true, import: 'default' }) as Record<string, string>;

/** Tried in order. Any one of them is enough; the first that loads wins. */
export const MUSIC_SOURCES: string[] = [
  audioFiles['../assets/audio/music.mp3'],
  audioFiles['../assets/audio/music.ogg'],
  audioFiles['../assets/audio/music.m4a'],
  audioFiles['../assets/audio/ambience.mp3'],
  audioFiles['../assets/audio/bgm.mp3'],
].filter(Boolean);

/** Sitting-room level: present, never in the way of the table talk. */
let FULL_VOLUME = 0.8;
/** While the opening film has the floor. */
const DUCKED_VOLUME = 0;
const FADE_STEP = 0.03;
const FADE_MS = 40;

type Music = {
  el: HTMLAudioElement | null;
  index: number;
  enabled: boolean;
  unlocked: boolean;
  exhausted: boolean;
  ducked: boolean;
  target: number;
  timer: number | null;
  volume: number;
};

const state: Music = {
  el: null,
  index: 0,
  enabled: true,
  unlocked: false,
  exhausted: false,
  ducked: false,
  target: 0,
  timer: null,
  volume: 0,
};

function wanted(): number {
  if (!state.enabled || state.exhausted) return 0;
  return state.ducked ? DUCKED_VOLUME : FULL_VOLUME;
}

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!state.el) {
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    el.addEventListener('error', () => {
      // Only chase the next name if we were actually trying to make sound;
      // otherwise a missing file would burn through the list unheard.
      if (!state.unlocked || !state.enabled) return;
      state.index += 1;
      if (state.index >= MUSIC_SOURCES.length) {
        state.exhausted = true;
        state.target = 0;
        return;
      }
      el.src = MUSIC_SOURCES[state.index];
      void el.play().catch(() => undefined);
    });
    el.addEventListener('playing', () => {
      // A loop that reports itself playing is a loop we can keep.
      state.exhausted = false;
    });
    state.el = el;
  }
  return state.el;
}

/** Walks the current volume toward the target, then stops the timer. */
function fade(): void {
  if (state.timer !== null) return;
  state.timer = window.setInterval(() => {
    const target = state.target;
    const diff = target - state.volume;
    if (Math.abs(diff) <= FADE_STEP) {
      state.volume = target;
      applyVolume();
      if (state.timer !== null) window.clearInterval(state.timer);
      state.timer = null;
      settle();
      return;
    }
    state.volume += diff > 0 ? FADE_STEP : -FADE_STEP;
    applyVolume();
  }, FADE_MS);
}

function applyVolume(): void {
  const el = state.el;
  if (!el) return;
  const next = Math.max(0, Math.min(1, state.volume));
  try {
    el.volume = next;
  } catch {
    /* some devices refuse volume changes before playback; harmless */
  }
}

/** Pause only once the music is silent, so nothing is ever cut off. */
function settle(): void {
  const el = state.el;
  if (!el) return;
  if (state.target === 0 && el.volume <= 0.001 && !el.paused) el.pause();
}

function sync(): void {
  state.target = wanted();

  if (state.target <= 0) {
    // Nothing to start; if something is already playing, fade it out.
    if (state.el && !state.el.paused) fade();
    return;
  }

  const el = element();
  if (!el) return;
  if (!el.src) el.src = MUSIC_SOURCES[state.index];
  if (el.paused) void el.play().catch(() => undefined);
  fade();
}

/**
 * Called from a real user gesture — the first click or tap on the page. Until
 * this happens the browser will not let any audio start, so everything waits
 * for it.
 */
export function unlockMusic(): void {
  if (state.unlocked) return;
  state.unlocked = true;
  sync();
}

/** The Music switch. Turning it on from a switch counts as the gesture too. */
export function setMusicEnabled(next: boolean): void {
  state.enabled = next;
  sync();
}

export function setMusicVolume(volume: number): void {
  FULL_VOLUME = Math.max(0, Math.min(1, volume));
  sync();
}

export function isMusicEnabled(): boolean {
  return state.enabled;
}

/** Pull the music down while something else has the floor (the opening film). */
export function duckMusic(ducked: boolean): void {
  state.ducked = ducked;
  sync();
}

if (typeof document !== 'undefined') {
  const pauseMusic = () => {
    const el = state.el;
    if (el) el.pause();
  };

  const resumeMusic = () => {
    const el = state.el;
    if (el && state.enabled && !state.exhausted && state.target > 0 && !document.hidden) {
      void el.play().catch(() => undefined);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseMusic();
    else resumeMusic();
  });

  window.addEventListener('blur', pauseMusic);
  window.addEventListener('focus', resumeMusic);
}
