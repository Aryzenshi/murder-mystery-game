import { memo } from 'react';
import { CHARACTER_BY_ID } from '@shared/constants/characters';
import { ROOM_BY_ID } from '@shared/constants/board';
import type { CharacterDef, Position, PublicPlayer } from '@shared/types';
import { toPercent } from './Board';

interface TokenLayerProps {
  positions: Record<string, Position>;
  players: PublicPlayer[];
  currentPlayerId: string | null;
  myPlayerId: string | null;
  dimOthers?: boolean;
}

interface Placed {
  player: PublicPlayer;
  character: CharacterDef;
  row: number;
  col: number;
}

/** Multiple detectives in one room line up neatly instead of stacking. */
function layout(players: PublicPlayer[], positions: Record<string, Position>): Placed[] {
  const placed: Placed[] = [];
  const byRoom = new Map<string, PublicPlayer[]>();
  const byCell = new Map<string, PublicPlayer[]>();

  for (const player of players) {
    const pos = positions[player.id];
    if (!pos || !player.characterId) continue;
    const character = CHARACTER_BY_ID[player.characterId];
    if (!character) continue;
    if (pos.kind === 'room') {
      const list = byRoom.get(pos.roomId) ?? [];
      list.push(player);
      byRoom.set(pos.roomId, list);
    } else {
      const key = `${pos.cell.row},${pos.cell.col}`;
      const list = byCell.get(key) ?? [];
      list.push(player);
      byCell.set(key, list);
    }
  }

  for (const [roomId, occupants] of byRoom) {
    const room = ROOM_BY_ID[roomId];
    if (!room) continue;
    const n = occupants.length;
    const usable = Math.max(1.4, room.rect.width - 1.1);
    const spacing = Math.min(0.82, usable / Math.max(n, 1));
    const centreX = room.rect.col + room.rect.width / 2;
    const rowY = room.rect.row + room.rect.height - 0.66;
    occupants.forEach((player, index) => {
      placed.push({
        player,
        character: CHARACTER_BY_ID[player.characterId as string],
        row: rowY,
        col: centreX + (index - (n - 1) / 2) * spacing,
      });
    });
  }

  for (const [, occupants] of byCell) {
    const n = occupants.length;
    occupants.forEach((player, index) => {
      const pos = positions[player.id];
      if (pos.kind !== 'corridor') return;
      const angle = (index / Math.max(n, 1)) * Math.PI * 2;
      const radius = n > 1 ? 0.17 : 0;
      placed.push({
        player,
        character: CHARACTER_BY_ID[player.characterId as string],
        row: pos.cell.row + 0.5 + Math.sin(angle) * radius,
        col: pos.cell.col + 0.5 + Math.cos(angle) * radius,
      });
    });
  }

  return placed;
}

function TokenLayerInner({
  positions,
  players,
  currentPlayerId,
  myPlayerId,
  dimOthers,
}: TokenLayerProps) {
  const placed = layout(players, positions);
  return (
    <div className="board__tokens">
      {placed.map(({ player, character, row, col }) => {
        const { left, top } = toPercent(row, col);
        const isCurrent = player.id === currentPlayerId;
        const isMine = player.id === myPlayerId;
        return (
          <div
            key={player.id}
            className="token"
            style={{ left: `${left}%`, top: `${top}%`, zIndex: isCurrent ? 4 : isMine ? 3 : 2 }}
            data-current={isCurrent || undefined}
            data-mine={isMine || undefined}
            data-dim={dimOthers && !isCurrent ? true : undefined}
            data-out={player.eliminated || undefined}
            title={`${player.name} — ${character.name}`}
          >
            <Pawn
              character={character}
              dimmed={player.eliminated}
              ringed={isCurrent}
              mine={isMine}
            />
          </div>
        );
      })}
    </div>
  );
}

export const TokenLayer = memo(TokenLayerInner);

