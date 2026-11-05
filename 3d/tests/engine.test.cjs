const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Grid, SearchSession, QLearner, random, limits } = require('../js/engine.js');

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

test('Free Build starts with undeveloped ground and only painted streets connect its endpoints', () => {
  const grid = new Grid(20).enableFreeBuild(false);
  assert.equal(grid.freeBuild, true);
  assert.equal(grid.developed.reduce((sum, value) => sum + value, 0), 2);
  assert.equal(grid.types[grid.start], 0); assert.equal(grid.types[grid.goal], 0);
  for (const algorithm of ['astar', 'dijkstra', 'bfs', 'dfs', 'greedy', 'bidir', 'theta', 'jps', 'dstar']) assert.equal(solve(grid, algorithm).path, null, algorithm);
  for (let i = grid.start; i <= grid.goal; i++) grid.set(i, 0, 0);
  for (const algorithm of ['astar', 'dijkstra', 'bfs', 'dfs', 'greedy', 'bidir', 'theta', 'jps', 'dstar']) close(solve(grid, algorithm).cost, 10);
  const empty = grid.start - grid.size, version = grid.version;
  assert.equal(grid.types[empty], 1); assert.equal(grid.developed[empty], 0);
  assert.equal(grid.set(empty, 1, 0, true), true, 'painting a building onto void is a real edit');
  assert.equal(grid.developed[empty], 1); assert.equal(grid.version, version + 1);
  grid.enableFreeBuild(true);
  assert.equal(grid.developed[empty], 1); assert.equal(grid.developed[empty + 1], 0, 'reentering does not turn void into buildings');
  assert.equal(grid.set(empty, 1, 0, false), true); assert.equal(grid.developed[empty], 0);
  assert.equal(grid.set(grid.start, 1, 0, false), false, 'endpoint streets cannot be erased');
  assert.equal(grid.developed[grid.start], 1);
  grid.set(grid.start + 5, 1, 0, false);
  assert.equal(solve(grid, 'astar').path, null, 'erasing a street closes the connection');
  assert.throws(() => grid.set(empty, 0, 0, false), /impassable/);
});

test('world coordinates round trip for odd and even grids and ordinary cities convert without data changes', () => {
  for (const size of [4, 15, 30]) {
    const grid = new Grid(size).generate('terrain', 42), before = Array.from(grid.types), elevation = Array.from(grid.elevations);
    for (let i = 0; i < grid.count; i++) {
      const world = grid.cellToWorld(i), cell = grid.worldToCell(world.x, world.z);
      assert.equal(cell.index, i); assert.equal(cell.inBounds, true);
    }
    grid.enableFreeBuild(true);
    assert.deepEqual(Array.from(grid.types), before); assert.deepEqual(Array.from(grid.elevations), elevation);
    assert.ok(grid.developed.every(value => value === 1));
    assert.equal(grid.cellToWorld(-1), null);
    assert.throws(() => grid.worldToCell(Infinity, 0), /finite/);
    assert.throws(() => grid.worldToCell(0, NaN), /finite/);
  }
});

test('canvas growth in every direction preserves world positions, terrain, elevation, development and route cost', () => {
  for (const direction of ['west', 'east', 'north', 'south', 'northwest', 'southeast']) {
    const grid = new Grid(15).generate('terrain', 42).enableFreeBuild(true);
    const endpointWorld = { start: grid.cellToWorld(grid.start), goal: grid.cellToWorld(grid.goal) };
    const snapshots = Array.from({ length: grid.count }, (_, i) => ({ world: grid.cellToWorld(i), type: grid.types[i], elevation: grid.elevations[i], developed: grid.developed[i] }));
    const beforeCost = solve(grid, 'dijkstra').cost, oldSize = grid.size;
    const x = direction.includes('west') ? grid.originX - 2.25 : direction.includes('east') ? grid.originX + grid.size + 2.25 : 0;
    const z = direction.includes('north') ? grid.originZ - 2.25 : direction.includes('south') ? grid.originZ + grid.size + 2.25 : 0;
    const change = grid.expandToWorld(x, z);
    assert.equal(change.changed, true, direction); assert.equal(change.oldSize, oldSize); assert.ok(grid.size > oldSize);
    assert.equal(change.index, grid.worldToCell(x, z).index); assert.ok(grid.valid(change.index));
    assert.equal(grid.types[change.index], 1); assert.equal(grid.developed[change.index], 0);
    assert.equal(grid.terrain, grid.types); assert.equal(grid.elevation, grid.elevations);
    for (const snapshot of snapshots) {
      const index = grid.worldToCell(snapshot.world.x, snapshot.world.z).index;
      assert.equal(grid.types[index], snapshot.type, direction); assert.equal(grid.elevations[index], snapshot.elevation, direction); assert.equal(grid.developed[index], snapshot.developed, direction);
      assert.deepEqual(grid.cellToWorld(index), snapshot.world);
    }
    assert.deepEqual(grid.cellToWorld(grid.start), endpointWorld.start); assert.deepEqual(grid.cellToWorld(grid.goal), endpointWorld.goal);
    close(solve(grid, 'dijkstra').cost, beforeCost);
    for (const algorithm of ['astar', 'bidir', 'jps', 'dstar']) close(solve(grid, algorithm).cost, beforeCost);
    const version = grid.version, types = grid.types, noChange = grid.expandToWorld(x, z);
    assert.equal(noChange.changed, false); assert.equal(grid.version, version); assert.equal(grid.types, types);
  }
});

