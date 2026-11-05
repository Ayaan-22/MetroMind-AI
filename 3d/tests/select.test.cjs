const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The component's real event handlers run here. Only browser layout and DOM
// primitives are substituted; visual appearance is checked in a browser.
function harness({ width = 1000, height = 800, visualBounds } = {}) {
  let document;
  class DOMEvent {
    constructor(type, options = {}) { Object.assign(this, { type, bubbles: false, defaultPrevented: false }, options); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.stopped = true; }
  }
  class Target {
    constructor() { this.events = new Map(); }
    addEventListener(name, handler) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(handler); }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      for (const handler of this.events.get(event.type) || []) handler(event);
      if (event.bubbles && !event.stopped && this.parentElement) this.parentElement.dispatchEvent(event);
      else if (event.bubbles && !event.stopped && this === document.documentElement) document.dispatchEvent(event);
      return !event.defaultPrevented;
    }
  }
  class Element extends Target {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parentElement = null; this.style = {}; this.dataset = {}; this._text = ''; this._selected = 0;
      this.rect = { top: 100, bottom: 140, left: 40, right: 300, width: 260, height: 40 };
      const classes = new Set();
      this.classList = { add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)), contains: v => classes.has(v), toggle: (v, on = !classes.has(v)) => { on ? classes.add(v) : classes.delete(v); return on; }, values: () => [...classes] };
    }
    get id() { return this.attrs.id || ''; } set id(value) { this.attrs.id = value; }
    get className() { return this.classList.values().join(' '); } set className(value) { this.classList.remove(...this.classList.values()); this.classList.add(...value.split(/\s+/).filter(Boolean)); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); } set textContent(value) { this._text = String(value); this.children = []; }
    get options() { return this.tagName === 'SELECT' ? this.querySelectorAll('option') : undefined; }
    get selectedIndex() { return this._selected; } set selectedIndex(value) { this._selected = value; }
    get value() { return this.tagName === 'SELECT' ? this.options[this.selectedIndex]?.value || '' : this.attrs.value || ''; }
    set value(value) { if (this.tagName === 'SELECT') this.selectedIndex = this.options.findIndex(o => o.value === value); else this.attrs.value = value; }
    get label() { return this.attrs.label || this.textContent; }
    get labels() { return document.querySelectorAll('label').filter(label => label.getAttribute('for') === this.id || label.contains(this)); }
    get disabled() { return this.attrs.disabled === true; } set disabled(value) { this.attrs.disabled = !!value; }
    get multiple() { return false; } get size() { return 1; }
    get isConnected() { return this === document.documentElement || !!this.parentElement?.isConnected; }
    get scrollHeight() { return this.children.reduce((sum, child) => sum + (child.classList.contains('metro-select-caption') ? 35 : 52), 10); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    append(...children) { children.forEach(child => { child.remove(); child.parentElement = this; this.children.push(child); }); }
    insertBefore(child, before) { child.remove(); child.parentElement = this; this.children.splice(this.children.indexOf(before), 0, child); }
    remove() { if (this.parentElement) { this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; } }
    replaceChildren(...children) { this.children.slice().forEach(child => child.remove()); this.append(...children); }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim(); if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        if (part.startsWith('#')) return this.id === part.slice(1);
        const match = /^(\w+)?(?:\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\])?$/.exec(part);
        return !!match && (!match[1] || this.tagName === match[1].toUpperCase()) && (!match[2] || match[2] in this.attrs && (match[3] === undefined || this.attrs[match[2]] === match[3]));
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    cloneNode(deep) { const copy = new Element(this.tagName); copy.attrs = { ...this.attrs }; copy.className = this.className; copy._text = this._text; if (deep) copy.append(...this.children.map(child => child.cloneNode(true))); return copy; }
    getClientRects() { return this.isConnected && !this.closest('[hidden],[aria-hidden="true"]') ? [this.rect] : []; }
    getBoundingClientRect() { return this.rect; }
    scrollIntoView() { this.scrolled = true; }
    focus() { document.activeElement = this; document.dispatchEvent(new DOMEvent('focusin', { target: this })); }
  }
  document = new Target(); document.documentElement = new Element('html'); document.documentElement.clientWidth = width; document.documentElement.clientHeight = height;
  document.body = new Element('body'); document.documentElement.append(document.body); document.activeElement = document.body;
  document.createElement = tag => new Element(tag); document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector); document.getElementById = id => document.querySelectorAll('#' + id)[0]; document.contains = el => document.documentElement.contains(el);
  const window = new Target();
  const visualViewport = visualBounds && Object.assign(new Target(), visualBounds);
  const context = vm.createContext({ document, Event: DOMEvent, innerWidth: width, innerHeight: height, visualViewport, addEventListener: (...args) => window.addEventListener(...args) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/select.js'), 'utf8'), context);
  function select(id, values, selected = 0, { label = id, wrapping = false, parent = document.body } = {}) {
    const host = new Element(wrapping ? 'label' : 'div'); if (!wrapping) host.className = 'select-wrap'; else host._text = label;
    const native = new Element('select'); native.id = id; if (!wrapping) native.setAttribute('aria-label', label);
    values.forEach((item, i) => { const option = new Element('option'); option.value = typeof item === 'string' ? item : item.value; option.textContent = typeof item === 'string' ? item : item.label || item.value; option.disabled = typeof item === 'object' && !!item.disabled; native.append(option); });
    native.selectedIndex = selected; host.append(native); parent.append(host); return native;
  }
  function trigger(native) { return document.getElementById(native.id + '-trigger'); }
  function menu(native) { return document.getElementById(native.id + '-listbox'); }
  function key(native, value) { const event = new DOMEvent('keydown', { key: value, bubbles: true }); trigger(native).dispatchEvent(event); return event; }
  function click(element) { element.dispatchEvent(new DOMEvent('click', { bubbles: true })); }
  return { document, window, visualViewport, select, trigger, menu, key, click, Event: DOMEvent, Element, api: context.MetroSelect };
}

test('enhancement preserves the native selection and accessible labels and is idempotent', () => {
  const h = harness(), native = h.select('grid-size', ['15 × 15', '30 × 30'], 1, { label: 'Grid size', wrapping: true });
  h.api.init(); h.api.init();
  assert.equal(native.value, '30 × 30');
  assert.equal(h.trigger(native).getAttribute('role'), 'combobox');
  assert.equal(h.trigger(native).getAttribute('aria-label'), 'Grid size');
  assert.equal(h.trigger(native).textContent, '30 × 30');
  assert.equal(native.getAttribute('aria-hidden'), 'true');
  assert.equal(h.document.querySelectorAll('.metro-select-trigger').length, 1);
});

test('keyboard navigation commits once, skips disabled options, cancels safely and isolates map shortcuts', () => {
  const h = harness(), native = h.select('algorithm', ['A*', { value: 'blocked', disabled: true }, 'Dijkstra', 'DFS']);
  let changes = 0, mapShortcuts = 0; native.addEventListener('change', () => changes++); h.document.addEventListener('keydown', () => mapShortcuts++); h.api.init();
  h.key(native, 'ArrowDown'); h.key(native, 'ArrowDown');
  assert.equal(native.value, 'A*', 'highlighting does not mutate the actual algorithm');
  assert.equal(h.trigger(native).getAttribute('aria-activedescendant'), 'algorithm-option-2');
  h.key(native, 'Enter'); assert.equal(native.value, 'Dijkstra'); assert.equal(changes, 1); assert.equal(h.menu(native), undefined);
  h.key(native, ' '); h.key(native, 'End'); h.key(native, 'Escape');
  assert.equal(native.value, 'Dijkstra'); assert.equal(changes, 1); assert.equal(h.document.activeElement, h.trigger(native));
  h.key(native, 'f'); h.key(native, 'Escape'); assert.equal(mapShortcuts, 0, 'letters and Space never reach application shortcuts');
  h.key(native, 'Escape'); assert.equal(mapShortcuts, 1, 'Escape with no open menu can close the settings panel');
});

test('pointer choice uses canonical native events and outside interaction dismisses the menu', () => {
  const h = harness(), native = h.select('heuristic', ['Manhattan', 'Euclidean', 'Octile']);
  let changes = 0; native.addEventListener('change', event => { assert.equal(event.target, native); changes++; }); h.api.init();
  h.click(h.trigger(native)); const row = h.menu(native).querySelectorAll('[role="option"]')[1]; h.click(row);
  assert.equal(native.value, 'Euclidean'); assert.equal(changes, 1); assert.equal(h.trigger(native).textContent, 'Euclidean');
  h.click(h.trigger(native)); h.document.dispatchEvent(new h.Event('pointerdown', { target: h.document.body }));
  assert.equal(h.menu(native), undefined); assert.equal(changes, 1);
});

test('programmatic values and disabled states sync and dialog menus remain in the top layer', () => {
  const h = harness(), native = h.select('heuristic', ['Manhattan', 'Octile']); h.api.init();
  native.value = 'Octile'; h.api.sync(); assert.equal(h.trigger(native).textContent, 'Octile');
  h.click(h.trigger(native)); native.disabled = true; h.api.sync(); assert.equal(h.trigger(native).disabled, true); assert.equal(h.menu(native), undefined);
  const dialog = new h.Element('dialog'); dialog.setAttribute('open', ''); h.document.body.append(dialog);
  const quality = h.select('quality-setting', ['High', 'Balanced', 'Performance'], 1, { parent: dialog, label: 'Rendering quality' });
  h.api.init(dialog); h.click(h.trigger(quality)); assert.equal(h.menu(quality).parentElement, dialog);
  dialog.remove(); h.api.init(); assert.equal(h.document.querySelectorAll('.metro-select-menu').length, 0, 'removed dialogs do not retain stale menus');
});

test('menus flip above low controls and clamp their width inside a phone viewport', () => {
  const h = harness({ width: 390, height: 800 }), native = h.select('grid-size', ['15', '20', '30', '40', '50', '60']); h.api.init();
  h.trigger(native).rect = { top: 720, bottom: 760, left: 150, right: 650, width: 500, height: 40 };
  h.click(h.trigger(native)); const menu = h.menu(native);
  assert.equal(menu.dataset.placement, 'above');
  assert.equal(menu.style.width, '370px');
  assert.equal(menu.style.left, '10px');
  assert.ok(Number.parseFloat(menu.style.top) >= 10);
  assert.ok(Number.parseFloat(menu.style.top) + Number.parseFloat(menu.style.maxHeight) <= 713);
  h.document.documentElement.clientWidth = 320;
  h.window.dispatchEvent(new h.Event('resize'));
  assert.equal(h.menu(native), menu, 'resizing keeps an open, visible menu available');
  assert.equal(menu.style.width, '300px');
  assert.equal(menu.style.left, '10px');
  assert.ok(Number.parseFloat(menu.style.top) + Number.parseFloat(menu.style.maxHeight) <= 790);
  h.trigger(native).rect = { top: 100, bottom: 140, left: 240, right: 336, width: 96, height: 40 };
  h.window.dispatchEvent(new h.Event('resize'));
  assert.equal(menu.style.width, '200px', 'compact triggers still leave readable room for option labels');
  assert.equal(menu.style.left, '110px', 'the wider menu remains inside the viewport');
  native.disabled = true;
  h.window.dispatchEvent(new h.Event('resize'));
  assert.equal(h.menu(native), undefined, 'a disabled control cannot retain an open menu');
});

test('an open menu repositions within the visible screen when the phone keyboard reduces it', () => {
  const h = harness({ width: 390, height: 800, visualBounds: { width: 390, height: 800, offsetTop: 0, offsetLeft: 0 } });
  const native = h.select('grid-size', ['15', '20', '30', '40', '50', '60']);
  h.api.init();
  h.trigger(native).rect = { top: 320, bottom: 360, left: 120, right: 260, width: 140, height: 40 };
  h.click(h.trigger(native));
  const menu = h.menu(native);
  assert.equal(menu.dataset.placement, 'below');
  Object.assign(h.visualViewport, { height: 300, offsetTop: 100 });
  h.visualViewport.dispatchEvent(new h.Event('resize'));
  assert.equal(menu.dataset.placement, 'above');
  assert.ok(Number.parseFloat(menu.style.top) >= 110);
  assert.ok(Number.parseFloat(menu.style.top) + Number.parseFloat(menu.style.maxHeight) <= 313);
  h.click(menu.querySelectorAll('[role="option"]')[2]);
  assert.equal(native.value, '30');
});
