import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * One socket for the whole app. In development Vite proxies /socket.io to the
 * Node server on :3000; in production the server serves the client itself, so
 * the same-origin default is always right — which is what makes LAN play work
 * from a phone without any configuration.
 */
export function getSocket(): Socket {
  if (!socket) {
    const url = import.meta.env.VITE_SERVER_URL || '';
    socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      timeout: 12000,
    });
  }
  return socket;
}

export interface StoredSession {
  roomCode: string;
  playerId: string;
  token: string;
  name: string;
}

const SESSION_KEY = 'mystery-mansion.session.v1';
const PREF_KEY = 'mystery-mansion.prefs.v1';

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession | null): void {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode — the game still works, reconnection just will not */
  }
}

export interface Prefs {
  name: string;
  sound: boolean;
  /** Background music loop, separate from the sound effects. */
  music: boolean;
  musicVolume: number;
  difficulty: string;
  personality: string;
}

const DEFAULT_PREFS: Prefs = {
  name: '',
  sound: true,
  music: true,
  musicVolume: 0.8,
  difficulty: 'medium',
  personality: 'analytical',
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export const notebookKey = (roomCode: string, playerId: string) =>
  `mystery-mansion.notebook.${roomCode}.${playerId}`;

export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const baseUrl = import.meta.env.VITE_SERVER_URL || '';
    const fullUrl = url.startsWith('/') ? `${baseUrl}${url}` : url;
    const response = await fetch(fullUrl);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface NetworkInfo {
  port: number;
  lanUrl: string | null;
  addresses: string[];
  hostnames: string[];
  lanReachable: boolean;
}
