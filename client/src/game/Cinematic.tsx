import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTER_BY_ID } from '@shared/constants/characters';
import type { PublicPlayer } from '@shared/types';
import { INTRO_FILM_URL } from '../cards/artAssets';
import { duckMusic } from '../audio/music';

/**
 * The opening credits — two sequential phases.
 *
 * Phase 1 — Storyboard (always):
 *   The crest, title, and backstory typed out one character at a time, the
 *   six suspects appearing, then "The envelope is sealed. The case is open."
 *   Same 8-second beat as before. The film preloads silently in the background.
 *
 * Phase 2 — Film (only when `public/cinematic/intro.mp4` exists):
 *   The video plays full-screen with music ducked. When it ends (or the user
 *   skips), the board is revealed.
 *
 * If the film is missing or fails to load, phase 2 is skipped and the board
 * appears immediately after the storyboard. Skip is always available.
 */

const TITLE = 'Mystery Mansion';

const STORY = [
  'Saturday evening, a quarter to nine.',
  'Sir Cornelius Ashgrove lies dead at the foot of the cellar stairs,',
  'on a spot the housekeeper has marked with a trembling X.',
  'Miss Ruby Vance found him — her screams carried as far as the village.',
  'Six guests remain in the house for the weekend. All are anxious to talk.',
  'One of them is lying.',
];

const CLOSING = 'The envelope is sealed. The case is open.';

