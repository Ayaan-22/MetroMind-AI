const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../js/engine.js');

// Exercise real UI handlers and the real algorithm engine; only graphics and the
// browser surfaces are substituted. This is not a WebGL/rendering test.
function createApp({ width = 1440 } = {}) {
  const elements = [], byID = new Map(), timers = new Map(), frames = new Map(), downloads = [];
  let next = 1, time = 0, document;
  const canvas = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  function matches(el, selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part.startsWith('.')) return el.classList.contains(part.slice(1));
      if (part.startsWith('#')) return el.id === part.slice(1);
      const attr = /^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(part);
      if (attr) return attr[1] in el.attrs && (!attr[2] || el.attrs[attr[1]] === attr[2]);
      return el.tagName === part.toUpperCase();
    });
  }
  class Element {
    constructor(tag = 'div', attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attrs = attrs; this.id = attrs.id;
      this.dataset = new Proxy({}, { set: (target, key, value) => { target[key] = String(value); this.attrs['data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = String(value); return true; } });
      for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, v) => v.toUpperCase())] = value;
      this.children = []; this.events = new Map(); this.style = {}; this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
      this.classList = { add: (...names) => names.forEach(n => this.classes.add(n)), remove: (...names) => names.forEach(n => this.classes.delete(n)), contains: n => this.classes.has(n), toggle: (n, on = !this.classes.has(n)) => { if (on) this.classes.add(n); else this.classes.delete(n); return on; } };
      this.value = attrs.value || ''; this.checked = 'checked' in attrs; this.disabled = 'disabled' in attrs; this.hidden = 'hidden' in attrs;
      this.textContent = ''; this.width = Number(attrs.width) || 400; this.height = Number(attrs.height) || 200; this.clientWidth = 900; this.clientHeight = 650;
      elements.push(this); if (this.id) byID.set(this.id, this);
    }
    get className() { return [...this.classes].join(' '); }
    set className(v) { this.classes = new Set(v.split(/\s+/)); }
    get innerHTML() { return this.html || ''; }
    set innerHTML(v) { this.html = v; this.children = parse(v); this.children.forEach(e => e.parentElement = this); }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(k, fn) { if (!this.events.has(k)) this.events.set(k, []); this.events.get(k).push(fn); }
    dispatch(type, data = {}) { if (type === 'click' && this.disabled) return; const e = { target: this, currentTarget: this, preventDefault() {}, ...data }; const outputs = []; if (this['on' + type]) outputs.push(this['on' + type](e)); for (const fn of this.events.get(type) || []) outputs.push(fn(e)); return outputs; }
    click() { return this.dispatch('click'); }
    append(...els) { els.forEach(e => { this.children.push(e); e.parentElement = this; }); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(e => e !== this); }
    replaceChildren(...els) { this.children = []; this.append(...els); }
    getContext() { return canvas; }
    getBoundingClientRect() { return { top: 0, left: 0, width: this.width, height: this.height, right: this.width, bottom: this.height }; }
    closest(selector) { return matches(this, selector) ? this : this.parentElement?.closest(selector) || null; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  function parse(html) {
    return [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(([, tag, raw]) => {
      const attrs = Object.fromEntries([...raw.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1], m[3]]));
      for (const name of ['checked', 'disabled', 'hidden']) if (new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(raw)) attrs[name] = '';
      return new Element(tag, attrs);
    });
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'); parse(html);
  for (const [, id, options] of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const all = [...options.matchAll(/<option\b([^>]*)value="([^"]+)"([^>]*)>/g)];
    const selected = all.find(m => /\bselected\b/.test(m[1] + m[3])) || all[0]; if (selected) byID.get(id).value = selected[2];
  }
  const docEvents = new Element(), winEvents = new Element(), body = elements.find(el => el.tagName === 'BODY') || new Element('body');
  document = { body, activeElement: body, hidden: false, getElementById: id => byID.get(id) || null, createElement: tag => new Element(tag), querySelectorAll: sel => elements.filter(e => matches(e, sel)), addEventListener: (...a) => docEvents.addEventListener(...a) };
  class FakeCity {
    constructor(element, options) { this.options = options; this.fps = 60; this.zoomFactors = []; this.fitCount = 0; this.editor = false; this.editorChanges = []; }
    setGrid(grid) { this.grid = grid; }
    setSearch(visited, frontier, route) { this.visited = visited; this.frontier = frontier; this.path = route; }
    setPath(route) { this.path = route; }
    setLayer(layer, data) { this.layer = layer; this.layerData = data; }
    setTool(v) { this.tool = v; }
    fitCity() { this.fitCount++; }
    zoom(factor) { this.zoomFactors.push(factor); }
    setCamera(value) { this.cameraPreset = value; }
    setEditor(enabled, options = {}) { this.editor = Boolean(enabled); this.editorOptions = { ...options }; this.editorChanges.push([this.editor, this.editorOptions]); if (options.brushSize !== undefined) this.brushSize = options.brushSize; if (options.showGrid !== undefined) this.gridGuides = options.showGrid; }
    setBrush(size) { this.brushSize = size; }
    setGridGuides(visible) { this.gridGuides = Boolean(visible); }
    resize() {} setMode() {} setQuality() {} setTraffic() {} setOrbit() {} updateCells() {} destroy() {}
  }
  const storage = new Map();
  const context = vm.createContext({ console, document, MetroEngine: engine, MetroCity: FakeCity, Blob, innerWidth: width, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} }, setTimeout: (fn, delay) => { const id = next++; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => { const id = next++; frames.set(id, fn); return id; }, addEventListener: (...a) => winEvents.addEventListener(...a) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), context, { filename: 'app.js' });
  return { app: context.MetroApp, downloads, body, document, element: id => byID.get(id), click(id) { const el = byID.get(id); el.focus(); return el.click(); }, change(id, value) { const e = byID.get(id); e.value = value; e.dispatch('change'); }, key(value, target = body) { let prevented = false; docEvents.dispatch('keydown', { key: value, target, preventDefault() { prevented = true; } }); return prevented; }, resize(nextWidth) { context.innerWidth = nextWidth; winEvents.dispatch('resize'); }, action(action) { const b = new Element('button', { 'data-action': action }); byID.get('modal-content').dispatch('click', { target: b }); }, frame() { time += 200; for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); } }, async timers() { for (const [id, { fn }] of [...timers]) { if (timers.has(id)) { timers.delete(id); fn(); } } await Promise.resolve(); } };
}

