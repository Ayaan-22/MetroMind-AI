const assert = require('node:assert/strict');
const { test } = require('node:test');
const THREE = require('../vendor/three.min.js');
const { Grid } = require('../js/engine.js');

global.THREE = THREE;
require('../js/city.js');

// Exercise the actual generated street networks for two simulated minutes.
// Geometry and transforms are real Three.js; no browser/GPU is created here.
function flowCity(preset, seed = 2084) {
  return cityFromGrid(new Grid(30).generate(preset, seed));
}

function cityFromGrid(grid) {
  const city = Object.create(global.MetroCity.prototype);
  Object.assign(city, {
    grid, size: grid.size, terrain: grid.types, elevation: grid.elevations,
    originX: grid.originX, originZ: grid.originZ, developed: grid.developed, freeBuild: false,
    world: new THREE.Group(), tmp: new THREE.Object3D(), box: new THREE.BoxGeometry(1, 1, 1),
    materials: { car: new THREE.MeshBasicMaterial(), carGlass: new THREE.MeshBasicMaterial(), light: new THREE.MeshBasicMaterial() },
    trafficVisible: true, reducedMotion: false,
  });
  city.makeTraffic();
  return city;
}

// Independent separating-axis check against the visible .18 x .34 car bodies,
// rather than reusing the renderer's larger clearance footprints.
function bodiesOverlap(first, second) {
  if (Math.abs(first.y - second.y) >= .105) return false;
  const x = second.x - first.x, z = second.z - first.z;
  if (x*x + z*z > .4*.4) return false;
  for (const [ax, az] of [[first.dx,first.dz],[first.dz,-first.dx],[second.dx,second.dz],[second.dz,-second.dx]]) {
    const extent = pose => .17*Math.abs(pose.dx*ax + pose.dz*az) + .09*Math.abs(pose.dz*ax - pose.dx*az);
    if (Math.abs(x*ax + z*az) >= extent(first) + extent(second) - 1e-6) return false;
  }
  return true;
}

for (const preset of ['downtown', 'manhattan']) {
  test(`${preset} traffic continues flowing without body collisions or permanent queues over two simulated minutes`, () => {
    const city = flowCity(preset), count = city.carStates.length, dt = .05;
    assert.ok(count >= 24, 'the default district retains substantial traffic while preventing queues');
    const waiting = new Float64Array(count), longestWait = new Float64Array(count), finalTravel = new Float64Array(count);
    let previous = city.carStates.map(car => ({...car.pose})), overlapCount = 0;
    for (let frame = 0; frame < 2400; frame++) {
      city.updateTraffic(dt);
      assert.equal(city.carStates.length, count, 'flow recovery keeps the existing cars instead of removing stalled vehicles');
      for (let index = 0; index < count; index++) {
        const pose = city.carStates[index].pose, movement = Math.hypot(pose.x - previous[index].x, pose.z - previous[index].z);
        assert.ok(Object.values(pose).every(Number.isFinite), 'car transforms stay finite');
        assert.ok(movement <= .11, 'a blocked car must recover without teleporting across the map');
        waiting[index] = movement < 1e-7 ? waiting[index] + dt : 0;
        longestWait[index] = Math.max(longestWait[index], waiting[index]);
        if (frame >= 2100) finalTravel[index] += movement;
        for (let other = index + 1; other < count; other++) if (bodiesOverlap(pose, city.carStates[other].pose)) overlapCount++;
        previous[index] = {...pose};
      }
    }
    const maxWait = Math.max(...longestWait), frozen = Array.from(finalTravel).filter(distance => distance < .25).length;
    assert.equal(overlapCount, 0, `${preset}: no rendered car bodies may interpenetrate`);
    assert.ok(maxWait <= 15 + dt, `${preset}: longest stationary wait was ${maxWait.toFixed(2)}s; existing cars must be able to clear junctions`);
    assert.equal(frozen, 0, `${preset}: ${frozen}/${count} cars made less than .25 units of progress in the final 15 seconds`);
  });
}

test('broad paved streets circulate around the district and building block rather than tiny cell loops', () => {
  const grid = new Grid(12); grid.types.fill(0);
  for (let row = 4; row < 8; row++) for (let col = 4; col < 8; col++) grid.types[row * grid.size + col] = 1;
  const city = cityFromGrid(grid), count = city.carStates.length;
  assert.ok(count > 0);
  const bounds = city.carStates.map(car => ({ minX: car.pose.x, maxX: car.pose.x, minZ: car.pose.z, maxZ: car.pose.z }));
  let previous = city.carStates.map(car => ({...car.pose}));
  for (let frame = 0; frame < 1200; frame++) {
    city.updateTraffic(.05);
    assert.equal(city.carStates.length, count);
    for (let index = 0; index < count; index++) {
      const pose = city.carStates[index].pose, box = bounds[index];
      assert.ok(Math.hypot(pose.x - previous[index].x, pose.z - previous[index].z) <= .11);
      box.minX = Math.min(box.minX, pose.x); box.maxX = Math.max(box.maxX, pose.x);
      box.minZ = Math.min(box.minZ, pose.z); box.maxZ = Math.max(box.maxZ, pose.z);
      for (let other = index + 1; other < count; other++) assert.equal(bodiesOverlap(pose, city.carStates[other].pose), false);
      previous[index] = {...pose};
    }
  }
  for (const box of bounds) {
    assert.ok(box.maxX - box.minX >= 3, 'each car traverses a real block width');
    assert.ok(box.maxZ - box.minZ >= 3, 'each car traverses a real block depth instead of orbiting one paved cell');
  }
});
