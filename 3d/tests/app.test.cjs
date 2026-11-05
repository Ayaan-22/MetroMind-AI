const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../js/engine.js');

// Exercise real UI handlers and the real algorithm engine; only graphics and the
// browser surfaces are substituted. This is not a WebGL/rendering test.
function createApp({ width = 1440, height = 900, sidebarCollapsed = false } = {}) {
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
      this.children = []; this.events = new Map(); this.style = { setProperty(key, value) { this[key] = value; } }; this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
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
    append(...els) {
      for (const element of els) {
        if (element.parentElement) element.parentElement.children = element.parentElement.children.filter(child => child !== element);
        this.children.push(element); element.parentElement = this;
      }
    }
    insertBefore(element, reference) {
      if (element === reference) return element;
      if (reference == null) { this.append(element); return element; }
      if (!this.children.includes(reference)) throw new Error('The reference is not a child of this element');
      if (element.parentElement) element.parentElement.children = element.parentElement.children.filter(child => child !== element);
      this.children.splice(this.children.indexOf(reference), 0, element); element.parentElement = this;
      return element;
    }
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
    const parsed = [], stack = [];
    for (const [, closing, tag, raw] of html.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
      if (closing) {
        const index = stack.findLastIndex(element => element.tagName === tag.toUpperCase());
        if (index >= 0) stack.length = index;
        continue;
      }
      const attrs = Object.fromEntries([...raw.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1], m[3]]));
      for (const name of ['checked', 'disabled', 'hidden']) if (new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(raw)) attrs[name] = '';
      const element = new Element(tag, attrs), parent = stack.at(-1);
      if (parent) { element.parentElement = parent; parent.children.push(element); }
      parsed.push(element);
      if (!/\/\s*$/.test(raw) && !/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag)) stack.push(element);
    }
    return parsed;
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'); parse(html);
  for (const [, id, options] of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const all = [...options.matchAll(/<option\b([^>]*)value="([^"]+)"([^>]*)>/g)];
    const selected = all.find(m => /\bselected\b/.test(m[1] + m[3])) || all[0]; if (selected) byID.get(id).value = selected[2];
  }
  const docEvents = new Element(), winEvents = new Element(), body = elements.find(el => el.tagName === 'BODY') || new Element('body');
  document = { body, activeElement: body, hidden: false, getElementById: id => byID.get(id) || null, createElement: tag => new Element(tag), querySelectorAll: sel => elements.filter(e => matches(e, sel)), addEventListener: (...a) => docEvents.addEventListener(...a) };
  class FakeCity {
    constructor(element, options) { this.options = options; this.fps = 60; this.zoomFactors = []; this.fitCount = 0; this.editor = false; this.editorChanges = []; this.bearing = 42; this.northResets = 0; this.orbit = false; }
    setGrid(grid) { this.grid = grid; }
    setSearch(visited, frontier, route) { this.visited = visited; this.frontier = frontier; this.path = route; }
    setPath(route) { this.path = route; }
    setLayer(layer, data) { this.layer = layer; this.layerData = data; }
    setLandscape(enabled) { this.landscapeEnabled = Boolean(enabled); }
    setParticles(enabled) { this.particlesEnabled = Boolean(enabled); }
    setLearningValues(values, counts) { this.learningValues = values ? Array.from(values) : null; this.learningCounts = counts ? Array.from(counts) : null; }
    setTool(v) { this.tool = v; }
    fitCity() { this.fitCount++; }
    zoom(factor) { this.zoomFactors.push(factor); }
    setCamera(value) { this.cameraPreset = value; }
    getBearing() { return this.bearing; }
    resetNorth() { this.bearing = 0; this.northResets++; }
    setOrbit(value) { this.orbit = value; }
    setEditor(enabled, options = {}) { this.editor = Boolean(enabled); this.editorOptions = { ...options }; this.editorChanges.push([this.editor, this.editorOptions]); if (options.brushSize !== undefined) this.brushSize = options.brushSize; if (options.showGrid !== undefined) this.gridGuides = options.showGrid; }
    setBrush(size) { this.brushSize = size; }
    setGridGuides(visible) { this.gridGuides = Boolean(visible); }
    setTraffic(visible) { this.trafficVisible = Boolean(visible); }
    resize() {} setMode() {} setQuality() {} updateCells() {} destroy() {}
  }
  const storage = new Map();
  if (sidebarCollapsed) storage.set('metromind-sidebar-collapsed', 'true');
  const context = vm.createContext({ console, document, MetroEngine: engine, MetroCity: FakeCity, Blob, innerWidth: width, innerHeight: height, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} }, setTimeout: (fn, delay) => { const id = next++; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => { const id = next++; frames.set(id, fn); return id; }, addEventListener: (...a) => winEvents.addEventListener(...a) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), context, { filename: 'app.js' });
  return { app: context.MetroApp, downloads, body, document, storage, element: id => byID.get(id), click(id) { const el = byID.get(id); el.focus(); return el.click(); }, change(id, value) { const e = byID.get(id); e.value = value; e.dispatch('change'); }, key(value, target = body) { let prevented = false; docEvents.dispatch('keydown', { key: value, target, preventDefault() { prevented = true; } }); return prevented; }, resize(nextWidth, nextHeight = context.innerHeight) { context.innerWidth = nextWidth; context.innerHeight = nextHeight; winEvents.dispatch('resize'); }, action(action) { const b = new Element('button', { 'data-action': action }); byID.get('modal-content').dispatch('click', { target: b }); }, frame() { time += 200; for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); } }, async timers() { for (const [id, { fn }] of [...timers]) { if (timers.has(id)) { timers.delete(id); fn(); } } await Promise.resolve(); } };
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