test('search playback supports run, pause, step, back, history seeking and completion', () => {
  const h = createApp(); h.app.generate('empty'); h.click('run-btn'); assert.equal(h.app.state.playing, true);
  h.frame(); h.frame(); assert.ok(h.app.search.cursor > 0);
  h.click('run-btn'); assert.equal(h.app.state.playing, false);
  const cursor = h.app.search.cursor; h.click('step-btn'); assert.equal(h.app.search.cursor, cursor + 1);
  h.click('back-btn'); assert.equal(h.app.search.cursor, cursor);
  h.element('history').value = '0'; h.element('history').dispatch('input'); assert.equal(h.app.search.cursor, 0);
  h.click('finish-btn'); assert.equal(h.app.search.done, true); assert.ok(h.app.search.path.length > 1);
  assert.equal(h.element('state-label').textContent, 'Route found'); assert.equal(h.app.state.playing, false);
});

test('presets replace city data, valid exports reopen and invalid imports leave the workspace intact', () => {
  const h = createApp(); h.change('grid-size', '15'); h.app.generate('terrain');
  assert.equal(h.app.grid.size, 15); assert.equal(h.app.grid.preset, 'terrain');
  const before = JSON.stringify(h.app.grid.serialize()), grid = h.app.grid;
  h.app.importCity('{"size":30,"types":[1],"start":-1}');
  assert.equal(h.app.grid, grid); assert.equal(JSON.stringify(h.app.grid.serialize()), before);
  const imported = new engine.Grid(12).generate('empty', 77); h.app.importCity(JSON.stringify(imported.serialize()));
  assert.equal(h.app.grid.size, 12); assert.equal(h.app.grid.seed, 77);
});

