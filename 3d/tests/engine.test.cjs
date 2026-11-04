const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Grid, SearchSession, QLearner, random } = require('../js/engine.js');

const solve = (grid, algorithm, options = {}) => new SearchSession(grid, algorithm, options).finish();
const close = (a, b) => assert.ok(a === b || Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);

test('terrain-aware searches match Dijkstra on directed elevation and highway costs', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const grid = new Grid(12).generate('random', seed), rand = random(seed + 50);
    for (let i = 0; i < grid.count; i++) if (grid.types[i] !== 1) {
      grid.elevations[i] = Math.floor(rand() * 4);
      if (rand() < 0.15) grid.types[i] = 2;
    }
    for (const diagonal of [false, true]) {
      const reference = solve(grid, 'dijkstra', { diagonal });
      for (const name of ['astar', 'bidir', 'dstar', 'jps']) {
        const actual = solve(grid, name, { diagonal });
        assert.ok(actual.done, `${name} completed`);
        close(actual.cost, reference.cost);
        close(grid.pathCost(actual.path), reference.cost);
      }
    }
  }
});

test('zero heuristic weight is preserved and makes A* follow Dijkstra expansion order', () => {
  const grid = new Grid(12).generate('random', 42);
  const astar = new SearchSession(grid, 'astar', { weight: 0 }).finish();
  const dijkstra = new SearchSession(grid, 'dijkstra').finish();
  assert.equal(astar.options.weight, 0);
  close(astar.cost, dijkstra.cost);
  assert.deepEqual(Array.from(astar.visited), Array.from(dijkstra.visited));
  assert.equal(new SearchSession(grid, 'astar', { weight: '0' }).options.weight, 0);
  assert.equal(new SearchSession(grid, 'astar', { weight: NaN }).options.weight, 1);
});

test('D* Lite repairs existing state for blocked cells, cheaper terrain, elevation and moved start', () => {
  const grid = new Grid(16).generate('downtown', 2084);
  const dynamic = solve(grid, 'dstar', { diagonal: true });
  const retainedState = dynamic.dynamic;
  for (let k = 0; k < 12; k++) {
    const originalPath = dynamic.path;
    if (originalPath?.length > 3) {
      const middle = originalPath[originalPath.length >> 1]; grid.set(middle, k % 2 ? 2 : 1, k % 3);
    }
    dynamic.replan().finish();
    close(dynamic.cost, solve(grid, 'dijkstra', { diagonal: true }).cost);
    assert.equal(dynamic.dynamic, retainedState);
  }
  grid.start = grid.neighbors(grid.start, true)[0];
  dynamic.replan().finish();
  close(dynamic.cost, solve(grid, 'dijkstra', { diagonal: true }).cost);
  grid.goal = grid.neighbors(grid.goal, true)[0];
  dynamic.replan().finish();
  assert.notEqual(dynamic.dynamic, retainedState);
  close(dynamic.cost, solve(grid, 'dijkstra', { diagonal: true }).cost);
});

test('strict corner handling applies to every search and line-of-sight', () => {
  const grid = new Grid(4); grid.start = 0; grid.goal = 5; grid.set(1, 1); grid.set(4, 1);
  assert.equal(grid.trace(0, 5), null);
  for (const name of ['astar', 'dijkstra', 'bfs', 'dfs', 'greedy', 'bidir', 'theta', 'jps', 'dstar']) {
    const result = solve(grid, name, { diagonal: true });
    assert.equal(result.path, null, name); assert.equal(result.cost, Infinity, name);
  }
});

test('jump acceleration preserves exact uniform-grid routes', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const grid = new Grid(18).generate('random', seed);
    for (let i = 0; i < grid.count; i++) if (grid.types[i] > 1) grid.types[i] = 0;
    for (const diagonal of [false, true]) close(solve(grid, 'jps', { diagonal }).cost, solve(grid, 'dijkstra', { diagonal }).cost);
  }
});

test('history replay restores frontier, visited and the completed route', () => {
  const session = new SearchSession(new Grid(12).generate('downtown'), 'astar');
  session.step(10);
  const visited = Array.from(session.visited), frontier = Array.from(session.frontier).sort((a,b) => a-b), expanded = session.expanded;
  session.back(); session.step();
  assert.deepEqual(Array.from(session.visited), visited);
  assert.deepEqual(Array.from(session.frontier).sort((a,b) => a-b), frontier);
  assert.equal(session.expanded, expanded);
  session.finish(); const path = session.path.slice(), cost = session.cost;
  session.back(); assert.equal(session.done, false); assert.equal(session.path, null);
  session.finish(); assert.deepEqual(session.path, path); assert.equal(session.cost, cost);
});

