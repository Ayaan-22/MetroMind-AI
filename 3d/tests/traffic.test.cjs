const assert = require('node:assert/strict');
const { test } = require('node:test');
const THREE = require('../vendor/three.min.js');
const { Grid } = require('../js/engine.js');

global.THREE = THREE;
require('../js/city.js');
const MetroCity = global.MetroCity;

// Real Three.js car transforms and road data, without a browser or GPU.
function cityWithRoads(size, roads, { freeBuild = false, originX = 10, originZ = 20 } = {}) {
  const grid = new Grid(size);
  grid.types.fill(1); grid.originX = originX; grid.originZ = originZ;
  grid.freeBuild = freeBuild; grid.developed.fill(freeBuild ? 0 : 1);
  for (const index of roads) { grid.types[index] = 0; grid.developed[index] = 1; }
  const city = Object.create(MetroCity.prototype);
  Object.assign(city, {
    grid, size, terrain: grid.types, elevation: grid.elevations,
    originX, originZ, freeBuild, developed: grid.developed,
    world: new THREE.Group(), tmp: new THREE.Object3D(),
    box: new THREE.BoxGeometry(1, 1, 1),
    materials: { car: new THREE.MeshBasicMaterial(), carGlass: new THREE.MeshBasicMaterial(), light: new THREE.MeshBasicMaterial() },
    trafficVisible: true, reducedMotion: false, carStates: [], elapsed: 0,
  });
  return city;
}

function pose(city, index = 0) {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  city.carBodies.getMatrixAt(index, matrix); matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale, forward: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize() };
}

function advance(city, seconds, step = 0.01) {
  for (let elapsed = 0; elapsed < seconds - 1e-10;) {
    const dt = Math.min(step, seconds - elapsed); city.elapsed += dt; city.updateTraffic(dt); elapsed += dt;
  }
}

function laneKey(car) { return `${car.prev}:${car.cell}`; }
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test('traffic spawns only on connected developed streets and starts at visible world positions', () => {
  const road = Array.from({ length: 8 }, (_, i) => 32 + i);
  const city = cityWithRoads(8, road.concat([0, 24, 40, 47]), { freeBuild: true });
  city.terrain[24] = 4; city.developed[40] = 0; city.elevation[47] = 4;
  city.terrain[33] = 2; city.terrain[34] = 3;
  city.makeTraffic();
  assert.ok(city.carStates.length > 0);
  for (let i = 0; i < city.carStates.length; i++) {
    const car = city.carStates[i];
    assert.ok(road.includes(car.prev) && road.includes(car.cell) && road.includes(car.next), 'isolated, muddy, undeveloped and cliff-bound cells are excluded');
    assert.equal(Math.abs(car.prev - car.cell), 1, 'cars start on a connected directed street');
    const current = pose(city, i);
    assert.ok([current.position.x, current.position.y, current.position.z].every(Number.isFinite));
    assert.ok(current.position.x >= 10 && current.position.x <= 18);
    assert.ok(current.position.z >= 24 && current.position.z <= 25);
    assert.ok(current.position.y > 0, 'traffic is placed immediately, even before the first animation frame');
  }
  assert.equal(new Set(city.carStates.map(laneKey)).size, city.carStates.length, 'initial directed lanes are unique');
});

test('isolated streets do not spawn cars that spin in place', () => {
  const isolated = [];
  for (let r = 0; r < 8; r += 2) for (let c = 0; c < 8; c += 2) isolated.push(r * 8 + c);
  const city = cityWithRoads(8, isolated); city.makeTraffic();
  assert.equal(city.carStates.length, 0);
  assert.ok(!city.carBodies || city.carBodies.count === 0);
});

test('traffic and reduced-motion pauses preserve each car transform', () => {
  const city = cityWithRoads(8, Array.from({ length: 8 }, (_, i) => 32 + i)); city.makeTraffic();
  assert.ok(city.carStates.length > 0);
  advance(city, 0.15);
  const before = Array.from(city.carBodies.instanceMatrix.array);
  city.setTraffic(false); advance(city, 0.5);
  assert.deepEqual(Array.from(city.carBodies.instanceMatrix.array), before);
  city.setTraffic(true); city.reducedMotion = true; advance(city, 0.5);
  assert.deepEqual(Array.from(city.carBodies.instanceMatrix.array), before);
  city.reducedMotion = false; advance(city, 0.1);
  assert.notDeepEqual(Array.from(city.carBodies.instanceMatrix.array), before);
});

function forcedCar(city, prev, cell, next, distance = 0, seed = 0) {
  city.makeTraffic();
  city.carStates = [city.makeTrafficState(prev, cell, next, seed, distance)];
  city.carBodies.count = city.carCabins.count = city.carLights.count = 1;
  city.writeTrafficTransforms();
  return city;
}

const cornerRoad = [9, 10, 11, 12, 20, 28, 36, 44, 52];

