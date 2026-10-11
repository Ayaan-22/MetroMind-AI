import { 
  EMPTY, WALL, START, GOAL, OPEN, CLOSED, PATH, TERRAIN_COST 
} from '../config.js';
import { heuristic as heuristicFunc } from './heuristics.js';

// ═══════════════════════════════════════════════════════
// MIN HEAP
// ═══════════════════════════════════════════════════════
export class MinHeap {
  constructor() {
    this.heap = [];
  }
  push(n) {
    this.heap.push(n);
    this._up(this.heap.length - 1);
  }
  pop() {
    const t = this.heap[0],
      l = this.heap.pop();
    if (this.heap.length) {
      this.heap[0] = l;
      this._down(0);
    }
    return t;
  }
  peek() {
    return this.heap[0];
  }
  get size() {
    return this.heap.length;
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p].f <= this.heap[i].f) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }
  _down(i) {
    const n = this.heap.length;
    while (true) {
      let m = i,
        l = 2 * i + 1,
        r = 2 * i + 2;
      if (l < n && this.heap[l].f < this.heap[m].f) m = l;
      if (r < n && this.heap[r].f < this.heap[m].f) m = r;
      if (m === i) break;
      [this.heap[m], this.heap[i]] = [this.heap[i], this.heap[m]];
      i = m;
    }
  }
}

export function getCellTerrainCost(r, c, ROWS, COLS, terrainGrid) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 1.0;
  const t = terrainGrid[r] && terrainGrid[r][c];
  return TERRAIN_COST[t] || 1.0;
}

export function getNeighbors(r, c, ROWS, COLS, grid, terrainGrid, allowDiagonals) {
  let dirs = [
    { dr: -1, dc: 0, cost: 1 },
    { dr: 1, dc: 0, cost: 1 },
    { dr: 0, dc: -1, cost: 1 },
    { dr: 0, dc: 1, cost: 1 },
  ];
  if (allowDiagonals)
    dirs.push(
      { dr: -1, dc: -1, cost: Math.SQRT2 },
      { dr: -1, dc: 1, cost: Math.SQRT2 },
      { dr: 1, dc: -1, cost: Math.SQRT2 },
      { dr: 1, dc: 1, cost: Math.SQRT2 },
    );
  return dirs
    .map((d) => {
      const nr = r + d.dr,
        nc = c + d.dc;
      const terrain = getCellTerrainCost(nr, nc, ROWS, COLS, terrainGrid);
      return { r: nr, c: nc, cost: d.cost * terrain };
    })
    .filter(
      (n) =>
        n.r >= 0 &&
        n.r < ROWS &&
        n.c >= 0 &&
        n.c < COLS &&
        grid[n.r][n.c] !== WALL,
    );
}

export function initSearch(algo, sn, gn, grid, terrainGrid, allowDiagonals, heuristicWeight = 1.0) {
  if (!sn || !gn) return null;
  
  const openSet = new MinHeap(),
    nodeMap = {},
    closed = new Set(),
    cameFrom = {};
  const sk = `${sn.r},${sn.c}`;
  const h0 = heuristicFunc(sn, gn);
  let f0;
  if (algo === "dijkstra" || algo === "bfs") f0 = 0;
  else if (algo === "greedy") f0 = h0 * heuristicWeight;
  else f0 = h0 * heuristicWeight;
  
  openSet.push({ r: sn.r, c: sn.c, g: 0, h: h0, f: f0, key: sk });
  nodeMap[sk] = { r: sn.r, c: sn.c, g: 0, h: h0, f: f0, key: sk };

  // bidirectional extra state
  let bOpenSet = null,
    bNodeMap = null,
    bClosed = null,
    bCameFrom = null;
  if (algo === "bidirectional") {
    bOpenSet = new MinHeap();
    bNodeMap = {};
    bClosed = new Set();
    bCameFrom = {};
    const gk = `${gn.r},${gn.c}`;
    const hg = heuristicFunc(gn, sn) * heuristicWeight;
    bOpenSet.push({ r: gn.r, c: gn.c, g: 0, h: hg, f: hg, key: gk });
    bNodeMap[gk] = { r: gn.r, c: gn.c, g: 0, h: hg, f: hg, key: gk };
  }

  return {
    openSet: (algo === "bfs" || algo === "dfs") ? [nodeMap[sk]] : openSet,
    nodeMap,
    closed,
    cameFrom,
    explored: 0,
    finalPath: null,
    livePath: null,
    done: false,
    bfsCounter: 1,
    bOpenSet,
    bNodeMap,
    bClosed: bClosed || new Set(),
    bCameFrom: bCameFrom || {},
    bTurn: false,
    algo,
    sn,
    gn,
    gr: grid,
    parentMap: {},
    losParent: {},
  };
}

