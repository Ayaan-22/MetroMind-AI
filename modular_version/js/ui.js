import { TOAST_ICONS, PORTRAIT_CONFIGS } from './config.js';

let sidebarOpen = true;
let rpOpen = true;
let isFullscreen = false;
let autoScroll = true;
let toastTimer = null;
let toastBarTimer = null;

const sparkData = { nodes: [], path: [], open: [], cost: [] };
const sparkColors = {
  nodes: "rgba(0,229,160,",
  path: "rgba(0,184,255,",
  open: "rgba(247,183,49,",
  cost: "rgba(167,139,250,",
};

let portraitFrame = null;
let portraitT = 0;
let _effChartWidth = 0;
const effData = [];

export function triggerGlitch() {
  const el = document.querySelector(".app-title");
  if (!el) return;
  el.setAttribute("data-text", el.textContent);
  el.classList.add("glitching");
  setTimeout(() => el.classList.remove("glitching"), 400);
}

export function showToast(msg, type) {
  type = type || (msg.startsWith("✓") ? "success" : msg.startsWith("⚠") ? "warn" : msg.startsWith("✕") ? "error" : "info");
  const t = document.getElementById("toast");
  const bar = document.getElementById("toastBar");
  const msgEl = document.getElementById("toastMsg");
  const iconEl = document.getElementById("toastIcon");
  if (!t || !bar || !msgEl || !iconEl) return;
  
  msgEl.textContent = msg.replace(/^[✓⚠✕ℹ]\s*/, "");
  iconEl.textContent = TOAST_ICONS[type] || "ℹ";
  t.className = "toast t-" + type;
  bar.style.transition = "none";
  bar.style.transform = "scaleX(1)";
  void bar.offsetWidth;
  t.classList.add("show");
  const dur = 2600;
  bar.style.transition = `transform ${dur}ms linear`;
  bar.style.transform = "scaleX(0)";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), dur);
}

const RING_CIRC = 2 * Math.PI * 18; 
export function updateProgressRing(explored, total, statusText) {
  const fill = document.getElementById("progressRingFill");
  const label = document.getElementById("progressLabel");
  const pstatus = document.getElementById("progressStatus");
  if (!fill) return;
  const pct = total > 0 ? Math.min(1, explored / total) : 0;
  fill.style.strokeDashoffset = RING_CIRC * (1 - pct);
  if (label) label.textContent = Math.round(pct * 100) + "%";
  if (pstatus && statusText) pstatus.textContent = statusText;
}

export function drawSparkline(canvasId, data, colorBase) {
  const cvs = document.getElementById(canvasId);
  if (!cvs || data.length < 2) return;
  const w = cvs.parentElement.clientWidth, h = 22;
  cvs.width = w;
  cvs.height = h;
  const sctx = cvs.getContext("2d");
  sctx.clearRect(0, 0, w, h);
  const max = Math.max(...data) || 1;
  sctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 1);
    i === 0 ? sctx.moveTo(x, y) : sctx.lineTo(x, y);
  });
  sctx.strokeStyle = colorBase + "0.9)";
  sctx.lineWidth = 1;
  sctx.stroke();
  sctx.lineTo(w, h);
  sctx.lineTo(0, h);
  const grd = sctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, colorBase + "0.35)");
  grd.addColorStop(1, colorBase + "0)");
  sctx.fillStyle = grd;
  sctx.fill();
}

export function updateSparklines(n, p, o, c) {
  const push = (arr, v) => {
    arr.push(isNaN(+v) ? arr[arr.length - 1] || 0 : +v);
    if (arr.length > 40) arr.shift();
  };
  push(sparkData.nodes, n);
  push(sparkData.path, p);
  push(sparkData.open, o);
  push(sparkData.cost, c);
  drawSparkline("sparkNodes", sparkData.nodes, sparkColors.nodes);
  drawSparkline("sparkPath", sparkData.path, sparkColors.path);
  drawSparkline("sparkOpen", sparkData.open, sparkColors.open);
  drawSparkline("sparkCost", sparkData.cost, sparkColors.cost);
}

export function clearSparklines() {
  Object.keys(sparkData).forEach((k) => (sparkData[k] = []));
  ["sparkNodes", "sparkPath", "sparkOpen", "sparkCost"].forEach((id) => {
    const cvs = document.getElementById(id);
    if (cvs) cvs.getContext("2d").clearRect(0, 0, cvs.width, cvs.height);
  });
}