test('growth reaches the full supported limit and rejects overflow atomically', () => {
  const grid = new Grid(199).enableFreeBuild(false), start = grid.cellToWorld(grid.start), goal = grid.cellToWorld(grid.goal);
  const change = grid.expandToWorld(grid.originX + 199.5, grid.originZ + 10.5);
  assert.equal(change.changed, true); assert.equal(grid.size, 200, 'padding shrinks to allow use of the last supported column');
  assert.deepEqual(grid.cellToWorld(grid.start), start); assert.deepEqual(grid.cellToWorld(grid.goal), goal);
  const snapshot = grid.serialize(), arrays = { types: grid.types, elevation: grid.elevations, developed: grid.developed }, version = grid.version;
  assert.throws(() => grid.expandToWorld(grid.originX + 200.5, grid.originZ + 10.5), /200 × 200/);
  assert.deepEqual(grid.serialize(), snapshot); assert.equal(grid.version, version);
  assert.equal(grid.types, arrays.types); assert.equal(grid.elevations, arrays.elevation); assert.equal(grid.developed, arrays.developed);
  assert.throws(() => grid.expandToWorld(NaN, 0), /finite/);
  assert.throws(() => grid.expandToWorld(0, 0, -1), /padding/);
  assert.deepEqual(grid.serialize(), snapshot);
  const normal = new Grid(4), next = normal.expandToWorld(3, 0);
  assert.equal(normal.types[next.index], 0); assert.equal(normal.developed[next.index], 1);
});

test('100-cell regular districts generate and round trip while their growth remains bounded', () => {
  assert.deepEqual(limits, { grid: 100, freeBuild: 200 }); assert.ok(Object.isFrozen(limits));
  const grid = new Grid(100).generate('downtown', 2084), data = grid.serialize(), restored = Grid.fromJSON(JSON.stringify(data));
  assert.equal(grid.count, 10000); assert.equal(restored.size, 100); assert.equal(restored.freeBuild, false);
  assert.deepEqual(restored.serialize(), data); assert.ok(solve(restored, 'astar').path);
  const before = grid.serialize();
  assert.throws(() => grid.expandToWorld(grid.originX + 100.5, grid.originZ + .5), /100 × 100/);
  assert.deepEqual(grid.serialize(), before);
  assert.throws(() => new Grid(201), /200/);
});

