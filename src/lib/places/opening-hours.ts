// Reads OpenStreetMap opening_hours (https://wiki.openstreetmap.org/wiki/Key:opening_hours)
// well enough to answer "open right now?". Only the common forms are
// understood: day ranges, time ranges (including past midnight), "24/7" and
// "off". Anything else (months, holidays, "sunrise", "open end"…) returns
// null, which the search treats as "unknown" and keeps the place.

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
type Interval = [start: number, end: number]; // minutes from the day's midnight; end may pass 1440

/** Parses opening_hours into each weekday's open intervals (Mo = 0), or null if unsupported. */
export function parseOpeningHours(value: string): Interval[][] | null {
  const text = value.trim();
  if (!text || text.length > 300) return null;
  // A holiday calendar is unavailable. Do not claim weekday hours also
  // apply on a possible holiday; retain the place as unknown instead.
  if (/\b(?:PH|SH)\b/.test(text)) return null;
  const week: Interval[][] = DAYS.map(() => []);
  if (text === "24/7") return week.map(() => [[0, 1440]]);

  // Rules are separated by ";", or by "," when a new day list follows a time
  // ("Su-We 11:00-24:00, Th 11:00-01:00").
  for (const rawRule of text.split(/;|(?<=\d)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/)) {
    const rule = rawRule.trim();
    if (!rule) continue;
    // A rule for public or school holidays only: ignore it.
    if (/^(PH|SH)(\s|$|,)/.test(rule) && !/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/.test(rule)) continue;

    const match = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?|PH|SH)(?:\s*,\s*(?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?|PH|SH))*)?\s*(.*)$/.exec(rule);
    if (!match) return null;
    const daysPart = match[1];
    const timesPart = match[2].trim();

    const days = daysPart ? parseDays(daysPart) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;

    let intervals: Interval[];
    if (timesPart === "off" || timesPart === "closed") {
      intervals = [];
    } else if (timesPart === "" && daysPart) {
      intervals = [[0, 1440]]; // "Mo-Fr" alone means open all day
    } else {
      const parsed = parseTimes(timesPart);
      if (!parsed) return null;
      intervals = parsed;
    }
    // A later rule replaces earlier ones for the days it names.
    for (const d of days) week[d] = intervals.slice();
  }
  return week;
}

function parseDays(part: string): number[] | null {
  const days = new Set<number>();
  for (const piece of part.split(",").map((p) => p.trim())) {
    if (piece === "PH" || piece === "SH") continue;
    const [from, to] = piece.split("-");
    const a = DAYS.indexOf(from as (typeof DAYS)[number]);
    if (a < 0) return null;
    if (to === undefined) {
      days.add(a);
      continue;
    }
    const b = DAYS.indexOf(to as (typeof DAYS)[number]);
    if (b < 0) return null;
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
  }
  return [...days];
}

function parseTimes(part: string): Interval[] | null {
  const out: Interval[] = [];
  for (const piece of part.split(",").map((p) => p.trim())) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(piece);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[4]) > 59 || end > 48 * 60) return null;
    if (end <= start) end += 1440; // closes after midnight
    out.push([start, end]);
  }
  return out;
}

/** The weekday (Mo = 0) and minutes past midnight at `now` in an IANA time zone. */
export function localWeekMinute(now: Date, timeZone: string): { day: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
    if (day < 0) return null;
    return { day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
  } catch {
    return null; // unknown time zone
  }
}

/** True / false when the hours say whether it's open at `now`; null when unknown. */
export function isOpenNow(hours: string | null | undefined, now: Date, timeZone: string | null): boolean | null {
  if (!hours || !timeZone) return null;
  const week = parseOpeningHours(hours);
  const at = localWeekMinute(now, timeZone);
  if (!week || !at) return null;
  if (week[at.day].some(([s, e]) => at.minute >= s && at.minute < e)) return true;
  // Still open from yesterday's late hours?
  const yesterday = week[(at.day + 6) % 7];
  return yesterday.some(([s, e]) => e > 1440 && at.minute + 1440 >= s && at.minute + 1440 < e);
}

/** True when `timeZone` is a time zone this server knows. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.length > 64) return false;
  return localWeekMinute(new Date(), timeZone) !== null;
}
