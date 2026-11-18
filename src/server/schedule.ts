/** When a scheduled task runs next, in its own time zone. Pure, so it is unit-tested. */

export type Schedule = {
  schedule: "once" | "daily" | "weekly";
  date: string | null;
  time: string;
  weekday: number | null;
  timeZone: string;
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function partsIn(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ms);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetAt(ms: number, timeZone: string): number {
  const p = partsIn(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant a wall-clock date and time in `timeZone` happen. */
export function zonedTime(
  year: number,
  month: number,
  day: number,
  time: string,
  timeZone: string,
): number {
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

/** The next run strictly after `after`, or null when a one-time task has passed. */
export function nextRunAt(task: Schedule, after: number): number | null {
  if (task.schedule === "once") {
    if (!task.date) return null;
    const [y, m, d] = task.date.split("-").map(Number);
    const at = zonedTime(y!, m!, d!, task.time, task.timeZone);
    return at > after ? at : null;
  }
  const today = partsIn(after, task.timeZone);
  for (let i = 0; i <= 8; i++) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    if (task.schedule === "weekly" && day.getUTCDay() !== task.weekday) continue;
    const at = zonedTime(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      task.time,
      task.timeZone,
    );
    if (at > after) return at;
  }
  return null;
}

/** "Daily at 08:00", "Fridays at 17:00", "Once on 2026-12-01 at 09:00". */
export function describeSchedule(task: Schedule): string {
  if (task.schedule === "daily") return `Daily at ${task.time}`;
  if (task.schedule === "weekly")
    return `${WEEKDAY_NAMES[task.weekday ?? 0]} at ${task.time}`;
  return `Once on ${task.date} at ${task.time}`;
}
