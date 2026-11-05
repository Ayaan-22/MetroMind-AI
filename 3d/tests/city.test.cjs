const assert = require('node:assert/strict');
const { test } = require('node:test');
const THREE = require('../vendor/three.min.js');
const { Grid } = require('../js/engine.js');

// These checks use the bundled Three.js geometry, matrices and materials. They
// intentionally do not create a WebGL renderer or certify GPU appearance.
global.THREE = THREE;
require('../vendor/OrbitControls.js');
require('../js/city.js');
const MetroCity = global.MetroCity;

function scene() {
  const grid = new Grid(4);
  grid.originX = 10; grid.originZ = 20;
  const city = Object.create(MetroCity.prototype);
  Object.assign(city, {
    grid, size: grid.size, terrain: grid.types, elevation: grid.elevations,
    originX: grid.originX, originZ: grid.originZ,
    freeBuild: false, developed: grid.developed,
    scene: new THREE.Scene(), route: new THREE.Group(),
    tmp: new THREE.Object3D(), buildingHeights: new Float32Array(grid.count),
    quality: 'balanced', reducedMotion: false,
    box: new THREE.BoxGeometry(1, 1, 1),
  });
  city.scene.add(city.route);
  return city;
}

function transform(mesh, index) {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(position, new THREE.Quaternion(), scale);
  return { position, scale, matrix };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} differs from ${expected}`);

function cameraScene() {
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      fire(type, event) { for (const listener of listeners.get(type) || []) listener({ preventDefault() {}, ...event }); },
    };
  };
  const ownerDocument = events(), canvas = { ...events(), ownerDocument, clientWidth: 800, clientHeight: 600, focus() {}, style: {} };
  const city = Object.create(MetroCity.prototype);
  city.camera = new THREE.PerspectiveCamera(39, 4 / 3, .1, 500);
  city.camera.position.set(27, 18, 34);
  const previousDocument = global.document;
  global.document = ownerDocument;
  try { city.controls = new THREE.OrbitControls(city.camera, canvas); }
  finally { if (previousDocument === undefined) delete global.document; else global.document = previousDocument; }
  city.controls.enableDamping = true; city.controls.dampingFactor = .075;
  city.controls.minDistance = 9; city.controls.maxDistance = 86; city.controls.maxPolarAngle = Math.PI * .47;
  city.controls.target.set(11, 2, -8); city.camera.position.copy(city.controls.target).add(new THREE.Vector3(17, 12, -9));
  city.controls.update(); city.camera.updateMatrixWorld();
  return { city, canvas, ownerDocument };
}

function pointerScene() {
  const fixture = cameraScene(), { city, canvas } = fixture, captures = new Set(), painted = [], strokes = [];
  Object.assign(city, scene(), {
    canvas, events: [], editorEnabled: true, tool: 'view',
    hover: new THREE.Object3D(), selection: new THREE.Object3D(),
    options: { onPaintWorld(point) { painted.push({ ...point }); }, onStrokeEnd() { strokes.push(painted.length); } },
  });
  canvas.setPointerCapture = id => captures.add(id);
  canvas.hasPointerCapture = id => captures.has(id);
  canvas.releasePointerCapture = id => { captures.delete(id); canvas.fire('lostpointercapture', { pointerId: id, pointerType: 'touch' }); };
  city.pickWorld = event => ({ x: 10 + event.clientX / 20, z: 20 + event.clientY / 20 });
  city.bindPointer(); city.setTool('road');
  const pointer = (type, id, x, y = 100, pointerType = 'touch') => canvas.fire(type, { pointerId: id, pointerType, button: 0, clientX: x, clientY: y });
  const touch = (type, points) => canvas.fire(type, { touches: points.map(([pageX, pageY]) => ({ pageX, pageY })) });
  return { ...fixture, captures, painted, strokes, pointer, touch };
}

test('touch taps and intentional drags paint complete strokes without turning a small contact movement into a mark', () => {
  const h = pointerScene();
  assert.equal(h.canvas.style.touchAction, 'none');
  h.pointer('pointerdown', 1, 100); h.pointer('pointermove', 1, 102);
  assert.equal(h.painted.length, 0, 'contact jitter is not yet a paint drag');
  h.pointer('pointerup', 1, 102);
  assert.equal(h.painted.length, 1, 'a completed tap paints exactly once');
  assert.equal(h.strokes.length, 1); assert.equal(h.captures.size, 0);
  h.pointer('pointerdown', 2, 200); h.pointer('pointermove', 2, 230); h.pointer('pointerup', 2, 230);
  assert.ok(h.painted.length > 2, 'the real freehand interpolator fills an intentional stroke');
  near(h.painted[1].x, 20); near(h.painted.at(-1).x, 21.5);
  assert.equal(h.strokes.length, 2);
  h.city.controls.dispose();
});

test('two-finger camera pan and pinch do not paint, including while one finger remains after the gesture', () => {
  const h = pointerScene(), target = h.city.controls.target.clone(), distance = h.city.camera.position.distanceTo(target);
  h.pointer('pointerdown', 1, 100); h.touch('touchstart', [[100, 100]]);
  h.pointer('pointerdown', 2, 200); h.touch('touchstart', [[100, 100], [200, 100]]);
  h.pointer('pointermove', 1, 70); h.pointer('pointermove', 2, 250);
  h.touch('touchmove', [[70, 120], [250, 120]]);
  assert.equal(h.painted.length, 0, 'pinch contacts never become editable cells');
  assert.equal(h.strokes.length, 0);
  assert.ok(h.city.controls.target.distanceTo(target) > 0, 'bundled OrbitControls pans with the gesture');
  assert.ok(h.city.camera.position.distanceTo(h.city.controls.target) < distance, 'bundled OrbitControls also pinches to zoom');
  h.pointer('pointerup', 2, 250); h.touch('touchend', [[70, 120]]);
  h.pointer('pointermove', 1, 360); h.pointer('pointerup', 1, 360); h.touch('touchend', []);
  assert.equal(h.painted.length, 0, 'the remaining finger must lift before painting can restart');
  h.pointer('pointerdown', 3, 400); h.pointer('pointerup', 3, 400); h.touch('touchend', []);
  assert.equal(h.painted.length, 1, 'a fresh tap resumes without bridging from the camera gesture');
  near(h.painted[0].x, 30); assert.equal(h.strokes.length, 1);
  h.city.controls.dispose();
});

test('adding a finger ends an existing drawing stroke once and never joins it to the next stroke', () => {
  const h = pointerScene();
  h.pointer('pointerdown', 1, 100); h.pointer('pointermove', 1, 120);
  const count = h.painted.length; assert.ok(count > 1);
  h.pointer('pointerdown', 2, 200);
  assert.equal(h.strokes.length, 1);
  h.pointer('pointermove', 1, 300); h.pointer('pointermove', 2, 400);
  h.pointer('pointerup', 1, 300); h.pointer('pointerup', 2, 400); h.touch('touchend', []);
  assert.equal(h.painted.length, count); assert.equal(h.strokes.length, 1);
  h.pointer('pointerdown', 3, 500); h.pointer('pointerup', 3, 500);
  assert.equal(h.painted.length, count + 1); assert.equal(h.strokes.length, 2);
  h.city.controls.dispose();
});

test('pointer cancellation, capture loss and tool changes finish only the owning edit and leave fresh input usable', () => {
  const h = pointerScene();
  h.pointer('pointerdown', 1, 100); h.pointer('pointercancel', 1, 100);
  assert.equal(h.painted.length, 0); assert.equal(h.strokes.length, 0);
  h.pointer('pointerdown', 2, 100); h.pointer('pointermove', 2, 120);
  h.pointer('pointerup', 99, 500, 100, 'pen');
  assert.equal(h.strokes.length, 0, 'an unrelated pointer cannot end the active stroke');
  h.canvas.fire('lostpointercapture', { pointerId: 2, pointerType: 'touch' });
  assert.equal(h.strokes.length, 1);
  const count = h.painted.length;
  h.pointer('pointermove', 2, 300); h.pointer('pointerup', 2, 300); h.touch('touchend', []);
  assert.equal(h.painted.length, count);
  h.pointer('pointerdown', 3, 300, 100, 'mouse');
  assert.equal(h.painted.length, count + 1, 'mouse editing remains immediate');
  h.city.setTool('view');
  assert.equal(h.strokes.length, 2);
  h.pointer('pointermove', 3, 500, 100, 'mouse'); h.pointer('pointerup', 3, 500, 100, 'mouse');
  assert.equal(h.painted.length, count + 1);
  h.city.controls.dispose();
});

test('view mode uses a single touch to orbit and never edits the canvas', () => {
  const h = pointerScene(); h.city.setTool('view');
  const position = h.city.camera.position.clone();
  h.pointer('pointerdown', 1, 100); h.touch('touchstart', [[100, 100]]);
  h.pointer('pointermove', 1, 150); h.touch('touchmove', [[150, 120]]);
  h.pointer('pointerup', 1, 150); h.touch('touchend', []);
  assert.ok(h.city.camera.position.distanceTo(position) > 0);
  assert.equal(h.painted.length, 0); assert.equal(h.strokes.length, 0);
  h.city.controls.dispose();
});

test('ordinary city endpoint and terrain editing also use the active touch without treating camera gestures as taps', () => {
  const h = pointerScene(), cells = [];
  h.city.setEditor(false); h.city.setTool('start');
  h.city.cellAt = event => Math.min(15, Math.floor(event.clientX / 20));
  h.city.options.onCell = index => cells.push(index);
  h.pointer('pointerdown', 1, 40); h.pointer('pointerup', 1, 40);
  assert.deepEqual(cells, [2]);
  h.pointer('pointerdown', 2, 60); h.pointer('pointerdown', 3, 80);
  h.pointer('pointermove', 2, 100); h.pointer('pointerup', 3, 80); h.pointer('pointerup', 2, 100);
  assert.deepEqual(cells, [2], 'two-finger navigation leaves the existing endpoints intact');
  h.city.setTool('wall');
  h.pointer('pointerdown', 4, 100); h.pointer('pointermove', 4, 160); h.pointer('pointerup', 4, 160);
  assert.deepEqual(cells, [2, 5, 8]);
  assert.equal(h.strokes.length, 2);
  h.city.controls.dispose();
});

test('camera bearing follows the actual view direction around a panned target', () => {
  const { city } = cameraScene(), target = city.controls.target;
  for (const [x, z, expected] of [[0, 20, 0], [-20, 0, 90], [0, -20, 180], [20, 0, 270], [-20, 20, 45], [20, 20, 315]]) {
    city.camera.position.set(target.x + x, target.y + 12, target.z + z);
    near(city.getBearing(), expected);
  }
  city.camera.position.set(target.x, target.y + 20, target.z);
  assert.equal(city.getBearing(), 0, 'an exactly vertical camera uses a stable north bearing');
  city.camera.position.x = NaN;
  assert.ok(Number.isNaN(city.getBearing()), 'invalid coordinates mark the compass unavailable instead of reporting a false north');
  city.controls.dispose();
});

test('north reset preserves pan, distance, tilt and zoom while stopping a camera tween and automatic orbit', () => {
  const { city } = cameraScene(), target = city.controls.target.clone(), offset = city.camera.position.clone().sub(target);
  city.camera.zoom = 1.7; city.camera.updateProjectionMatrix();
  city.cameraTween = { position: new THREE.Vector3(1, 2, 3), target: new THREE.Vector3() };
  city.cameraFraming = 'explore'; city.cameraPreset = 'street'; city.cameraTouched = false; city.controls.autoRotate = true;
  assert.equal(city.resetNorth(), true);
  near(city.getBearing(), 0); near(city.controls.target.distanceTo(target), 0);
  near(city.camera.position.distanceTo(target), offset.length());
  near(city.camera.position.y - target.y, offset.y);
  near(city.camera.position.z - target.z, Math.hypot(offset.x, offset.z));
  near(city.camera.position.x, target.x); near(city.camera.zoom, 1.7);
  assert.equal(city.cameraTween, null); assert.equal(city.cameraTouched, true);
  assert.equal(city.controls.autoRotate, false); assert.equal(city.controls.enableDamping, true);
  assert.equal(city.cameraFraming, 'explore'); assert.equal(city.cameraPreset, 'street');
  const northPosition = city.camera.position.clone();
  for (let frame = 0; frame < 60; frame++) city.controls.update();
  near(city.camera.position.distanceTo(northPosition), 0);
  city.controls.dispose();
});

test('north reset drains actual OrbitControls drag and pan inertia instead of drifting away afterward', () => {
  const { city, canvas, ownerDocument } = cameraScene();
  const drag = (button, dx, dy) => {
    canvas.fire('pointerdown', { pointerType: 'mouse', button, clientX: 100, clientY: 100 });
    ownerDocument.fire('pointermove', { pointerType: 'mouse', clientX: 100 + dx, clientY: 100 + dy });
    ownerDocument.fire('pointerup', { pointerType: 'mouse' });
  };
  drag(0, 100, 20); city.camera.updateMatrixWorld(); drag(2, 36, 15);
  const moving = city.camera.position.clone(); city.controls.update();
  assert.ok(city.camera.position.distanceTo(moving) > 1e-4, 'the fixture contains real pending orbit/pan inertia');
  const target = city.controls.target.clone(), offset = city.camera.position.clone().sub(target);
  city.resetNorth();
  const northPosition = city.camera.position.clone();
  for (let frame = 0; frame < 120; frame++) city.controls.update();
  near(city.getBearing(), 0); near(city.controls.target.distanceTo(target), 0);
  near(city.camera.position.distanceTo(northPosition), 0);
  near(city.camera.position.distanceTo(target), offset.length());
  near(city.camera.position.y - target.y, offset.y);
  city.controls.dispose();
});

test('route geometry follows searched segments, renders over the city and has a larger agent', () => {
  const city = scene(); city.setPath([0, 1, 5]);
  assert.equal(city.routePoints.length, 3);
  near(city.routePoints[0].x, 10.5); near(city.routePoints[0].z, 20.5);
  near(city.routePoints[1].x, 11.5); near(city.routePoints[1].z, 20.5);
  near(city.routePoints[2].x, 11.5); near(city.routePoints[2].z, 21.5);
  near(city.routeDistance, 2);
  const segments = city.route.children.filter(node => node.geometry?.type === 'CylinderGeometry');
  assert.ok(segments.length > 0);
  for (const pass of segments) {
    assert.equal(pass.count, 2, 'each tube pass contains one instance per searched segment');
    for (let index = 0; index < pass.count; index++) {
      const { scale, matrix } = transform(pass, index);
      assert.ok(scale.x * pass.geometry.parameters.radiusTop > 0.035, 'instance transforms give the route real geometric width');
      near(scale.x, scale.z);
      near(scale.y, city.routePoints[index].distanceTo(city.routePoints[index + 1]));
      const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(matrix);
      const b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(matrix);
      const forward = a.distanceTo(city.routePoints[index]) + b.distanceTo(city.routePoints[index + 1]);
      const reverse = b.distanceTo(city.routePoints[index]) + a.distanceTo(city.routePoints[index + 1]);
      assert.ok(Math.min(forward, reverse) < 1e-5, 'tube endpoints retain the searched corners without smoothing through buildings');
    }
  }
  const core = segments.find(node => node.material.opacity === 1), casing = segments.find(node => node !== core);
  assert.ok(core && casing);
  assert.ok(transform(casing, 0).scale.x > transform(core, 0).scale.x, 'the glow casing surrounds the solid route core');
  city.route.traverse(node => {
    if (!node.material) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      assert.equal(material.depthTest, false);
      assert.equal(material.depthWrite, false);
      assert.equal(material.fog, false);
      assert.equal(material.transparent, true, 'route meshes join the transparent pass after landscape columns');
    }
    assert.ok(node.renderOrder > 2, 'the route renders after the search overlay');
  });
  assert.ok(city.routeAgent.geometry.parameters.radius > 0.105, 'the moving agent is larger than the old dot');
  assert.equal(city.routeAgent.material.opacity, 1, 'the main agent remains fully readable');
  assert.ok(segments.some(node => node.material.opacity === 1), 'the route has a fully opaque core within the transparent render pass');
});

test('reusing a route preserves its geometry and clearing releases the old route objects', () => {
  const city = scene(); city.setPath([0, 1, 5]);
  const oldAgent = city.routeAgent, oldChildren = [...city.route.children], oldHalo = city.routeHalo;
  let disposedInstances = 0;
  for (const mesh of oldChildren.filter(node => node.isInstancedMesh)) mesh.addEventListener('dispose', () => disposedInstances++);
  let disposed = 0;
  let haloDisposed = false; oldHalo.geometry.addEventListener('dispose', () => { haloDisposed = true; });
  for (const geometry of new Set(oldChildren.map(node => node.geometry).filter(Boolean))) geometry.addEventListener('dispose', () => disposed++);
  city.setPath([0, 1, 5]);
  assert.equal(city.routeAgent, oldAgent, 'telemetry refreshes do not restart the moving dot');
  city.setPath(null);
  assert.equal(city.path, null);
  assert.equal(city.routeAgent, null);
  assert.equal(city.route.children.length, 0);
  assert.equal(disposedInstances, 2, 'both instance buffers receive the renderer disposal event');
  assert.equal(oldAgent.parent, null);
  assert.ok(disposed > 0, 'cleared route geometry is disposed');
  assert.ok(haloDisposed, 'nested halo geometry is disposed with its route agent');
});

test('the route agent stops advancing while reduced motion is enabled', () => {
  const city = scene(); city.setPath([0, 1, 2, 3]);
  Object.assign(city, {
    camera: new THREE.PerspectiveCamera(),
    controls: { target: new THREE.Vector3(), update() {} },
    markers: new THREE.Group(), lastTime: 0, frameCount: 0, fpsTime: 0,
    renderer: { render() {}, info: { render: { calls: 0, triangles: 0 } } },
    updateTraffic() {},
  });
  city.scene.fog = new THREE.Fog(0x101b24, 65, 135);
  const start = city.routeAgent.position.clone(); city.animate(100);
  assert.ok(city.routeAgent.position.distanceTo(start) > 0, 'the agent moves when motion is allowed');
  const current = city.routeAgent.position.clone(); city.reducedMotion = true; city.animate(200);
  near(city.routeAgent.position.distanceTo(current), 0);
});

test('Q columns use finite visited values only, preserve world positions and distinguish the sign', () => {
  const city = scene(); city.freeBuild = true;
  city.terrain[2] = 1; city.developed[3] = 0; city.elevation[0] = 2;
  city.ensureEffects(); city.makeLandscape(); city.setLandscape(true);
  const values = new Float32Array(city.grid.count), visits = new Uint32Array(city.grid.count);
  values.set([1, -1, 30, 20, NaN, Infinity, 0, 1e20, 20]); visits.fill(1, 0, 8);
  city.setLearningValues(values, visits); city.updateLandscape(0, true);
  assert.ok(city.landscapeHeights[0] > 0);
  near(city.landscapeHeights[0], city.landscapeHeights[1]);
  for (const index of [2, 3, 4, 5, 8]) {
    near(transform(city.landscapeMesh, index).scale.y, 0);
    assert.equal(city.landscapeTargets[index], 0, `cell ${index} must not invent a learned column`);
  }
  assert.ok(city.landscapeHeights[7] <= 4.5, 'very large learned values retain bounded geometry');
  const first = transform(city.landscapeMesh, 0);
  near(first.position.x, 10.5); near(first.position.z, 20.5);
  assert.ok(first.position.y - first.scale.y / 2 >= city.level(0), 'the column starts above its terrain');
  const positive = new THREE.Color(), negative = new THREE.Color();
  city.landscapeMesh.getColorAt(0, positive); city.landscapeMesh.getColorAt(1, negative);
  assert.notEqual(positive.getHex(), negative.getHex(), 'equal magnitudes with different signs have different colors');
  assert.ok(Array.from(city.landscapeMesh.instanceMatrix.array).every(Number.isFinite));
});

test('Q columns ease toward new data and reduced motion applies the latest height immediately', () => {
  const city = scene(); city.ensureEffects(); city.makeLandscape(); city.setLandscape(true);
  const values = new Float32Array(city.grid.count), visits = new Uint32Array(city.grid.count);
  values[0] = 40; visits[0] = 1;
  city.setLearningValues(values, visits);
  city.updateLandscape(0.05);
  assert.ok(city.landscapeHeights[0] > 0 && city.landscapeHeights[0] < city.landscapeTargets[0]);
  city.reducedMotion = true; city.updateLandscape(0.05);
  near(city.landscapeHeights[0], city.landscapeTargets[0]);
  city.setLandscape(false); assert.equal(city.landscape.visible, false);
  city.setLearningValues(null, null);
  assert.equal(city.landscapeActive.size, 0);
  assert.ok(Array.from(city.landscapeHeights).every(height => height === 0));
  for (let index = 0; index < city.grid.count; index++) near(transform(city.landscapeMesh, index).scale.y, 0);
  city.setLandscape(true);
  for (let index = 0; index < city.grid.count; index++) near(transform(city.landscapeMesh, index).scale.y, 0);
});

test('landscape rebuilds dispose old buffers and follow changed canvas origins', () => {
  const city = scene(); city.ensureEffects(); city.makeLandscape(); city.setLandscape(true);
  const old = city.landscapeMesh; let geometryDisposed = false, materialDisposed = false;
  old.geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  old.material.addEventListener('dispose', () => { materialDisposed = true; });
  city.originX = city.grid.originX = -34; city.originZ = city.grid.originZ = 71;
  city.makeLandscape();
  const values = new Float32Array(city.grid.count), visits = new Uint32Array(city.grid.count); values[0] = 3; visits[0] = 1;
  city.setLearningValues(values, visits); city.updateLandscape(0, true);
  assert.ok(geometryDisposed && materialDisposed);
  assert.equal(old.parent, null);
  const first = transform(city.landscapeMesh, 0);
  near(first.position.x, -33.5); near(first.position.z, 71.5);
});

test('particles are bounded, deterministic and stationary when reduced motion or visibility stops them', () => {
  const first = scene(), second = scene();
  for (const city of [first, second]) { city.ensureEffects(); city.setParticles(true); }
  const points = first.particleMesh.geometry.getAttribute('position');
  assert.ok(points.count > 0 && points.count <= 128, 'decorative lights use a bounded points buffer');
  assert.deepEqual(Array.from(points.array), Array.from(second.particleMesh.geometry.getAttribute('position').array));
  for (let i = 0; i < points.count; i++) {
    assert.ok(Number.isFinite(points.getX(i)) && Number.isFinite(points.getY(i)) && Number.isFinite(points.getZ(i)));
    assert.ok(Math.abs(points.getX(i) - 12) <= 8 && Math.abs(points.getZ(i) - 22) <= 8, 'the cloud tracks the district world origin');
    assert.ok(points.getY(i) > 0);
  }
  const initial = Array.from(points.array); first.updateParticles(0.5);
  assert.notDeepEqual(Array.from(points.array), initial, 'lights drift when enabled');
  const moving = Array.from(points.array); first.reducedMotion = true; first.updateParticles(0.5);
  assert.deepEqual(Array.from(points.array), moving);
  first.reducedMotion = false; first.setParticles(false); first.updateParticles(0.5);
  assert.equal(first.particles.visible, false);
  assert.deepEqual(Array.from(points.array), moving, 'hidden particles do no animation work');
  let disposed = false; first.particleMesh.geometry.addEventListener('dispose', () => { disposed = true; });
  first.makeParticles(); assert.equal(disposed, true, 'rebuilding the cloud releases its old geometry');
});

test('grid replacement and scene destruction release effect buffers without resurrecting old learning', () => {
  const city = scene(); city.ensureEffects(); city.makeLandscape(); city.setParticles(true);
  const values = new Float32Array(city.grid.count), visits = new Uint32Array(city.grid.count); values[0] = 8; visits[0] = 1;
  city.setLearningValues(values, visits); city.updateLandscape(0, true); city.setPath([0, 1]);
  const previousEffects = [city.landscapeMesh, city.particleMesh];
  let releasedOnGridChange = 0;
  previousEffects.forEach(mesh => mesh.geometry.addEventListener('dispose', () => releasedOnGridChange++));
  // Materials and labels are unrelated to the effects under test; keep actual
  // grid rebuild/Three geometry code while substituting canvas labels, traffic
  // and lighting setup, which require a browser-backed renderer.
  const material = new THREE.MeshBasicMaterial();
  const materials = Object.fromEntries('road roadAlt highway traffic mud pavement roof roofDark glass ground edge rail grass trunk leaves leaves2 water line orange light vent car carGlass'.split(' ').map(name => [name, material]));
  materials.facade = Array(5).fill(material);
  let rendererDisposed = false, controlsDisposed = false;
  Object.assign(city, {
    materials, world: new THREE.Group(), overlay: new THREE.Group(), markers: new THREE.Group(),
    crownGeo: new THREE.IcosahedronGeometry(1, 1), pickPlane: new THREE.Plane(),
    camera: new THREE.PerspectiveCamera(), cameraTouched: true,
    controls: { dispose() { controlsDisposed = true; } },
    renderer: { dispose() { rendererDisposed = true; } },
    canvas: { removeEventListener() {} }, events: [],
    makeMarkers() {}, makeTraffic() {}, setMode() {},
  });
  city.setLandscape(false); city.setParticles(false);
  const replacement = new Grid(6); replacement.originX = -20; replacement.originZ = 31;
  city.setGrid(replacement);
  assert.equal(releasedOnGridChange, 2);
  assert.equal(city.landscapeMesh.count, replacement.count);
  assert.equal(city.learningValues, null);
  assert.equal(city.landscape.visible, false); assert.equal(city.particles.visible, false);
  assert.equal(city.routeAgent, null); assert.equal(city.path, null);
  city.setLandscape(true);
  assert.ok(Array.from(city.landscapeHeights).every(height => height === 0));
  for (const previous of previousEffects) assert.equal(previous.parent, null);
  let releasedOnDestroy = 0;
  for (const mesh of [city.landscapeMesh, city.particleMesh]) {
    mesh.geometry.addEventListener('dispose', () => releasedOnDestroy++);
    mesh.material.addEventListener('dispose', () => releasedOnDestroy++);
  }
  const originalCancel = global.cancelAnimationFrame;
  global.cancelAnimationFrame = () => {};
  try { city.destroy(); } finally { global.cancelAnimationFrame = originalCancel; }
  assert.equal(releasedOnDestroy, 4);
  assert.ok(rendererDisposed && controlsDisposed);
  assert.equal(city.landscapeMesh, null); assert.equal(city.particleMesh, null);
  assert.equal(city.landscape.children.length, 0); assert.equal(city.particles.children.length, 0);
});