export function jpsJump(r, c, dr, dc, goalR, goalC, grid, ROWS, COLS) {
  let x = r + dr,
    y = c + dc;
  while (true) {
    if (
      x < 0 ||
      x >= ROWS ||
      y < 0 ||
      y >= COLS ||
      grid[x][y] === WALL
    )
      return null;
    if (x === goalR && y === goalC) return { r: x, c: y };
    if (dr === 0) {
      const aboveBlocked = x > 0 && grid[x - 1][y] === WALL;
      const aboveBehindFree = x > 0 && grid[x - 1][y - dc] !== WALL;
      const belowBlocked = x < ROWS - 1 && grid[x + 1][y] === WALL;
      const belowBehindFree = x < ROWS - 1 && grid[x + 1][y - dc] !== WALL;
      if (
        (aboveBlocked && aboveBehindFree) ||
        (belowBlocked && belowBehindFree)
      )
        return { r: x, c: y };
    } else {
      const leftBlocked = y > 0 && grid[x][y - 1] === WALL;
      const leftBehindFree = y > 0 && grid[x - dr][y - 1] !== WALL;
      const rightBlocked = y < COLS - 1 && grid[x][y + 1] === WALL;
      const rightBehindFree = y < COLS - 1 && grid[x - dr][y + 1] !== WALL;
      if (
        (leftBlocked && leftBehindFree) ||
        (rightBlocked && rightBehindFree)
      )
        return { r: x, c: y };
      if (
        jpsJump(x, y, 0, 1, goalR, goalC, grid, ROWS, COLS) !== null ||
        jpsJump(x, y, 0, -1, goalR, goalC, grid, ROWS, COLS) !== null
      )
        return { r: x, c: y };
    }
    x += dr;
    y += dc;
  }
}

