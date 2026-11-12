// Plain helpers for the ranking screens (13 and 15), tested in ranking.test.ts.

/** Moves the item at `from` to `to`, shifting the others. Returns a new list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

/**
 * The starting order: this phone's saved ranking when it still matches the
 * options exactly, otherwise the options in the order they came (best first).
 */
export function initialOrder(optionIds: readonly string[], saved: readonly string[] | null | undefined): string[] {
  return sameOptions(optionIds, saved) ? [...saved] : [...optionIds];
}

/** True when `list` holds exactly these option IDs, each once, in any order. */
export function sameOptions(optionIds: readonly string[], list: readonly string[] | null | undefined): list is readonly string[] {
  return !!list && list.length === optionIds.length && new Set(list).size === list.length && list.every((id) => optionIds.includes(id));
}

/**
 * Where a ranking screen starts: the order this phone was arranging (an
 * unsent draft, kept across a reload), else the submitted ranking being
 * changed, else the options' own order.
 */
export function startingOrder(
  optionIds: readonly string[],
  draft: readonly string[] | null | undefined,
  submitted: readonly string[] | null | undefined,
): string[] {
  if (sameOptions(optionIds, draft)) return [...draft];
  return initialOrder(optionIds, submitted);
}

/**
 * Where a dragged row lands: the number of other rows whose middle is above
 * the dragged row's middle. `middles` are the rows' resting middles, in order.
 */
export function dropIndex(middles: readonly number[], from: number, draggedMiddle: number): number {
  let index = 0;
  middles.forEach((m, i) => {
    if (i !== from && m < draggedMiddle) index += 1;
  });
  return index;
}

/**
 * How far a row that isn't being dragged moves to make room: up one slot
 * when the dragged row passed it going down, down one slot going up.
 */
export function shiftFor(i: number, from: number, to: number): -1 | 0 | 1 {
  if (i === from) return 0;
  if (from < to && i > from && i <= to) return -1;
  if (from > to && i >= to && i < from) return 1;
  return 0;
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
