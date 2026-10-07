import { Room } from './server/src/game/Room';
import { getPlayerView } from '@mystery/shared';
const nullIo = { to: () => ({ emit: () => undefined }) } as never;
let seed = 12345;
const rng = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1e6) / 1e6; };
const room = new Room('SEC01', nullIo, {}, { rng, aiDelayScale: 0 });
const ids: string[] = [];
for (let i = 0; i < 4; i++) { const p = room.createPlayer({ name: `Human ${i + 1}`, isAI: false }); if (p) ids.push(p.id); }
for (let i = 0; i < 2; i++) room.createPlayer({ name: `Bot ${i + 1}`, isAI: true });
room.start();
const view = JSON.stringify(getPlayerView(room.state, ids[0]));
const i = view.indexOf('tok');
console.log('index of tok:', i, i >= 0 ? JSON.stringify(view.slice(Math.max(0, i - 90), i + 60)) : '');
console.log('names:', room.players.map((p) => p.name));
console.log('gameId:', room.state.gameId, '| ids:', ids);