test('Free Build grows past 100 to 200, preserving its world layout and portable search data', () => {
  const grid = new Grid(100).enableFreeBuild(false);
  for (let i = grid.start; i <= grid.goal; i++) grid.set(i, 0);
  grid.set(grid.start + 1, 2, .5);
  const start = grid.cellToWorld(grid.start), goal = grid.cellToWorld(grid.goal), street = grid.cellToWorld(grid.start + 1), cost = solve(grid, 'dijkstra').cost;
  const change = grid.expandToWorld(grid.originX + 199.5, grid.originZ + .5);
  assert.equal(change.changed, true); assert.equal(grid.size, 200); assert.equal(grid.count, 40000);
  assert.deepEqual(grid.cellToWorld(grid.start), start); assert.deepEqual(grid.cellToWorld(grid.goal), goal);
  const retained = grid.worldToCell(street.x, street.z).index;
  assert.equal(grid.types[retained], 2); assert.equal(grid.elevations[retained], .5); assert.equal(grid.developed[retained], 1);
  assert.equal(grid.developed[change.index], 0); assert.equal(grid.types[change.index], 1);
  const data = grid.serialize(), restored = Grid.fromJSON(JSON.stringify(data));
  assert.equal(restored.size, 200); assert.equal(restored.freeBuild, true);
  assert.deepEqual(restored.serialize(), data); close(solve(restored, 'astar').cost, cost);
  assert.deepEqual(restored.cellToWorld(restored.start), start); assert.deepEqual(restored.cellToWorld(restored.goal), goal);
  assert.throws(() => Grid.fromJSON({ ...data, freeBuild: false }), /between 4 and 100/);
  assert.throws(() => Grid.fromJSON({ ...data, freeBuild: undefined }), /between 4 and 100/);
  assert.throws(() => Grid.fromJSON({ ...data, freeBuild: 'true' }), /true or false/);
  assert.throws(() => Grid.fromJSON({ ...data, size: 201 }), /between 4 and 200/);
  assert.throws(() => Grid.fromJSON({ rows: 101, cols: 4, grid: [[]], freeBuild: true }), /between 4 and 100/);
});

test('Free Build imports retain editable bounds and reject inconsistent or malformed metadata', () => {
  const grid = new Grid(20).enableFreeBuild(false);
  for (let i = grid.start; i <= grid.goal; i++) grid.set(i, 2, 0);
  grid.expandToWorld(grid.originX - 3, grid.originZ - 2);
  const data = grid.serialize(), restored = Grid.fromJSON(JSON.stringify(data));
  assert.equal(restored.freeBuild, true); assert.equal(restored.originX, grid.originX); assert.equal(restored.originZ, grid.originZ);
  assert.deepEqual(restored.types, grid.types); assert.deepEqual(restored.elevations, grid.elevations); assert.deepEqual(restored.developed, grid.developed);
  assert.deepEqual(restored.cellToWorld(restored.start), grid.cellToWorld(grid.start)); close(solve(restored, 'dijkstra').cost, solve(grid, 'dijkstra').cost);
  assert.throws(() => Grid.fromJSON({ ...data, freeBuild: 'true' }), /true or false/);
  assert.throws(() => Grid.fromJSON({ ...data, originX: Infinity }), /origins/);
  assert.throws(() => Grid.fromJSON({ ...data, originZ: 10001 }), /origins/);
  assert.throws(() => Grid.fromJSON({ ...data, developed: undefined }), /developed/);
  assert.throws(() => Grid.fromJSON({ ...data, developed: Array(grid.count).fill(2) }), /Developed/);
  assert.throws(() => Grid.fromJSON({ ...data, developed: new Array(grid.count) }), /Developed/);
  assert.throws(() => Grid.fromJSON({ ...data, developed: [1] }), /Developed/);
  const invalidTerrain = { ...data, types: data.types.slice() }, voidIndex = data.developed.indexOf(0);
  invalidTerrain.types[voidIndex] = 0;
  assert.throws(() => Grid.fromJSON(invalidTerrain), /Undeveloped/);
  assert.throws(() => Grid.fromJSON({ ...data, freeBuild: false }), /Regular/);
  const old = Grid.fromJSON({ N: 4, T: Array(16).fill(0), E: Array(16).fill(0), start: 0, goal: 15 });
  assert.equal(old.freeBuild, false); assert.equal(old.originX, -2); assert.equal(old.originZ, -2); assert.ok(old.developed.every(value => value === 1));
});

test('dynamic replanning starts fresh when growth changes array dimensions without changing the goal index', () => {
  const grid = new Grid(99); grid.start = 0; grid.goal = 1;
  const search = solve(grid, 'dstar'), previous = search.dynamic;
  grid.expandToWorld(grid.originX + 99.5, grid.originZ + 0.5, 0);
  assert.equal(grid.goal, 1, 'the endpoint index can remain equal despite a resized canvas');
  search.replan().finish();
  assert.notEqual(search.dynamic, previous); assert.equal(search.dynamic.g.length, 10000);
  close(search.cost, 1); assert.deepEqual(search.path, [0, 1]);
});
