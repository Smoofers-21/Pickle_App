// The two demo locations (milestone 8). A demo lobby's host picks one in
// setup instead of sharing the phone's location; demo games then show the
// saved sample places and events recorded around it. Both centers are
// public downtown spots, never anyone's real location.

export type DemoArea = {
  key: "fayetteville" | "los_angeles";
  label: string;
  /** The center the samples were recorded around (and distances are measured from). */
  lat: number;
  lng: number;
  /** For "open now". */
  timeZone: string;
};

export const DEMO_AREAS: readonly DemoArea[] = [
  // The downtown square, Fayetteville, Arkansas.
  { key: "fayetteville", label: "Fayetteville, AR", lat: 36.062, lng: -94.157, timeZone: "America/Chicago" },
  // Downtown Los Angeles (Pershing Square), California.
  { key: "los_angeles", label: "Los Angeles, CA", lat: 34.048, lng: -118.253, timeZone: "America/Los_Angeles" },
];

export const DEFAULT_DEMO_AREA: DemoArea["key"] = "fayetteville";

export function demoArea(key: unknown): DemoArea | null {
  return DEMO_AREAS.find((a) => a.key === key) ?? null;
}

/** The demo area a search center belongs to (the nearest one). */
export function nearestDemoArea(lat: number, lng: number): DemoArea {
  let best = DEMO_AREAS[0];
  let bestD = Infinity;
  for (const a of DEMO_AREAS) {
    const d = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}