test('cars curve continuously through a right-angle junction and face their travel direction', () => {
  const city = forcedCar(cityWithRoads(8, cornerRoad), 11, 12, 20);
  let previous = pose(city), changedHeading = false;
  for (let step = 0; step < 180; step++) {
    advance(city, 0.01); const current = pose(city), movement = current.position.clone().sub(previous.position);
    assert.ok(movement.length() < 0.04, 'a lane change cannot jump the car sideways at a cell boundary');
    assert.ok(current.forward.angleTo(previous.forward) < 0.14, 'the body does not snap to a new heading');
    const lightMatrix = new THREE.Matrix4(); city.carLights.getMatrixAt(0, lightMatrix);
    const lightOffset = new THREE.Vector3().setFromMatrixPosition(lightMatrix).sub(current.position);
    assert.ok(lightOffset.dot(current.forward) > 0.1, 'headlights remain ahead of the body while it turns');
    const cabinMatrix = new THREE.Matrix4(); city.carCabins.getMatrixAt(0, cabinMatrix);
    const cabinOffset = new THREE.Vector3().setFromMatrixPosition(cabinMatrix).sub(current.position);
    near(cabinOffset.x, 0, 1e-4); near(cabinOffset.z, 0, 1e-4);
    if (movement.length() > 1e-7) assert.ok(current.forward.dot(movement.normalize()) > 0.94, 'the forward axis follows the curve tangent');
    const row = Math.floor(current.position.z - city.originZ), col = Math.floor(current.position.x - city.originX);
    assert.ok(cornerRoad.includes(row * city.size + col), 'the car center stays inside the connected street footprint');
    changedHeading ||= current.forward.dot(new THREE.Vector3(1, 0, 0)) < 0.85;
    previous = current;
  }
  assert.ok(changedHeading, 'the sample traverses an actual turn');
});

test('car travel preserves elapsed distance across coarse and fine animation steps', () => {
  const coarse = forcedCar(cityWithRoads(8, cornerRoad), 11, 12, 20, 0.05, 7);
  const fine = forcedCar(cityWithRoads(8, cornerRoad), 11, 12, 20, 0.05, 7);
  advance(coarse, 2.4, 0.1); advance(fine, 2.4, 0.005);
  assert.ok(pose(coarse).position.distanceTo(pose(fine).position) < 0.002, 'crossing a cell boundary does not discard leftover travel time');
  assert.ok(pose(coarse).forward.angleTo(pose(fine).forward) < 0.005);
});

test('a faster follower keeps its lane and a safe body gap behind slower traffic', () => {
  const road = Array.from({ length: 12 }, (_, i) => 72 + i), spareRoad = Array.from({ length: 12 }, (_, i) => 96 + i), city = cityWithRoads(12, road.concat(spareRoad));
  city.terrain[78] = 2; for (const index of [79, 80, 81, 82, 83]) city.terrain[index] = 3;
  city.makeTraffic();
  assert.ok(city.carBodies.instanceMatrix.count >= 2, 'the fixture allocates actual instance buffers for both cars');
  city.carStates = [city.makeTrafficState(78, 79, 80, 1, 0.1), city.makeTrafficState(77, 78, 79, 2, 0.2)];
  city.carBodies.count = city.carCabins.count = city.carLights.count = 2; city.writeTrafficTransforms();
  let tightest = Infinity;
  for (let step = 0; step < 160; step++) {
    advance(city, 0.01); const leading = pose(city, 0), following = pose(city, 1);
    const gap = leading.position.x - following.position.x; tightest = Math.min(tightest, gap);
    assert.ok(gap >= 0.34, 'the follower cannot overlap or overtake the leading body');
    near(leading.position.z, following.position.z, 1e-4);
  }
  assert.ok(tightest < 0.9, 'the fixture actually brings the fast follower toward the slower car');
});

test('a render rebuild preserves valid traffic poses and reseeds invalid road states safely', () => {
  const road = Array.from({ length: 8 }, (_, i) => 32 + i), city = cityWithRoads(8, road);
  city.makeTraffic(); advance(city, 0.35);
  const before = Array.from(city.carBodies.instanceMatrix.array), oldStates = city.carStates.slice();
  city.clear(city.world); city.makeTraffic();
  assert.deepEqual(Array.from(city.carBodies.instanceMatrix.array), before, 'same-grid graphics rebuilds do not teleport cars');
  for (let index = 0; index < oldStates.length; index++) assert.equal(city.carStates[index], oldStates[index]);
  const closed = city.carStates[0].cell; city.terrain[closed] = 1;
  city.clear(city.world); city.makeTraffic();
  for (let index = 0; index < city.carStates.length; index++) {
    const car = city.carStates[index];
    for (const cell of [car.prev, car.cell, car.next]) assert.notEqual(city.terrain[cell], 1);
    const current = pose(city, index);
    assert.ok([current.position.x, current.position.y, current.position.z].every(Number.isFinite));
  }
});

