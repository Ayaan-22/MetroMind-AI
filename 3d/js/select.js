/* Consistent select menus without changing the native values used by the app. */
(function (scope) {
  'use strict';
  const instances = new Set();
  const controls = new WeakMap();
  const descriptions = {
    astar: 'Balance route cost and distance ahead',
    dijkstra: 'Find the lowest weighted travel cost',
    bidir: 'Search from both endpoints',
    dstar: 'Repair routes when the city changes',
    theta: 'Connect visible points at any angle',
    jps: 'Jump ahead on uniform terrain',
    greedy: 'Prioritize proximity to the destination',
    bfs: 'Find the fewest unweighted steps',
    dfs: 'Explore one branch at a time'
  };
  let sequence = 0;
  let current = null;
  let listenersInstalled = false;

  function enabled(option) {
    return !option.disabled && !option.closest('optgroup')?.disabled;
  }

  function labelFor(select) {
    const explicit = select.getAttribute('aria-label');
    if (explicit) return explicit;
    const labelled = select.getAttribute('aria-labelledby');
    if (labelled) {
      const text = labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (text) return text;
    }
    const label = select.labels?.[0];
    if (label) {
      // A wrapping label also contains its options and, once enhanced, its
      // trigger. Only its actual label text belongs in the accessible name.
      const clone = label.cloneNode(true);
      clone.querySelectorAll('select,button,.metro-select').forEach(node => node.remove());
      const text = clone.textContent.replace(/\s+/g, ' ').replace(/\s*\?\s*$/, '').trim();
      if (text) return text;
    }
    return select.name || select.id || 'Choose an option';
  }

  function selectedIndex(instance) {
    return instance.select.selectedIndex;
  }

  function visible(instance) {
    return instance.select.isConnected && instance.trigger.getClientRects().length > 0 &&
      !instance.select.parentElement.closest('[hidden],[aria-hidden="true"]');
  }

  function active(instance, index, scroll = true) {
    if (index < 0 || !instance.select.options[index] || !enabled(instance.select.options[index])) return;
    instance.active = index;
    instance.rows.forEach((row, i) => row.classList.toggle('is-active', i === index));
    instance.trigger.setAttribute('aria-activedescendant', instance.rows[index].id);
    if (scroll) instance.rows[index].scrollIntoView({ block: 'nearest' });
  }

  function step(instance, direction) {
    const options = Array.from(instance.select.options);
    let index = instance.active;
    for (let i = 0; i < options.length; i++) {
      index = (index + direction + options.length) % options.length;
      if (enabled(options[index])) { active(instance, index); return; }
    }
  }

  function end(instance, last) {
    const options = Array.from(instance.select.options);
    const indices = options.map((_, i) => i);
    if (last) indices.reverse();
    const index = indices.find(i => enabled(options[i]));
    if (index !== undefined) active(instance, index);
  }

  function position(instance) {
    if (!current || current !== instance) return;
    const rect = instance.trigger.getBoundingClientRect();
    const viewport = scope.visualViewport;
    const viewportWidth = viewport?.width || document.documentElement.clientWidth || scope.innerWidth;
    const viewportHeight = viewport?.height || document.documentElement.clientHeight || scope.innerHeight;
    const viewportLeft = viewport?.offsetLeft || 0, viewportTop = viewport?.offsetTop || 0;
    const edge = 10, gap = 7;
    const width = Math.max(1, Math.min(Math.max(200, rect.width), viewportWidth - edge * 2));
    instance.menu.style.width = `${width}px`;
    instance.menu.style.maxHeight = `${Math.min(420, viewportHeight - edge * 2)}px`;
    instance.menu.style.left = `${Math.max(viewportLeft + edge, Math.min(rect.left, viewportLeft + viewportWidth - width - edge))}px`;
    const desired = Math.min(instance.menu.scrollHeight, 420, viewportHeight - edge * 2);
    const below = viewportTop + viewportHeight - rect.bottom - gap - edge;
    const above = rect.top - gap - viewportTop - edge;
    const useAbove = below < Math.min(desired, 230) && above > below;
    const available = Math.max(64, useAbove ? above : below);
    const height = Math.min(desired, available);
    instance.menu.style.maxHeight = `${height}px`;
    const top = useAbove ? rect.top - gap - height : rect.bottom + gap;
    instance.menu.style.top = `${Math.max(viewportTop + edge, Math.min(top, viewportTop + viewportHeight - height - edge))}px`;
    instance.menu.dataset.placement = useAbove ? 'above' : 'below';
  }

  function close(instance, restoreFocus = false) {
    if (!instance) return;
    instance.menu.remove();
    instance.trigger.setAttribute('aria-expanded', 'false');
    instance.trigger.removeAttribute('aria-activedescendant');
    instance.host.classList.remove('is-open');
    instance.buffer = '';
    if (current === instance) current = null;
    if (restoreFocus && visible(instance) && !instance.trigger.disabled) instance.trigger.focus();
  }

  function closeAll({ restoreFocus = false } = {}) {
    if (current) close(current, restoreFocus);
  }

  function draw(instance) {
    const select = instance.select;
    instance.value.textContent = select.options[selectedIndex(instance)]?.label || 'Choose an option';
    instance.trigger.disabled = select.disabled;
    instance.trigger.setAttribute('aria-disabled', String(select.disabled));
    instance.host.classList.toggle('is-disabled', select.disabled);
    if (select.disabled && current === instance) close(instance);
    if (current === instance) {
      instance.rows.forEach((row, index) => {
        const isSelected = index === selectedIndex(instance);
        row.classList.toggle('is-selected', isSelected);
        row.setAttribute('aria-selected', String(isSelected));
      });
    }
  }

  function renderOptions(instance) {
    const menu = instance.menu;
    menu.replaceChildren();
    const caption = document.createElement('div');
    caption.className = 'metro-select-caption';
    caption.setAttribute('aria-hidden', 'true');
    caption.textContent = instance.label;
    menu.append(caption);
    instance.rows = Array.from(instance.select.options).map((option, index) => {
      const row = document.createElement('div');
      row.className = 'metro-select-option';
      row.id = `${instance.id}-option-${index}`;
      row.dataset.index = String(index);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === selectedIndex(instance)));
      row.setAttribute('aria-disabled', String(!enabled(option)));
      row.classList.toggle('is-selected', index === selectedIndex(instance));
      const text = document.createElement('span');
      text.className = 'metro-select-option-text';
      const title = document.createElement('span');
      title.className = 'metro-select-option-label';
      title.textContent = option.label;
      text.append(title);
      const description = instance.select.id === 'algorithm' ? descriptions[option.value] : null;
      if (description) {
        const sub = document.createElement('span');
        sub.className = 'metro-select-option-description';
        sub.textContent = description;
        text.append(sub);
      }
      const check = document.createElement('span');
      check.className = 'metro-select-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      row.append(text, check);
      menu.append(row);
      return row;
    });
    menu.classList.toggle('is-rich', instance.select.id === 'algorithm');
  }

  function open(instance) {
    if (instance.select.disabled || !visible(instance)) return;
    closeAll();
    renderOptions(instance);
    const dialog = instance.select.closest('dialog[open]');
    (dialog || document.body).append(instance.menu);
    current = instance;
    instance.host.classList.add('is-open');
    instance.trigger.setAttribute('aria-expanded', 'true');
    instance.trigger.focus();
    position(instance);
    const index = selectedIndex(instance);
    if (index >= 0 && enabled(instance.select.options[index])) active(instance, index);
    else end(instance, false);
  }

  function choose(instance, index) {
    const option = instance.select.options[index];
    if (!option || !enabled(option)) return;
    const changed = selectedIndex(instance) !== index;
    instance.select.selectedIndex = index;
    draw(instance);
    // Restore focus before dispatch: a grid-size handler can close the entire
    // settings panel, and its own focus handoff must remain the final one.
    close(instance, true);
    if (changed) instance.select.dispatchEvent(new Event('change', { bubbles: true }));
    draw(instance);
  }

  function typeahead(instance, key) {
    const now = Date.now();
    instance.buffer = now - instance.typedAt > 700 ? key : instance.buffer + key;
    instance.typedAt = now;
    let query = instance.buffer.toLocaleLowerCase();
    if (query.length > 1 && Array.from(query).every(character => character === query[0])) query = query[0];
    const options = Array.from(instance.select.options);
    for (let offset = 1; offset <= options.length; offset++) {
      const index = (instance.active + offset + options.length) % options.length;
      if (enabled(options[index]) && options[index].label.trim().toLocaleLowerCase().startsWith(query)) { active(instance, index); break; }
    }
  }

  function keyboard(instance, event) {
    if (instance.select.disabled) return;
    const isOpen = current === instance, key = event.key;
    if (event.ctrlKey || event.metaKey || (event.altKey && key !== 'ArrowDown' && key !== 'ArrowUp')) return;
    if (key === 'Tab') { if (isOpen) { event.stopPropagation(); close(instance); } return; }
    if (key === 'Escape') {
      if (isOpen) { event.preventDefault(); event.stopPropagation(); close(instance, true); }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault(); event.stopPropagation();
      if (!isOpen) {
        open(instance);
        if (key === 'Home' || key === 'End') end(instance, key === 'End');
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp') step(instance, key === 'ArrowDown' ? 1 : -1);
      else if (key === 'Home' || key === 'End') end(instance, key === 'End');
      else choose(instance, instance.active);
      return;
    }
    if (key.length === 1) {
      event.preventDefault(); event.stopPropagation();
      if (!isOpen) open(instance);
      typeahead(instance, key);
    }
  }

  function install(select) {
    if (controls.has(select) || select.multiple || select.size > 1) return;
    const id = select.id || `metro-select-${++sequence}`;
    const label = labelFor(select);
    let host = select.parentElement;
    if (!host.classList.contains('select-wrap')) {
      host = document.createElement('span');
      select.parentElement.insertBefore(host, select);
      host.append(select);
    }
    host.classList.add('metro-select');
    host.dataset.selectId = select.id;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `${id}-trigger`;
    trigger.className = 'metro-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-label', label);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-listbox`);
    const value = document.createElement('span');
    value.className = 'metro-select-value';
    const chevron = document.createElement('span');
    chevron.className = 'metro-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(value, chevron);
    const menu = document.createElement('div');
    menu.id = `${id}-listbox`;
    menu.className = 'metro-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', `${label} options`);
    menu.dataset.selectId = select.id;
    const instance = { id, label, select, host, trigger, value, menu, rows: [], active: -1, buffer: '', typedAt: 0 };
    trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); current === instance ? close(instance, true) : open(instance); });
    trigger.addEventListener('keydown', event => keyboard(instance, event));
    menu.addEventListener('pointerdown', event => event.preventDefault());
    menu.addEventListener('click', event => { const row = event.target.closest('.metro-select-option'); if (row && menu.contains(row)) { event.stopPropagation(); choose(instance, Number(row.dataset.index)); } });
    menu.addEventListener('pointermove', event => { const row = event.target.closest('.metro-select-option'); if (row && menu.contains(row)) active(instance, Number(row.dataset.index), false); });
    select.addEventListener('change', () => draw(instance));
    select.addEventListener('focus', () => trigger.focus());
    Array.from(select.labels || []).forEach(labelElement => labelElement.addEventListener('click', event => {
      if (event.target === select || !host.contains(event.target)) { event.preventDefault(); if (!select.disabled) trigger.focus(); }
    }));
    host.append(trigger);
    // Apply hiding only after the replacement is ready, retaining the normal
    // native control whenever enhancement is not available.
    select.classList.add('metro-select-native');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    controls.set(select, instance); instances.add(instance);
    if (scope.MutationObserver) {
      instance.observer = new MutationObserver(() => draw(instance));
      instance.observer.observe(select, { attributes: true, attributeFilter: ['disabled'] });
    }
    draw(instance);
  }

  function prune() {
    for (const instance of instances) if (!instance.select.isConnected) {
      close(instance); instance.observer?.disconnect(); instances.delete(instance); controls.delete(instance.select);
    }
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener('pointerdown', event => { if (current && !current.host.contains(event.target) && !current.menu.contains(event.target)) close(current); }, true);
    document.addEventListener('focusin', event => { if (current && event.target !== current.trigger && !current.menu.contains(event.target)) close(current); }, true);
    document.addEventListener('scroll', event => { if (current && event.target !== current.menu && !current.menu.contains(event.target)) close(current); }, true);
    document.addEventListener('close', () => closeAll(), true);
    document.addEventListener('cancel', () => closeAll(), true);
    const reposition = () => {
      if (!current) return;
      if (!visible(current) || current.select.disabled) close(current);
      else position(current);
    };
    scope.addEventListener('resize', reposition);
    scope.visualViewport?.addEventListener('resize', reposition);
  }

  function init(root = document) {
    prune(); installListeners();
    if (root.matches?.('select')) install(root);
    root.querySelectorAll('select').forEach(install);
    sync(root);
  }

  function sync(root = document) {
    prune();
    for (const instance of instances) if (root === document || root === instance.select || root.contains(instance.select)) draw(instance);
    if (current && !visible(current)) close(current);
  }

  scope.MetroSelect = { init, sync, closeAll };
})(globalThis);
