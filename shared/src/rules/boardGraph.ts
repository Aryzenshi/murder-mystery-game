import type { BoardGraph, BoardNode, Cell, NodeId, RoomId } from '../types';
import { BLOCKED_RECTS, GRID, ROOMS, isCellInRect } from '../constants/board';

export const key = (row: number, col: number) => `${row},${col}`;
export const roomNodeId = (roomId: RoomId) => `r:${roomId}`;
export const corridorNodeId = (row: number, col: number) => `c:${row},${col}`;

export function parseCell(nodeId: NodeId): Cell {
  const [row, col] = nodeId.slice(2).split(',').map(Number);
  return { row, col };
}

export function nodeRoomId(nodeId: NodeId): RoomId | null {
  return nodeId.startsWith('r:') ? nodeId.slice(2) : null;
}

function roomAt(row: number, col: number) {
  return ROOMS.find((r) => isCellInRect(row, col, r.rect)) ?? null;
}

function isBlocked(row: number, col: number) {
  return BLOCKED_RECTS.some((b) => isCellInRect(row, col, b));
}

function centreOf(cells: Cell[]): Cell {
  let r = 0;
  let c = 0;
  for (const cell of cells) {
    r += cell.row;
    c += cell.col;
  }
  return { row: Math.round(r / cells.length), col: Math.round(c / cells.length) };
}

/**
 * Compiles the authored rectangles into a movement graph.
 *
 *  - every walkable corridor square is its own node
 *  - every room is a single node covering its whole footprint
 *  - a corridor square becomes a doorway into a room when it is declared in
 *    that room's `doors` list and physically touches the room
 *  - secret passages are extra room <-> room edges
 */
export function buildBoard(): BoardGraph {
  const walkable: boolean[][] = [];
  const cellOwner: Record<string, NodeId> = {};
  const nodes: Record<NodeId, BoardNode> = {};

  for (let row = 0; row < GRID.height; row++) {
    walkable[row] = [];
    for (let col = 0; col < GRID.width; col++) {
      walkable[row][col] = !isBlocked(row, col);
    }
  }

  // Rooms first: they claim their footprint.
  for (const room of ROOMS) {
    const cells: Cell[] = [];
    for (let row = room.rect.row; row < room.rect.row + room.rect.height; row++) {
      for (let col = room.rect.col; col < room.rect.col + room.rect.width; col++) {
        if (isBlocked(row, col)) {
          throw new Error(`Room ${room.id} overlaps a blocked region at ${row},${col}`);
        }
        cells.push({ row, col });
        cellOwner[key(row, col)] = roomNodeId(room.id);
      }
    }
    const id = roomNodeId(room.id);
    nodes[id] = {
      id,
      kind: 'room',
      cells,
      anchor: centreOf(cells),
      roomId: room.id,
      neighbors: [],
      doors: room.doors,
      secretPassage: room.secretPassage,
    };
  }

  // Corridor squares.
  for (let row = 0; row < GRID.height; row++) {
    for (let col = 0; col < GRID.width; col++) {
      if (!walkable[row][col]) continue;
      if (cellOwner[key(row, col)]) continue; // inside a room
      const id = corridorNodeId(row, col);
      nodes[id] = {
        id,
        kind: 'corridor',
        cells: [{ row, col }],
        anchor: { row, col },
        neighbors: [],
        doors: [],
      };
      cellOwner[key(row, col)] = id;
    }
  }

  const link = (a: NodeId, b: NodeId) => {
    if (!nodes[a] || !nodes[b]) return;
    if (!nodes[a].neighbors.includes(b)) nodes[a].neighbors.push(b);
    if (!nodes[b].neighbors.includes(a)) nodes[b].neighbors.push(a);
  };

  // Corridor <-> corridor.
  for (const node of Object.values(nodes)) {
    if (node.kind !== 'corridor') continue;
    const { row, col } = node.cells[0];
    const dirs = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];
    for (const [r, c] of dirs) {
      if (r < 0 || c < 0 || r >= GRID.height || c >= GRID.width) continue;
      const other = cellOwner[key(r, c)];
      if (other && nodes[other]?.kind === 'corridor') link(node.id, other);
    }
  }

  // Corridor <-> room (doors only).
  for (const room of ROOMS) {
    const rid = roomNodeId(room.id);
    for (const door of room.doors) {
      const owner = cellOwner[key(door.row, door.col)];
      if (!owner) {
        throw new Error(
          `Door for room ${room.id} at ${door.row},${door.col} is not a walkable square`,
        );
      }
      if (nodes[owner].kind !== 'corridor') {
        throw new Error(
          `Door for room ${room.id} at ${door.row},${door.col} is not on a corridor square`,
        );
      }
      const touches = [
        [door.row - 1, door.col],
        [door.row + 1, door.col],
        [door.row, door.col - 1],
        [door.row, door.col + 1],
      ].some(([r, c]) => cellOwner[key(r, c)] === rid);
      if (!touches) {
        throw new Error(`Door at ${door.row},${door.col} does not touch room ${room.id}`);
      }
      link(rid, owner);
    }
  }

  // Room <-> room (secret passages).
  for (const room of ROOMS) {
    if (!room.secretPassage) continue;
    const target = roomNodeId(room.secretPassage);
    if (nodes[target]) link(roomNodeId(room.id), target);
  }

  return {
    width: GRID.width,
    height: GRID.height,
    nodes,
    cellOwner,
    walkable,
    rooms: ROOMS.map((r) => r.id),
  };
}

let cached: BoardGraph | null = null;
export function getBoard(): BoardGraph {
  if (!cached) cached = buildBoard();
  return cached;
}

export function nodeAt(graph: BoardGraph, cell: Cell): NodeId | null {
  return graph.cellOwner[key(cell.row, cell.col)] ?? null;
}

export function nodeById(graph: BoardGraph, id: NodeId): BoardNode | undefined {
  return graph.nodes[id];
}

/** All corridor doorway nodes that lead into a room. */
export function doorNodesOf(graph: BoardGraph, roomId: RoomId): NodeId[] {
  const room = graph.nodes[roomNodeId(roomId)];
  if (!room) return [];
  return room.neighbors.filter((n) => graph.nodes[n]?.kind === 'corridor');
}

export function isSameNode(a: NodeId | null, b: NodeId | null): boolean {
  return !!a && !!b && a === b;
}
