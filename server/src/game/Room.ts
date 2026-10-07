import type { Server } from 'socket.io';
import {
  CHARACTERS,
  AI_NAMES,
  normalizeNameKey,
  applyIntent,
  createGameState,
  getPlayerView,
  startGame,
  uid,
  type AiDifficulty,
  type AiPersonality,
  type GameSettings,
  type GameState,
  type Intent,
  type IntentResult,
  type Player,
} from '@mystery/shared';
import { AIController } from '../ai/AIController';
import { sanitizeNotebook, sessionToken } from '../security';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const DISCONNECT_GRACE_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RoomOptions {
  rng?: () => number;
  /** Test hook: scales the 500–2000ms AI "thinking" pauses. */
  aiDelayScale?: number;
}

export class Room {
  readonly code: string;
  readonly state: GameState;
  private sockets = new Map<string, Set<string>>();
  private sessions = new Map<string, string>();
  private bots = new Map<string, AIController>();
  private standIns = new Map<string, AIController>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private aiRunning = false;
  private aiNameCursor = 0;
  private rng: () => number;
  private aiDelayScale: number;

  constructor(
    code: string,
    private io: Server,
    settings?: Partial<GameSettings>,
    options: RoomOptions = {},
  ) {
    this.code = code;
    this.rng = options.rng ?? Math.random;
    this.aiDelayScale = options.aiDelayScale ?? 1;
    this.state = createGameState({
      gameId: uid('game'),
      roomCode: code,
      players: [],
      settings: {
        aiDifficulty: 'medium',
        aiPersonality: 'analytical',
        autoPlayDisconnected: true,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        ...settings,
      },
    });
  }

  get players(): Player[] {
    return this.state.players;
  }

  private freeCharacter(): string | null {
    const taken = new Set(this.state.players.map((p) => p.characterId));
    const free = CHARACTERS.find((c) => !taken.has(c.id));
    return free ? free.id : null;
  }

  private nextAiName(): string {
    const used = new Set(this.state.players.map((p) => p.name));
    for (let i = 0; i < AI_NAMES.length; i++) {
      const candidate = AI_NAMES[(this.aiNameCursor + i) % AI_NAMES.length];
      if (!used.has(candidate)) {
        this.aiNameCursor = (this.aiNameCursor + i + 1) % AI_NAMES.length;
        return candidate;
      }
    }
    this.aiNameCursor += 1;
    return `Bot ${this.state.players.length + 1}`;
  }

  createPlayer(opts: {
    name: string;
    isAI: boolean;
    difficulty?: AiDifficulty;
    personality?: AiPersonality;
  }): Player | null {
    if (this.state.players.length >= MAX_PLAYERS) return null;
    if (this.state.phase !== 'lobby') return null;
    const player: Player = {
      id: uid('p'),
      name: opts.name,
      isAI: opts.isAI,
      isHost: this.state.players.length === 0,
      ready: true,
      connected: !opts.isAI,
      characterId: this.freeCharacter(),
      seat: this.state.players.length,
      difficulty: opts.difficulty ?? this.state.settings.aiDifficulty,
      personality: opts.personality ?? this.state.settings.aiPersonality,
      lastSeen: Date.now(),
      disconnectedAt: null,
    };
    this.state.players.push(player);
    this.state.hands[player.id] = [];
    this.state.positions[player.id] = { kind: 'corridor', cell: { row: 0, col: 0 } };
    this.state.eliminated[player.id] = false;
    this.state.seen[player.id] = [];
    this.state.shown[player.id] = [];
    this.state.notebooks[player.id] = {};
    this.sockets.set(player.id, new Set());
    this.sessions.set(player.id, sessionToken());
    if (opts.isAI) {
      this.bots.set(
        player.id,
        new AIController(player.id, player.difficulty, player.personality, this.rng),
      );
    }
    this.state.version += 1;
    return player;
  }

  addAI(difficulty?: AiDifficulty, personality?: AiPersonality): Player | null {
    return this.createPlayer({
      name: this.nextAiName(),
      isAI: true,
      difficulty,
      personality,
    });
  }

  fillWithAI(): number {
    let added = 0;
    while (this.state.players.length < MAX_PLAYERS) {
      if (!this.addAI()) break;
      added += 1;
    }
    this.state.version += 1;
    return added;
  }

