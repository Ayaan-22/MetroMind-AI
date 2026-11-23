import { EMPTY, WALL, START, GOAL, OPEN, CLOSED, TERRAIN_COST } from '../config.js';

const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
const equal = (a, b) => a === b || Math.abs(a - b) < 1e-9;
const MIN_COST = Math.min(1, ...Object.values(TERRAIN_COST));

// Indexed heap: one entry per inconsistent vertex, ordered by BOTH key values.
class KeyQueue {
  heap = [];
  positions = new Map();
  get size() { return this.heap.length; }
  peek() { return this.heap[0]; }
  swap(a, b) {
    [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]];
    this.positions.set(this.heap[a].node.key, a);
    this.positions.set(this.heap[b].node.key, b);
  }
  up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(this.heap[i].priority, this.heap[p].priority)) break;
      this.swap(i, p);
      i = p;
    }
    return i;
  }
  down(i) {
    while (true) {
      let m = i;
      for (const c of [2 * i + 1, 2 * i + 2]) {
        if (c < this.size && less(this.heap[c].priority, this.heap[m].priority)) m = c;
      }
      if (m === i) return;
      this.swap(i, m);
      i = m;
    }
  }
  remove(key) {
    const i = this.positions.get(key);
    if (i === undefined) return;
    const last = this.heap.pop();
    this.positions.delete(key);
    if (i < this.size) {
      this.heap[i] = last;
      this.positions.set(last.node.key, i);
      this.down(this.up(i));
    }
  }
  push(node, priority) {
    this.remove(node.key);
    this.positions.set(node.key, this.size);
    this.heap.push({ node, priority });
    this.up(this.size - 1);
  }
  pop() {
    const first = this.peek();
    if (first) this.remove(first.node.key);
    return first;
  }
}

// Backward incremental search (Koenig & Likhachev, D* Lite, Figure 3).
// https://idm-lab.org/bib/abstracts/Koen02e.html
export class DStarLite {
  constructor(start, goal, grid, terrainGrid, allowDiagonals) {
    this.algo = 'dstarlite';
    this.sn = { ...start };
    this.gn = { ...goal };
    this.gr = grid;
    this.terrainGrid = terrainGrid;
    this.rows = grid.length;
    this.cols = grid[0].length;
    this.allowDiagonals = allowDiagonals;
    this.km = 0;
    this.nodeMap = {};
    this.openSet = new KeyQueue();
    this.closed = new Set();
    this.explored = 0;
    this.replans = 0;
    this.invalidate();
    const target = this.node(goal.r, goal.c);
    target.rhs = 0;
    this.updateVertex(target);
  }

  node(r, c) {
    const key = `${r},${c}`;
    return this.nodeMap[key] ||= { r, c, key, g: Infinity, rhs: Infinity, f: Infinity };
  }

  heuristic(a, b) {
    const dr = Math.abs(a.r - b.r), dc = Math.abs(a.c - b.c);
    // Consistent even on highways and with diagonals; independent of weighted A* controls.
    return MIN_COST * (this.allowDiagonals
      ? Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc)
      : dr + dc);
  }

  calculateKey(node) {
    const value = Math.min(node.g, node.rhs);
    return [value + this.heuristic(this.sn, node) + this.km, value];
  }

  adjacent(node) {
    const nodes = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((!dr && !dc) || (!this.allowDiagonals && dr && dc)) continue;
        const r = node.r + dr, c = node.c + dc;
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) nodes.push(this.node(r, c));
      }
    }
    return nodes;
  }

  cost(from, to) {
    if (this.gr[from.r][from.c] === WALL || this.gr[to.r][to.c] === WALL) return Infinity;
    // Match the existing grid: terrain is charged on entry, diagonal corner crossing is allowed.
    const distance = from.r !== to.r && from.c !== to.c ? Math.SQRT2 : 1;
    return distance * (TERRAIN_COST[this.terrainGrid[to.r]?.[to.c]] || 1);
  }

  paint(node, value) {
    const cell = this.gr[node.r][node.c];
    if (cell !== WALL && cell !== START && cell !== GOAL) this.gr[node.r][node.c] = value;
  }

  updateVertex(node) {
    if (node.r !== this.gn.r || node.c !== this.gn.c) {
      node.rhs = Math.min(...this.adjacent(node).map(next => this.cost(node, next) + next.g));
    }
    this.openSet.remove(node.key);
    const priority = this.calculateKey(node);
    node.f = priority[0];
    if (!equal(node.g, node.rhs)) {
      this.openSet.push(node, priority);
      this.paint(node, OPEN);
    } else {
      this.paint(node, this.closed.has(node.key) ? CLOSED : EMPTY);
    }
  }

  invalidate() {
    this.done = false;
    this.finalPath = null;
    this.livePath = null;
    this.solutionCost = undefined;
  }

  // Call AFTER applying a batch of obstacle/terrain edits to the shared grid.
  updateCells(cells) {
    const affected = new Set();
    for (const { r, c } of cells) {
      const node = this.node(r, c);
      affected.add(node);
      // Update every incoming AND outgoing edge (terrain costs are directed).
      for (const neighbor of this.adjacent(node)) affected.add(neighbor);
    }
    if (!affected.size) return;
    this.invalidate();
    this.replans++;
    for (const node of affected) this.updateVertex(node);
  }

  moveStart(start) {
    this.km += this.heuristic(this.sn, start);
    this.sn = { ...start };
    this.invalidate();
  }

  needsRepair() {
    const start = this.node(this.sn.r, this.sn.c);
    const top = this.openSet.peek()?.priority || [Infinity, Infinity];
    return less(top, this.calculateKey(start)) || !equal(start.g, start.rhs);
  }

  // One queue expansion per animation step; never run a blocking search loop in the UI.
  step() {
    if (this.done) return;
    if (this.needsRepair() && this.openSet.size) {
      const { node, priority } = this.openSet.pop();
      const nextKey = this.calculateKey(node);
      if (less(priority, nextKey)) {
        this.openSet.push(node, nextKey);
      } else {
        if (node.g > node.rhs) {
          node.g = node.rhs;
        } else {
          node.g = Infinity;
          this.updateVertex(node);
        }
        this.closed.add(node.key);
        this.explored++;
        this.paint(node, equal(node.g, node.rhs) ? CLOSED : OPEN);
        for (const predecessor of this.adjacent(node)) this.updateVertex(predecessor);
      }
    }
    if (!this.needsRepair()) this.finish();
  }

  finish() {
    this.done = true;
    let current = this.node(this.sn.r, this.sn.c);
    if (!Number.isFinite(current.g) || this.gr[current.r][current.c] === WALL) return;
    const path = [{ ...this.sn }], seen = new Set([current.key]);
    let cost = 0;
    while (current.r !== this.gn.r || current.c !== this.gn.c) {
      let best = null, bestValue = Infinity;
      for (const next of this.adjacent(current)) {
        const value = this.cost(current, next) + next.g;
        if (value < bestValue) { bestValue = value; best = next; }
      }
      // Defensive guard: never publish a cyclic or incomplete route.
      if (!best || seen.has(best.key)) return;
      seen.add(best.key);
      cost += this.cost(current, best);
      path.push({ r: best.r, c: best.c });
      current = best;
    }
    this.finalPath = path;
    this.solutionCost = cost;
  }
}
