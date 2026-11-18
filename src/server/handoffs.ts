import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { handoffSteps, handoffs } from "@/db/schema";
import { getProject } from "@/server/projects";

export const handoffInput = z
  .object({
    goal: z.string().trim().min(1, "Say what to do on the web").max(1000),
    projectId: z.string().uuid().nullable().default(null),
  })
  .strict();
export const handoffIdInput = z.object({ id: z.string().uuid() }).strict();
export const decisionInput = z
  .object({ id: z.string().uuid(), approve: z.boolean() })
  .strict();

export type HandoffStatus =
  | "queued"
  | "running"
  | "needs_approval"
  | "done"
  | "failed"
  | "cancelled";
export const FINAL: HandoffStatus[] = ["done", "failed", "cancelled"];

const shown = {
  id: handoffs.id,
  goal: handoffs.goal,
  status: handoffs.status,
  summary: handoffs.summary,
  projectId: handoffs.projectId,
  createdAt: handoffs.createdAt,
  updatedAt: handoffs.updatedAt,
};

export function listHandoffs(userId: string) {
  return db
    .select(shown)
    .from(handoffs)
    .where(eq(handoffs.userId, userId))
    .orderBy(desc(handoffs.createdAt))
    .limit(100);
}

export async function getHandoff(userId: string, id: string) {
  const [handoff] = await db
    .select(shown)
    .from(handoffs)
    .where(and(eq(handoffs.id, id), eq(handoffs.userId, userId)));
  if (!handoff) return null;
  const steps = await listSteps(id);
  return { ...handoff, steps };
}

export function listSteps(handoffId: string) {
  return db
    .select({
      id: handoffSteps.id,
      position: handoffSteps.position,
      action: handoffSteps.action,
      url: handoffSteps.url,
      note: handoffSteps.note,
      fields: handoffSteps.fields,
      snapshot: handoffSteps.snapshot,
      status: handoffSteps.status,
      createdAt: handoffSteps.createdAt,
    })
    .from(handoffSteps)
    .where(eq(handoffSteps.handoffId, handoffId))
    .orderBy(asc(handoffSteps.position));
}

export async function enqueueStep(handoffId: string): Promise<void> {
  await env.jobs.send({ handoffId });
}

export async function createHandoff(
  user: { id: string; orgId: string },
  input: z.infer<typeof handoffInput>,
): Promise<string | null> {
  if (input.projectId && !(await getProject(user.id, input.projectId)))
    return null;
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.insert(handoffs).values({
    id,
    userId: user.id,
    orgId: user.orgId,
    projectId: input.projectId,
    goal: input.goal,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  await enqueueStep(id);
  return id;
}

export async function cancelHandoff(userId: string, id: string): Promise<boolean> {
  const handoff = await getHandoff(userId, id);
  if (!handoff) return false;
  if (FINAL.includes(handoff.status)) return true;
  await db
    .update(handoffs)
    .set({ status: "cancelled", updatedAt: Date.now() })
    .where(and(eq(handoffs.id, id), eq(handoffs.userId, userId)));
  await db
    .update(handoffSteps)
    .set({ status: "rejected" })
    .where(and(eq(handoffSteps.handoffId, id), eq(handoffSteps.status, "needs_approval")));
  return true;
}

export async function setStatus(
  id: string,
  status: HandoffStatus,
  summary?: string,
  only?: HandoffStatus[],
): Promise<boolean> {
  const updated = await db
    .update(handoffs)
    .set({ status, updatedAt: Date.now(), ...(summary !== undefined ? { summary } : {}) })
    .where(and(eq(handoffs.id, id), only ? inArray(handoffs.status, only) : undefined))
    .returning({ id: handoffs.id });
  return updated.length > 0;
}

export async function addStep(
  handoff: { id: string; userId: string },
  step: {
    position: number;
    action: "visit" | "submit";
    url: string;
    note: string;
    fields?: string | null;
    snapshot?: string | null;
    status: "done" | "failed" | "needs_approval" | "approved" | "rejected";
  },
): Promise<void> {
  await db.insert(handoffSteps).values({
    id: crypto.randomUUID(),
    handoffId: handoff.id,
    userId: handoff.userId,
    ...step,
    createdAt: Date.now(),
  });
}

export async function updateStep(
  id: string,
  change: { status: "approved" | "rejected" | "failed"; snapshot?: string | null; note?: string },
): Promise<void> {
  await db.update(handoffSteps).set(change).where(eq(handoffSteps.id, id));
}

/** The background record, without an owner filter: only the queue consumer reads it. */
export async function handoffForRunner(id: string) {
  const [row] = await db
    .select({ ...shown, userId: handoffs.userId, orgId: handoffs.orgId })
    .from(handoffs)
    .where(eq(handoffs.id, id));
  return row ?? null;
}
