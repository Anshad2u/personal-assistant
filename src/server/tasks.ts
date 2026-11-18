import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { getProject } from "@/server/projects";
import { describeSchedule, isTimeZone, nextRunAt } from "@/server/schedule";

export const taskInput = z
  .object({
    instruction: z.string().trim().min(1, "Say what the task should do").max(2000),
    schedule: z.enum(["once", "daily", "weekly"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
    weekday: z.number().int().min(0).max(6).nullable().default(null),
    timeZone: z.string().refine(isTimeZone, "Unknown time zone"),
    projectId: z.string().uuid().nullable().default(null),
  })
  .strict()
  .refine((t) => t.schedule !== "once" || t.date, { message: "Pick a date", path: ["date"] })
  .refine((t) => t.schedule !== "weekly" || t.weekday !== null, { message: "Pick a weekday", path: ["weekday"] });
export const updateTaskInput = z.object({ id: z.string().uuid(), task: taskInput }).strict();
export const taskIdInput = z.object({ id: z.string().uuid() }).strict();
export const pauseTaskInput = z.object({ id: z.string().uuid(), paused: z.boolean() }).strict();

export type TaskInput = z.infer<typeof taskInput>;

export type Task = {
  id: string;
  instruction: string;
  schedule: "once" | "daily" | "weekly";
  date: string | null;
  time: string;
  weekday: number | null;
  timeZone: string;
  projectId: string | null;
  status: "active" | "paused" | "completed";
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunStatus: "ok" | "error" | null;
  label: string;
};

const shown = {
  id: tasks.id,
  instruction: tasks.instruction,
  schedule: tasks.schedule,
  date: tasks.date,
  time: tasks.time,
  weekday: tasks.weekday,
  timeZone: tasks.timeZone,
  projectId: tasks.projectId,
  status: tasks.status,
  nextRunAt: tasks.nextRunAt,
  lastRunAt: tasks.lastRunAt,
  lastRunStatus: tasks.lastRunStatus,
};

export async function listTasks(userId: string): Promise<Task[]> {
  const rows = await db
    .select(shown)
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.createdAt));
  return rows.map((row) => ({ ...row, label: describeSchedule(row) }));
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

async function prepare(userId: string, input: TaskInput) {
  if (input.projectId && !(await getProject(userId, input.projectId)))
    return { error: "That project no longer exists." } as const;
  const clean = {
    ...input,
    date: input.schedule === "once" ? input.date : null,
    weekday: input.schedule === "weekly" ? input.weekday : null,
  };
  const next = nextRunAt(clean, Date.now());
  if (next === null) return { error: "Pick a time in the future." } as const;
  return { clean, next } as const;
}

export async function createTask(
  user: { id: string; orgId: string },
  input: TaskInput,
): Promise<SaveResult> {
  const prepared = await prepare(user.id, input);
  if ("error" in prepared) return { ok: false, error: prepared.error ?? "That didn't work." };
  const id = crypto.randomUUID();
  await db.insert(tasks).values({
    id,
    userId: user.id,
    orgId: user.orgId,
    ...prepared.clean,
    status: "active",
    nextRunAt: prepared.next,
    createdAt: Date.now(),
  });
  return { ok: true, id };
}

export async function updateTask(
  userId: string,
  id: string,
  input: TaskInput,
): Promise<SaveResult> {
  const prepared = await prepare(userId, input);
  if ("error" in prepared) return { ok: false, error: prepared.error ?? "That didn't work." };
  const updated = await db
    .update(tasks)
    .set({ ...prepared.clean, status: "active", nextRunAt: prepared.next })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });
  return updated.length ? { ok: true, id } : { ok: false, error: "Not found" };
}

export async function setPaused(userId: string, id: string, paused: boolean): Promise<void> {
  const [task] = await db
    .select(shown)
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!task || task.status === "completed") return;
  await db
    .update(tasks)
    .set(
      paused
        ? { status: "paused" }
        : { status: "active", nextRunAt: nextRunAt(task, Date.now()) },
    )
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
}

/** Upcoming active tasks, soonest first. */
export async function upcomingTasks(userId: string, limit = 5) {
  return (await listTasks(userId))
    .filter((t) => t.status === "active" && t.nextRunAt)
    .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
    .slice(0, limit);
}

/** Every active task due by `now`, across members (the cron's work list). */
export function dueTasks(now: number) {
  return db
    .select({ ...shown, userId: tasks.userId, orgId: tasks.orgId })
    .from(tasks)
    .where(and(eq(tasks.status, "active"), lte(tasks.nextRunAt, now)))
    .limit(25);
}

export async function recordRun(
  task: Task & { userId: string },
  ok: boolean,
  now: number,
): Promise<void> {
  const next = task.schedule === "once" ? null : nextRunAt(task, now);
  await db
    .update(tasks)
    .set({
      lastRunAt: now,
      lastRunStatus: ok ? "ok" : "error",
      nextRunAt: next,
      status: next === null ? "completed" : "active",
    })
    .where(and(eq(tasks.id, task.id), eq(tasks.userId, task.userId)));
}
