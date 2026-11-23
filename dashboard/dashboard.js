(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const { Grid, SearchSession, algorithms, terrain: terrainTypes } = window.MetroEngine;
  const grid = new Grid(30).generate('downtown', 2084);
  const gridCanvas = byId('grid-canvas');
  const gridContext = gridCanvas.getContext('2d');
  const cityCanvas = byId('city-canvas');
  const demoBar = byId('demo-bar');
  const algorithm = byId('demo-algorithm');
  const play = byId('demo-play');
  const note = byId('demo-note');
  const algorithmRows = byId('algorithm-rows');
  const motionButton = byId('city-motion');
  const lightingButton = byId('city-light');
  const compassButton = byId('city-north');
  const lightingModes = [
    { mode: 'dusk', label: 'Dusk', icon: 'dusk', ambient: .66, sun: 1.7, rim: .66, exposure: 1.24 },
    { mode: 'night', label: 'Night', icon: 'moon', ambient: .44, sun: .38, rim: .65, exposure: 1.2 },
    { mode: 'day', label: 'Day', icon: 'sun', ambient: .8, sun: 1.72, rim: .4, exposure: 1.1 }
  ];
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(pointer: coarse)');
  const terrain = ['#293d35', '#1a2b27', '#3d5246', '#67563c', '#47424c'];
  const statusLabels = {
    preview: 'Route preview',
    running: 'Searching both views',
    paused: 'Search paused',
    complete: 'Route found',
    empty: 'No route found'
  };
  const countFormat = new Intl.NumberFormat();
  const costFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

  let city = null;
  let session;
  let state = 'preview';
  let stepsPerSecond = 28;
  let totalSteps = 1;
  let lightingIndex = 0;
  let animationFrame = 0;
  let previousTime = 0;
  let budget = 0;
  let motionPaused = motionPreference.matches;
  let dragEnabled = false;
  let orbit = true;

  function drawGrid() {
    const context = gridContext;
    if (!context) return;
    const { width, height } = byId('grid-preview').getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * ratio);
    const pixelsHigh = Math.round(height * ratio);
    if (gridCanvas.width !== pixelsWide || gridCanvas.height !== pixelsHigh) {
      gridCanvas.width = pixelsWide;
      gridCanvas.height = pixelsHigh;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#111f1c';
    context.fillRect(0, 0, width, height);

    const tileHeight = Math.floor(Math.min((height - 31) / grid.size, (width - 42) / grid.size));
    if (tileHeight < 2) return;
    const tileWidth = Math.min((width - 47) / grid.size, tileHeight * 1.9);
    const spanX = tileWidth * grid.size;
    const spanY = tileHeight * grid.size;
    const left = Math.round((width - spanX) / 2) + 5;
    const top = Math.round((height - spanY) / 2) - 5;
    const x = index => left + (index % grid.size) * tileWidth;
    const y = index => top + Math.floor(index / grid.size) * tileHeight;

    context.beginPath();
    for (let line = (left % 24 + 24) % 24; line < width; line += 24) {
      context.moveTo(line + .5, 0);
      context.lineTo(line + .5, height);
    }
    for (let line = (top % 24 + 24) % 24; line < height; line += 24) {
      context.moveTo(0, line + .5);
      context.lineTo(width, line + .5);
    }
    context.lineWidth = 1;
    context.strokeStyle = '#1b2e28';
    context.stroke();

    context.fillStyle = '#12211d';
    context.fillRect(left - 2, top - 2, spanX + 3, spanY + 3);
    for (let i = 0; i < grid.count; i++) {
      context.fillStyle = session.frontier.has(i) ? '#d5b982' : session.visited.has(i) ? '#4d9483' : terrain[grid.types[i]];
      context.fillRect(x(i), y(i), tileWidth - .75, tileHeight - .75);
    }
    context.strokeStyle = '#54706e';
    context.strokeRect(left - 1.5, top - 1.5, spanX + 2, spanY + 2);

    context.font = '10px Consolas, monospace';
    context.fillStyle = '#849d9c';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let cell = 5; cell <= grid.size; cell += 5) {
      const offset = cell - .5;
      const label = String(cell).padStart(2, '0');
      context.fillText(label, left + offset * tileWidth, top + spanY + 11);
      context.fillText(label, left - 12, top + offset * tileHeight);
    }

    if (session.path) {
      context.beginPath();
      session.path.forEach((index, step) => {
        const centerX = x(index) + (tileWidth - .75) / 2;
        const centerY = y(index) + (tileHeight - .75) / 2;
        if (step) context.lineTo(centerX, centerY);
        else context.moveTo(centerX, centerY);
      });
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.lineWidth = Math.max(2.1, tileHeight * .37);
      context.strokeStyle = '#9ce7c6';
      context.shadowColor = '#70caab';
      context.shadowBlur = 7;
      context.stroke();
      context.shadowBlur = 0;
    }

    for (const [index, color] of [[grid.start, '#a6efd0'], [grid.goal, '#dba7bf']]) {
      context.beginPath();
      context.arc(x(index) + (tileWidth - .75) / 2, y(index) + (tileHeight - .75) / 2, Math.max(3.2, tileHeight * .62), 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = '#101b23';
      context.stroke();
    }
  }

  function render() {
    drawGrid();
    city?.setSearch(session.visited, session.frontier, session.path);
    const progress = session.done ? 1 : Math.min(1, session.cursor / totalSteps);
    demoBar.style.setProperty('--route-progress', (progress * 100).toFixed(1) + '%');
    const visited = countFormat.format(session.visited.size);
    const result = session.path
      ? ' · ' + countFormat.format(session.path.length) + ' waypoints · Cost ' + costFormat.format(session.cost)
      : '';
    byId('demo-count').textContent = visited + ' visited' + result;
  }

  function setState(next) {
    state = next;
    demoBar.dataset.state = next;
    const active = state === 'running';
    play.querySelector('use').setAttribute('href', active ? '#i-pause' : '#i-play');
    play.lastElementChild.textContent = active ? 'Pause search' : state === 'paused' ? 'Resume search' : 'Replay search';
    const message = active && (!city || !gridContext) ? (city ? 'Searching city' : 'Searching grid') : statusLabels[state];
    byId('demo-status').textContent = message;
  }

  function stop() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousTime = 0;
    budget = 0;
  }

  function showPreview() {
    stop();
    session = new SearchSession(grid, algorithm.value).finish();
    totalSteps = Math.max(1, session.cursor);
    note.textContent = session.note;
    note.hidden = !session.note;
    for (const row of algorithmRows.rows) {
      if (row.dataset.algorithm === algorithm.value) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
    setState(session.path ? 'preview' : 'empty');
    render();
  }

  function tick(now) {
    budget += Math.min(.08, (now - (previousTime || now)) / 1000) * stepsPerSecond;
    previousTime = now;
    const steps = Math.floor(budget);
    if (steps) {
      budget -= steps;
      session.step(steps);
      render();
    }
    if (session.done) {
      stop();
      setState(session.path ? 'complete' : 'empty');
    } else {
      animationFrame = requestAnimationFrame(tick);
    }
  }

  function start(restart) {
    stop();
    if (restart) {
      if (session.done) stepsPerSecond = Math.max(28, Math.round(session.cursor / 4));
      session = new SearchSession(grid, algorithm.value);
      render();
    }
    setState('running');
    animationFrame = requestAnimationFrame(tick);
  }

  function toggleSearch() {
    if (state === 'running') {
      stop();
      setState('paused');
    } else {
      start(state !== 'paused');
    }
  }

  function setMotion(paused) {
    motionPaused = paused;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.title = paused ? 'Resume scene motion' : 'Pause scene motion';
    motionButton.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    if (!city) return;
    city.reducedMotion = paused;
    city.controls.enableDamping = !paused;
    city.setOrbit(orbit && !paused);
  }

  function updateDrag() {
    if (!city) return;
    const enabled = !touch.matches || dragEnabled;
    city.controls.enabled = enabled;
    cityCanvas.style.touchAction = enabled ? 'none' : 'auto';
    byId('city-hint').hidden = touch.matches;
    const button = byId('city-drag');
    button.hidden = !touch.matches;
    button.textContent = dragEnabled ? 'Done orbiting' : 'Orbit city';
  }

  function showCitySnapshot() {
    city?.destroy();
    city = null;
    cityCanvas.hidden = true;
    byId('city-snapshot').hidden = false;
    byId('city-tools').hidden = true;
    byId('city-snapshot-label').hidden = false;
    updateDemoAvailability();
    if (!gridContext) stop();
    setState(state);
  }

  function updateDemoAvailability() {
    demoBar.hidden = !gridContext && !city;
  }

  function updateCompass() {
    const bearing = city?.getBearing();
    if (Number.isFinite(bearing)) compassButton.style.setProperty('--north-rotation', -bearing + 'deg');
  }

  function applyLighting() {
    if (!city) return;
    const lighting = lightingModes[lightingIndex];
    city.setMode(lighting.mode);
    city.hemi.intensity = lighting.ambient;
    city.sun.intensity = lighting.sun;
    city.rim.intensity = lighting.rim;
    city.renderer.toneMappingExposure = lighting.exposure;
    const next = lightingModes[(lightingIndex + 1) % lightingModes.length].mode;
    lightingButton.querySelector('use').setAttribute('href', '#i-' + lighting.icon);
    lightingButton.title = lighting.label + ' lighting · Change to ' + next;
    lightingButton.setAttribute('aria-label', lighting.label + ' lighting. Change to ' + next + '.');
  }

  function resizeCity() {
    if (!city) return;
    const { clientWidth: width, clientHeight: height } = byId('city-preview');
    if (!width || !height) return;
    city.camera.zoom = width >= 560 ? 1.1 : 1.02;
    if (width !== city.width || height !== city.height) city.resize(width, height);
    else city.camera.updateProjectionMatrix();
  }

  function initCity() {
    cityCanvas.hidden = false;
    try {
      city = new window.MetroCity(cityCanvas);
      city.setParticles(false);
      city.setLandscape(false);
      city.setTraffic(true);
      city.setGrid(grid);
      city.setLayer('search');
      city.gridLines.material.opacity = .28;
      city.sun.position.set(-24, 28, 12);
      applyLighting();
      city.setTool('view');
      city.controls.enableZoom = false;
      city.controls.autoRotateSpeed = .26;
      city.controls.addEventListener('change', updateCompass);
      city.controls.addEventListener('start', () => {
        orbit = false;
        city.setOrbit(false);
      });
      resizeCity();
      city.fitCity();
      city.fitCamera('isometric', false);
      updateCompass();
      setMotion(motionPaused);
      updateDrag();
      byId('city-snapshot').hidden = true;
      byId('city-tools').hidden = false;
    } catch {
      showCitySnapshot();
    }
  }

  function addDetail(list, name, description) {
    const row = document.createElement('div');
    const title = document.createElement('dt');
    const detail = document.createElement('dd');
    title.textContent = name;
    detail.textContent = description;
    row.append(title, detail);
    list.append(row);
  }

  for (const [key, { name }] of Object.entries(algorithms)) {
    if (key !== 'astar') algorithm.add(new Option(name, key));
  }
  const terrainList = byId('terrain-list');
  for (const { name, cost } of terrainTypes) {
    addDetail(terrainList, name, Number.isFinite(cost) ? costFormat.format(cost) + '×' : 'Blocked');
  }

  play.addEventListener('click', toggleSearch);
  algorithm.addEventListener('change', () => {
    showPreview();
    if (!motionPreference.matches) start(true);
  });
  motionButton.addEventListener('click', () => {
    if (motionPaused) orbit = true;
    setMotion(!motionPaused);
  });
  lightingButton.addEventListener('click', () => {
    lightingIndex = (lightingIndex + 1) % lightingModes.length;
    applyLighting();
  });
  compassButton.addEventListener('click', () => {
    if (city?.resetNorth()) {
      orbit = false;
      updateCompass();
    }
  });
  byId('city-drag').addEventListener('click', () => {
    dragEnabled = !dragEnabled;
    updateDrag();
  });
  motionPreference.addEventListener('change', event => setMotion(event.matches));
  touch.addEventListener('change', updateDrag);
  cityCanvas.addEventListener('webglcontextlost', showCitySnapshot);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'running') toggleSearch();
  });

  initCity();
  showPreview();
  if (gridContext) {
    gridCanvas.hidden = false;
    byId('grid-snapshot').hidden = true;
  }
  updateDemoAvailability();
  window.MetroSelect?.init(algorithm);
  const resize = new ResizeObserver(() => {
    drawGrid();
    resizeCity();
  });
  resize.observe(byId('grid-preview'));
  resize.observe(byId('city-preview'));
})();
