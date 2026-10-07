import { create } from 'zustand';
import type {
  AiDifficulty,
  AiPersonality,
  CardId,
  GameSettings,
  Intent,
  NodeId,
  PlayerView,
} from '@shared/types';
import { getSocket, loadPrefs, loadSession, savePrefs, saveSession, notebookKey, type Prefs, type StoredSession } from '../net/socket';
import { sfx, setSoundEnabled } from '../audio/sfx';
import { setMusicEnabled, setMusicVolume } from '../audio/music';

export type Screen = 'home' | 'lobby' | 'game';
export type NotebookMark = 'unknown' | 'possible' | 'confirmed' | 'eliminated';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
}

export interface AiStatus {
  playerId: string | null;
  text: string;
}

interface Store {
  screen: Screen;
  connected: boolean;
  reconnecting: boolean;
  busy: boolean;
  view: PlayerView | null;
  session: StoredSession | null;
  prefs: Prefs;
  toasts: Toast[];
  aiStatus: AiStatus | null;
  notebook: Record<string, NotebookMark>;
  rolling: boolean;
  joinError: string | null;
  victory: { winnerId: string | null; seen: boolean } | null;
  leaving: boolean;

  init: () => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;

  createGame: (name: string) => void;
  joinGame: (code: string, name: string) => void;
  rejoin: (session: StoredSession) => void;
  leaveGame: () => void;
  clearJoinError: () => void;

  setName: (name: string) => void;
  pickCharacter: (characterId: string | null) => void;
  setReady: (ready: boolean) => void;
  addAI: () => void;
  fillWithAI: () => void;
  removeAllBots: () => void;
  removePlayer: (playerId: string) => void;
  updateSettings: (settings: Partial<GameSettings>) => void;
  startGame: () => void;
  restartGame: () => void;

  send: (intent: Intent) => void;
  roll: () => void;
  moveTo: (node: NodeId) => void;
  usePassage: () => void;
  suggest: (suspect: CardId, weapon: CardId) => void;
  reveal: (card: CardId) => void;
  accuse: (suspect: CardId, weapon: CardId, room: CardId) => void;
  endTurn: () => void;

  markNotebook: (cardId: CardId) => void;
  clearNotebook: () => void;
  dismissVictory: () => void;
}

let toastId = 0;
let rollTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * The dice are decided on the server, but a throw that lands in 12 ms feels
 * like nothing happened. Hold the tumble for at least this long — the numbers
 * are already known, we are just letting them fall.
 */
const MIN_ROLL_MS = 900;
let rollStartedAt = 0;

/**
 * Log entries that have already been given a sound. The log only grows, and
 * private lines arrive already filtered for this player, so a new entry is
 * simply one we have not seen before.
 */
const heardLog = new Set<string>();
let heardRoom = '';

function cueForLog(view: PlayerView, previous: PlayerView | null): void {
  if (!previous) return;
  if (heardRoom !== view.public.roomCode) {
    heardRoom = view.public.roomCode;
    heardLog.clear();
  }
  for (const entry of view.public.log) {
    if (heardLog.has(entry.id)) continue;
    heardLog.add(entry.id);
    // On the first snapshot after a rejoin, the whole log is new; stay quiet
    // rather than stamping through the entire case.
    if (previous.public.log.length === 0) continue;
    if (entry.kind === 'suggest') sfx.suggest();
    else if (entry.kind === 'reveal') sfx.reveal();
    else if (entry.kind === 'accuse') sfx.accuse();
  }
}

