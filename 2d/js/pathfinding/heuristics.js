export let currentHeuristic = "manhattan";

export function heuristic(a, b) {
  const dr = Math.abs(a.r - b.r),
    dc = Math.abs(a.c - b.c);
  switch (currentHeuristic) {
    case "euclidean":
      return Math.sqrt(dr * dr + dc * dc);
    case "chebyshev":
      return Math.max(dr, dc);
    case "octile":
      return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
    case "manhattan":
    default:
      return dr + dc;
  }
}

export function setHeuristic(h) {
  currentHeuristic = h;
}