export function jpsGetSuccessors(r, c, pr, pc, goalR, goalC, grid, ROWS, COLS) {
  const successors = [];
  let dr = 0,
    dc = 0;
  const hasParent = pr !== undefined && pr !== null;
  if (hasParent) {
    dr = r > pr ? 1 : r < pr ? -1 : 0;
    dc = c > pc ? 1 : c < pc ? -1 : 0;
  }
  const dirs = hasParent
    ? dr !== 0
      ? [
          [dr, 0],
          [0, 1],
          [0, -1],
        ]
      : [
          [0, dc],
          [-1, 0],
          [1, 0],
        ]
    : [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
  for (const [dd, ddc] of dirs) {
    const jp = jpsJump(r, c, dd, ddc, goalR, goalC, grid, ROWS, COLS);
    if (jp) {
      const dist = Math.abs(jp.r - r) + Math.abs(jp.c - c);
      successors.push({ ...jp, dist });
    }
  }
  return successors;
}

export function lineOfSight(r0, c0, r1, c1, grid, ROWS, COLS) {
  let x0 = r0,
    y0 = c0,
    x1 = r1,
    y1 = c1;
  const dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (x0 !== x1 || y0 !== y1) {
    if (grid[x0][y0] === WALL) return false;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return grid[x1][y1] !== WALL;
}

export function reconstructPath(cameFrom, endKey) {
  const path = [];
  let k = endKey;
  while (k) {
    const [pr, pc] = k.split(",");
    path.unshift({ r: +pr, c: +pc });
    k = cameFrom[k];
  }
  return path;
}

export function markJumpLine(r0, c0, r1, c1, state, value) {
  const dr = Math.sign(r1 - r0),
    dc = Math.sign(c1 - c0);
  let r = r0 + dr,
    c = c0 + dc;
  while (r !== r1 || c !== c1) {
    if (state.gr[r][c] !== START && state.gr[r][c] !== GOAL)
      state.gr[r][c] = value;
    r += dr;
    c += dc;
  }
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
  heuristicWeight,
  currentHeuristic,
  logEntry,
  setStatus,
  showToast,
  onDone,
) {
  const { algo, gn, gr } = state;
  const paintGrid = gr === grid;
  const offscreen = gr !== grid;

  // ── JPS ──
  if (algo === "jps") {
    if (state.done || state.openSet.size === 0) {
      if (!state.done) {
        if (!offscreen) {
          logEntry("warn", "⚠ No path found (JPS)");
          setStatus("error", "No path found");
        }
        if (onDone) onDone(null, state);
      }
      state.done = true;
      return;
    }
    const cur = state.openSet.pop(),
      key = cur.key;
    if (state.closed.has(key)) return;
    state.closed.add(key);
    if (gr[cur.r][cur.c] !== START && gr[cur.r][cur.c] !== GOAL)
      gr[cur.r][cur.c] = CLOSED;
    state.explored++;

    if (cur.r === gn.r && cur.c === gn.c) {
      const path = reconstructPath(state.cameFrom, key);
      state.finalPath = path.slice();
      state.solutionCost = Math.round(cur.g);
      if (!offscreen) {
        logEntry("success", `✓ JPS path! ${path.length} steps, cost ${Math.round(cur.g)}`);
        setStatus("done", `Path found — ${path.length} steps · cost ${Math.round(cur.g)}`);
        showToast(`✓ JPS: ${path.length} steps, ${state.explored} nodes explored`, "success");
      }
      if (onDone) onDone(path, state);
      state.done = true;
      return;
    }
    const parentKey = state.cameFrom[key];
    let pr = undefined, pc = undefined;
    if (parentKey) {
      const [a, b] = parentKey.split(",");
      pr = +a; pc = +b;
    }
    const succs = jpsGetSuccessors(cur.r, cur.c, pr, pc, gn.r, gn.c, gr, ROWS, COLS);
    for (const suc of succs) {
      const nbKey = `${suc.r},${suc.c}`;
      if (state.closed.has(nbKey)) continue;
      const tg = cur.g + suc.dist;
      const h = heuristicFunc(suc, gn) * heuristicWeight;
      const ex = state.nodeMap[nbKey];
      if (!ex || tg < ex.g) {
        const f = tg + h;
        const nd = { r: suc.r, c: suc.c, g: tg, h, f, key: nbKey };
        state.nodeMap[nbKey] = nd;
        state.cameFrom[nbKey] = key;
        state.openSet.push(nd);
        if (paintGrid) markJumpLine(cur.r, cur.c, suc.r, suc.c, state, CLOSED);
        if (gr[suc.r][suc.c] !== START && gr[suc.r][suc.c] !== GOAL)
          gr[suc.r][suc.c] = OPEN;
      }
    }
    return;
  }

  // ── THETA* ──
  if (algo === "thetastar") {
    if (state.done || state.openSet.size === 0) {
      if (!state.done) {
        if (!offscreen) {
          logEntry("warn", "⚠ No path (Theta*)");
          setStatus("error", "No path found");
        }
        if (onDone) onDone(null, state);
      }
      state.done = true;
      return;
    }
    const cur = state.openSet.pop(),
      key = cur.key;
    if (state.closed.has(key)) return;
    state.closed.add(key);
    if (gr[cur.r][cur.c] !== START && gr[cur.r][cur.c] !== GOAL)
      gr[cur.r][cur.c] = CLOSED;
    state.explored++;

    if (cur.r === gn.r && cur.c === gn.c) {
      const path = reconstructPath(state.cameFrom, key);
      state.finalPath = path.slice();
      state.solutionCost = Math.round(cur.g);
      if (!offscreen) {
        logEntry("success", `✓ Theta* path! ${path.length} steps, cost ${Math.round(cur.g)}`);
        setStatus("done", `Path found — ${path.length} steps · cost ${Math.round(cur.g)}`);
        showToast(`✓ Theta*: ${path.length} steps (any-angle)`, "success");
      }
      if (onDone) onDone(path, state);
      state.done = true;
      return;
    }
    for (const nb of getNeighbors(cur.r, cur.c, ROWS, COLS, gr, terrainGrid, allowDiagonals)) {
      const nbKey = `${nb.r},${nb.c}`;
      if (state.closed.has(nbKey)) continue;
      const h = heuristicFunc(nb, gn) * heuristicWeight;
      const parentKey = state.cameFrom[key];
      let gpR = cur.r, gpC = cur.c, gpG = cur.g;
      if (parentKey) {
        const [a, b] = parentKey.split(",");
        gpR = +a; gpC = +b;
        const gpNd = state.nodeMap[parentKey];
        if (gpNd) gpG = gpNd.g;
      }
      let tg, cameFromKey;
      if (parentKey && lineOfSight(gpR, gpC, nb.r, nb.c, gr, ROWS, COLS)) {
        const dist = Math.sqrt((nb.r - gpR) ** 2 + (nb.c - gpC) ** 2);
        tg = gpG + dist;
        cameFromKey = parentKey;
      } else {
        tg = cur.g + nb.cost;
        cameFromKey = key;
      }
      const ex = state.nodeMap[nbKey];
      if (!ex || tg < ex.g) {
        const f = tg + h;
        const nd = { r: nb.r, c: nb.c, g: tg, h, f, key: nbKey };
        state.nodeMap[nbKey] = nd;
        state.cameFrom[nbKey] = cameFromKey;
        state.openSet.push(nd);
        if (gr[nb.r][nb.c] !== START && gr[nb.r][nb.c] !== GOAL)
          gr[nb.r][nb.c] = OPEN;
      }
    }
    return;
  }

  // ── BIDIRECTIONAL A* ──
  if (algo === "bidirectional") {
    if (state.done) return;
    const noFwd = state.openSet.size === 0,
      noBwd = state.bOpenSet.size === 0;
    if (noFwd && noBwd) {
      state.done = true;
      if (onDone) onDone(null, state);
      return;
    }
    state.bTurn = !state.bTurn;
    const fwd = !state.bTurn;
    const activeSet = fwd ? state.openSet : state.bOpenSet;
    const activeCF = fwd ? state.cameFrom : state.bCameFrom;
    const activeClosed = fwd ? state.closed : state.bClosed;
    const otherClosed = fwd ? state.bClosed : state.closed;
    const otherCF = fwd ? state.bCameFrom : state.cameFrom;
    const nodeTarget = fwd ? gn : state.sn;
    if (activeSet.size === 0) return;
    const cur = activeSet.pop(),
      key = cur.key;
    if (activeClosed.has(key)) return;
    activeClosed.add(key);
    if (gr[cur.r][cur.c] !== START && gr[cur.r][cur.c] !== GOAL)
      gr[cur.r][cur.c] = CLOSED;
    state.explored++;

    if (otherClosed.has(key)) {
      const fwdPath = reconstructPath(fwd ? activeCF : otherCF, key);
      const bwdPath = reconstructPath(fwd ? otherCF : activeCF, key);
      bwdPath.reverse();
      const path = [...fwdPath, ...bwdPath.slice(1)];
      state.finalPath = path.slice();
      state.solutionCost = Math.round(cur.g);
      state.done = true;
      if (!offscreen) {
        logEntry("success", `✓ Bidir path! ${path.length} steps, cost ${state.solutionCost}`);
        setStatus("done", `Path found — ${path.length} steps · cost ${state.solutionCost}`);
        showToast(`✓ Path: ${path.length} steps, explored ${state.explored} nodes`, "success");
      }
      if (onDone) onDone(path, state);
      return;
    }
    for (const nb of getNeighbors(cur.r, cur.c, ROWS, COLS, gr, terrainGrid, allowDiagonals)) {
      const nbKey = `${nb.r},${nb.c}`;
      if (activeClosed.has(nbKey)) continue;
      const tg = cur.g + nb.cost;
      const h = heuristicFunc(nb, nodeTarget) * heuristicWeight;
      const nodeStore = fwd ? state.nodeMap : state.bNodeMap;
      const ex = nodeStore[nbKey];
      if (!ex || tg < ex.g) {
        const f = tg + h;
        const nd = { r: nb.r, c: nb.c, g: tg, h, f, key: nbKey };
        nodeStore[nbKey] = nd;
        activeCF[nbKey] = key;
        activeSet.push(nd);
        if (gr[nb.r][nb.c] !== START && gr[nb.r][nb.c] !== GOAL)
          gr[nb.r][nb.c] = OPEN;
      }
    }
    return;
  }

  // ── General case: A*, Dijkstra, Greedy, BFS, DFS ──
  if (state.done || (Array.isArray(state.openSet) ? state.openSet.length === 0 : state.openSet.size === 0)) {
    state.done = true;
    if (onDone) onDone(null, state);
    return;
  }
  const cur = Array.isArray(state.openSet) 
    ? (algo === "dfs" ? state.openSet.pop() : state.openSet.shift())
    : state.openSet.pop();
  const key = cur.key;
  if (state.closed.has(key)) return;
  state.closed.add(key);
  if (gr[cur.r][cur.c] !== START && gr[cur.r][cur.c] !== GOAL)
    gr[cur.r][cur.c] = CLOSED;
  state.explored++;

  if (cur.r === gn.r && cur.c === gn.c) {
    const path = reconstructPath(state.cameFrom, key);
    state.finalPath = path.slice();
    state.solutionCost = Math.round(cur.g);
    state.done = true;
    if (!offscreen) {
      logEntry("success", `✓ Path found! ${path.length} steps, cost ${state.solutionCost}`);
      setStatus("done", `Path found — ${path.length} steps · cost ${state.solutionCost}`);
      showToast(`✓ Path: ${path.length} steps, explored ${state.explored} nodes`, "success");
    }
    if (onDone) onDone(path, state);
    return;
  }
  for (const nb of getNeighbors(cur.r, cur.c, ROWS, COLS, gr, terrainGrid, allowDiagonals)) {
    const nbKey = `${nb.r},${nb.c}`;
    if (state.closed.has(nbKey)) continue;
    const tg = cur.g + nb.cost;
    const ex = state.nodeMap[nbKey];
    if (!ex || tg < ex.g) {
      const h = (algo === "dijkstra" || algo === "bfs") ? 0 : heuristicFunc(nb, gn) * heuristicWeight;
      const f = algo === "greedy" ? h : tg + h;
      const nd = { r: nb.r, c: nb.c, g: tg, h, f, key: nbKey };
      state.nodeMap[nbKey] = nd;
      state.cameFrom[nbKey] = key;
      if (Array.isArray(state.openSet)) state.openSet.push(nd);
      else state.openSet.push(nd);
      if (gr[nb.r][nb.c] !== START && gr[nb.r][nb.c] !== GOAL)
        gr[nb.r][nb.c] = OPEN;
    }
  }
}