export const useGame = create<Store>((set, get) => ({
  screen: 'home',
  connected: false,
  reconnecting: false,
  busy: false,
  view: null,
  session: null,
  prefs: loadPrefs(),
  toasts: [],
  aiStatus: null,
  notebook: {},
  rolling: false,
  joinError: null,
  victory: null,
  leaving: false,

  init: () => {
    const prefs = get().prefs;
    setSoundEnabled(prefs.sound);
    setMusicEnabled(prefs.music);
    setMusicVolume(prefs.musicVolume);
    const socket = getSocket();

    socket.on('connect', () => {
      set({ connected: true, reconnecting: false });
      const session = get().session ?? loadSession();
      if (session && get().screen !== 'home') {
        socket.emit('session:rejoin', session);
      } else if (session && get().screen === 'home') {
        // Stay on the home screen but remember the seat so the player can
        // step straight back into the room.
        set({ session });
      }
    });

    socket.on('disconnect', () => set({ connected: false, reconnecting: true }));
    socket.io.on('reconnect_attempt', () => set({ reconnecting: true }));
    socket.io.on('error', () => set({ reconnecting: true }));

    socket.on('hello', () => set({ reconnecting: false }));

    socket.on('joined', (payload: StoredSession & { isHost: boolean }) => {
      const session: StoredSession = {
        roomCode: payload.roomCode,
        playerId: payload.playerId,
        token: payload.token,
        name: payload.name ?? get().prefs.name,
      };
      saveSession(session);
      const resumed = get().view?.public.roomCode === payload.roomCode;
      const phase = resumed ? get().view?.public.phase : undefined;
      set({
        session,
        screen: phase === 'playing' || phase === 'finished' ? 'game' : 'lobby',
        joinError: null,
        busy: false,
        victory: null,
        reconnecting: false,
      });
      sfx.join();
    });

    socket.on('sync', (view: PlayerView) => {
      const previous = get().view;
      set((state) => ({
        view,
        screen:
          state.screen === 'home'
            ? 'home'
            : view.public.phase === 'lobby'
              ? 'lobby'
              : view.public.phase === 'playing' || view.public.phase === 'finished'
                ? 'game'
                : state.screen,
        // keep the tumble going until the throw has had time to land
        rolling: view.public.dice
          ? state.rolling && Date.now() - rollStartedAt < MIN_ROLL_MS
          : state.rolling,
        victory:
          view.public.phase === 'finished'
            ? state.victory?.winnerId === view.public.winnerId
              ? state.victory
              : { winnerId: view.public.winnerId, seen: false }
            : null,
      }));
      // sound cues driven by what actually changed on the server
      cueForLog(view, previous);
      if (previous) {
        for (const player of view.public.players) {
          const was = previous.public.players.find((p) => p.id === player.id);
          if (player.eliminated && was && !was.eliminated) sfx.wrong();
        }
        const before = previous.public.positions;
        const after = view.public.positions;
        if (JSON.stringify(before) !== JSON.stringify(after) && view.public.dice) sfx.move();
        if (!previous.public.dice && view.public.dice) sfx.dice();
      }
    });

    socket.on('toast', ({ message, tone }: { message: string; tone: Toast['tone'] }) => {
      get().toast(message, tone);
    });

    socket.on('ai:status', (status: AiStatus) => {
      set({ aiStatus: status.text ? status : null });
    });

    socket.on('game:over', () => {
      const view = get().view;
      const me = get().session?.playerId;
      if (view?.public.winnerId && view.public.winnerId === me) sfx.victory();
      else sfx.defeat();
    });

    socket.on('kicked', () => {
      saveSession(null);
      set({ screen: 'home', view: null, session: null, victory: null });
      get().toast('You were asked to leave the table.', 'info');
    });

    socket.on('left', () => {
      saveSession(null);
      set({ screen: 'home', view: null, session: null, victory: null });
    });

    socket.on('room:closed', () => {
      saveSession(null);
      set({ screen: 'home', view: null, session: null, victory: null });
      get().toast('The table has been cleared away.', 'info');
    });

    // Restore the notebook for this seat.
    const stored = loadSession();
    if (stored) {
      set({ session: stored });
      try {
        const raw = localStorage.getItem(notebookKey(stored.roomCode, stored.playerId));
        if (raw) set({ notebook: JSON.parse(raw) });
      } catch {
        /* ignore */
      }
    }
  },

  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    savePrefs(prefs);
    set({ prefs });
    if (patch.sound !== undefined) setSoundEnabled(patch.sound);
    if (patch.music !== undefined) setMusicEnabled(patch.music);
    if (patch.musicVolume !== undefined) setMusicVolume(patch.musicVolume);
  },

  toast: (message, tone = 'info') => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  createGame: (name) => {
    const socket = getSocket();
    set({ busy: true, joinError: null });
    get().setPrefs({ name });
    socket.emit('room:create', { name }, (response: { ok: boolean; error?: string }) => {
      set({ busy: false });
      if (!response?.ok) get().toast(response?.error ?? 'Could not open the parlour.', 'error');
    });
  },

  joinGame: (code, name) => {
    const socket = getSocket();
    set({ busy: true, joinError: null });
    get().setPrefs({ name });
    socket.emit(
      'room:join',
      { code: code.toUpperCase(), name },
      (response: { ok: boolean; error?: string }) => {
        set({ busy: false });
        if (!response?.ok) {
          set({ joinError: response?.error ?? 'Could not join that game.' });
          get().toast(response?.error ?? 'Could not join that game.', 'error');
        }
      },
    );
  },

  rejoin: (session) => {
    const socket = getSocket();
    set({ busy: true });
    socket.emit('session:rejoin', session, (response: { ok: boolean; error?: string }) => {
      set({ busy: false });
      if (!response?.ok) {
        saveSession(null);
        set({ session: null, screen: 'home' });
        get().toast(response?.error ?? 'That game is no longer running.', 'error');
      }
    });
  },

  leaveGame: () => {
    getSocket().emit('room:leave');
    saveSession(null);
    set({ screen: 'home', view: null, session: null, victory: null, notebook: {} });
  },

  clearJoinError: () => set({ joinError: null }),

  setName: (name) => {
    get().setPrefs({ name });
    getSocket().emit('room:setName', { name });
  },

  pickCharacter: (characterId) => {
    sfx.click();
    getSocket().emit('room:setCharacter', { characterId });
  },

  setReady: (ready) => {
    sfx.click();
    getSocket().emit('room:ready', { ready });
  },

  addAI: () => {
    sfx.click();
    getSocket().emit('room:addAI');
  },

  fillWithAI: () => {
    sfx.click();
    getSocket().emit('room:fillWithAI');
  },

  removeAllBots: () => {
    const players = get().view?.public.players ?? [];
    const bots = players.filter((p) => p.isAI);
    if (!bots.length) return;
    sfx.click();
    for (const bot of bots) getSocket().emit('room:removePlayer', { playerId: bot.id });
  },

  removePlayer: (playerId) => {
    sfx.click();
    getSocket().emit('room:removePlayer', { playerId });
  },

  updateSettings: (settings) => {
    getSocket().emit('room:settings', settings);
    if (settings.aiDifficulty) get().setPrefs({ difficulty: settings.aiDifficulty });
    if (settings.aiPersonality) get().setPrefs({ personality: settings.aiPersonality });
  },

  startGame: () => {
    sfx.click();
    getSocket().emit('room:start', {}, (response: { ok: boolean; error?: string }) => {
      if (!response?.ok) get().toast(response?.error ?? 'The game could not start.', 'error');
    });
  },

  restartGame: () => {
    sfx.click();
    getSocket().emit('room:restart');
  },

  send: (intent) => {
    getSocket().emit('game:intent', intent, (response: { ok: boolean; error?: string }) => {
      if (!response?.ok && response?.error) get().toast(response.error, 'error');
    });
  },

  roll: () => {
    if (get().rolling) return; // one throw at a time
    sfx.click();
    rollStartedAt = Date.now();
    set({ rolling: true });
    get().send({ type: 'roll' });
    if (rollTimer) clearTimeout(rollTimer);
    rollTimer = setTimeout(() => set({ rolling: false }), MIN_ROLL_MS);
  },

  moveTo: (node) => {
    sfx.click();
    get().send({ type: 'move', to: node });
  },

  usePassage: () => {
    sfx.click();
    get().send({ type: 'usePassage' });
  },

  suggest: (suspect, weapon) => {
    sfx.suggest();
    get().send({ type: 'suggest', suspect, weapon });
  },

  reveal: (card) => {
    sfx.reveal();
    get().send({ type: 'reveal', card });
  },

  accuse: (suspect, weapon, room) => {
    sfx.accuse();
    get().send({ type: 'accuse', suspect, weapon, room });
  },

  endTurn: () => {
    sfx.click();
    get().send({ type: 'endTurn' });
  },

  markNotebook: (cardId) => {
    const order: NotebookMark[] = ['unknown', 'possible', 'confirmed', 'eliminated'];
    const current = get().notebook[cardId] ?? 'unknown';
    const next = order[(order.indexOf(current) + 1) % order.length];
    const notebook = { ...get().notebook, [cardId]: next };
    set({ notebook });
    sfx.click();
    const session = get().session;
    if (session) {
      try {
        localStorage.setItem(notebookKey(session.roomCode, session.playerId), JSON.stringify(notebook));
      } catch {
        /* ignore */
      }
      getSocket().emit('notebook:save', { notebook });
    }
  },

  clearNotebook: () => {
    set({ notebook: {} });
    const session = get().session;
    if (session) {
      try {
        localStorage.removeItem(notebookKey(session.roomCode, session.playerId));
      } catch {
        /* ignore */
      }
      getSocket().emit('notebook:save', { notebook: {} });
    }
  },

  dismissVictory: () => set({ victory: null }),
}));

/* ---------- selectors ---------- */

export function useMe() {
  return useGame((state) => {
    const id = state.session?.playerId;
    return id ? state.view?.public.players.find((p) => p.id === id) ?? null : null;
  });
}

export function useIsMyTurn() {
  return useGame((state) => !!state.view && state.view.public.currentPlayerId === state.session?.playerId);
}

export function useCurrentPlayer() {
  return useGame((state) => {
    const id = state.view?.public.currentPlayerId;
    return id ? state.view?.public.players.find((p) => p.id === id) ?? null : null;
  });
}

export function useAiPrefs(): { difficulty: AiDifficulty; personality: AiPersonality } {
  return useGame((state) => ({
    difficulty: (state.prefs.difficulty as AiDifficulty) ?? 'medium',
    personality: (state.prefs.personality as AiPersonality) ?? 'analytical',
  }));
}