const TYPE_MS = 3200; // how long the typing takes
const SUSPECTS_AT = 4200;
const CLOSING_AT = 6100;
const TOTAL_MS = 8200;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function Cinematic({
  players,
  soundOn,
  introVideo = true,
  onDone,
}: {
  players: PublicPlayer[];
  /** False when the player has switched the sound off — the film respects it. */
  soundOn: boolean;
  /** False when the player has disabled heavy video downloads or on slow networks. */
  introVideo?: boolean;
  onDone: () => void;
}) {
  /** 'storyboard' → animated text; 'film' → video plays full-screen. */
  const [phase, setPhase] = useState<'storyboard' | 'film'>('storyboard');
  const [filmFailed, setFilmFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Storyboard animation state
  const [typed, setTyped] = useState(0);
  const [beat, setBeat] = useState(0);
  const reduced = useMemo(prefersReducedMotion, []);

  const doneRef = useRef(false);
  const failedRef = useRef(false);
  const full = STORY.join('\n');

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Irrevocably hand control back to the game. */
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  /**
   * End the storyboard. If the film loaded and buffered enough to play smoothly,
   * transition to phase 2; otherwise skip the film so slow connections aren't stalled.
   */
  const endStoryboard = () => {
    if (doneRef.current) return;
    const video = videoRef.current;
    if (failedRef.current || !introVideo || !video || video.readyState < 3) {
      finish();
    } else {
      setPhase('film');
    }
  };

  // ── Phase 1 — preload the film silently while storyboard plays ─────────────

  useEffect(() => {
    if (!introVideo || !INTRO_FILM_URL) {
      failedRef.current = true;
      setFilmFailed(true);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    // Preload only — no play() yet. Muted so the browser permits the load.
    video.preload = 'auto';
    video.muted = true;
    video.src = INTRO_FILM_URL;
    video.load();
  }, [introVideo]);

  // ── Phase 1 — typing animation ─────────────────────────────────────────────

  useEffect(() => {
    if (reduced) {
      setTyped(full.length);
      return;
    }
    let shown = 0;
    const step = Math.max(1, Math.ceil(full.length / (TYPE_MS / 16)));
    const timer = setInterval(() => {
      shown += step;
      setTyped(Math.min(full.length, shown));
      if (shown >= full.length) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // ── Phase 1 — beats + automatic transition to film ─────────────────────────

  useEffect(() => {
    const marks = [
      setTimeout(() => setBeat(1), reduced ? 0 : SUSPECTS_AT),
      setTimeout(() => setBeat(2), reduced ? 0 : CLOSING_AT),
      setTimeout(endStoryboard, reduced ? 1500 : TOTAL_MS),
    ];
    return () => marks.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // ── Phase 2 — play the film, duck music ────────────────────────────────────

  useEffect(() => {
    if (phase !== 'film') return;

    // Music steps down for the duration of the film.
    duckMusic(true);

    const video = videoRef.current;
    if (!video) {
      finish();
      return;
    }

    // Apply user's sound preference now that we're about to play for real.
    video.muted = !soundOn;
    video.volume = 1;

    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        // Browser blocked unmuted autoplay — retry muted.
        video.muted = true;
        void video.play().catch(() => {
          // Utterly refused — bail to the board.
          failedRef.current = true;
          setFilmFailed(true);
          finish();
        });
      });
    }

    // Dynamic hard cap derived from the video's actual duration (plus a generous 3s buffer)
    let hardStop: ReturnType<typeof setTimeout>;

    const setHardStop = () => {
      clearTimeout(hardStop);
      const durationMs = (video.duration && !isNaN(video.duration) ? video.duration : 30) * 1000;
      hardStop = setTimeout(finish, durationMs + 3000);
    };

    if (video.readyState >= 1) { // HAVE_METADATA or higher
      setHardStop();
    } else {
      hardStop = setTimeout(finish, 30_000); // 30s fallback
      video.addEventListener('loadedmetadata', setHardStop);
    }

    return () => {
      duckMusic(false);
      clearTimeout(hardStop);
      video.removeEventListener('loadedmetadata', setHardStop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Keep volume in sync if the user toggles sound mid-film.
  useEffect(() => {
    if (phase !== 'film') return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = !soundOn;
  }, [soundOn, phase]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.stopPropagation();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Click handler — skip means skip ────────────────────────────────────────

  const handleClick = () => finish();

  // ── Derived data ───────────────────────────────────────────────────────────

  const suspects = players.map((p) => ({
    id: p.id,
    name: p.characterId ? CHARACTER_BY_ID[p.characterId]?.short ?? p.name : p.name,
    colour: p.characterId ? CHARACTER_BY_ID[p.characterId]?.color ?? '#b1834a' : '#b1834a',
  }));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="cine" onClick={handleClick} role="presentation">
      {/*
        The video element is always mounted so the browser can preload it during
        the storyboard phase. In the storyboard phase it is invisible; in the
        film phase it fills the screen.
      */}
      {!filmFailed && introVideo && (
        <video
          ref={videoRef}
          className="cine__film"
          playsInline
          onEnded={finish}
          onError={() => {
            failedRef.current = true;
            setFilmFailed(true);
            if (phase === 'film') finish();
          }}
          // Visible only once the film phase starts.
          style={phase !== 'film' ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
        />
      )}

      {/* Storyboard — hidden (not unmounted) once the film takes over */}
      <div
        className="cine__stage"
        style={phase === 'film' ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
      >
        <div className="cine__crest" aria-hidden="true">
          <span>M</span>
        </div>
        <h1 className="cine__title">{TITLE}</h1>
        <p className="cine__time">Saturday evening · 8.45 pm</p>

        <p className="cine__story" aria-label={full}>
          {full.slice(0, typed)}
          {typed < full.length && <span className="cine__caret" aria-hidden="true" />}
        </p>

        <ul className="cine__suspects" data-show={beat >= 1 || undefined}>
          {suspects.map((s) => (
            <li key={s.id} style={{ borderColor: s.colour }}>
              <span className="cine__dot" style={{ background: s.colour }} />
              {s.name}
            </li>
          ))}
        </ul>

        <p className="cine__closing" data-show={beat >= 2 || undefined}>
          {CLOSING}
        </p>
      </div>

      <button type="button" className="cine__skip" onClick={(e) => { e.stopPropagation(); handleClick(); }}>
        Skip <kbd>Esc</kbd>
      </button>
    </div>
  );
}
