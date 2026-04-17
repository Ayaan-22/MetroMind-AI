export const MAX_HISTORY = 40;
export let searchHistory = [];
export let historyIdx = -1;
export let historyMode = false;

export function setHistoryMode(v) { historyMode = v; }
export function setHistoryIdx(v) { historyIdx = v; }
export function setSearchHistory(v) { searchHistory = v; }

export function snapshotHistory(state, grid) {
  if (searchHistory.length >= MAX_HISTORY) searchHistory.shift();
  searchHistory.push({
    state: JSON.parse(JSON.stringify(state, (key, value) => {
      if (value instanceof Map) return Array.from(value.entries());
      if (value instanceof Set) return Array.from(value);
      if (key === "heap") return value; // MinHeap heap is an array
      return value;
    })),
    grid: grid.map((r) => [...r]),
  });
  historyIdx = searchHistory.length - 1;
  updateHistoryUI();
}

export function updateHistoryUI() {
  const label = document.getElementById("historyLabel");
  const fill = document.getElementById("historyFill");
  if (!label || !fill) return;
  label.textContent = `Snapshot ${historyIdx + 1} / ${searchHistory.length}`;
  fill.style.width = (searchHistory.length / MAX_HISTORY) * 100 + "%";
}

export function clearHistory() {
  searchHistory = [];
  historyIdx = -1;
  historyMode = false;
  updateHistoryUI();
}