test('Display switches control both effects and retain choices when reopened or the scene is rebuilt', () => {
  const h = createApp();
  h.app.generate('empty'); h.click('finish-btn'); const route = Array.from(h.app.search.path);
  assert.equal(h.app.city.landscapeEnabled, true);
  assert.equal(h.app.city.particlesEnabled, true);
  h.click('nav-settings');
  assert.equal(h.element('landscape-setting').checked, true);
  assert.equal(h.element('particles-setting').checked, true);
  for (const id of ['landscape-setting', 'particles-setting']) { h.element(id).checked = false; h.element(id).dispatch('change'); }
  assert.equal(h.app.city.landscapeEnabled, false);
  assert.equal(h.app.city.particlesEnabled, false);
  h.click('close-modal'); h.click('nav-settings');
  assert.equal(h.element('landscape-setting').checked, false);
  assert.equal(h.element('particles-setting').checked, false);
  h.element('motion-setting').checked = true; h.element('motion-setting').dispatch('change');
  assert.equal(h.app.city.reducedMotion, true);
  assert.equal(h.app.city.trafficVisible, true, 'reduced motion pauses enabled cars instead of hiding them');
  h.click('close-modal'); h.click('retry-scene');
  assert.equal(h.app.city.landscapeEnabled, false);
  assert.equal(h.app.city.particlesEnabled, false);
  assert.equal(h.app.city.reducedMotion, true);
  assert.deepEqual(Array.from(h.app.city.path), route, 'rebuilding graphics restores the current route');
});

