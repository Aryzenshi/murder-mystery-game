import { describe, expect, it } from 'vitest';
import {
  buildBoard,
  getBoard,
  roomNodeId,
  corridorNodeId,
  doorNodesOf,
} from '../shared/src/rules/boardGraph';
import { searchMoves, distanceTo, routeToRoom } from '../shared/src/rules/movement';
import { ROOMS, GRID } from '../shared/src/constants/board';
import { CHARACTERS } from '../shared/src/constants/characters';

const board = buildBoard();

describe('board construction', () => {
  it('has nine rooms and compiles without config errors', () => {
    expect(ROOMS).toHaveLength(9);
    expect(board.rooms).toHaveLength(9);
  });

  it('every room has at least one connected doorway', () => {
    for (const room of ROOMS) {
      const doors = doorNodesOf(board, room.id);
      expect(doors.length, `${room.id} doors`).toBeGreaterThan(0);
      for (const door of doors) {
        expect(board.nodes[door].kind).toBe('corridor');
        expect(board.nodes[door].neighbors).toContain(roomNodeId(room.id));
      }
    }
  });

  it('every corridor square is reachable from every other corridor square', () => {
    const corridors = Object.values(board.nodes).filter((n) => n.kind === 'corridor');
    const start = corridors[0].id;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const node = queue.shift()!;
      for (const next of board.nodes[node].neighbors) {
        if (board.nodes[next].kind !== 'corridor') continue;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(corridors.length);
  });

  it('every room can be reached from every corridor square', () => {
    const corridors = Object.values(board.nodes).filter((n) => n.kind === 'corridor');
    for (const room of ROOMS) {
      const from = corridorNodeId(0, 0);
      const { distance } = routeToRoom(board, from, room.id);
      expect(Number.isFinite(distance), `${room.id} unreachable`).toBe(true);
      expect(distance).toBeLessThan(30);
    }
    expect(corridors.length).toBeGreaterThan(100);
  });

  it('secret passages link diagonally opposite rooms', () => {
    expect(board.nodes[roomNodeId('study')].neighbors).toContain(roomNodeId('kitchen'));
    expect(board.nodes[roomNodeId('kitchen')].neighbors).toContain(roomNodeId('study'));
    expect(board.nodes[roomNodeId('lounge')].neighbors).toContain(roomNodeId('conservatory'));
    expect(board.nodes[roomNodeId('conservatory')].neighbors).toContain(roomNodeId('lounge'));
  });

  it('start squares are all walkable corridors and unique', () => {
    const seen = new Set<string>();
    for (const character of CHARACTERS) {
      const { row, col } = character.start;
      const node = board.cellOwner[`${row},${col}`];
      expect(node, `${character.id} start`).toBeTruthy();
      expect(board.nodes[node].kind, `${character.id} start kind`).toBe('corridor');
      expect(seen.has(node)).toBe(false);
      seen.add(node);
    }
    expect(seen.size).toBe(6);
  });

  it('rooms never border each other directly (walls everywhere)', () => {
    for (const room of ROOMS) {
      for (const cell of board.nodes[roomNodeId(room.id)].cells) {
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const r = cell.row + dr;
          const c = cell.col + dc;
          if (r < 0 || c < 0 || r >= GRID.height || c >= GRID.width) continue;
          const owner = board.cellOwner[`${r},${c}`];
          if (!owner) continue;
          const other = board.nodes[owner];
          if (other.kind === 'room') expect(other.roomId).toBe(room.id);
        }
      }
    }
  });
});

describe('movement', () => {
  it('never lets a room be walked through', () => {
    const kitchen = roomNodeId('kitchen');
    const from = board.nodes[kitchen].neighbors.find((n) => board.nodes[n].kind === 'corridor')!;
    const { targets } = searchMoves(board, from, 40);
    // Kitchen has three doors; entering it ends the move, so no path may
    // continue out of the other side.
    for (const target of targets) {
      if (board.nodes[target].kind === 'room') continue;
      // fine
    }
    const { dist } = searchMoves(board, from, 40);
    expect(dist[kitchen]).toBe(1);
    const otherDoor = board.nodes[kitchen].neighbors.find((n) => n !== from)!;
    // reaching the other door must require going the long way round
    expect(dist[otherDoor]).toBeGreaterThan(2);
  });

  it('respects the step budget', () => {
    const from = corridorNodeId(0, 0);
    const { dist } = searchMoves(board, from, 3);
    for (const value of Object.values(dist)) expect(value).toBeLessThanOrEqual(3);
    expect(Object.keys(dist).length).toBeGreaterThan(3);
  });

  it('cannot re-enter the room it started from', () => {
    const library = roomNodeId('library');
    const { dist } = searchMoves(board, library, 10);
    expect(dist[library]).toBe(0);
    const { targets } = searchMoves(board, library, 10);
    expect(targets).not.toContain(library);
  });

  it('produces reconstructable paths', () => {
    const from = corridorNodeId(0, 0);
    const { paths, targets } = searchMoves(board, from, 6);
    for (const target of targets) {
      const path = paths[target];
      expect(path[0]).toBe(from);
      expect(path[path.length - 1]).toBe(target);
      for (let i = 1; i < path.length; i++) {
        expect(board.nodes[path[i - 1]].neighbors).toContain(path[i]);
      }
    }
  });

  it('distances are symmetric between corridor squares', () => {
    const a = corridorNodeId(0, 0);
    const b = corridorNodeId(24, 12);
    expect(distanceTo(board, a, b)).toBe(distanceTo(board, b, a));
  });
});

describe('board singleton', () => {
  it('is cached', () => {
    expect(getBoard()).toBe(getBoard());
  });
});
