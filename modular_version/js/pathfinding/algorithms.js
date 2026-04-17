import { 
  EMPTY, WALL, START, GOAL, OPEN, CLOSED, PATH, TERRAIN_COST 
} from '../config.js';
import { heuristic, currentHeuristic } from './heuristics.js';

export class MinHeap {
  constructor(comparator = (a, b) => a.f - b.f) {
    this.heap = [];
    this.comparator = comparator;
  }
  push(node) {
    this.heap.push(node);
    this.siftUp();
  }
  pop() {
    if (this.size === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.size > 0) {
      this.heap[0] = bottom;
      this.siftDown();
    }
    return top;
  }
  get size() {
    return this.heap.length;
  }
  siftUp() {
    let i = this.size - 1;
    while (i > 0) {
      let p = (i - 1) >> 1;
      if (this.comparator(this.heap[i], this.heap[p]) < 0) {
        [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
        i = p;
      } else break;
    }
  }
  siftDown() {
    let i = 0;
    while (true) {
      let l = i * 2 + 1,
        r = i * 2 + 2,
        s = i;
      if (l < this.size && this.comparator(this.heap[l], this.heap[s]) < 0)
        s = l;
      if (r < this.size && this.comparator(this.heap[r], this.heap[s]) < 0)
        s = r;
      if (s !== i) {
        [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]];
        i = s;
      } else break;
    }
  }
}

export function getCellTerrainCost(r, c, terrainGrid) {
  const t = terrainGrid[r] && terrainGrid[r][c];
  return TERRAIN_COST[t] || 1.0;
}

export function getNeighbors(node, COLS, ROWS, grid, allowDiagonals, terrainGrid) {
  const res = [];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  if (allowDiagonals) {
    dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  }
  for (const [dr, dc] of dirs) {
    const nr = node.r + dr,
      nc = node.c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] !== WALL) {
      const cost = getCellTerrainCost(nr, nc, terrainGrid);
      // Diagonals cost sqrt(2) or equivalent if using Manhattan? 
      // Actually standard is to use the unit cost * mult
      const stepCost = (dr !== 0 && dc !== 0 ? 1.414 : 1) * cost;
      res.push({ r: nr, c: nc, cost: stepCost });
    }
  }
  return res;
}

export function initSearch(algo, startNode, goalNode, grid, terrainGrid, allowDiagonals, heuristicWeight = 1.0) {
  if (!startNode || !goalNode) return null;
  const h = (node) => heuristic[currentHeuristic](node, goalNode) * heuristicWeight;
  
  if (algo === "bidirectional") {
    // Return custom state for bidir
    return {
      algo,
      forward: {
        openSet: new MinHeap(),
        closed: new Map(),
        parent: new Map(),
        g: new Map(),
      },
      backward: {
        openSet: new MinHeap(),
        closed: new Map(),
        parent: new Map(),
        g: new Map(),
      },
      done: false,
      explored: 0,
      solutionCost: null,
      finalPath: null,
      meetingNode: null,
    };
  }

  const start = { ...startNode, g: 0, f: h(startNode) };
  return {
    algo,
    openSet: algo === "bfs" || algo === "dfs" ? [start] : new MinHeap(),
    closed: new Set(),
    parent: new Map(),
    gScores: new Map([[ `${start.r},${start.c}`, 0 ]]),
    done: false,
    explored: 0,
    solutionCost: null,
    finalPath: null,
    heuristic: h,
  };
}

export function lineOfSight(r1, c1, r2, c2, grid) {
  let dr = Math.abs(r2 - r1),
    dc = Math.abs(c2 - c1);
  let r = r1,
    c = c1;
  let n = 1 + dr + dc;
  let dr2 = dr * 2,
    dc2 = dc * 2;
  let dr_step = r2 > r1 ? 1 : -1;
  let dc_step = c2 > c1 ? 1 : -1;
  let error = dr - dc;

  for (; n > 0; n--) {
    if (grid[r][c] === WALL) return false;
    if (error > 0) {
      r += dr_step;
      error -= dc2;
    } else if (error < 0) {
      c += dc_step;
      error += dr2;
    } else {
      r += dr_step;
      c += dc_step;
      error += dr2 - dc2;
      n--;
    }
  }
  return true;
}