test('the landscape receives genuine visited Q-values independently of the heatmap and clears stale training data', () => {
  const h = createApp(); h.app.generate('empty'); h.click('tab-learning');
  for (const id of ['heatmap', 'policy-arrows']) { h.element(id).checked = false; h.element(id).dispatch('change'); }
  h.change('episodes', '10'); h.change('max-steps', '10'); h.change('batch-size', '10'); h.click('run-btn');
  for (let i = 0; i < 5 && h.app.state.training; i++) h.frame();
  assert.deepEqual(h.app.city.learningValues, Array.from(h.app.learner.heat));
  assert.deepEqual(h.app.city.learningCounts, Array.from(h.app.learner.counts));
  assert.ok(h.app.city.learningCounts.some(count => count > 0));
  assert.equal(h.app.city.layer, 'search', 'the 3D landscape does not depend on either policy overlay');
  h.click('tab-search'); assert.equal(h.app.city.learningValues, null);
  h.click('tab-learning'); assert.ok(h.app.city.learningValues);
  h.click('reset-agent'); assert.equal(h.app.city.learningValues, null);
  h.click('step-btn'); assert.ok(h.app.city.learningValues);
  h.app.generate('downtown'); assert.equal(h.app.city.learningValues, null);
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
  assert.equal(h.element('nav-simulation').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('drawer-backdrop').hidden, true, 'desktop map remains interactive');

  h.click('nav-learning');
  assert.equal(h.app.state.learning, true);
  assert.equal(h.element('control-panel').classList.contains('open'), true, 'changing workspace does not dismiss its panel');
  assert.equal(h.element('nav-learning').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('nav-simulation').getAttribute('aria-expanded'), 'true', 'the Controls button represents the visible panel in either workspace');

  h.click('toggle-analytics');
  assert.equal(h.element('control-panel').classList.contains('open'), false);
  assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'false');
  assert.equal(h.element('nav-learning').getAttribute('aria-expanded'), 'false');
  assert.equal(h.element('toggle-analytics').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('drawer-backdrop').hidden, true);
  h.click('close-analytics');
  assert.equal(h.element('toggle-analytics').getAttribute('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, h.element('toggle-analytics'));
});

test('closing and reopening floating Controls preserves the selected learning workspace', () => {
  const h = createApp(); h.click('nav-learning');
  assert.equal(h.app.state.learning, true);
  h.change('episodes', '30'); h.click('close-controls');
  assert.equal(h.element('map-commandbar').hidden, false);
  assert.equal(h.element('command-learning').hidden, false);
  h.click('nav-simulation');
  assert.equal(h.app.state.learning, true, 'opening Controls does not switch to pathfinding');
  assert.equal(h.element('learning-settings').hidden, false);
  assert.equal(h.element('episodes').value, '30');
  assert.equal(h.element('nav-simulation').getAttribute('aria-expanded'), 'true');
  h.click('tab-search');
  assert.equal(h.app.state.learning, false, 'the Pathfinding tab explicitly changes workspace');
});

test('mobile drawers dismiss from a focused field and adapt their backdrop on resize', () => {
  const h = createApp({ width: 390 });
  h.click('nav-simulation');
  assert.equal(h.element('drawer-backdrop').hidden, false);
  assert.equal(h.document.activeElement, h.element('close-controls'));
  h.element('seed').focus();
  h.key('Escape', h.element('seed'));
  assert.equal(h.element('control-panel').classList.contains('open'), false);
  assert.equal(h.element('drawer-backdrop').hidden, true);
  assert.equal(h.document.activeElement, h.element('nav-simulation'));

  h.click('toggle-analytics');
  assert.equal(h.element('drawer-backdrop').hidden, false);
  h.resize(1440);
  assert.equal(h.element('analytics-panel').classList.contains('open'), true, 'resizing does not discard the active panel');
  assert.equal(h.element('drawer-backdrop').hidden, true);
  h.click('close-analytics');
  assert.equal(h.document.activeElement, h.element('toggle-analytics'));
});

test('pinned panels survive workspace actions and explicit close unpins only the chosen panel', () => {
  const h = createApp(); h.click('nav-simulation'); h.click('pin-controls');
  assert.equal(h.element('pin-controls').getAttribute('aria-pressed'), 'true');
  assert.equal(h.element('control-panel').classList.contains('pinned'), true);
  assert.equal(h.body.classList.contains('controls-pinned'), true);
  h.click('nav-simulation');
  assert.equal(h.element('control-panel').classList.contains('open'), true, 'the pinned navigation toggle keeps its panel available');
  h.app.generate('empty'); h.click('run-btn');
  assert.equal(h.element('control-panel').classList.contains('open'), true, 'starting a simulation preserves pinned controls');
  h.click('run-btn'); h.click('toggle-analytics'); h.click('pin-insights');
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  assert.equal(h.element('analytics-panel').classList.contains('open'), true);
  assert.equal(h.element('pin-insights').getAttribute('aria-pressed'), 'true');
  assert.equal(h.body.classList.contains('insights-pinned'), true);
  h.key('g');
  assert.equal(h.body.classList.contains('immersive'), true);
  for (const id of ['control-panel', 'analytics-panel']) {
    assert.equal(h.element(id).classList.contains('open'), true, 'focus mode preserves pinned panel state');
    assert.equal(h.element(id).getAttribute('aria-hidden'), 'true', 'focus mode hides pinned panels from interaction');
  }
  h.key('g');
  assert.equal(h.body.classList.contains('immersive'), false);
  for (const id of ['control-panel', 'analytics-panel']) assert.equal(h.element(id).getAttribute('aria-hidden'), 'false');
  assert.equal(h.element('pin-controls').getAttribute('aria-pressed'), 'true');
  assert.equal(h.element('pin-insights').getAttribute('aria-pressed'), 'true');
  h.key('Escape'); h.click('drawer-backdrop');
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  assert.equal(h.element('analytics-panel').classList.contains('open'), true);
  h.click('help-btn'); h.click('close-modal'); h.click('free-build-btn');
  assert.equal(h.element('control-panel').classList.contains('open'), true, 'dialogs and Free Build preserve pinned controls');
  assert.equal(h.element('analytics-panel').classList.contains('open'), true);
  h.click('close-controls');
  assert.equal(h.element('control-panel').classList.contains('open'), false);
  assert.equal(h.element('pin-controls').getAttribute('aria-pressed'), 'false');
  assert.equal(h.body.classList.contains('controls-pinned'), false);
  assert.equal(h.element('analytics-panel').classList.contains('open'), true, 'closing one panel does not dismiss the other pin');
  h.click('pin-insights');
  assert.equal(h.element('pin-insights').getAttribute('aria-pressed'), 'false');
  assert.equal(h.element('analytics-panel').classList.contains('open'), true, 'unpinning keeps the current panel open');
  h.click('drawer-backdrop');
  assert.equal(h.element('analytics-panel').classList.contains('open'), false);
});

test('mobile pins retain both panels while exposing only the selected panel and restore both on desktop', () => {
  const h = createApp({ width: 390 }), algorithm = h.element('algorithm'), speed = h.element('speed'), environment = h.element('map-environment');
  h.click('nav-simulation'); h.click('pin-controls');
  assert.equal(algorithm.closest('#algorithm-slot'), h.element('algorithm-slot'));
  assert.equal(speed.closest('#speed-slot'), h.element('speed-slot'));
  assert.equal(environment.parentElement, h.element('environment-slot'));
  assert.equal(h.element('map-commandbar').hidden, true);
  h.click('toggle-analytics'); h.click('pin-insights');
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  assert.equal(h.element('control-panel').getAttribute('aria-hidden'), 'true');
  assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'false');
  assert.ok(algorithm.closest('#map-commandbar'), 'suspending Controls returns its canonical inputs to the visible floating capsule');
  assert.ok(speed.closest('#map-commandbar'));
  assert.equal(environment.parentElement, h.element('viewport'));
  assert.equal(h.element('map-commandbar').hidden, false);
  assert.equal(h.element('drawer-backdrop').hidden, true, 'pinned mobile panels do not install a blocking backdrop');
  h.resize(1440);
  for (const id of ['control-panel', 'analytics-panel']) assert.equal(h.element(id).getAttribute('aria-hidden'), 'false');
  assert.ok(algorithm.closest('#control-panel'));
  assert.ok(speed.closest('#control-panel'));
  assert.equal(environment.parentElement, h.element('environment-slot'));
  h.resize(390); h.click('nav-simulation');
  assert.equal(h.element('control-panel').getAttribute('aria-hidden'), 'false');
  assert.equal(h.element('analytics-panel').classList.contains('open'), true);
  assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'true');
  assert.equal(h.element('algorithm'), algorithm);
  assert.equal(h.element('speed'), speed);
  assert.ok(algorithm.closest('#algorithm-slot'));
  assert.ok(speed.closest('#speed-slot'));
  h.key('Escape');
  assert.equal(h.element('control-panel').getAttribute('aria-hidden'), 'false');
  h.click('close-controls');
  assert.equal(h.element('pin-controls').getAttribute('aria-pressed'), 'false');
  assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'false', 'closing the front panel reveals the other retained pin');
  assert.ok(algorithm.closest('#map-commandbar'));
  assert.ok(speed.closest('#map-commandbar'));
  assert.equal(environment.parentElement, h.element('viewport'));
});