test('dead-end cars turn back continuously into the opposite lane', () => {
  const road = [32, 33, 34, 35], city = forcedCar(cityWithRoads(8, road), 34, 35, 34);
  const initial = pose(city); let previous = initial;
  for (let step = 0; step < 180; step++) {
    advance(city, 0.01); const current = pose(city);
    assert.ok(current.position.distanceTo(previous.position) < 0.04);
    assert.ok(current.forward.angleTo(previous.forward) < 0.2, 'a dead end does not flip the car instantly');
    const row = Math.floor(current.position.z - city.originZ), col = Math.floor(current.position.x - city.originX);
    assert.ok(road.includes(row * city.size + col), 'the turn stays inside the street footprint');
    previous = current;
  }
  assert.ok(previous.forward.dot(initial.forward) < -0.9);
  assert.ok(Math.abs(previous.position.z - initial.position.z) > 0.35, 'return traffic occupies the opposite lane');
});

test('graphics rebuilds retain two safely spaced cars sharing the same directed street segment', () => {
  const road = Array.from({ length: 12 }, (_, i) => 72 + i), spare = Array.from({ length: 12 }, (_, i) => 96 + i), city = cityWithRoads(12, road.concat(spare));
  city.makeTraffic();
  const cars = [city.makeTrafficState(77, 78, 79, 1, .02), city.makeTrafficState(77, 78, 79, 2, .90)];
  assert.equal(city.trafficCollision(cars[0].pose, cars[1].pose), false);
  city.carStates = cars; city.carBodies.count = city.carCabins.count = city.carLights.count = 2; city.writeTrafficTransforms();
  const before = cars.map((car, index) => pose(city, index));
  city.clear(city.world); city.makeTraffic();
  for (let index = 0; index < cars.length; index++) {
    assert.equal(city.carStates[index], cars[index], 'a valid car must not be discarded or reseeded during a render rebuild');
    assert.ok(pose(city, index).position.distanceTo(before[index].position) < 1e-5);
  }
});

test('opposing cars pass without stopping on their separate straight lanes', () => {
  const road = Array.from({ length: 12 }, (_, i) => 72 + i), spareRoad = Array.from({ length: 12 }, (_, i) => 96 + i), city = cityWithRoads(12, road.concat(spareRoad));
  city.makeTraffic(); assert.ok(city.carBodies.instanceMatrix.count >= 2);
  city.carStates = [city.makeTrafficState(77, 78, 79, 1, 0.15), city.makeTrafficState(81, 80, 79, 2, 0.15)];
  city.carBodies.count = city.carCabins.count = city.carLights.count = 2; city.writeTrafficTransforms();
  const eastStart = pose(city, 0), westStart = pose(city, 1);
  assert.ok(Math.abs(eastStart.position.z - westStart.position.z) > 0.4);
  for (let step = 0; step < 300; step++) {
    advance(city, 0.01); const east = pose(city, 0), west = pose(city, 1);
    assert.ok(east.position.distanceTo(west.position) > 0.4, 'opposing bodies do not overlap while passing');
    near(east.position.z, eastStart.position.z); near(west.position.z, westStart.position.z);
  }
  const eastEnd = pose(city, 0), westEnd = pose(city, 1);
  near(eastEnd.position.x - eastStart.position.x, 2.4, 0.002);
  near(westStart.position.x - westEnd.position.x, 2.4, 0.002);
  assert.ok(eastEnd.position.x > westEnd.position.x, 'both cars complete the pass');
});

test('Free Build canvas growth keeps existing traffic at the same world pose', () => {
  const road = Array.from({ length: 8 }, (_, i) => 32 + i), city = cityWithRoads(8, road, { freeBuild: true });
  city.makeTraffic(); advance(city, 0.35);
  const before = city.carStates.map((state, index) => ({ state, pose: pose(city, index), cell: state.cell }));
  const oldSize = city.size, oldOriginX = city.originX, oldOriginZ = city.originZ;
  const growth = city.grid.expandToWorld(oldOriginX - 4, oldOriginZ - 3);
  assert.equal(growth.changed, true);
  Object.assign(city, { size: city.grid.size, terrain: city.grid.types, elevation: city.grid.elevations, originX: city.grid.originX, originZ: city.grid.originZ, developed: city.grid.developed });
  city.remapTrafficStates(oldSize, oldOriginX, oldOriginZ);
  city.clear(city.world); city.makeTraffic();
  for (let index = 0; index < before.length; index++) {
    assert.equal(city.carStates[index], before[index].state, 'growth preserves each existing vehicle state');
    assert.notEqual(city.carStates[index].cell, before[index].cell, 'the fixture changes the underlying cell indices');
    assert.ok(pose(city, index).position.distanceTo(before[index].pose.position) < 1e-5);
    assert.ok(pose(city, index).forward.angleTo(before[index].pose.forward) < 1e-5);
  }
});