export function jpsJump(r, c, dr, dc, goalNode, grid, COLS, ROWS) {
  const nr = r + dr,
    nc = c + dc;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === WALL)
    return null;
  if (nr === goalNode.r && nc === goalNode.c) return { r: nr, c: nc };

  // Forced neighbors
  if (dr !== 0) {
    if (
      (nc + 1 < COLS &&
        grid[nr][nc + 1] !== WALL &&
        grid[nr - dr][nc + 1] === WALL) ||
      (nc - 1 >= 0 &&
        grid[nr][nc - 1] !== WALL &&
        grid[nr - dr][nc - 1] === WALL)
    ) {
      return { r: nr, c: nc };
    }
  } else {
    if (
      (nr + 1 < ROWS &&
        grid[nr + 1][nc] !== WALL &&
        grid[nr + 1][nc - dc] === WALL) ||
      (nr - 1 >= 0 &&
        grid[nr - 1][nc] !== WALL &&
        grid[nr - 1][nc - dc] === WALL)
    ) {
      return { r: nr, c: nc };
    }
  }
  return jpsJump(nr, nc, dr, dc, goalNode, grid, COLS, ROWS);
}

export function jpsGetSuccessors(node, goalNode, grid, COLS, ROWS) {
  const successors = [];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (const [dr, dc] of dirs) {
    const jumpPoint = jpsJump(node.r, node.c, dr, dc, goalNode, grid, COLS, ROWS);
    if (jumpPoint) {
      const d = Math.abs(jumpPoint.r - node.r) + Math.abs(jumpPoint.c - node.c);
      successors.push({ ...jumpPoint, cost: d });
    }
  }
  return successors;
}

export function reconstructPath(lastNode, parentMap) {
  const path = [];
  let curr = lastNode;
  while (curr) {
    path.push({ r: curr.r, c: curr.c });
    curr = parentMap.get(`${curr.r},${curr.c}`);
  }
  return path.reverse();
}