test('phone and tablet width changes preserve pinned panels and the same canonical settings', () => {
  // This covers responsive application state, not CSS layout or browser rendering.
  for (const [width, height, controlsSuspended] of [[320,568,true], [390,844,true], [570,700,true], [768,1024,true], [844,390,true], [844,900,false]]) {
    const h = createApp({ width, height }), algorithm = h.element('algorithm'), speed = h.element('speed'), environment = h.element('map-environment');
    h.click('nav-simulation'); h.click('pin-controls');
    h.change('algorithm', 'dijkstra'); speed.value = '48'; speed.dispatch('input');
    h.click('toggle-analytics'); h.click('pin-insights');
    assert.equal(h.element('control-panel').getAttribute('aria-hidden'), String(controlsSuspended), `Controls visibility at ${width} × ${height}`);
    assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'false');
    assert.equal(h.element('pin-controls').getAttribute('aria-pressed'), 'true');
    assert.equal(h.element('pin-insights').getAttribute('aria-pressed'), 'true');
    h.resize(390);
    assert.equal(h.element('control-panel').classList.contains('mobile-suspended'), true);
    assert.equal(algorithm.closest('#map-commandbar'), h.element('map-commandbar'));
    assert.equal(environment.parentElement, h.element('viewport'));
    h.click('nav-simulation');
    assert.equal(h.element('control-panel').getAttribute('aria-hidden'), 'false');
    assert.equal(h.element('analytics-panel').getAttribute('aria-hidden'), 'true');
    assert.equal(algorithm.closest('#algorithm-slot'), h.element('algorithm-slot'));
    assert.equal(speed.closest('#speed-slot'), h.element('speed-slot'));
    h.resize(844, 900);
    for (const id of ['control-panel', 'analytics-panel']) assert.equal(h.element(id).getAttribute('aria-hidden'), 'false');
    assert.equal(h.element('algorithm'), algorithm);
    assert.equal(h.element('speed'), speed);
    assert.equal(algorithm.value, 'dijkstra');
    assert.equal(speed.value, '48');
    assert.equal(environment.parentElement, h.element('environment-slot'));
    h.click('close-controls'); h.click('close-analytics');
    assert.equal(algorithm.closest('#map-commandbar'), h.element('map-commandbar'));
    assert.equal(speed.closest('#map-commandbar'), h.element('map-commandbar'));
    assert.equal(environment.parentElement, h.element('viewport'));
  }
});

