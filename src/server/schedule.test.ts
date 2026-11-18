import { describe, expect, it } from "vitest";
import { describeSchedule, nextRunAt, zonedTime } from "./schedule";

describe("schedule", () => {
  it("places wall-clock times in the task's time zone", () => {
    expect(new Date(zonedTime(2026, 7, 1, "09:00", "Europe/Lisbon")).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(new Date(zonedTime(2026, 1, 15, "09:00", "America/New_York")).toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("runs daily tasks today when the time is still ahead, else tomorrow", () => {
    const after = Date.parse("2026-11-18T07:00:00Z");
    const task = { schedule: "daily" as const, date: null, time: "08:00", weekday: null, timeZone: "UTC" };
    expect(new Date(nextRunAt(task, after)!).toISOString()).toBe("2026-11-18T08:00:00.000Z");
    expect(new Date(nextRunAt(task, Date.parse("2026-11-18T08:00:00Z"))!).toISOString()).toBe("2026-11-19T08:00:00.000Z");
  });

  it("runs weekly tasks on their weekday", () => {
    const task = { schedule: "weekly" as const, date: null, time: "17:00", weekday: 5, timeZone: "Europe/Lisbon" };
    // 2026-11-18 is a Wednesday.
    expect(new Date(nextRunAt(task, Date.parse("2026-11-18T12:00:00Z"))!).toISOString()).toBe("2026-11-20T17:00:00.000Z");
    expect(describeSchedule(task)).toBe("Fridays at 17:00");
  });

  it("gives one-time tasks no next run once passed", () => {
    const task = { schedule: "once" as const, date: "2026-11-20", time: "10:00", weekday: null, timeZone: "UTC" };
    expect(nextRunAt(task, Date.parse("2026-11-19T00:00:00Z"))).toBe(Date.parse("2026-11-20T10:00:00Z"));
    expect(nextRunAt(task, Date.parse("2026-11-21T00:00:00Z"))).toBeNull();
  });
});
