export const SUBTASK_COLORS = [
  "#f59e0b", // slot 0 — amber
  "#e879f9", // slot 1 — fuchsia
  "#22d3ee", // slot 2 — cyan
  "#fb923c", // slot 3 — orange
  "#a78bfa", // slot 4 — violet
  "#f43f5e", // slot 5 — rose
] as const;

export function subtaskColor(index: number): string {
  return SUBTASK_COLORS[index % SUBTASK_COLORS.length];
}