  removePlayer(playerId: string): boolean {
    if (this.state.phase === 'playing') return false;
    const index = this.state.players.findIndex((p) => p.id === playerId);
    if (index < 0) return false;
    this.state.players.splice(index, 1);
    for (const socketId of this.sockets.get(playerId) ?? []) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(this.code);
        socket.data.roomCode = null;
        socket.data.playerId = null;
      }
    }
    this.sockets.delete(playerId);
    this.sessions.delete(playerId);
    this.bots.delete(playerId);
    this.standIns.delete(playerId);
    const timer = this.disconnectTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(playerId);
    delete this.state.hands[playerId];
    delete this.state.positions[playerId];
    delete this.state.eliminated[playerId];
    if (this.state.players.length && !this.state.players.some((p) => p.isHost)) {
      this.state.players[0].isHost = true;
    }
    this.state.players.forEach((p, i) => {
      p.seat = i;
    });
    this.state.version += 1;
    return true;
  }

  setCharacter(playerId: string, characterId: string | null): boolean {
    if (this.state.phase !== 'lobby') return false;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return false;
    if (characterId && this.state.players.some((p) => p.id !== playerId && p.characterId === characterId)) {
      return false; // somebody else is already wearing that coat
    }
    player.characterId = characterId;
    this.state.version += 1;
    return true;
  }

  setReady(playerId: string, ready: boolean): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    player.ready = ready;
    this.state.version += 1;
  }

  setName(playerId: string, name: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    const clean = name.trim().slice(0, 18);
    if (clean) player.name = clean;
    this.state.version += 1;
  }

  updateSettings(settings: Partial<GameSettings>): void {
    this.state.settings = { ...this.state.settings, ...settings };
    if (settings.aiDifficulty || settings.aiPersonality) {
      for (const player of this.state.players) {
        if (!player.isAI) continue;
        if (settings.aiDifficulty) player.difficulty = settings.aiDifficulty;
        if (settings.aiPersonality) player.personality = settings.aiPersonality;
        this.bots.set(
          player.id,
          new AIController(player.id, player.difficulty, player.personality, this.rng),
        );
      }
    }
    this.state.version += 1;
  }

  saveNotebook(playerId: string, notebook: Record<string, string>): void {
    if (!this.state.players.some((p) => p.id === playerId)) return;
    this.state.notebooks[playerId] = sanitizeNotebook(notebook);
  }

  canStart(): { ok: boolean; error?: string } {
    if (this.state.phase !== 'lobby') return { ok: false, error: 'The game has already begun.' };
    const count = this.state.players.length;
    if (count < MIN_PLAYERS) {
      return { ok: false, error: `A case needs at least ${MIN_PLAYERS} detectives.` };
    }
    if (count > MAX_PLAYERS) return { ok: false, error: 'Too many detectives.' };
    if (this.state.players.some((p) => !p.characterId)) {
      return { ok: false, error: 'Every detective needs a character.' };
    }
    if (this.state.players.some((p) => !p.isAI && !p.ready)) {
      return { ok: false, error: 'Someone at the table is not ready.' };
    }
    return { ok: true };
  }

  start(): { ok: boolean; error?: string } {
    const check = this.canStart();
    if (!check.ok) return check;
    for (const player of this.state.players) {
      if (player.isAI) {
        this.bots.set(
          player.id,
          new AIController(player.id, player.difficulty, player.personality, this.rng),
        );
      }
    }
    startGame(this.state, this.rng);
    this.state.version += 1;
    this.syncAll();
    this.maybeRunAI();
    return { ok: true };
  }

  restart(): { ok: boolean; error?: string } {
    this.state.phase = 'lobby';
    this.state.solution = null;
    this.state.winnerId = null;
    this.state.revealedSolution = null;
    this.state.log = [];
    this.state.history = [];
    this.state.pendingSuggestion = null;
    this.state.currentPlayerId = null;
    this.state.turnNumber = 0;
    this.state.turnStep = 'roll';
    this.state.finishedAt = null;
    this.state.startedAt = null;
    for (const player of this.state.players) {
      this.state.hands[player.id] = [];
      this.state.eliminated[player.id] = false;
      this.state.seen[player.id] = [];
      this.state.shown[player.id] = [];
    }
    this.standIns.clear();
    this.state.version += 1;
    this.syncAll();
    return { ok: true };
  }

  handleIntent(playerId: string, intent: Intent): IntentResult {
    const result = applyIntent(this.state, playerId, intent, this.rng);
    if (!result.ok) {
      this.toast(playerId, result.error ?? 'That move was refused.', 'error');
      return result;
    }
    if (intent.type === 'reveal') {
      const controller = this.bots.get(playerId) ?? this.standIns.get(playerId);
      const ps = this.state.pendingSuggestion;
      if (controller && ps?.shownCard) controller.rememberShown(ps.byId, ps.shownCard);
    }
    this.state.version += 1;
    this.syncAll();
    if (this.state.phase === 'finished') {
      this.io.to(this.code).emit('game:over', {
        winnerId: this.state.winnerId,
        solution: this.state.revealedSolution,
        roomCode: this.code,
      });
    } else {
      setTimeout(() => this.maybeRunAI(), 0);
    }
    return result;
  }

  private controllerFor(playerId: string): AIController | null {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return null;
    if (player.isAI) return this.bots.get(playerId) ?? null;
    if (this.state.settings.autoPlayDisconnected && !player.connected) {
      let standIn = this.standIns.get(playerId);
      if (!standIn) {
        standIn = new AIController(playerId, 'medium', 'analytical', this.rng);
        this.standIns.set(playerId, standIn);
      }
      return standIn;
    }
    return null;
  }

  maybeRunAI(): void {
    if (this.state.phase !== 'playing') return;
    if (this.aiRunning) return;
    const ps = this.state.pendingSuggestion;
    if (ps && !ps.resolved && this.state.turnStep === 'reveal') {
      const responder = ps.order[ps.index];
      if (responder && this.controllerFor(responder)) {
        void this.runBotLoop(responder);
        return;
      }
    }
    const current = this.state.currentPlayerId;
    if (current && this.controllerFor(current)) {
      void this.runBotLoop(current);
    }
  }

  private async runBotLoop(botId: string): Promise<void> {
    if (this.aiRunning) return;
    this.aiRunning = true;
    try {
      let guard = 0;
      while (guard++ < 60) {
        if (this.state.phase !== 'playing') break;
        const controller = this.controllerFor(botId);
        if (!controller) break;
        const ps = this.state.pendingSuggestion;
        const isResponder =
          !!ps &&
          !ps.resolved &&
          this.state.turnStep === 'reveal' &&
          ps.order[ps.index] === botId;
        if (!isResponder && this.state.currentPlayerId !== botId) break;

        const view = getPlayerView(this.state, botId);
        const decision = controller.decide(view);
        if (!decision.intent) break;
        if (decision.say) this.aiStatus(botId, decision.say);
        await sleep(Math.max(0, decision.delayMs * this.aiDelayScale));
        if (this.state.phase !== 'playing') break;
        const result = this.handleIntent(botId, decision.intent);
        if (!result.ok) {
          if (this.state.currentPlayerId === botId) {
            this.handleIntent(botId, { type: 'endTurn' });
          }
          break;
        }
        if (decision.intent.type === 'endTurn') break;
      }
    } finally {
      this.aiStatus(null, '');
      this.aiRunning = false;
      setTimeout(() => this.maybeRunAI(), 30);
    }
  }

  attachSocket(playerId: string, socketId: string, token: string): void {
    const set = this.sockets.get(playerId) ?? new Set<string>();
    set.add(socketId);
    this.sockets.set(playerId, set);
    this.sessions.set(playerId, token);
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = true;
      player.disconnectedAt = null;
      player.lastSeen = Date.now();
      this.standIns.delete(playerId);
    }
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
    this.state.version += 1;
  }

  detachSocket(playerId: string, socketId: string): void {
    const set = this.sockets.get(playerId);
    if (!set) return;
    set.delete(socketId);
    if (set.size > 0) return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isAI) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    this.state.version += 1;
    const timer = setTimeout(() => {
      if (this.state.phase === 'playing') {
        this.syncAll();
        this.maybeRunAI();
      } else {
        this.removePlayer(playerId);
        this.syncAll();
      }
    }, DISCONNECT_GRACE_MS);
    this.disconnectTimers.set(playerId, timer);
    this.syncAll();
    setTimeout(() => this.maybeRunAI(), 400);
  }

  sessionToken(playerId: string): string | null {
    return this.sessions.get(playerId) ?? null;
  }

  /** True when somebody else at this table is already using that name. */
  nameTaken(raw: unknown, exceptPlayerId?: string): boolean {
    const key = normalizeNameKey(raw);
    if (!key) return false;
    return this.state.players.some(
      (p) => p.id !== exceptPlayerId && normalizeNameKey(p.name) === key,
    );
  }

  playerById(playerId: string): Player | null {
    return this.state.players.find((p) => p.id === playerId) ?? null;
  }

  hasConnectedHumans(): boolean {
    return this.state.players.some((p) => !p.isAI && p.connected);
  }

  isEmpty(): boolean {
    return !this.hasConnectedHumans();
  }

  destroy(): void {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
    this.bots.clear();
    this.standIns.clear();
  }

  syncAll(): void {
    for (const player of this.state.players) this.syncPlayer(player.id);
  }

  syncPlayer(playerId: string): void {
    const socketIds = this.sockets.get(playerId);
    if (!socketIds || socketIds.size === 0) return;
    const view = getPlayerView(this.state, playerId);
    for (const socketId of socketIds) {
      this.io.to(socketId).emit('sync', view);
    }
  }

  toast(
    playerId: string | null,
    message: string,
    tone: 'info' | 'error' | 'success' = 'info',
  ): void {
    if (playerId) {
      for (const socketId of this.sockets.get(playerId) ?? []) {
        this.io.to(socketId).emit('toast', { message, tone });
      }
    } else {
      this.io.to(this.code).emit('toast', { message, tone });
    }
  }

  aiStatus(playerId: string | null, text: string): void {
    this.io.to(this.code).emit('ai:status', { playerId, text });
  }
}