test('JSON and CSV downloads carry the actual editable city and completed experiment', async () => {
  const h = createApp(); h.app.generate('empty'); h.click('finish-btn');
  h.click('export-btn'); h.action('export-json'); const map = JSON.parse(await h.downloads.at(-1).text());
  assert.equal(map.size, h.app.grid.size); assert.deepEqual(map.types, Array.from(h.app.grid.types));
  h.action('export-csv'); const csv = await h.downloads.at(-1).text(); assert.match(csv, /travel_cost/); assert.match(csv, /A\* Search/); assert.match(csv, new RegExp(h.app.search.cost.toFixed(4)));
});

test('learning completes a bounded training run, tests its learned policy, and resets telemetry', () => {
  const h = createApp(); h.app.generate('empty'); h.click('finish-btn'); h.click('tab-learning');
  assert.equal(h.element('stat-path').textContent, '—', 'old classical result is not presented as a learned policy');
  h.change('episodes', '10'); h.change('max-steps', '10'); h.change('batch-size', '10'); h.click('run-btn');
  for (let i = 0; i < 5 && h.app.state.training; i++) h.frame();
  assert.equal(h.app.learner.episodes, 10); assert.equal(h.app.state.training, false);
  h.click('policy-btn'); assert.ok(h.app.city.path.length >= 1);
  h.click('reset-agent'); assert.equal(h.app.learner, null); assert.equal(h.element('stat-path').textContent, '—'); assert.equal(h.element('rl-episodes').textContent, '0');
});

test('paused D* edits retain dynamic state and repair on the next search step', () => {
  const h = createApp(); h.app.generate('empty'); h.change('algorithm', 'dstar'); h.click('step-btn');
  const session = h.app.search, dynamic = session.dynamic; h.key('1');
  const cell = h.app.grid.start + 1; h.app.city.options.onCell(cell, {}); h.app.flushEdits();
  assert.equal(h.app.grid.types[cell], 1); assert.equal(h.app.search, session); assert.equal(session.dynamic, dynamic); assert.equal(h.app.state.playing, false);
  h.click('finish-btn'); const reference = new engine.SearchSession(h.app.grid, 'dijkstra').finish(); assert.equal(h.app.search.cost, reference.cost);
});

test('closing an in-flight comparison prevents it from replacing another dialog', async () => {
  const h = createApp(); const done = h.app.compare(); h.click('close-modal'); h.click('help-btn'); const title = h.element('modal-title').textContent;
  for (let i = 0; i < 15; i++) await h.timers(); await done;
  assert.equal(h.element('modal-title').textContent, title); assert.match(h.element('modal-content').innerHTML, /shortcut-grid/);
});

test('desktop map opens controls and insights on demand without blocking map interaction', () => {
  const h = createApp();
  assert.equal(h.body.classList.contains('map-first'), true);
  assert.equal(h.element('control-panel').getAttribute('aria-hidden'), 'true');
  assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'true');

  h.click('nav-simulation');
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  assert.equal(h.element('toggle-controls').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('nav-simulation').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('drawer-backdrop').hidden, true, 'desktop map remains interactive');

  h.click('nav-learning');
  assert.equal(h.app.state.learning, true);
  assert.equal(h.element('control-panel').classList.contains('open'), true, 'changing workspace does not dismiss its panel');
  assert.equal(h.element('nav-learning').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('nav-simulation').getAttribute('aria-expanded'), 'false');

  h.click('toggle-analytics');
  assert.equal(h.element('control-panel').classList.contains('open'), false);
  assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'false');
  assert.equal(h.element('toggle-controls').getAttribute('aria-expanded'), 'false');
  assert.equal(h.element('toggle-analytics').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('drawer-backdrop').hidden, true);
  h.click('close-analytics');
  assert.equal(h.element('toggle-analytics').getAttribute('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, h.element('toggle-analytics'));
});