export function Pawn({
  character,
  size,
  dimmed,
  ringed,
  mine,
}: {
  character: CharacterDef;
  size?: number;
  dimmed?: boolean;
  ringed?: boolean;
  mine?: boolean;
}) {
  const id = `pawn-${character.id}${size ? `-${size}` : ''}${dimmed ? '-d' : ''}`;
  return (
    <svg
      className="pawn"
      viewBox="-15 -26 30 38"
      width={size ? `${size}px` : undefined}
      style={{ width: size ? `${size}px` : undefined }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor={lighten(character.color, 0.34)} />
          <stop offset="52%" stopColor={character.color} />
          <stop offset="100%" stopColor={character.shade} />
        </linearGradient>
        <linearGradient id={`${id}-hat`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={lighten(character.color, 0.5)} />
          <stop offset="100%" stopColor={character.shade} />
        </linearGradient>
      </defs>

      {ringed && <circle cx="0" cy="6" r="11.4" className="pawn__ring" />}
      {mine && <circle cx="0" cy="6" r="9.8" className="pawn__mine" />}

      <ellipse cx="0" cy="7.6" rx="9.2" ry="2.9" fill="rgba(26,16,10,0.34)" />
      <ellipse cx="0" cy="6.2" rx="9" ry="3.2" fill={`url(#${id}-body)`} />
      <ellipse cx="0" cy="5.6" rx="9" ry="3.2" fill={character.color} />
      <ellipse cx="0" cy="5.6" rx="9" ry="3.2" fill="none" stroke={character.shade} strokeWidth="0.7" />

      <path
        d="M-7.4 5.6 C-7.6 0.8 -5.4 -1.4 -4.3 -5.2 L-3.4 -9.4 L3.4 -9.4 L4.3 -5.2 C5.4 -1.4 7.6 0.8 7.4 5.6 Z"
        fill={`url(#${id}-body)`}
        stroke={character.shade}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <ellipse cx="0" cy="-7.6" rx="5.1" ry="1.7" fill={lighten(character.color, 0.18)} stroke={character.shade} strokeWidth="0.6" />
      <circle cx="0" cy="-13.2" r="5" fill={`url(#${id}-body)`} stroke={character.shade} strokeWidth="0.8" />
      <path
        d="M-2.6 -15.6 C-2 -16.8 -1 -17.2 0.2 -17.2"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />

      <Headpiece character={character} gradId={`${id}-hat`} />

      {dimmed && <ellipse cx="0" cy="5.6" rx="9" ry="3.2" fill="rgba(30,20,14,0.45)" />}
      {dimmed && (
        <path
          d="M-7.4 5.6 C-7.6 0.8 -5.4 -1.4 -4.3 -5.2 L-3.4 -9.4 L3.4 -9.4 L4.3 -5.2 C5.4 -1.4 7.6 0.8 7.4 5.6 Z"
          fill="rgba(30,20,14,0.45)"
        />
      )}
      {dimmed && <circle cx="0" cy="-13.2" r="5" fill="rgba(30,20,14,0.45)" />}
    </svg>
  );
}

function Headpiece({ character, gradId }: { character: CharacterDef; gradId: string }) {
  const stroke = { stroke: character.shade, strokeWidth: 0.8, strokeLinejoin: 'round' as const };
  switch (character.token) {
    case 'heirloom':
      return (
        <g>
          <ellipse cx="0" cy="-16.6" rx="10.4" ry="2.5" fill={`url(#${gradId})`} {...stroke} />
          <path d="M-4.4 -16.8 C-4.6 -21 -3.6 -22.6 0 -22.6 C3.6 -22.6 4.6 -21 4.4 -16.8 Z" fill={`url(#${gradId})`} {...stroke} />
          <path d="M1.6 -22.2 C5 -24.4 8.4 -24.6 10.6 -23.2 C8.2 -22.4 5.6 -21.6 3.4 -20.4 Z" fill="#e8dcc0" stroke={character.shade} strokeWidth="0.5" />
        </g>
      );
    case 'colonel':
      return (
        <g>
          <path d="M-5.4 -16.2 C-5.6 -20.4 -4 -22.6 0 -22.6 C4 -22.6 5.6 -20.4 5.4 -16.2 Z" fill={`url(#${gradId})`} {...stroke} />
          <ellipse cx="0" cy="-16.2" rx="8" ry="1.9" fill={character.shade} {...stroke} />
          <ellipse cx="0" cy="-16.9" rx="5.3" ry="1.2" fill="rgba(0,0,0,0.28)" />
          <circle cx="0" cy="-19.8" r="1.3" fill="#d8b878" stroke={character.shade} strokeWidth="0.4" />
        </g>
      );
    case 'housekeeper':
      return (
        <g>
          <path d="M-6.2 -15.4 C-7 -21.4 -3.8 -23.6 0 -23.6 C3.8 -23.6 7 -21.4 6.2 -15.4 Z" fill={`url(#${gradId})`} {...stroke} />
          <path d="M-6.2 -15.4 C-3 -16.6 3 -16.6 6.2 -15.4" fill="none" stroke={character.shade} strokeWidth="0.7" />
          <circle cx="4.6" cy="-14.6" r="1.5" fill="#efe4cb" stroke={character.shade} strokeWidth="0.5" />
        </g>
      );
    case 'businessman':
      return (
        <g>
          <path d="M-5 -15.8 C-5.2 -21 -3.6 -23 0 -23 C3.6 -23 5.2 -21 5 -15.8 Z" fill={`url(#${gradId})`} {...stroke} />
          <ellipse cx="0" cy="-15.6" rx="7.4" ry="1.9" fill={character.shade} {...stroke} />
        </g>
      );
    case 'socialite':
      return (
        <g>
          <ellipse cx="0" cy="-16.4" rx="8.6" ry="2.2" fill={`url(#${gradId})`} {...stroke} />
          <path d="M-3.8 -16.6 C-3.6 -22.4 -2.6 -25 0 -25 C2.6 -25 3.6 -22.4 3.8 -16.6 Z" fill={`url(#${gradId})`} {...stroke} />
          <path d="M-3 -24.4 C-6 -26.6 -9.6 -26.4 -11.4 -24.6 C-8.6 -24.6 -5.8 -24.6 -3.4 -24.2" fill="none" stroke="#e8dcc0" strokeWidth="0.9" strokeLinecap="round" />
          <circle cx="-11.6" cy="-24.4" r="1.1" fill="#d8b878" />
        </g>
      );
    case 'scholar':
    default:
      return (
        <g>
          <path d="M-4.6 -16.4 C-4.8 -20.8 -3.4 -22.8 0 -22.8 C3.4 -22.8 4.8 -20.8 4.6 -16.4 Z" fill={`url(#${gradId})`} {...stroke} />
          <path d="M0 -22.6 L11 -19.4 L0 -16.2 L-11 -19.4 Z" fill={character.shade} {...stroke} />
          <path d="M0 -22.6 L11 -19.4 L0 -16.2 L-11 -19.4 Z" fill="rgba(0,0,0,0.18)" />
          <path d="M9.6 -19.2 C11.4 -17.6 11.6 -15.4 11 -14.2" fill="none" stroke="#d8b878" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      );
  }
}

function lighten(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
