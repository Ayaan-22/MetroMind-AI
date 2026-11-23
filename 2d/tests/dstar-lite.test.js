import test from 'node:test';
import assert from 'node:assert/strict';
import { DStarLite } from '../js/pathfinding/dstar-lite.js';
import { initSearch, searchStep } from '../js/pathfinding/algorithms.js';
import { EMPTY, WALL, START, GOAL, HIGHWAY, TRAFFIC, MUD, TERRAIN_COST } from '../js/config.js';

function fixture(rows = 8, cols = 10, diagonal = false) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(EMPTY));
  const terrain = grid.map(row => row.map(() => 0));
  const start = { r: 1, c: 1 }, goal = { r: rows - 2, c: cols - 2 };
  grid[start.r][start.c] = START;
  grid[goal.r][goal.c] = GOAL;
  return { grid, terrain, start, goal, diagonal };
}
function planner(f) { return initSearch('dstarlite', f.start, f.goal, f.grid, f.terrain, f.diagonal, 3); }
function solve(state) {
  let callbacks = 0;
  for (let i = 0; !state.done && i < 100000; i++) {
    searchStep(state, state.gr, state.terrainGrid, state.cols, state.rows,
      state.allowDiagonals, state.gn, state.sn, 3, 'manhattan',
      () => {}, () => {}, () => {}, () => { callbacks++; });
  }
  assert.equal(state.done, true, 'search must terminate');
  assert.equal(callbacks, 1, 'notify completion exactly once');
  searchStep(state, state.gr, state.terrainGrid, state.cols, state.rows,
    state.allowDiagonals, state.gn, state.sn, 3, 'manhattan',
    () => {}, () => {}, () => {}, () => { callbacks++; });
  assert.equal(callbacks, 1);
}

// Independent Dijkstra oracle: does not use D* Lite's queue, neighbors or cost functions.
function optimum(f, start = f.start) {
  const dist = new Map([[`${start.r},${start.c}`, 0]]), pending = [{ ...start, g: 0 }];
  while (pending.length) {
    pending.sort((a, b) => b.g - a.g);
    const cur = pending.pop();
    if (cur.g !== dist.get(`${cur.r},${cur.c}`)) continue;
    if (cur.r === f.goal.r && cur.c === f.goal.c) return cur.g;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if ((!dr && !dc) || (!f.diagonal && dr && dc)) continue;
      const r = cur.r + dr, c = cur.c + dc;
      if (r < 0 || r >= f.grid.length || c < 0 || c >= f.grid[0].length || f.grid[r][c] === WALL) continue;
      const g = cur.g + (dr && dc ? Math.SQRT2 : 1) * (TERRAIN_COST[f.terrain[r][c]] || 1);
      const key = `${r},${c}`;
      if (g < (dist.get(key) ?? Infinity)) { dist.set(key, g); pending.push({ r, c, g }); }
    }
  }
  return Infinity;
}
function verify(state, f) {
  const expected = optimum(f, state.sn);
  if (!Number.isFinite(expected)) {
    assert.equal(state.finalPath, null);
    assert.equal(state.solutionCost, undefined);
    return;
  }
  assert.ok(state.finalPath);
  assert.deepEqual(state.finalPath[0], state.sn);
  assert.deepEqual(state.finalPath.at(-1), f.goal);
  assert.equal(new Set(state.finalPath.map(p => `${p.r},${p.c}`)).size, state.finalPath.length);
  let cost = 0;
  state.finalPath.forEach((p, i, path) => {
    assert.notEqual(f.grid[p.r][p.c], WALL);
    if (!i) return;
    const dr = Math.abs(p.r - path[i - 1].r), dc = Math.abs(p.c - path[i - 1].c);
    assert.ok(dr <= 1 && dc <= 1 && dr + dc > 0);
    if (!f.diagonal) assert.equal(dr + dc, 1);
    cost += (dr && dc ? Math.SQRT2 : 1) * (TERRAIN_COST[f.terrain[p.r][p.c]] || 1);
  });
  assert.ok(Math.abs(cost - expected) < 1e-8, `${cost} should equal optimal cost ${expected}`);
  assert.ok(Math.abs(state.solutionCost - cost) < 1e-8);
}