test('mobile drawers dismiss from a focused field and adapt their backdrop on resize', () => {
  const h = createApp({ width: 390 });
  h.click('toggle-controls');
  assert.equal(h.element('drawer-backdrop').hidden, false);
  assert.equal(h.document.activeElement, h.element('close-controls'));
  h.element('seed').focus();
  h.key('Escape', h.element('seed'));
  assert.equal(h.element('control-panel').classList.contains('open'), false);
  assert.equal(h.element('drawer-backdrop').hidden, true);
  assert.equal(h.document.activeElement, h.element('toggle-controls'));

  h.click('toggle-analytics');
  assert.equal(h.element('drawer-backdrop').hidden, false);
  h.resize(1440);
  assert.equal(h.element('analytics-panel').classList.contains('open'), true, 'resizing does not discard the active panel');
  assert.equal(h.element('drawer-backdrop').hidden, true);
  h.click('close-analytics');
  assert.equal(h.document.activeElement, h.element('toggle-analytics'));
});

test('map focus mode is reversible and leaves ordinary keyboard navigation available', () => {
  const h = createApp();
  h.click('toggle-controls');
  h.key('g');
  assert.equal(h.body.classList.contains('immersive'), true);
  assert.equal(h.element('control-panel').classList.contains('open'), false);
  assert.equal(h.element('restore-map-ui').hidden, false);
  assert.equal(h.element('fullscreen-btn').getAttribute('aria-pressed'), 'true');
  h.key('Escape');
  assert.equal(h.body.classList.contains('immersive'), false);
  assert.equal(h.body.classList.contains('map-first'), true);
  assert.equal(h.element('restore-map-ui').hidden, true);
  assert.equal(h.element('fullscreen-btn').getAttribute('aria-pressed'), 'false');
  assert.equal(h.key('Tab'), false, 'Tab uses the browser focus sequence');
  assert.equal(h.body.classList.contains('immersive'), false);
});

test('map zoom and fit controls change the camera without editing city data', () => {
  const h = createApp(), before = JSON.stringify(h.app.grid.serialize()), fits = h.app.city.fitCount;
  h.click('zoom-in'); h.click('zoom-out'); h.click('reset-camera');
  assert.equal(h.app.city.zoomFactors.length, 2);
  assert.ok(h.app.city.zoomFactors[0] > 1, 'zoom in moves closer');
  assert.ok(h.app.city.zoomFactors[1] > 0 && h.app.city.zoomFactors[1] < 1, 'zoom out moves farther');
  assert.equal(h.app.city.fitCount, fits + 1);
  assert.equal(JSON.stringify(h.app.grid.serialize()), before);
});

test('advanced terrain tools remain available and cannot stay active while hidden', () => {
  const h = createApp(); h.app.generate('empty');
  assert.equal(h.element('tools-expand').getAttribute('aria-expanded'), 'false');
  h.key('5');
  assert.equal(h.element('tools-expand').getAttribute('aria-expanded'), 'true');
  assert.equal(h.app.state.tool, 'highway');
  h.app.city.options.onCell(2, {}); h.app.flushEdits();
  assert.equal(h.app.grid.types[2], 2);
  h.click('tools-expand');
  assert.equal(h.element('tools-expand').getAttribute('aria-expanded'), 'false');
  assert.equal(h.app.state.tool, 'view', 'collapsing terrain tools returns to the visible orbit control');
  h.key('8');
  assert.equal(h.element('tools-expand').getAttribute('aria-expanded'), 'true');
  h.app.city.options.onCell(3, {}); h.app.flushEdits();
  assert.ok(h.app.grid.elevations[3] > 0);
});

function buildStroke(h, points, event = {}) {
  for (const point of points) h.app.city.options.onPaintWorld(point, event);
  h.app.city.options.onStrokeEnd();
}

function worldCell(grid, point) {
  const hit = grid.worldToCell(point.x, point.z);
  assert.equal(hit.inBounds, true, 'the world position remains inside the editable model');
  return hit.index;
}