test('all city presets are deterministic and keep their destination reachable', () => {
  for (const preset of ['downtown', 'manhattan', 'maze', 'terrain', 'empty', 'corridor', 'spiral', 'rooms', 'cross', 'random', 'snake', 'grid', 'recursive', 'perlin']) {
    const one = new Grid(30).generate(preset, 2084), two = new Grid(30).generate(preset, 2084);
    assert.deepEqual(one.types, two.types, preset);
    assert.ok(solve(one, 'astar').path, preset);
  }
});

test('urban presets place endpoints inside connected avenues and build dense neighborhoods', () => {
  for (const preset of ['downtown', 'manhattan', 'grid', 'blocks', 'city']) {
    const grid = new Grid(30).generate(preset, 2084), block = preset === 'manhattan' ? 5 : 6;
    for (const endpoint of [grid.start, grid.goal]) {
      const r = endpoint / grid.size | 0, c = endpoint % grid.size;
      assert.ok(r > 1 && r < grid.size - 2 && c > 1 && c < grid.size - 2);
      assert.ok(r % block <= 1 && c % block <= 1);
    }
    assert.ok(grid.start / grid.size > grid.goal / grid.size);
    assert.ok(grid.start % grid.size < grid.goal % grid.size);
    assert.ok(grid.types.filter(type => type === 1).length >= 210, preset);
    assert.ok(solve(grid, 'astar').path);
  }
  const smallest = new Grid(4).generate('downtown');
  assert.notEqual(smallest.start, smallest.goal);
  assert.ok(solve(smallest, 'astar').path);
});

test('layout round trips validate data and retain v11 rectangular route boundaries', () => {
  const original = new Grid(12).generate('terrain', 42), restored = Grid.fromJSON(JSON.stringify(original.serialize()));
  assert.deepEqual(restored.types, original.types); assert.deepEqual(restored.elevations, original.elevations);
  assert.equal(restored.start, original.start); assert.equal(restored.goal, original.goal);
  const old = Grid.fromJSON({ N: 4, T: Array(16).fill(0), E: Array(16).fill(0), start: 0, goal: 15 }); assert.equal(old.size, 4);
  const v11 = { rows: 4, cols: 6, grid: Array.from({ length: 4 }, () => Array(6).fill(0)), terrain: Array.from({ length: 4 }, () => Array(6).fill(0)), start: { r: 0, c: 0 }, goal: { r: 3, c: 5 } };
  v11.terrain[1][2] = 7; v11.grid[2][2] = 1;
  const imported = Grid.fromJSON(v11); assert.equal(imported.size, 6); assert.equal(imported.types[8], 2); assert.equal(imported.types[14], 1); assert.equal(imported.types[24], 1);
  assert.throws(() => Grid.fromJSON({ ...original.serialize(), start: -1 }));
  assert.throws(() => Grid.fromJSON({ ...original.serialize(), elevations: Array(144).fill(NaN) }));
  assert.throws(() => Grid.fromJSON({ ...original.serialize(), types: Array(144).fill(8) }));
  assert.throws(() => Grid.fromJSON({ ...original.serialize(), size: 900 }));
});

test('Theta* segments remain visible and produce finite reproducible route costs', () => {
  const grid = new Grid(15).generate('random', 42), result = solve(grid, 'theta');
  assert.ok(result.path?.length);
  for (let i = 1; i < result.path.length; i++) assert.ok(grid.trace(result.path[i - 1], result.path[i]));
  close(result.cost, grid.pathCost(result.path, true));
});

test('Q-learning resets on city edits and never uses blocked actions during policy rollout', () => {
  const grid = new Grid(6), learner = new QLearner(grid, { maxSteps: 60 });
  learner.train(10); assert.equal(learner.episodes, 10); assert.equal(learner.rewards.length, 10);
  const result = learner.rollout(); for (let k = 1; k < result.path.length; k++) assert.ok(Number.isFinite(grid.cost(result.path[k - 1], result.path[k])));
  grid.set(15, 1); learner.train(2); assert.equal(learner.episodes, 2); assert.equal(learner.policy[15], -1);
  assert.ok(learner.heat.every(Number.isFinite));
});
