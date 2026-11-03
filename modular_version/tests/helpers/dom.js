// A deterministic DOM/canvas/clock for exercising both shipped entry points.
export function createHarness(html) {
  const all = [];
  const context = new Proxy({}, { get: (obj, name) => obj[name] || (String(name).startsWith('create')
    ? () => ({ addColorStop() {} }) : () => {}) });
  class Element {
    constructor(attrs = {}) {
      this.attrs = attrs;
      this.id = attrs.id;
      this.tagName = attrs.tagName || 'DIV';
      this.style = {};
      this.textContent = '';
      this.value = attrs.value || '';
      this.checked = 'checked' in attrs;
      this.disabled = 'disabled' in attrs;
      this.hidden = 'hidden' in attrs;
      this.children = [];
      this.events = new Map();
      this.parentElement = { clientWidth: 240, offsetWidth: 240 };
      this.clientWidth = 240;
      this.offsetWidth = 1000;
      this.offsetHeight = 600;
      this.classes = new Set((attrs.class || '').split(' ').filter(Boolean));
      this.classList = {
        add: (...names) => names.forEach(n => this.classes.add(n)),
        remove: (...names) => names.forEach(n => this.classes.delete(n)),
        contains: n => this.classes.has(n),
        toggle: (name, on = !this.classes.has(name)) => on ? this.classes.add(name) : this.classes.delete(name),
      };
      all.push(this);
    }
    get className() { return [...this.classes].join(' '); }
    set className(value) { this.classes = new Set(value.split(' ').filter(Boolean)); }
    get innerHTML() { return this.html || ''; }
    set innerHTML(value) { this.html = value; this.children = []; }
    getAttribute(n) { return this.attrs[n]; }
    setAttribute(n, v) { this.attrs[n] = v; }
    addEventListener(n, f) {
      if (typeof f !== 'function') throw new Error(`Missing listener for ${this.id || this.tagName}: ${n}`);
      if (!this.events.has(n)) this.events.set(n, []);
      this.events.get(n).push(f);
    }
    dispatch(n, data = {}) {
      if (n === 'click' && this.disabled) return;
      for (const f of this.events.get(n) || []) f({ target: this, currentTarget: this, preventDefault() {}, ...data });
    }
    click() { this.dispatch('click'); }
    appendChild(e) { this.children.push(e); e.parentElement = this; return e; }
    append(...elements) { elements.forEach(e => this.appendChild(e)); }
    replaceChildren(...elements) { this.children = []; this.append(...elements); }
    removeChild(e) { this.children.splice(this.children.indexOf(e), 1); }
    get firstChild() { return this.children[0]; }
    getContext() { return context; }
    getBoundingClientRect() { return { top: 0, left: 0, width: this.width, height: this.height }; }
    querySelectorAll(selector) { return descendants(this).filter(e => matches(e, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  function descendants(element) {
    return element.children.flatMap(child => [child, ...descendants(child)]);
  }
  function matches(element, selector) {
    const match = selector.match(/^(?:#([\w-]+)|((?:\.[\w-]+)+))(?:\[([\w-]+)\])?$/);
    return !!match && (match[1] ? element.id === match[1] : match[2].slice(1).split('.').every(c => element.classList.contains(c)))
      && (!match[3] || match[3] in element.attrs);
  }
  // Ignore CSS, JavaScript, and template strings within the bundled script.
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
  for (const [tag] of markup.matchAll(/<[^/!][^>]*>/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    attrs.tagName = tag.match(/^<([\w-]+)/)[1].toUpperCase();
    for (const attr of ['disabled', 'hidden', 'checked']) if (new RegExp(`\\s${attr}[\\s/>]`).test(tag)) attrs[attr] = '';
    new Element(attrs);
  }
  const byId = id => all.find(e => e.id === id) || null;
  const documentEvents = new Element();
  globalThis.document = {
    getElementById: byId,
    createElement: tagName => new Element({ tagName: tagName.toUpperCase() }),
    createTextNode: text => Object.assign(new Element(), { textContent: text }),
    documentElement: new Element({ 'data-theme': 'dark' }),
    body: new Element(),
    addEventListener: (...args) => documentEvents.addEventListener(...args),
    querySelectorAll: selector => all.filter(e => matches(e, selector)),
    querySelector(selector) {
      if (selector === '.grid-container') return { clientWidth: 1024, clientHeight: 624 };
      return this.querySelectorAll(selector)[0] || null;
    },
  };
  const windowEvents = new Element();
  globalThis.window = { innerWidth: 1440, innerHeight: 900, addEventListener: (...args) => windowEvents.addEventListener(...args) };
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  let nextId = 1;
  const timers = new Map(), timeouts = new Map(), frames = new Map(), blobs = [];
  globalThis.setInterval = (fn, delay) => { const id = nextId++; timers.set(id, { fn, delay }); return id; };
  globalThis.clearInterval = id => timers.delete(id);
  globalThis.setTimeout = fn => { const id = nextId++; timeouts.set(id, fn); return id; };
  globalThis.clearTimeout = id => timeouts.delete(id);
  globalThis.requestAnimationFrame = fn => { const id = nextId++; frames.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  URL.createObjectURL = blob => { blobs.push(blob); return `blob:test-${blobs.length}`; };
  URL.revokeObjectURL = () => {};
  function drainTimeouts() {
    for (const [id, fn] of [...timeouts]) {
      if (!timeouts.has(id)) continue;
      timeouts.delete(id);
      fn();
    }
  }
  function frame() {
    for (const [id, fn] of [...frames]) {
      if (!frames.has(id)) continue;
      frames.delete(id);
      fn();
    }
  }
  return { byId, windowEvents, documentEvents, timers, frames, blobs, storage, drainTimeouts, frame };
}