test('compact floating controls work directly on the map without duplicate navigation buttons', () => {
  const h = createApp();
  for (const id of ['toggle-controls', 'compare-btn', 'quick-algorithm', 'quick-algorithm-name']) assert.equal(h.element(id), undefined, `${id} no longer duplicates navigation`);
  for (const id of ['nav-simulation', 'nav-compare', 'free-build-btn', 'toggle-analytics']) {
    assert.ok(h.element(id).closest('#workspace-actions'), `${id} belongs to the floating action group`);
    assert.equal(h.element(id).closest('nav'), null, 'the sidebar does not repeat floating actions');
    assert.equal(h.document.querySelectorAll('#' + id).length, 1);
  }
  for (const id of ['algorithm', 'speed']) {
    assert.ok(h.element(id).closest('#map-commandbar'), `${id} remains directly on the map`);
    assert.equal(h.element(id).closest('#control-panel'), null);
  }
  assert.ok(h.element('grid-size').closest('#map-environment'));
  assert.equal(h.element('grid-size').closest('#control-panel'), null);
  assert.equal(h.element('control-panel').classList.contains('open'), false);
  h.change('grid-size', '15'); h.app.generate('empty'); h.change('algorithm', 'astar');
  h.element('speed').value = '33'; h.element('speed').dispatch('input');
  assert.match(h.element('speed-value').textContent, /33/);
  h.click('run-btn'); h.frame();
  assert.ok(h.app.search.cursor > 2, 'the on-map speed range changes actual playback');
  h.click('run-btn');
  h.element('quick-diagonal').checked = true; h.element('quick-diagonal').dispatch('change');
  assert.equal(h.element('diagonal').checked, true);
  h.click('finish-btn'); assert.equal(h.app.search.options.diagonal, true);
  h.element('quick-replan').checked = false; h.element('quick-replan').dispatch('change');
  assert.equal(h.element('live-replan').checked, false);
  h.key('1'); h.app.city.options.onCell(h.app.grid.start + 1, {}); h.app.flushEdits();
  assert.equal(h.app.search, null, 'turning quick replanning off uses ordinary reset behavior');
  h.element('diagonal').checked = false; h.element('diagonal').dispatch('change');
  h.element('live-replan').checked = true; h.element('live-replan').dispatch('change');
  assert.equal(h.element('quick-diagonal').checked, false);
  assert.equal(h.element('quick-replan').checked, true);
  h.click('quick-maps'); assert.equal(h.element('modal').open, true); h.click('close-modal');
  const oldGrid = h.app.grid; h.click('quick-regenerate');
  assert.notEqual(h.app.grid, oldGrid);
  assert.equal(h.element('control-panel').classList.contains('open'), false, 'quick settings do not reopen Controls');
});

test('the floating environment card reuses its controls inside an open Controls panel and returns when closed', () => {
  const h = createApp(), environment = h.element('map-environment'), grid = h.element('grid-size');
  assert.equal(environment.parentElement, h.element('viewport'));
  h.click('nav-simulation');
  assert.equal(environment.parentElement, h.element('environment-slot'));
  assert.ok(grid.closest('#control-panel'));
  h.change('grid-size', '40');
  assert.equal(h.app.grid.size, 40);
  // Generation may dismiss an unpinned panel, but must return the same controls.
  assert.equal(h.element('map-environment'), environment);
  assert.equal(h.element('grid-size'), grid);
  assert.equal(environment.parentElement, h.element('viewport'));
  h.click('nav-simulation'); h.click('pin-controls');
  h.click('quick-regenerate');
  assert.equal(environment.parentElement, h.element('environment-slot'));
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  h.click('close-controls');
  assert.equal(environment.parentElement, h.element('viewport'));
  assert.equal(h.element('grid-size'), grid);
});

test('on-map learning controls synchronize episodes and test the learned policy with Controls closed', () => {
  const h = createApp(); h.app.generate('empty');
  assert.equal(h.element('command-learning').hidden, true);
  assert.equal(h.element('command-search').hidden, false);
  h.click('nav-learning'); h.click('close-controls');
  assert.equal(h.element('command-learning').hidden, false);
  assert.equal(h.element('command-search').hidden, true);
  h.change('quick-episodes', '20'); assert.equal(h.element('episodes').value, '20');
  h.change('episodes', '30'); assert.equal(h.element('quick-episodes').value, '30');
  h.change('quick-episodes', '20'); h.change('max-steps', '10'); h.change('batch-size', '10'); h.click('run-btn');
  for (let i = 0; i < 5 && h.app.state.training; i++) h.frame();
  assert.equal(h.app.learner.episodes, 20);
  h.click('quick-policy'); assert.ok(h.app.city.path.length >= 1);
  assert.equal(h.element('control-panel').classList.contains('open'), false);
});

