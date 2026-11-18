import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files, messages, projects, tasks, handoffs } from "@/db/schema";
import { env } from "cloudflare:workers";

export const projectInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    description: z.string().trim().max(1000).default(""),
  })
  .strict();
export const updateProjectInput = projectInput.extend({ id: z.string().uuid() });
export const projectIdInput = z.object({ id: z.string().uuid() }).strict();

export type Project = {
  id: string;
  name: string;
  description: string;
  lastActivityAt: number;
};

const shown = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  lastActivityAt: projects.lastActivityAt,
};

export function listProjects(userId: string): Promise<Project[]> {
  return db
    .select(shown)
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.lastActivityAt));
}

export async function getProject(
  userId: string,
  id: string,
): Promise<Project | null> {
  const [row] = await db
    .select(shown)
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return row ?? null;
}

export async function createProject(
  userId: string,
  input: z.infer<typeof projectInput>,
): Promise<Project> {
  const now = Date.now();
  const row = {
    id: crypto.randomUUID(),
    userId,
    name: input.name,
    description: input.description,
    createdAt: now,
    lastActivityAt: now,
  };
  await db.insert(projects).values(row);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lastActivityAt: now,
  };
}

export async function updateProject(
  userId: string,
  input: z.infer<typeof updateProjectInput>,
): Promise<Project | null> {
  await db
    .update(projects)
    .set({ name: input.name, description: input.description })
    .where(and(eq(projects.id, input.id), eq(projects.userId, userId)));
  return getProject(userId, input.id);
}

/** Deletes the project with its messages and files; its tasks and handoffs report to the main thread. */
export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const project = await getProject(userId, id);
  if (!project) return false;
  const stored = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.projectId, id), eq(files.userId, userId)));
  if (stored.length) await env.files.delete(stored.map((f) => fileKey(userId, f.id)));
  await db.batch([
    db.delete(messages).where(and(eq(messages.projectId, id), eq(messages.userId, userId))),
    db.delete(files).where(and(eq(files.projectId, id), eq(files.userId, userId))),
    db.update(tasks).set({ projectId: null }).where(and(eq(tasks.projectId, id), eq(tasks.userId, userId))),
    db.update(handoffs).set({ projectId: null }).where(and(eq(handoffs.projectId, id), eq(handoffs.userId, userId))),
    db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))),
  ]);
  return true;
}

export const fileKey = (userId: string, fileId: string) =>
  `${encodeURIComponent(userId)}/${fileId}`;