test('initial routes, wall insertion/removal and persistent search values', () => {
  const f = fixture(), state = planner(f);
  assert.ok(state instanceof DStarLite);
  solve(state); verify(state, f);
  const nodes = state.nodeMap, goal = nodes[`${f.goal.r},${f.goal.c}`];
  const cell = state.finalPath[3];
  f.grid[cell.r][cell.c] = WALL;
  state.updateCells([cell]);
  assert.equal(state.done, false);
  assert.equal(state.finalPath, null);
  assert.equal(state.solutionCost, undefined);
  solve(state); verify(state, f);
  assert.equal(state.nodeMap, nodes);
  assert.equal(state.nodeMap[goal.key], goal);
  assert.equal(goal.g, 0);
  f.grid[cell.r][cell.c] = EMPTY;
  state.updateCells([cell]);
  solve(state); verify(state, f);
});

test('blocked route recovers when a gap is opened', () => {
  const f = fixture(), state = planner(f);
  solve(state);
  const barrier = f.grid.map((row, r) => ({ r, c: 4 }));
  barrier.forEach(p => { f.grid[p.r][p.c] = WALL; });
  state.updateCells(barrier);
  solve(state); verify(state, f);
  f.grid[3][4] = EMPTY;
  state.updateCells([{ r: 3, c: 4 }]);
  solve(state); verify(state, f);
});

test('edits during initial planning and during an unfinished repair', () => {
  const f = fixture(), state = planner(f);
  state.step();
  f.grid[2][2] = WALL;
  state.updateCells([{ r: 2, c: 2 }]);
  state.step();
  f.terrain[3][3] = MUD;
  state.updateCells([{ r: 3, c: 3 }]);
  solve(state); verify(state, f);
});

for (const diagonal of [false, true]) {
  test(`weighted terrain and seeded dynamic edits (${diagonal ? 8 : 4}-way) match Dijkstra`, () => {
    const f = fixture(9, 12, diagonal), state = planner(f);
    let seed = 7321;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let round = 0; round < 100; round++) {
      const cells = [];
      for (let i = 0; i < 5; i++) {
        const r = Math.floor(random() * f.grid.length), c = Math.floor(random() * f.grid[0].length);
        if ((r === f.start.r && c === f.start.c) || (r === f.goal.r && c === f.goal.c)) continue;
        f.grid[r][c] = random() < 0.25 ? WALL : EMPTY;
        f.terrain[r][c] = [0, HIGHWAY, TRAFFIC, MUD][Math.floor(random() * 4)];
        cells.push({ r, c });
      }
      if (cells.length) state.updateCells(cells);
      solve(state); verify(state, f);
      assert.ok(state.openSet.size <= f.grid.length * f.grid[0].length);
    }
  });
}

test('moving the start reuses goal distances and updates km', () => {
  const f = fixture(8, 10, true), state = planner(f);
  solve(state);
  const next = state.finalPath[2], nodes = state.nodeMap;
  state.moveStart(next);
  solve(state); verify(state, f);
  assert.equal(state.nodeMap, nodes);
  assert.ok(state.km > 0);
  const cell = state.finalPath[1];
  f.grid[cell.r][cell.c] = WALL;
  state.updateCells([cell]);
  solve(state); verify(state, f);
});

test('existing algorithms still complete on an empty cardinal grid', () => {
  for (const algo of ['astar', 'dijkstra', 'greedy', 'bfs', 'dfs', 'bidirectional', 'jps', 'thetastar']) {
    const f = fixture(), state = initSearch(algo, f.start, f.goal, f.grid, f.terrain, false);
    for (let i = 0; !state.done && i < 10000; i++) {
      searchStep(state, f.grid, f.terrain, 10, 8, false, f.goal, f.start, 1, 'manhattan',
        () => {}, () => {}, () => {}, () => {});
    }
    assert.equal(state.done, true, algo);
    assert.ok(state.finalPath, `${algo} should find a route`);
    assert.deepEqual(state.finalPath[0], f.start);
    assert.deepEqual(state.finalPath.at(-1), f.goal);
    if (algo === 'dijkstra' || algo === 'astar') assert.equal(state.solutionCost, optimum(f));
    if (algo === 'bidirectional') assert.equal(state.solutionCost, state.finalPath.length - 1, 'bidirectional cost includes both halves');
  }
});
