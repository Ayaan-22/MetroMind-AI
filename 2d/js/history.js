export const MAX_HISTORY = 60;
export let searchHistory = [];
export let historyIdx = -1;
export let historyMode = false;

export function setHistoryMode(v) { historyMode = v; }
export function setHistoryIdx(v) { historyIdx = v; }
export function setSearchHistory(v) { searchHistory = v; }

export function snapshotHistory(searchState, grid) {
  if (!searchState) return;
  const snap = {
    grid: grid.map((r) => [...r]),
    explored: searchState.explored,
    openSize: searchState.openSet.size,
  };
  if (searchHistory.length >= MAX_HISTORY) searchHistory.shift();
  searchHistory.push(snap);
  historyIdx = searchHistory.length - 1;
  updateHistoryUI();
}

export function updateHistoryUI() {
  const total = searchHistory.length;
  const idx = historyIdx;
  const posEl = document.getElementById("historyPos");
  const btnBack = document.getElementById("btnBack");
  const btnFwd = document.getElementById("btnFwd");
  
  if (posEl) posEl.textContent = total ? `${idx + 1}/${total}` : "— / —";
  if (btnBack) btnBack.disabled = idx <= 0;
  if (btnFwd) btnFwd.disabled = idx >= total - 1;
}

export function clearHistory() {
  searchHistory = [];
  historyIdx = -1;
  historyMode = false;
  updateHistoryUI();
}

export function stepBackward(restoreCallback) {
  if (historyIdx <= 0) return;
  historyMode = true;
  historyIdx--;
  restoreSnapshot(searchHistory[historyIdx], restoreCallback);
}

export function stepForward(restoreCallback) {
  if (historyIdx >= searchHistory.length - 1) return;
  historyIdx++;
  restoreSnapshot(searchHistory[historyIdx], restoreCallback);
}

function restoreSnapshot(snap, restoreCallback) {
  if (restoreCallback) restoreCallback(snap);
  updateHistoryUI();
}