export function bumpStat(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

export function updateStats(n, p, o, c) {
  const setV = (id, v) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(v)) {
      el.textContent = v;
      bumpStat(id);
    }
  };
  setV("statNodes", n);
  setV("statPath", p);
  setV("statOpen", o);
  setV("statCost", c);
  ["cardNodes", "cardPath", "cardOpen", "cardCost"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
  });
  effData.push(+n || 0);
  if (effData.length > 60) effData.shift();
  drawEffChart();
  updateSparklines(n, p, o, c);
  const hn = document.getElementById("hudNodes"),
    hp = document.getElementById("hudPath"),
    hc = document.getElementById("hudCost");
  if (hn) hn.textContent = n;
  if (hp) hp.textContent = p;
  if (hc) hc.textContent = c;
}

export function drawEffChart() {
  const effCanvas = document.getElementById("effChart");
  if (!effCanvas) return;
  const effCtx = effCanvas.getContext("2d");
  const w = effCanvas.parentElement.offsetWidth - 2, h = 36;
  if (w !== _effChartWidth) {
    _effChartWidth = w;
    effCanvas.width = w;
    effCanvas.height = h;
  }
  if (effData.length < 2) return;
  const max = Math.max(...effData) || 1;
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const col = isDark ? "rgba(0,229,160," : "rgba(0,149,106,";
  effCtx.clearRect(0, 0, w, h);
  effCtx.beginPath();
  effCtx.moveTo(0, h);
  effData.forEach((v, i) => {
    const x = (i / (effData.length - 1)) * w;
    const y = h - (v / max) * (h - 2);
    effCtx.lineTo(x, y);
  });
  effCtx.lineTo(w, h);
  effCtx.closePath();
  const grad = effCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, col + "0.4)");
  grad.addColorStop(1, col + "0.02)");
  effCtx.fillStyle = grad;
  effCtx.fill();
  effCtx.beginPath();
  effData.forEach((v, i) => {
    const x = (i / (effData.length - 1)) * w;
    const y = h - (v / max) * (h - 2);
    i === 0 ? effCtx.moveTo(x, y) : effCtx.lineTo(x, y);
  });
  effCtx.strokeStyle = col + "0.8)";
  effCtx.lineWidth = 1.5;
  effCtx.stroke();
}