test('Free Build entry preserves the current city, and Done preserves the finished layout', () => {
  const h = createApp(), grid = h.app.grid, types = Array.from(grid.types), elevations = Array.from(grid.elevations);
  const start = grid.cellToWorld(grid.start), goal = grid.cellToWorld(grid.goal);
  assert.ok(h.element('free-build-btn'));
  h.click('free-build-btn');
  assert.equal(h.app.state.editing, true);
  assert.equal(h.app.grid.freeBuild, true);
  assert.equal(h.app.city.editor, true);
  assert.equal(h.app.state.tool, 'road');
  assert.equal(h.element('builder-workspace').hidden, false);
  assert.equal(h.element('free-build-btn').getAttribute('aria-pressed'), 'true');
  assert.equal(h.element('grid-size').disabled, true);
  assert.deepEqual(Array.from(h.app.grid.types), types);
  assert.deepEqual(Array.from(h.app.grid.elevations), elevations);
  assert.deepEqual(h.app.grid.cellToWorld(h.app.grid.start), start);
  assert.deepEqual(h.app.grid.cellToWorld(h.app.grid.goal), goal);

  const finished = JSON.stringify(h.app.grid.serialize());
  h.click('builder-done');
  assert.equal(h.app.state.editing, false);
  assert.equal(h.app.city.editor, false);
  assert.equal(h.app.state.tool, 'view');
  assert.equal(h.element('builder-workspace').hidden, true);
  assert.equal(h.element('grid-size').disabled, false);
  assert.equal(JSON.stringify(h.app.grid.serialize()), finished, 'Done changes the editor mode, not the city data');
});

test('a blank Free Build canvas requires drawn roads and its route responds to building and erase strokes', () => {
  const h = createApp(); h.click('free-build-btn'); h.click('build-blank');
  const grid = h.app.grid, start = grid.cellToWorld(grid.start), goal = grid.cellToWorld(grid.goal);
  assert.equal(h.app.state.editing, true);
  assert.equal(grid.freeBuild, true);
  assert.equal(grid.developed.reduce((a, v) => a + v, 0), 2);
  h.click('finish-btn');
  assert.equal(h.app.search.path, null, 'unbuilt surrounding ground cannot become a shortcut');

  const road = [];
  for (let x = start.x; x <= goal.x; x++) road.push({ x, z: start.z });
  buildStroke(h, road);
  h.click('finish-btn');
  assert.ok(h.app.search.path?.length > 1);
  assert.equal(h.app.search.path[0], grid.start);
  assert.equal(h.app.search.path.at(-1), grid.goal);
  assert.ok(h.app.search.path.every(i => grid.developed[i] && grid.types[i] === 0));

  const middle = { x: (start.x + goal.x) / 2, z: start.z };
  h.click('build-tool-wall'); buildStroke(h, [middle]);
  h.click('finish-btn'); assert.equal(h.app.search.path, null);
  buildStroke(h, [start]);
  assert.equal(grid.types[grid.start], 0, 'the origin stays passable when a building brush overlaps it');
  h.click('build-tool-erase'); buildStroke(h, [middle]);
  const i = worldCell(grid, middle);
  assert.equal(grid.developed[i], 0);
  assert.equal(grid.types[i], 1, 'erasing returns a cell to undeveloped land');
  h.click('build-tool-road'); buildStroke(h, [middle]);
  h.click('finish-btn'); assert.ok(h.app.search.path?.length > 1);
});

test('builder brush width, weighted surface selection and guides change the intended editor state', () => {
  const h = createApp(); h.app.newFreeCanvas();
  h.change('brush-size', '3');
  assert.equal(h.app.state.brushSize, 3);
  assert.equal(h.app.city.brushSize, 3);
  const center = { x: .5, z: 6.5 };
  buildStroke(h, [center]);
  const grid = h.app.grid;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const i = worldCell(grid, { x: center.x + dx, z: center.z + dz });
    assert.equal(grid.developed[i], 1);
    assert.equal(grid.types[i], 0);
  }
  assert.equal(grid.developed.reduce((a, v) => a + v, 0), 11, 'the brush develops nine cells alongside the two endpoint cells');
  h.change('build-surface', 'highway');
  buildStroke(h, [{ x: .5, z: 10.5 }]);
  assert.equal(grid.types[worldCell(grid, { x: .5, z: 10.5 })], 2);
  h.element('grid-guides').checked = true; h.element('grid-guides').dispatch('change');
  assert.equal(h.app.city.gridGuides, true);
});

