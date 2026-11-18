import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memories } from "@/db/schema";

export const memoryInput = z
  .object({ content: z.string().trim().min(1, "Write something to remember").max(500) })
  .strict();
export const updateMemoryInput = memoryInput.extend({ id: z.string().min(1) });
export const memoryIdInput = z.object({ id: z.string().min(1) }).strict();

export type Memory = {
  id: string;
  content: string;
  source: "chat" | "manual";
  createdAt: number;
  updatedAt: number;
};

export function listMemories(userId: string): Promise<Memory[]> {
  return db
    .select({
      id: memories.id,
      content: memories.content,
      source: memories.source,
      createdAt: memories.createdAt,
      updatedAt: memories.updatedAt,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt));
}

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Adds memories that aren't already known; returns how many were new. */
export async function addMemories(
  userId: string,
  contents: string[],
  source: "chat" | "manual",
): Promise<number> {
  const known = new Set((await listMemories(userId)).map((m) => normalize(m.content)));
  const now = Date.now();
  const rows = [];
  for (const raw of contents) {
    const content = raw.trim().slice(0, 500);
    const key = normalize(content);
    if (!key || known.has(key)) continue;
    known.add(key);
    rows.push({ id: `m_${crypto.randomUUID()}`, userId, content, source, createdAt: now, updatedAt: now });
  }
  if (rows.length) await db.insert(memories).values(rows);
  return rows.length;
}

export async function updateMemory(
  userId: string,
  input: z.infer<typeof updateMemoryInput>,
): Promise<void> {
  await db
    .update(memories)
    .set({ content: input.content, updatedAt: Date.now() })
    .where(and(eq(memories.id, input.id), eq(memories.userId, userId)));
}

export async function deleteMemories(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db
    .delete(memories)
    .where(and(eq(memories.userId, userId), inArray(memories.id, ids)));
}

export async function deleteAllMemories(userId: string): Promise<void> {
  await db.delete(memories).where(eq(memories.userId, userId));
}
