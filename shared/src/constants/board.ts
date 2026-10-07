import type { Cell, Rect, RoomId } from '../types';

/**
 * ---------------------------------------------------------------------------
 * THE MANSION — original board layout
 * ---------------------------------------------------------------------------
 * An original 24 × 25 mansion plan in the classic nine-room format: four rooms
 * down the west wing, three down the east wing (with a large kitchen), a grand
 * hall to the north, a ballroom to the south and an ornamental courtyard at
 * the heart of the house that cannot be entered.
 *
 * The grid is authored as plain rectangles and compiled into a movement graph
 * by `rules/boardGraph.ts`, so the layout can be re-drawn without touching a
 * single rule.
 * ---------------------------------------------------------------------------
 */

export const GRID = { width: 24, height: 25 } as const;

export type FloorPattern =
  | 'parquet'
  | 'tile'
  | 'carpet'
  | 'rug'
  | 'marble'
  | 'glass'
  | 'plank'
  | 'checker'
  | 'inlay';

export interface RoomDef {
  id: RoomId;
  name: string;
  /** Printed-board label (may wrap onto two lines). */
  label: string[];
  rect: Rect;
  /** Corridor cells that open into this room. */
  doors: Cell[];
  secretPassage?: RoomId;
  /** Muted printed tint. */
  tint: string;
  pattern: FloorPattern;
  /** Small flavour line drawn under the room name. */
  motif?: string;
}

const cell = (row: number, col: number): Cell => ({ row, col });

export const ROOMS: RoomDef[] = [
  {
    id: 'study',
    name: 'Study',
    label: ['STUDY'],
    rect: { row: 1, col: 1, height: 5, width: 5 },
    doors: [cell(6, 2)],
    secretPassage: 'kitchen',
    tint: '#8b3f45',
    pattern: 'plank',
    motif: 'west wing',
  },
  {
    id: 'hall',
    name: 'Hall',
    label: ['HALL'],
    rect: { row: 1, col: 8, height: 5, width: 8 },
    doors: [cell(3, 7), cell(3, 16), cell(6, 11)],
    tint: '#b08d4f',
    pattern: 'marble',
    motif: 'north entrance',
  },
  {
    id: 'lounge',
    name: 'Lounge',
    label: ['LOUNGE'],
    rect: { row: 1, col: 18, height: 5, width: 5 },
    doors: [cell(6, 20)],
    secretPassage: 'conservatory',
    tint: '#9c6070',
    pattern: 'carpet',
    motif: 'east wing',
  },
  {
    id: 'library',
    name: 'Library',
    label: ['LIBRARY'],
    rect: { row: 7, col: 1, height: 5, width: 5 },
    doors: [cell(6, 3), cell(9, 6)],
    tint: '#3f6b52',
    pattern: 'parquet',
    motif: 'west wing',
  },
  {
    id: 'dining',
    name: 'Dining Room',
    label: ['DINING', 'ROOM'],
    rect: { row: 7, col: 18, height: 5, width: 5 },
    doors: [cell(6, 20), cell(9, 17)],
    tint: '#a8603c',
    pattern: 'inlay',
    motif: 'east wing',
  },
  {
    id: 'billiard',
    name: 'Billiard Room',
    label: ['BILLIARD', 'ROOM'],
    rect: { row: 13, col: 1, height: 5, width: 5 },
    doors: [cell(18, 3), cell(15, 6)],
    tint: '#2f5d4a',
    pattern: 'rug',
    motif: 'west wing',
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    label: ['KITCHEN'],
    rect: { row: 13, col: 18, height: 11, width: 5 },
    doors: [cell(15, 17)],
    secretPassage: 'study',
    tint: '#6f8a90',
    pattern: 'tile',
    motif: 'east wing',
  },
  {
    id: 'conservatory',
    name: 'Conservatory',
    label: ['CONSER-', 'VATORY'],
    rect: { row: 19, col: 1, height: 5, width: 5 },
    doors: [cell(21, 6)],
    secretPassage: 'lounge',
    tint: '#6f8b52',
    pattern: 'glass',
    motif: 'south west',
  },
  {
    id: 'ballroom',
    name: 'Ballroom',
    label: ['BALL', 'ROOM'],
    rect: { row: 19, col: 8, height: 5, width: 8 },
    doors: [cell(18, 10), cell(18, 13)],
    tint: '#5c6b9c',
    pattern: 'checker',
    motif: 'south wing',
  },
];

/** Decorative, unwalkable areas (the central courtyard). */
export const BLOCKED_RECTS: (Rect & { kind: 'courtyard' })[] = [
  { row: 7, col: 8, height: 11, width: 8, kind: 'courtyard' },
];

export const ROOM_IDS = ROOMS.map((r) => r.id);

export const ROOM_BY_ID: Record<RoomId, RoomDef> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
);

export const SECRET_PASSAGES: { from: RoomId; to: RoomId }[] = ROOMS.filter(
  (r) => r.secretPassage,
).map((r) => ({ from: r.id, to: r.secretPassage as RoomId }));

export function roomCardId(roomId: RoomId): string {
  return `room:${roomId}`;
}

export function isCellInRect(row: number, col: number, rect: Rect): boolean {
  return (
    row >= rect.row &&
    row < rect.row + rect.height &&
    col >= rect.col &&
    col < rect.col + rect.width
  );
}
