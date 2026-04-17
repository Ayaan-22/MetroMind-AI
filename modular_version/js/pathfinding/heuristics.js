export let currentHeuristic = "manhattan";

export const heuristic = {
  manhattan: (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c),
  euclidean: (a, b) => Math.sqrt((a.r - b.r) ** 2 + (a.c - b.c) ** 2),
  chebyshev: (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)),
  octile: (a, b) => {
    const dr = Math.abs(a.r - b.r),
      dc = Math.abs(a.c - b.c);
    const F1 = Math.SQRT2 - 1;
    return dr < dc ? F1 * dr + dc : F1 * dc + dr;
  },
  proximity: (a, b) =>
    Math.abs(a.r - b.r) + Math.abs(a.c - b.c) + Math.random() * 0.1,
};

export function setHeuristic(h) {
  if (heuristic[h]) currentHeuristic = h;
}