export function startPortrait(algo) {
  if (portraitFrame) cancelAnimationFrame(portraitFrame);
  const cvs = document.getElementById("algoPortrait");
  if (!cvs) return;
  const w = cvs.parentElement.clientWidth, h = 48;
  cvs.width = w;
  cvs.height = h;
  const pc = cvs.getContext("2d");
  const cfg = PORTRAIT_CONFIGS[algo] || PORTRAIT_CONFIGS.astar;
  const label = document.getElementById("portraitLabel");
  if (label) label.textContent = cfg.label;
  function draw() {
    portraitT += 0.03;
    pc.clearRect(0, 0, w, h);
    pc.fillStyle = "rgba(0,0,0,0.15)";
    pc.fillRect(0, 0, w, h);
    const t = portraitT;
    if (cfg.style === "wave") {
      for (let x = 0; x < w; x++) {
        const y1 = h / 2 + Math.sin(x * 0.12 + t) * 12 * Math.cos(t * 0.3);
        pc.beginPath();
        pc.moveTo(x, h / 2);
        pc.lineTo(x, y1);
        pc.strokeStyle = cfg.col + Math.round(80 + 80 * ((y1 - h / 2) / 12)).toString(16).padStart(2, "0");
        pc.lineWidth = 1.2;
        pc.stroke();
      }
    } else if (cfg.style === "rings") {
      [0.8, 0.55, 0.3].forEach((r, i) => {
        pc.beginPath();
        pc.arc(w / 2, h / 2, ((r * h) / 2) * (0.9 + 0.1 * Math.sin(t + i)), 0, Math.PI * 2);
        pc.strokeStyle = [cfg.col, cfg.col2, cfg.col][i];
        pc.lineWidth = 1.5;
        pc.globalAlpha = 0.6 + 0.3 * Math.sin(t * 2 + i);
        pc.stroke();
        pc.globalAlpha = 1;
      });
    } else if (cfg.style === "arrow") {
      const x = (((t * 60) % w) + w) % w;
      pc.beginPath();
      pc.moveTo(x, h / 2);
      pc.lineTo(x - 20, h / 2 - 8);
      pc.lineTo(x - 20, h / 2 + 8);
      pc.closePath();
      pc.fillStyle = cfg.col;
      pc.fill();
      pc.beginPath();
      pc.moveTo(0, h / 2);
      pc.lineTo(x, h / 2);
      pc.strokeStyle = cfg.col2;
      pc.lineWidth = 1.5;
      pc.setLineDash([4, 4]);
      pc.stroke();
      pc.setLineDash([]);
    } else if (cfg.style === "layers") {
      for (let i = 0; i < 5; i++) {
        const progress = (t * 0.4 + i * 0.25) % 1;
        pc.beginPath();
        pc.arc(w / 2, h / 2, progress * (h / 2 + 4), 0, Math.PI * 2);
        pc.strokeStyle = i % 2 === 0 ? cfg.col : cfg.col2;
        pc.lineWidth = 1;
        pc.globalAlpha = (1 - progress) * 0.8;
        pc.stroke();
        pc.globalAlpha = 1;
      }
    } else if (cfg.style === "spiral") {
      pc.beginPath();
      for (let a = 0; a < t * 3; a += 0.1) {
        const r = (a / (t * 3)) * h * 0.42;
        const x = w / 2 + r * Math.cos(a);
        const y = h / 2 + r * Math.sin(a);
        a === 0 ? pc.moveTo(x, y) : pc.lineTo(x, y);
      }
      pc.strokeStyle = cfg.col;
      pc.lineWidth = 1.5;
      pc.stroke();
    } else if (cfg.style === "bidir") {
      const p1 = (((t * 40) % w) + w) % w, p2 = w - ((((t * 40) % w) + w) % w);
      [p1, p2].forEach((x, i) => {
        pc.beginPath();
        pc.arc(x, h / 2, 5, 0, Math.PI * 2);
        pc.fillStyle = i === 0 ? cfg.col : cfg.col2;
        pc.fill();
        pc.beginPath();
        pc.moveTo(i === 0 ? 0 : w, h / 2);
        pc.lineTo(x, h / 2);
        pc.strokeStyle = i === 0 ? cfg.col : cfg.col2;
        pc.lineWidth = 1.5;
        pc.globalAlpha = 0.5;
        pc.stroke();
        pc.globalAlpha = 1;
      });
      if (Math.abs(p1 - p2) < 12) {
        pc.beginPath();
        pc.arc(w / 2, h / 2, 8, 0, Math.PI * 2);
        pc.fillStyle = "rgba(247,183,49,0.8)";
        pc.fill();
      }
    } else if (cfg.style === "jump") {
      const pts = [0.1, 0.35, 0.6, 0.85].map((f) => ({ x: f * w, y: h / 2 }));
      const phase = (t * 0.5) % 1;
      pts.forEach((p, i) => {
        const active = Math.abs(phase - i / pts.length) < 0.12;
        pc.beginPath();
        pc.arc(p.x, p.y, active ? 8 : 4, 0, Math.PI * 2);
        pc.fillStyle = active ? cfg.col : cfg.col + "44";
        pc.fill();
      });
      pc.setLineDash([6, 4]);
      pc.beginPath();
      pc.moveTo(0, h / 2);
      pts.forEach((p) => pc.lineTo(p.x, p.y));
      pc.lineTo(w, h / 2);
      pc.strokeStyle = cfg.col2;
      pc.lineWidth = 1;
      pc.globalAlpha = 0.5;
      pc.stroke();
      pc.setLineDash([]);
      pc.globalAlpha = 1;
    } else if (cfg.style === "angle") {
      const a = t * 0.8;
      pc.beginPath();
      pc.moveTo(w * 0.15, h * 0.8);
      pc.lineTo(w * 0.5 + Math.cos(a) * w * 0.3, h * 0.2 + Math.sin(a) * h * 0.2);
      pc.lineTo(w * 0.85, h * 0.8);
      pc.strokeStyle = cfg.col;
      pc.lineWidth = 2;
      pc.stroke();
      pc.beginPath();
      pc.moveTo(w * 0.15, h * 0.8);
      pc.lineTo(w * 0.85, h * 0.8);
      pc.strokeStyle = cfg.col2 + "88";
      pc.lineWidth = 1;
      pc.setLineDash([3, 3]);
      pc.stroke();
      pc.setLineDash([]);
    }
    portraitFrame = requestAnimationFrame(draw);
  }
  draw();
}

export function toggleFullscreen(resizeCallback) {
  isFullscreen = !isFullscreen;
  document.body.classList.toggle("fullscreen", isFullscreen);
  const btn = document.getElementById("fsBtn");
  if (btn) btn.textContent = isFullscreen ? "⛶" : "⛶";
  setTimeout(resizeCallback, 50);
}

