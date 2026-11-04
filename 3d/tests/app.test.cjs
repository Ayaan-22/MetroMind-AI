const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../js/engine.js');

// Exercise real UI handlers and the real algorithm engine; only graphics and the
// browser surfaces are substituted. This is not a WebGL/rendering test.
function createApp() {
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
      this.tagName = tag.toUpperCase(); this.attrs = attrs; this.id = attrs.id; this.dataset = {};
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
  const docEvents = new Element(), winEvents = new Element(), body = new Element('body');
  document = { body, activeElement: body, hidden: false, getElementById: id => byID.get(id) || null, createElement: tag => new Element(tag), querySelectorAll: sel => elements.filter(e => matches(e, sel)), addEventListener: (...a) => docEvents.addEventListener(...a) };
  class FakeCity {
    constructor(element, options) { this.options = options; this.fps = 60; }
    setGrid(grid) { this.grid = grid; }
    setSearch(visited, frontier, route) { this.visited = visited; this.frontier = frontier; this.path = route; }
    setPath(route) { this.path = route; }
    setLayer(layer, data) { this.layer = layer; this.layerData = data; }
    setTool(v) { this.tool = v; }
    resize() {} setMode() {} setQuality() {} setTraffic() {} setCamera() {} setOrbit() {} updateCells() {} destroy() {}
  }
  const storage = new Map();
  const context = vm.createContext({ console, document, MetroEngine: engine, MetroCity: FakeCity, Blob, innerWidth: 1440, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} }, setTimeout: (fn, delay) => { const id = next++; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => { const id = next++; frames.set(id, fn); return id; }, addEventListener: (...a) => winEvents.addEventListener(...a) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), context, { filename: 'app.js' });
  return { app: context.MetroApp, downloads, element: id => byID.get(id), click: id => byID.get(id).click(), change(id, value) { const e = byID.get(id); e.value = value; e.dispatch('change'); }, key(value) { docEvents.dispatch('keydown', { key: value, target: body }); }, action(action) { const b = new Element('button', { 'data-action': action }); byID.get('modal-content').dispatch('click', { target: b }); }, frame() { time += 200; for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); } }, async timers() { for (const [id, { fn }] of [...timers]) { if (timers.has(id)) { timers.delete(id); fn(); } } await Promise.resolve(); } };
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