test('map focus mode is reversible and leaves ordinary keyboard navigation available', () => {
  const h = createApp();
  h.click('nav-simulation');
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

test('the sidebar can close and reopen without disturbing pinned controls, and remembers the choice', () => {
  const h = createApp(), rail = h.element('workspace-sidebar'), toggle = h.element('sidebar-toggle'), grid = h.app.grid;
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(rail.inert, false);
  h.click('nav-simulation'); h.click('pin-controls');
  h.click('sidebar-toggle'); h.frame();
  assert.equal(h.body.classList.contains('sidebar-collapsed'), true);
  assert.equal(rail.inert, true);
  assert.equal(rail.getAttribute('aria-hidden'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Show sidebar');
  assert.equal(h.storage.get('metromind-sidebar-collapsed'), 'true');
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  assert.equal(h.app.grid, grid);
  h.click('sidebar-toggle');
  assert.equal(h.body.classList.contains('sidebar-collapsed'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(rail.inert, false);
  assert.equal(h.storage.get('metromind-sidebar-collapsed'), 'false');
  h.resize(390);
  assert.equal(toggle.disabled, true);
  assert.equal(rail.inert, true, 'the phone workspace menu replaces the hidden sidebar');
  h.resize(1440);
  assert.equal(toggle.disabled, false);
  assert.equal(rail.inert, false);
  const restored = createApp({ sidebarCollapsed: true });
  assert.equal(restored.body.classList.contains('sidebar-collapsed'), true);
  assert.equal(restored.element('sidebar-toggle').getAttribute('aria-expanded'), 'false');
  restored.key('g'); restored.key('Escape');
  assert.equal(restored.body.classList.contains('sidebar-collapsed'), true, 'focus mode retains the saved sidebar choice');
  restored.click('sidebar-toggle');
  assert.equal(restored.element('workspace-sidebar').inert, false);
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

test('the compass follows camera bearing and resets north while stopping automatic orbit', () => {
  const h = createApp(), before = JSON.stringify(h.app.grid.serialize());
  assert.equal(h.element('compass').disabled, false);
  assert.equal(h.element('compass-bearing').textContent, '042°');
  assert.equal(h.element('compass-needle').style.transform, 'rotate(-42deg)');
  h.app.city.bearing = 270; h.frame();
  assert.equal(h.element('compass-bearing').textContent, '270°');
  assert.equal(h.element('compass-needle').style.transform, 'rotate(-270deg)');
  assert.match(h.element('compass').getAttribute('aria-label'), /270°.*Reset/);
  h.click('orbit-btn'); assert.equal(h.app.city.orbit, true);
  h.click('compass');
  assert.equal(h.app.city.northResets, 1);
  assert.equal(h.app.city.orbit, false);
  assert.equal(h.element('orbit-btn').getAttribute('aria-pressed'), 'false');
  assert.equal(h.element('compass-bearing').textContent, '000°');
  assert.equal(JSON.stringify(h.app.grid.serialize()), before);
  h.app.city.bearing = 359.8; h.frame();
  assert.equal(h.element('compass-bearing').textContent, '000°', 'rounding never displays 360 degrees');
  h.app.city.bearing = NaN; h.frame();
  assert.equal(h.element('compass').disabled, true, 'an unavailable camera cannot trigger a reset');
  h.click('compass'); assert.equal(h.app.city.northResets, 1);
});

test('speed retains its accessible value and filled track when moved between the floating dock and Controls', () => {
  const h = createApp(), speed = h.element('speed');
  h.element('speed').value = '120'; speed.dispatch('input');
  assert.equal(speed.style['--range-fill'], '100%');
  assert.equal(speed.getAttribute('aria-valuetext'), '120 steps per second');
  assert.equal(h.element('speed-value').textContent, '120 steps/s');
  h.click('nav-simulation'); assert.equal(speed.closest('#speed-slot'), h.element('speed-slot'));
  assert.equal(speed.style['--range-fill'], '100%');
  speed.value = '1'; speed.dispatch('input');
  h.click('close-controls');
  assert.equal(h.element('speed'), speed);
  assert.ok(speed.closest('#map-commandbar'));
  assert.equal(speed.style['--range-fill'], '0%');
  assert.equal(speed.getAttribute('aria-valuetext'), '1 step per second');
});

test('advanced terrain tools remain available and cannot stay active while hidden', () => {
  const h = createApp(); h.app.generate('empty');
  const primaryCount = h.element('map-tools').children.length;
  assert.equal(h.element('terrain-palette').hidden, true);
  assert.equal(h.element('terrain-surfaces').children.length, 4);
  assert.equal(h.element('terrain-elevation').children.length, 2);
  assert.equal(h.element('tools-expand').getAttribute('aria-expanded'), 'false');
  h.key('5');
  assert.equal(h.element('tools-expand').getAttribute('aria-expanded'), 'true');
  assert.equal(h.element('terrain-palette').hidden, false);
  assert.equal(h.element('map-tools').children.length, primaryCount, 'opening advanced tools leaves the primary rail intact');
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
  h.key('Escape');
  assert.equal(h.element('terrain-palette').hidden, true);
  assert.equal(h.app.state.tool, 'view');
  assert.equal(h.document.activeElement, h.element('tools-expand'));
});

test('Free Build exposes its drawing choices in a compact editor without an options popup', () => {
  const h = createApp(); h.click('tools-expand'); h.click('free-build-btn');
  assert.equal(h.element('terrain-palette').hidden, true);
  assert.equal(h.element('build-options-toggle'), undefined);
  assert.equal(h.element('builder-options'), undefined);
  for (const id of ['build-tool-road', 'build-tool-wall', 'build-tool-erase', 'build-tool-start', 'build-tool-goal', 'build-surface', 'brush-size', 'grid-guides', 'build-blank', 'build-undo', 'build-redo', 'builder-done']) {
    assert.ok(h.element(id).closest('.builder-toolbar'), `${id} remains directly in the single editing bar`);
  }
  h.change('brush-size', '3'); h.change('build-surface', 'traffic');
  assert.equal(h.app.state.brushSize, 3);
  assert.equal(h.app.state.tool, 'traffic');
  h.element('grid-guides').checked = true; h.element('grid-guides').dispatch('change');
  assert.equal(h.app.city.gridGuides, true);
  h.click('build-tool-wall');
  assert.equal(h.app.state.tool, 'wall');
  h.click('build-blank');
  assert.equal(h.app.grid.preset, 'freebuild');
  assert.equal(h.element('builder-workspace').hidden, false);
  h.key('Escape');
  assert.equal(h.app.state.editing, true);
  h.click('builder-done');
  assert.equal(h.element('builder-workspace').hidden, true);
});

test('the phone workspace menu reaches secondary tools and Free Build can navigate without painting', () => {
  for (const width of [320, 390, 570]) {
    const h = createApp({ width });
    assert.equal(h.element('workspace-sidebar').inert, true, 'the phone menu replaces the hidden sidebar');
    const chooseWorkspace = key => {
      h.click('workspace-menu');
      const cards = h.document.querySelectorAll('[data-workspace]');
      for (const action of ['simulation', 'learning', 'freebuild', 'layers', 'display', 'focus', 'help']) {
        assert.ok(cards.some(card => card.dataset.workspace === action), `${action} is reachable from the phone menu`);
      }
      const card = cards.findLast(item => item.dataset.workspace === key);
      h.element('modal-content').dispatch('click', { target: card });
    };
    chooseWorkspace('simulation');
    assert.equal(h.element('control-panel').getAttribute('aria-hidden'), 'false'); h.click('close-controls');
    chooseWorkspace('learning');
    assert.equal(h.app.state.learning, true); h.click('close-controls');
    chooseWorkspace('layers');
    assert.equal(h.element('modal').open, true);
    assert.ok(h.document.querySelectorAll('[data-layer]').length >= 3); h.click('close-modal');
    chooseWorkspace('display');
    assert.equal(h.element('modal').open, true);
    assert.ok(h.element('quality-setting'));
    h.change('lighting-setting', 'night');
    assert.ok(h.document.querySelectorAll('[data-light]').find(button => button.dataset.light === 'night').classList.contains('active'));
    h.click('close-modal');
    chooseWorkspace('display');
    assert.equal(h.element('lighting-setting').value, 'night'); h.click('close-modal');
    chooseWorkspace('help');
    assert.equal(h.element('modal').open, true); h.click('close-modal');
    chooseWorkspace('focus');
    assert.equal(h.body.classList.contains('immersive'), true);
    h.click('restore-map-ui');
    assert.equal(h.body.classList.contains('immersive'), false, 'a screen button restores controls without a keyboard');
    chooseWorkspace('freebuild'); h.click('build-blank');
    const grid = h.app.grid, point = { x: grid.originX + 2.5, z: grid.originZ + 2.5 }, index = grid.worldToCell(point.x, point.z).index;
    const before = JSON.stringify(grid.serialize());
    h.click('build-tool-view');
    assert.equal(h.app.state.editing, true);
    assert.equal(h.app.state.tool, 'view');
    assert.equal(h.app.city.tool, 'view');
    assert.equal(h.element('build-tool-view').getAttribute('aria-pressed'), 'true');
    buildStroke(h, [point]);
    assert.equal(JSON.stringify(grid.serialize()), before, 'navigating the canvas cannot paint a road');
    h.click('build-tool-road'); buildStroke(h, [point]);
    assert.equal(grid.developed[index], 1, 'drawing resumes without leaving Free Build');
    h.click('build-undo'); assert.equal(h.app.grid.developed[index], 0);
    h.click('build-redo'); assert.equal(h.app.grid.developed[index], 1);
    h.click('builder-done'); assert.equal(h.app.state.editing, false);
  }
});

test('Free Build preserves canonical simulation controls in visible Controls or their floating capsule', () => {
  const h = createApp(), algorithm = h.element('algorithm'), speed = h.element('speed');
  h.click('nav-simulation'); h.click('pin-controls'); h.click('free-build-btn');
  assert.equal(h.element('build-simulation-tools'), undefined, 'the build dock does not absorb unrelated simulation controls');
  assert.equal(h.element('map-commandbar').hidden, true);
  assert.equal(h.element('command-search').parentElement, h.element('algorithm-slot'));
  assert.equal(h.element('command-speed').parentElement, h.element('speed-slot'));
  assert.equal(h.element('command-learning').parentElement, h.element('map-commandbar'));
  for (const id of ['command-search', 'command-learning', 'command-speed']) assert.equal(h.element(id).closest('.builder-toolbar'), null);
  assert.equal(h.element('map-environment').hidden, true, 'Build hides map generation controls while retaining the pinned panel');
  h.click('finish-btn'); assert.ok(h.app.search);
  h.change('algorithm', 'dijkstra');
  assert.equal(h.app.search, null, 'changing the canonical algorithm clears the previous search');
  assert.equal(h.app.state.editing, true);
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  assert.equal(h.element('pin-controls').getAttribute('aria-pressed'), 'true');
  h.element('speed').value = '48'; h.element('speed').dispatch('input');
  assert.match(h.element('speed-value').textContent, /48/);
  h.click('nav-learning');
  assert.equal(h.element('command-search').hidden, true);
  assert.equal(h.element('command-learning').hidden, false);
  assert.ok(h.element('quick-episodes').closest('#map-commandbar'));
  h.change('quick-episodes', '20'); assert.equal(h.element('episodes').value, '20');
  h.click('builder-done');
  assert.equal(h.element('algorithm'), algorithm, 'mode changes reuse the canonical controls rather than cloning them');
  assert.equal(h.element('speed'), speed);
  assert.equal(h.element('command-search').parentElement, h.element('algorithm-slot'));
  assert.equal(h.element('command-speed').parentElement, h.element('speed-slot'));
  assert.equal(h.element('map-environment').hidden, false);
  assert.equal(h.element('command-search').hidden, true);
  assert.equal(h.element('command-learning').hidden, false);
  assert.equal(h.element('control-panel').classList.contains('open'), true);
  h.click('tab-search');
  assert.equal(h.element('command-search').hidden, false);
  assert.equal(h.element('algorithm').value, 'dijkstra');
  assert.equal(h.element('speed').value, '48');
  h.click('close-controls'); h.click('free-build-btn');
  assert.equal(h.element('map-commandbar').hidden, false, 'Build retains its floating simulation capsule when Controls are closed');
  for (const id of ['command-search', 'command-learning', 'command-speed']) assert.equal(h.element(id).parentElement, h.element('map-commandbar'));
  assert.deepEqual(h.element('map-commandbar').children.filter(child => ['command-search', 'command-learning', 'command-speed'].includes(child.id)).map(child => child.id), ['command-search', 'command-learning', 'command-speed']);
  assert.equal(h.element('algorithm'), algorithm);
  assert.equal(h.element('speed'), speed);
  assert.equal(h.element('algorithm').value, 'dijkstra');
  assert.equal(h.element('speed').value, '48');
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
  assert.match(h.element('build-help').textContent, /200/);
});

test('the regular grid selector generates a routable 100 by 100 city', () => {
  const h = createApp(); h.change('grid-size', '100');
  assert.equal(h.app.grid.size, 100);
  assert.equal(h.app.grid.count, 10000);
  assert.equal(h.app.grid.freeBuild, false);
  assert.equal(h.element('scene-grid-label').textContent, '10,000 NODES');
  h.click('finish-btn');
  assert.ok(h.app.search.path?.length > 1);
});

test('a 200 by 200 Free Build canvas supports undo, redo, portable import and returning to regular presets', async () => {
  const h = createApp(); h.app.newFreeCanvas();
  const point = { x: h.app.grid.originX + 190.5, z: h.app.grid.originZ + 4.5 };
  const start = h.app.grid.cellToWorld(h.app.grid.start), goal = h.app.grid.cellToWorld(h.app.grid.goal);
  buildStroke(h, [point]);
  assert.equal(h.app.grid.size, 200);
  assert.equal(h.app.grid.count, 40000);
  assert.deepEqual(h.app.grid.cellToWorld(h.app.grid.start), start);
  assert.deepEqual(h.app.grid.cellToWorld(h.app.grid.goal), goal);
  h.click('build-undo'); assert.equal(h.app.grid.size, 30);
  h.click('build-redo'); assert.equal(h.app.grid.size, 200);
  h.click('export-btn'); h.action('export-json');
  const json = await h.downloads.at(-1).text(), other = createApp(); other.app.importCity(json);
  assert.equal(other.app.state.editing, true);
  assert.equal(other.app.grid.size, 200);
  assert.equal(other.app.grid.developed[worldCell(other.app.grid, point)], 1);
  assert.deepEqual(other.app.grid.serialize(), h.app.grid.serialize());
  other.click('builder-done'); other.app.generate('downtown');
  assert.equal(other.app.grid.size, 100, 'regular preset generation respects its own ceiling after a larger Free Build canvas');
  assert.equal(other.app.grid.freeBuild, false);
});
