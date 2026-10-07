import type { BoardGraph, NodeId } from '../types';
import { getBoard, roomNodeId } from './boardGraph';

export interface MoveSearchResult {
  /** node -> squares needed to get there (1..steps) */
  dist: Record<NodeId, number>;
  parent: Record<NodeId, NodeId | null>;
  targets: NodeId[];
  paths: Record<NodeId, NodeId[]>;
}

/**
 * Legal destinations for a move of `steps` squares starting at `from`.
 *
 * Movement rules encoded here (identical for humans and AI):
 *  1. no diagonals — only graph edges may be used;
 *  2. rooms may only be entered through a doorway;
 *  3. a room may never be walked *through* — entering it ends the move;
 *  4. a square may not be entered twice in the same move (no doubling back);
 *  5. the room a player started the turn in may not be re-entered;
 *  6. a player may stop short of the full roll (see "Mansion rule" in How To
 *     Play) — this keeps the board free of dead ends without changing any
 *     deduction rule.
 *
 * Secret passages are deliberately NOT part of a dice move: they are a
 * separate, turn-consuming action.
 */
export function searchMoves(
  graph: BoardGraph,
  from: NodeId,
  steps: number,
): MoveSearchResult {
  const dist: Record<NodeId, number> = { [from]: 0 };
  const parent: Record<NodeId, NodeId | null> = { [from]: null };
  const queue: NodeId[] = [from];
  const targets: NodeId[] = [];

  while (queue.length) {
    const current = queue.shift() as NodeId;
    const d = dist[current];
    if (d >= steps) continue;

    for (const next of graph.nodes[current]?.neighbors ?? []) {
      if (next === from) continue; // rule 5 / no immediate re-entry
      if (dist[next] !== undefined) continue; // rule 4
      const nd = d + 1;
      dist[next] = nd;
      parent[next] = current;
      targets.push(next);
      const node = graph.nodes[next];
      // Rule 3: entering a room ends the move, so rooms are not expanded.
      if (node?.kind === 'corridor') queue.push(next);
    }
  }

  const paths: Record<NodeId, NodeId[]> = {};
  for (const target of targets) {
    const path: NodeId[] = [];
    let cursor: NodeId | null = target;
    while (cursor) {
      path.unshift(cursor);
      cursor = parent[cursor] ?? null;
    }
    paths[target] = path;
  }

  return { dist, parent, targets, paths };
}

export function legalMovesFor(
  graph: BoardGraph,
  from: NodeId,
  steps: number,
): { targets: NodeId[]; paths: Record<NodeId, NodeId[]> } {
  if (steps <= 0) return { targets: [], paths: {} };
  const { targets, paths } = searchMoves(graph, from, steps);
  return { targets, paths };
}

/** Unbounded distance from `from` to `to` (rooms treated as terminal). */
export function distanceTo(graph: BoardGraph, from: NodeId, to: NodeId): number {
  if (from === to) return 0;
  const seen: Record<NodeId, number> = { [from]: 0 };
  const queue: NodeId[] = [from];
  while (queue.length) {
    const current = queue.shift() as NodeId;
    const d = seen[current];
    for (const next of graph.nodes[current]?.neighbors ?? []) {
      if (seen[next] !== undefined) continue;
      if (next === to) return d + 1;
      seen[next] = d + 1;
      if (graph.nodes[next]?.kind === 'corridor') queue.push(next);
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Distance to the nearest doorway of `roomId`, plus which doorway. */
export function routeToRoom(
  graph: BoardGraph,
  from: NodeId,
  roomId: string,
): { distance: number; door: NodeId | null } {
  const target = roomNodeId(roomId);
  if (from === target) return { distance: 0, door: null };
  let best = Number.POSITIVE_INFINITY;
  let bestDoor: NodeId | null = null;
  for (const door of graph.nodes[target]?.neighbors ?? []) {
    const d = distanceTo(graph, from, door);
    if (d < best) {
      best = d;
      bestDoor = door;
    }
  }
  return { distance: best === Number.POSITIVE_INFINITY ? best : best + 1, door: bestDoor };
}

export function board(): BoardGraph {
  return getBoard();
}
