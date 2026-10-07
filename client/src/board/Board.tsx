import { memo, useMemo, useState } from 'react';
import {
  BLOCKED_RECTS,
  GRID,
  ROOMS,
  SECRET_PASSAGES,
} from '@shared/constants/board';
import { CHARACTERS } from '@shared/constants/characters';
import type { NodeId, Position, PublicPlayer } from '@shared/types';
import { BoardDefs, hexToRgba } from './boardDefs';
import { BOARD_ART_URL, roomArtUrl } from '../cards/artAssets';
import { TokenLayer } from './Token';

const VB = { x: -1.05, y: -1.05, w: GRID.width + 2.1, h: GRID.height + 2.1 };

/** Board-space coordinate -> percentage of the board box (for the HTML token layer). */
export function toPercent(row: number, col: number) {
  return {
    left: ((col - VB.x) / VB.w) * 100,
    top: ((row - VB.y) / VB.h) * 100,
  };
}

export const BOARD_ASPECT = `${VB.w} / ${VB.h}`;

interface BoardProps {
  positions: Record<string, Position>;
  players: PublicPlayer[];
  legalMoves: NodeId[];
  currentPlayerId: string | null;
  myPlayerId: string | null;
  pendingMove?: NodeId | null;
  onPickTarget?: (nodeId: NodeId) => void;
  compact?: boolean;
}