export function searchStep(
  state,
  grid,
  terrainGrid,
  COLS,
  ROWS,
  allowDiagonals,
  goalNode,
  startNode,
) {
  if (state.done) return;

  if (state.algo === "jps") {
    if (state.openSet.size === 0) {
      state.done = true;
      return;
    }
    const curr = state.openSet.pop();
    const key = `${curr.r},${curr.c}`;
    if (state.closed.has(key)) return;
    state.closed.add(key);
    state.explored++;

    if (curr.r === goalNode.r && curr.c === goalNode.c) {
      state.done = true;
      state.finalPath = reconstructPath(curr, state.parent);
      state.solutionCost = state.gScores.get(key);
      return;
    }

    if (grid[curr.r][curr.c] !== START && grid[curr.r][curr.c] !== GOAL)
      grid[curr.r][curr.c] = CLOSED;

    const successors = jpsGetSuccessors(curr, goalNode, grid, COLS, ROWS);
    for (const s of successors) {
      const g = state.gScores.get(key) + s.cost;
      const sk = `${s.r},${s.c}`;
      if (!state.gScores.has(sk) || g < state.gScores.get(sk)) {
        state.gScores.set(sk, g);
        const snode = { ...s, g, f: g + state.heuristic(s) };
        state.parent.set(sk, curr);
        state.openSet.push(snode);
        if (grid[s.r][s.c] === EMPTY) grid[s.r][s.c] = OPEN;
      }
    }
    return;
  }

  if (state.algo === "thetastar") {
    if (state.openSet.size === 0) {
      state.done = true;
      return;
    }
    const curr = state.openSet.pop();
    const key = `${curr.r},${curr.c}`;
    if (state.closed.has(key)) return;
    state.closed.add(key);
    state.explored++;

    if (curr.r === goalNode.r && curr.c === goalNode.c) {
      state.done = true;
      state.finalPath = reconstructPath(curr, state.parent);
      state.solutionCost = state.gScores.get(key);
      return;
    }

    if (grid[curr.r][curr.c] !== START && grid[curr.r][curr.c] !== GOAL)
      grid[curr.r][curr.c] = CLOSED;

    const neighbors = getNeighbors(
      curr,
      COLS,
      ROWS,
      grid,
      allowDiagonals,
      terrainGrid,
    );
    for (const nb of neighbors) {
      const sk = `${nb.r},${nb.c}`;
      if (state.closed.has(sk)) continue;

      const p = state.parent.get(key);
      if (p && lineOfSight(p.r, p.c, nb.r, nb.c, grid)) {
        const g =
          state.gScores.get(`${p.r},${p.c}`) +
          Math.sqrt((nb.r - p.r) ** 2 + (nb.c - p.c) ** 2) *
            getCellTerrainCost(nb.r, nb.c, terrainGrid);
        if (!state.gScores.has(sk) || g < state.gScores.get(sk)) {
          state.gScores.set(sk, g);
          state.parent.set(sk, p);
          state.openSet.push({ ...nb, g, f: g + state.heuristic(nb) });
        }
      } else {
        const g = state.gScores.get(key) + nb.cost;
        if (!state.gScores.has(sk) || g < state.gScores.get(sk)) {
          state.gScores.set(sk, g);
          state.parent.set(sk, curr);
          state.openSet.push({ ...nb, g, f: g + state.heuristic(nb) });
        }
      }
      if (grid[nb.r][nb.c] === EMPTY) grid[nb.r][nb.c] = OPEN;
    }
    return;
  }

  if (state.algo === "bidirectional") {
    const expand = (s, other) => {
      if (s.openSet.size === 0) return null;
      const curr = s.openSet.pop();
      const key = `${curr.r},${curr.c}`;
      if (s.closed.has(key)) return null;
      s.closed.set(key, curr);
      state.explored++;

      if (other.closed.has(key)) return curr;

      if (grid[curr.r][curr.c] === EMPTY)
        grid[curr.r][curr.c] = s === state.forward ? CLOSED : OPEN;

      const neighbors = getNeighbors(
        curr,
        COLS,
        ROWS,
        grid,
        allowDiagonals,
        terrainGrid,
      );
      for (const nb of neighbors) {
        const nk = `${nb.r},${nb.c}`;
        if (s.closed.has(nk)) continue;
        const g = (s.g.get(key) || 0) + nb.cost;
        if (!s.g.has(nk) || g < s.g.get(nk)) {
          s.g.set(nk, g);
          s.parent.set(nk, curr);
          s.openSet.push({ ...nb, g, f: g + heuristic[currentHeuristic](nb, goalNode) });
        }
      }
      return null;
    };

    let meeting = expand(state.forward, state.backward);
    if (!meeting) meeting = expand(state.backward, state.forward);

    if (meeting) {
      state.done = true;
      state.meetingNode = meeting;
      const mk = `${meeting.r},${meeting.c}`;
      const p1 = reconstructPath(meeting, state.forward.parent);
      const p2 = reconstructPath(meeting, state.backward.parent);
      state.finalPath = [...p1, ...p2.reverse().slice(1)];
      state.solutionCost = state.forward.g.get(mk) + state.backward.g.get(mk);
    }
    if (state.forward.openSet.size === 0 && state.backward.openSet.size === 0) {
      state.done = true;
    }
    return;
  }

  // General case: A*, Dijkstra, Greedy, BFS, DFS
  const isHeap = Array.isArray(state.openSet) === false;
  if ((isHeap && state.openSet.size === 0) || (!isHeap && state.openSet.length === 0)) {
    state.done = true;
    return;
  }

  const curr = isHeap
    ? state.openSet.pop()
    : state.algo === "dfs"
      ? state.openSet.pop()
      : state.openSet.shift();

  const key = `${curr.r},${curr.c}`;
  if (state.closed.has(key)) return;
  state.closed.add(key);
  state.explored++;

  if (curr.r === goalNode.r && curr.c === goalNode.c) {
    state.done = true;
    state.finalPath = reconstructPath(curr, state.parent);
    state.solutionCost = state.gScores.get(key);
    return;
  }

  if (grid[curr.r][curr.c] !== START && grid[curr.r][curr.c] !== GOAL)
    grid[curr.r][curr.c] = CLOSED;

  const neighbors = getNeighbors(
    curr,
    COLS,
    ROWS,
    grid,
    allowDiagonals,
    terrainGrid,
  );
  for (const nb of neighbors) {
    const sk = `${nb.r},${nb.c}`;
    if (state.closed.has(sk)) continue;

    const g = state.gScores.get(key) + nb.cost;
    const isNew = !state.gScores.has(sk);
    const isBetter = isNew || g < state.gScores.get(sk);

    if (isBetter) {
      state.gScores.set(sk, g);
      state.parent.set(sk, curr);
      const hVal =
        state.algo === "dijkstra" || state.algo === "bfs"
          ? 0
          : state.heuristic(nb);
      const fVal = state.algo === "greedy" ? hVal : g + hVal;

      const node = { ...nb, g, f: fVal };
      if (isHeap) state.openSet.push(node);
      else state.openSet.push(node);

      if (grid[nb.r][nb.c] === EMPTY) grid[nb.r][nb.c] = OPEN;
    }
  }
}

