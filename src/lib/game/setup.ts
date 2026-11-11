// Host setup options (screen 07, "Host setup" in docs/product-spec.md).

import type { Category } from "./tags";

export const RADIUS_OPTIONS = [1, 5, 10, 25, 50] as const;
export const ROUND_OPTIONS = [1, 2, 3] as const;
export const EVENT_DAYS_AHEAD = 14;

export type Setup = {
  category: Category | null;
  eventDate: string; // YYYY-MM-DD, events only
  radiusMi: number;
  age: "all" | "21_plus";
  indoorOutdoor: "either" | "indoor" | "outdoor";
  rounds: number;
};

/** The phone's local date as YYYY-MM-DD, `daysAhead` days from today. */
export function localDate(daysAhead = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + daysAhead);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "Today", "Tomorrow" or "Sat Nov 14" for a YYYY-MM-DD date. */
export function dateLabel(date: string, today = localDate()): string {
  if (date === today) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(y, m - 1, d);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((value.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  return shortDate(date);
}

/** "Tue Nov 10" for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(y, m - 1, d);
  const weekday = value.toLocaleDateString("en-US", { weekday: "short" });
  const month = value.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${month} ${d}`;
}

export const DEFAULT_SETUP: Setup = {
  category: null,
  eventDate: "",
  radiusMi: 5,
  age: "all",
  indoorOutdoor: "either",
  rounds: 1,
};