function BoardInner({
  positions,
  players,
  legalMoves,
  currentPlayerId,
  myPlayerId,
  onPickTarget,
  compact = false,
}: BoardProps) {
  const legalSet = useMemo(() => new Set(legalMoves), [legalMoves]);
  const passages = useMemo(() => {
    const seen = new Set<string>();
    return SECRET_PASSAGES.filter((p) => {
      const key = [p.from, p.to].sort().join('>');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  return (
    <div className="board" style={{ aspectRatio: BOARD_ASPECT }}>
      <svg
        className="board__svg"
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Mystery Mansion board"
      >
        <BoardDefs />

        {/* ---- wooden frame ---- */}
        <rect
          x={VB.x}
          y={VB.y}
          width={VB.w}
          height={VB.h}
          rx="0.5"
          fill="url(#woodFrame)"
        />
        <rect
          x={VB.x}
          y={VB.y}
          width={VB.w}
          height={VB.h}
          rx="0.5"
          fill="url(#grain)"
          opacity="0.5"
        />
        <rect
          x="-0.72"
          y="-0.72"
          width={GRID.width + 1.44}
          height={GRID.height + 1.44}
          rx="0.28"
          fill="none"
          stroke="#7c5a2c"
          strokeWidth="0.09"
        />
        <rect
          x="-0.55"
          y="-0.55"
          width={GRID.width + 1.1}
          height={GRID.height + 1.1}
          rx="0.2"
          fill="none"
          stroke="rgba(227,196,137,0.35)"
          strokeWidth="0.04"
        />
        {[
          [-0.4, -0.4],
          [GRID.width + 0.4, -0.4],
          [-0.4, GRID.height + 0.4],
          [GRID.width + 0.4, GRID.height + 0.4],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="0.19" fill="url(#brassGrad)" />
            <circle cx={cx} cy={cy} r="0.19" fill="none" stroke="rgba(40,25,12,0.55)" strokeWidth="0.03" />
            <circle cx={cx - 0.05} cy={cy - 0.05} r="0.06" fill="rgba(255,240,210,0.55)" />
          </g>
        ))}

        {/* ---- board surface ---- */}
        <rect x="0" y="0" width={GRID.width} height={GRID.height} fill="url(#corridorFloor)" />
        {/* Optional painted surface: drop art/board/board-bg.png in to use one. */}
        <BoardImage />
        <rect
          x="0"
          y="0"
          width={GRID.width}
          height={GRID.height}
          fill="#f4e9d2"
          opacity="0.35"
        />
        <rect
          x="0"
          y="0"
          width={GRID.width}
          height={GRID.height}
          fill="#f4e9d2"
          filter="url(#grain)"
          opacity="0.5"
        />
        <rect
          x="0"
          y="0"
          width={GRID.width}
          height={GRID.height}
          fill="url(#tableLight)"
        />

        {/* ---- the cloister court (decorative, never walkable) ---- */}
        {BLOCKED_RECTS.map((block, i) => (
          <Courtyard key={i} x={block.col} y={block.row} w={block.width} h={block.height} />
        ))}

        {/* ---- rooms ---- */}
        {ROOMS.map((room) => {
          const { col: x, row: y, width: w, height: h } = room.rect;
          const lines = room.label;
          const centreY = y + h / 2;
          const nameSize = w >= 8 ? 0.82 : lines.length > 1 ? 0.6 : 0.72;
          const startY = centreY - ((lines.length - 1) * nameSize * 1.05) / 2 - 0.12;
          return (
            <g key={room.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#f4e9d2"
                filter="url(#roomShadow)"
              />
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={`url(#floor-${room.id})`}
              />
              <RoomImage id={room.id} x={x} y={y} w={w} h={h} />
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={hexToRgba(room.tint, 0.03)}
              />
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="none"
                stroke="#2c1d13"
                strokeWidth="0.13"
                strokeLinejoin="miter"
              />
              <rect
                x={x + 0.13}
                y={y + 0.13}
                width={w - 0.26}
                height={h - 0.26}
                fill="none"
                stroke={hexToRgba(room.tint, 0.55)}
                strokeWidth="0.035"
              />
              {/* name plaque */}
              <text
                x={x + w / 2}
                y={startY + 0.02}
                textAnchor="middle"
                className="board__room-name"
                style={{ fontSize: nameSize }}
                fill="#2b1c12"
                stroke="rgba(250,244,228,0.72)"
                strokeWidth="0.075"
                paintOrder="stroke"
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={x + w / 2} dy={i === 0 ? 0 : nameSize * 1.05}>
                    {line}
                  </tspan>
                ))}
              </text>
              {!compact && (
                <>
                  <path
                    d={`M${x + w / 2 - 0.9} ${startY + nameSize * (lines.length - 0.15) + 0.42} H${x + w / 2 + 0.9
                      }`}
                    stroke={hexToRgba(room.tint, 0.7)}
                    strokeWidth="0.035"
                  />
                  <text
                    x={x + w / 2}
                    y={startY + nameSize * (lines.length - 0.15) + 0.86}
                    textAnchor="middle"
                    className="board__room-motif"
                    fill={hexToRgba(room.tint, 0.95)}
                  >
                    {room.motif}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* ---- doorways ---- */}
        {(() => {
          const rendered = new Set<string>();
          return ROOMS.flatMap((room) =>
            room.doors.map((door, i) => {
              const { row: ry, height: rh, col: rx, width: rw } = room.rect;
              const isHoriz = ry + rh === door.row || ry - 1 === door.row;
              const y = ry + rh === door.row ? door.row : door.row - 1;
              const x = rx + rw === door.col ? door.col : door.col - 1;
              const key = isHoriz ? `h-${door.col}-${y}` : `v-${x}-${door.row}`;

              if (rendered.has(key)) return null;
              rendered.add(key);
              return <Doorway key={`${room.id}-${i}`} room={room} cell={door} />;
            })
          );
        })()}

        {/* ---- secret passages ---- */}
        {passages.map(({ from, to }) => {
          const a = ROOMS.find((r) => r.id === from)!;
          const b = ROOMS.find((r) => r.id === to)!;
          const ax = a.rect.col + a.rect.width / 2;
          const ay = a.rect.row + a.rect.height / 2;
          const bx = b.rect.col + b.rect.width / 2;
          const by = b.rect.row + b.rect.height / 2;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const cx = mx + (-dy / len) * len * 0.1;
          const cy = my + (dx / len) * len * 0.1;
          return (
            <g key={`${from}-${to}`} className="board__passage">
              <path
                d={`M${ax} ${ay} Q${cx} ${cy} ${bx} ${by}`}
                fill="none"
                stroke="#8a6a34"
                strokeWidth="0.075"
                strokeDasharray="0.22 0.16"
                strokeLinecap="round"
                opacity="0.8"
              />
              <circle cx={ax} cy={ay} r="0.15" fill="url(#brassGrad)" />
              <circle cx={bx} cy={by} r="0.15" fill="url(#brassGrad)" />
            </g>
          );
        })}

        {/* ---- start squares ---- */}
        {CHARACTERS.map((character) => {
          const { row, col } = character.start;
          const cx = col + 0.5;
          const cy = row + 0.5;
          const initial = character.short.replace(/^(Miss|Mrs\.|Mr\.|Colonel|Professor|Lady)\s*/i, '')[0];
          return (
            <g key={character.id} opacity="0.92">
              <circle
                cx={cx}
                cy={cy}
                r="0.34"
                fill={hexToRgba(character.color, 0.2)}
                stroke={hexToRgba(character.color, 0.75)}
                strokeWidth="0.055"
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                className="board__start-initial"
                fill={hexToRgba(character.shade, 0.95)}
              >
                {initial}
              </text>
            </g>
          );
        })}

        {/* ---- legal destinations ---- */}
        {legalMoves.map((node) => {
          const isRoom = node.startsWith('r:');
          const active = !!onPickTarget;
          if (isRoom) {
            const room = ROOMS.find((r) => r.id === node.slice(2));
            if (!room) return null;
            return (
              <g
                key={node}
                data-node={node}
                className={`board__move${active ? ' board__move--active' : ''}`}
                onClick={active ? () => onPickTarget?.(node) : undefined}
              >
                <rect
                  x={room.rect.col + 0.12}
                  y={room.rect.row + 0.12}
                  width={room.rect.width - 0.24}
                  height={room.rect.height - 0.24}
                  rx="0.12"
                  fill="rgba(177,131,74,0.1)"
                  stroke="#8a6a34"
                  strokeWidth="0.06"
                  strokeDasharray="0.3 0.2"
                />
              </g>
            );
          }
          const [row, col] = node.slice(2).split(',').map(Number);
          return (
            <g
              key={node}
              data-node={node}
              className={`board__move${active ? ' board__move--active' : ''}`}
              onClick={active ? () => onPickTarget?.(node) : undefined}
            >
              <rect
                x={col + 0.06}
                y={row + 0.06}
                width="0.88"
                height="0.88"
                rx="0.1"
                fill="rgba(177,131,74,0.16)"
                stroke="#8a6a34"
                strokeWidth="0.055"
                strokeDasharray="0.24 0.16"
              />
              <circle cx={col + 0.5} cy={row + 0.5} r="0.11" fill="rgba(122,90,44,0.55)" />
            </g>
          );
        })}
      </svg>

      <TokenLayer
        positions={positions}
        players={players}
        currentPlayerId={currentPlayerId}
        myPlayerId={myPlayerId}
        dimOthers={legalSet.size > 0}
      />
    </div>
  );
}

function Doorway({
  room,
  cell,
}: {
  room: (typeof ROOMS)[number];
  cell: { row: number; col: number };
}) {
  const { row: ry, col: rx, width: rw, height: rh } = room.rect;
  const horizontalWall = ry + rh === cell.row || ry - 1 === cell.row;
  const bx = cell.col;
  const by = cell.row;

  if (horizontalWall) {
    const y = ry + rh === cell.row ? cell.row : cell.row + 1;
    return (
      <g>
        <rect x={bx + 0.15} y={y - 0.1} width="0.7" height="0.2" fill="#f2e7cf" />
        <rect x={bx + 0.15} y={y - 0.14} width="0.08" height="0.28" fill="url(#brassGrad)" />
        <rect x={bx + 0.77} y={y - 0.14} width="0.08" height="0.28" fill="url(#brassGrad)" />
        <rect x={bx + 0.15} y={y - 0.02} width="0.7" height="0.045" fill="rgba(90,66,40,0.5)" />
      </g>
    );
  }
  const x = rx + rw === cell.col ? cell.col : cell.col + 1;
  return (
    <g>
      <rect x={x - 0.1} y={by + 0.15} width="0.2" height="0.7" fill="#f2e7cf" />
      <rect x={x - 0.14} y={by + 0.15} width="0.28" height="0.08" fill="url(#brassGrad)" />
      <rect x={x - 0.14} y={by + 0.77} width="0.28" height="0.08" fill="url(#brassGrad)" />
      <rect x={x - 0.02} y={by + 0.15} width="0.045" height="0.7" fill="rgba(90,66,40,0.5)" />
    </g>
  );
}

/**
 * Optional painted board surface. Missing file = no <image> painted, and the
 * board keeps its drawn parquet.
 */
function BoardImage() {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <image
      href={BOARD_ART_URL}
      x={0}
      y={0}
      width={GRID.width}
      height={GRID.height}
      preserveAspectRatio="xMidYMid slice"
      onError={() => setBroken(true)}
    />
  );
}

/** Optional picture inside one room, clipped to the room's rectangle. */
function RoomImage({ id, x, y, w, h }: { id: string; x: number; y: number; w: number; h: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  // `slice` crops the picture to the room rectangle, so no clip path is needed
  return (
    <image
      href={roomArtUrl(id)}
      x={x}
      y={y}
      width={w}
      height={h}
      preserveAspectRatio="xMidYMid slice"
      style={{ mixBlendMode: 'multiply' }}
      opacity={0.85}
      onError={() => setBroken(true)}
    />
  );
}

function Courtyard({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  const pathW = 0.62;
  return (
    <g>
      <defs>
        <radialGradient id="courtGrass" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#4a5c45" />
          <stop offset="100%" stopColor="#2a3628" />
        </radialGradient>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill="url(#courtGrass)" />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#2c1d13" strokeWidth="0.13" />
      <rect
        x={x + 0.13}
        y={y + 0.13}
        width={w - 0.26}
        height={h - 0.26}
        fill="none"
        stroke="rgba(227,196,137,0.35)"
        strokeWidth="0.035"
      />

      {/* hedges */}
      {[
        [x + 1.7, y + 2.5],
        [x + w - 1.7, y + 2.5],
        [x + 1.7, y + h - 2.6],
        [x + w - 1.7, y + h - 2.6],
      ].map(([hx, hy], i) => (
        <g key={i}>
          <circle cx={hx} cy={hy} r="1.15" fill="#243019" />
          <circle cx={hx} cy={hy} r="0.78" fill="#31422a" />
          <circle cx={hx - 0.2} cy={hy - 0.22} r="0.5" fill="rgba(255,255,255,0.07)" />
          <circle cx={hx} cy={hy - 1.15} r="0.22" fill="#2c3a23" />
        </g>
      ))}

      {/* gravel paths */}
      <rect x={cx - pathW / 2} y={y + 1.1} width={pathW} height={h - 2.2} fill="#cbb891" opacity="0.55" />
      <rect x={x + 1.1} y={y + h / 2 - pathW / 2} width={w - 2.2} height={pathW} fill="#cbb891" opacity="0.55" />

      {/* fountain */}
      <circle cx={cx} cy={y + h / 2} r="1.3" fill="#b9a67e" />
      <circle cx={cx} cy={y + h / 2} r="1.12" fill="#8d7c58" />
      <circle cx={cx} cy={y + h / 2} r="0.95" fill="#6d8b90" />
      <circle cx={cx} cy={y + h / 2} r="0.95" fill="none" stroke="rgba(240,228,196,0.4)" strokeWidth="0.05" />
      <circle cx={cx} cy={y + h / 2} r="0.3" fill="#cfc0a0" />
      <path
        d={`M${cx} ${y + h / 2 - 0.3} V${y + h / 2 - 0.95}`}
        stroke="rgba(240,240,255,0.55)"
        strokeWidth="0.07"
      />
      <circle cx={cx} cy={y + h / 2 - 1.02} r="0.12" fill="rgba(245,245,255,0.6)" />

      {/* title plate */}
      <text
        x={cx}
        y={y + 1.35}
        textAnchor="middle"
        className="board__court-title"
        fill="#f2e6cb"
      >
        MYSTERY MANSION
      </text>
      <path
        d={`M${cx - 2.6} ${y + 1.72} H${cx + 2.6}`}
        stroke="rgba(216,184,120,0.75)"
        strokeWidth="0.04"
      />
      <text
        x={cx}
        y={y + 2.14}
        textAnchor="middle"
        className="board__court-sub"
        fill="rgba(242,230,203,0.72)"
      >
        THE CLOISTERS
      </text>
    </g>
  );
}

export const Board = memo(BoardInner);