test('painting beyond the board expands the canvas while undo and redo restore its exact world layout', () => {
  const h = createApp(); h.app.startFreeBuild();
  const before = JSON.stringify(h.app.grid.serialize()), oldSize = h.app.grid.size;
  const start = h.app.grid.cellToWorld(h.app.grid.start), goal = h.app.grid.cellToWorld(h.app.grid.goal);
  const building = h.app.grid.types.findIndex(type => type === 1), buildingWorld = h.app.grid.cellToWorld(building);
  const point = { x: h.app.grid.originX - 2.5, z: h.app.grid.originZ + 4.5 };
  buildStroke(h, [point]);
  assert.ok(h.app.grid.size > oldSize);
  assert.deepEqual(h.app.grid.cellToWorld(h.app.grid.start), start);
  assert.deepEqual(h.app.grid.cellToWorld(h.app.grid.goal), goal);
  assert.equal(h.app.grid.types[worldCell(h.app.grid, buildingWorld)], 1);
  assert.equal(h.app.grid.types[worldCell(h.app.grid, point)], 0);
  assert.equal(h.app.grid.developed[worldCell(h.app.grid, point)], 1);
  const after = JSON.stringify(h.app.grid.serialize());
  assert.equal(h.element('build-undo').disabled, false);
  h.click('build-undo');
  assert.equal(JSON.stringify(h.app.grid.serialize()), before);
  assert.equal(h.element('build-redo').disabled, false);
  h.click('build-redo');
  assert.equal(JSON.stringify(h.app.grid.serialize()), after);
  assert.equal(h.app.state.editing, true);
  assert.equal(h.app.city.editor, true);
});

test('diagonal freehand samples keep a connected road for four-way search', () => {
  const h = createApp(); h.app.newFreeCanvas();
  const points = [{ x: .5, z: 4.5 }, { x: 1.5, z: 5.5 }, { x: 2.5, z: 6.5 }, { x: 3.5, z: 7.5 }];
  buildStroke(h, points);
  const grid = h.app.grid, start = worldCell(grid, points[0]), goal = worldCell(grid, points.at(-1));
  const originalStart = grid.start, originalGoal = grid.goal;
  grid.start = start; grid.goal = goal;
  const result = new engine.SearchSession(grid, 'astar', { diagonal: false }).finish();
  grid.start = originalStart; grid.goal = originalGoal;
  assert.ok(result.path?.length > points.length, 'corner bridge cells connect diagonal drawing samples');
  assert.ok(result.path.every(i => grid.developed[i] && grid.types[i] !== 1));
});

test('Free Build export and import retain the developed canvas and reopen the editor', async () => {
  const h = createApp(); h.app.newFreeCanvas();
  const point = { x: h.app.grid.originX - 3.5, z: h.app.grid.originZ + 3.5 };
  buildStroke(h, [point]);
  h.click('builder-done'); h.click('export-btn'); h.action('export-json');
  const exported = JSON.parse(await h.downloads.at(-1).text());
  assert.equal(exported.freeBuild, true);
  assert.equal(exported.developed.length, exported.size * exported.size);
  const other = createApp(); other.app.importCity(JSON.stringify(exported));
  assert.equal(other.app.state.editing, true);
  assert.equal(other.app.city.editor, true);
  assert.equal(other.app.state.tool, 'road');
  assert.equal(other.element('builder-workspace').hidden, false);
  assert.deepEqual(other.app.grid.serialize(), exported);
  assert.equal(other.app.grid.developed[worldCell(other.app.grid, point)], 1);
});

test('a stroke beyond the supported expansion limit leaves the current canvas intact', () => {
  const h = createApp(); h.app.newFreeCanvas();
  const before = JSON.stringify(h.app.grid.serialize());
  buildStroke(h, [{ x: h.app.grid.originX + 200.5, z: h.app.grid.originZ + 4.5 }]);
  assert.equal(JSON.stringify(h.app.grid.serialize()), before);
  assert.equal(h.app.state.editing, true);
  assert.match(h.element('build-help').textContent, /100/);
});