export function toggleSidebar(resizeCallback) {
  const sb = document.getElementById("sidebar");
  const tab = document.getElementById("sidebarTab");
  const bd = document.getElementById("sidebarBackdrop");
  const isMobile = window.innerWidth <= 768;
  sidebarOpen = !sidebarOpen;
  if (sb) sb.classList.toggle("collapsed", !sidebarOpen);
  if (tab) tab.textContent = sidebarOpen ? "‹" : "›";
  if (isMobile && bd) bd.classList.toggle("visible", sidebarOpen);
  setTimeout(resizeCallback, 310);
}

export function closeSidebarMobile() {
  if (sidebarOpen && window.innerWidth <= 768) {
    toggleSidebar(() => {}); 
  }
}

export function toggleRightPanel(resizeCallback) {
  const rp = document.getElementById("rightPanel");
  const tab = document.getElementById("rpToggle");
  const btn = document.getElementById("rpToggleBtn");
  rpOpen = !rpOpen;
  if (rp) rp.classList.toggle("collapsed", !rpOpen);
  if (tab) tab.textContent = rpOpen ? "›" : "‹";
  if (btn) btn.textContent = rpOpen ? "📋" : "📋";
  setTimeout(resizeCallback, 310);
}

export function toggleSection(id) {
  const sec = document.getElementById(id);
  if (sec) sec.classList.toggle("collapsed");
}

export function setStatus(type, msg) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  if (dot) dot.className = "status-dot" + (type ? " " + type : "");
  if (text) text.textContent = msg;
}

const logEl = document.getElementById("algoLog");
const fab = document.getElementById("scrollFab");
const MAX_LOG = 400;

export function logEntry(type, msg) {
  if (!logEl) return;
  const div = document.createElement("div");
  div.className = "log-entry " + type;
  div.textContent = msg;
  logEl.appendChild(div);
  while (logEl.children.length > MAX_LOG)
    logEl.removeChild(logEl.firstChild);
  if (autoScroll) logEl.scrollTop = logEl.scrollHeight;
}

export function clearLog() {
  if (logEl) logEl.innerHTML = "";
  if (fab) fab.classList.remove("visible");
}

export function toggleAutoScroll() {
  autoScroll = !autoScroll;
  syncAutoScrollBtn();
  if (autoScroll && logEl) logEl.scrollTop = logEl.scrollHeight;
}

export function syncAutoScrollBtn() {
  const btn = document.getElementById("btnAutoScroll");
  if (btn) {
    btn.textContent = autoScroll ? "⬇ Auto" : "⏸ Auto";
    btn.classList.toggle("active", autoScroll);
  }
}

export function jumpToBottom() {
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
  if (fab) fab.classList.remove("visible");
  autoScroll = true;
  syncAutoScrollBtn();
}

export function showShortcuts() {
  const el = document.getElementById("shortcutsOverlay");
  if (el) el.classList.add("visible");
}

export function hideShortcuts() {
  const el = document.getElementById("shortcutsOverlay");
  if (el) el.classList.remove("visible");
}

export function setHeuristicUI(h) {
  document.querySelectorAll(".heur-btn").forEach((b) => b.classList.remove("active"));
  const btn = document.getElementById("heur-" + h);
  if (btn) btn.classList.add("active");
  const formulas = {
    manhattan: "|Δr|+|Δc|",
    euclidean: "√(Δr²+Δc²)",
    chebyshev: "max(|Δr|,|Δc|)",
    octile: "max(Δr,Δc)+(√2-1)·min(Δr,Δc)",
  };
  const fEl = document.getElementById("heurFormula");
  if (fEl) fEl.textContent = formulas[h] || "";
  const bEl = document.getElementById("heurBadge");
  if (bEl) bEl.textContent = h[0].toUpperCase() + h.slice(1);
}

export function switchSbTab(name, btn) {
  document.querySelectorAll(".sb-panel").forEach((p) => (p.hidden = true));
  document.querySelectorAll(".sb-tab").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  const panel = document.getElementById("tab-" + name);
  if (panel) panel.hidden = false;
  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
  }
}

export function toggleTheme(drawGridCallback) {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = next === "dark" ? "🌙" : "☀️";
  if (drawGridCallback) drawGridCallback();
}

export { sidebarOpen, rpOpen, isFullscreen, autoScroll, effData };
