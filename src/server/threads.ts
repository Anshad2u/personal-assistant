import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages, projects } from "@/db/schema";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "done" | "pending" | "error";
  source: string | null;
  createdAt: number;
};

const thread = (userId: string, projectId: string | null) =>
  and(
    eq(messages.userId, userId),
    projectId ? eq(messages.projectId, projectId) : isNull(messages.projectId),
  );

const shown = {
  id: messages.id,
  role: messages.role,
  content: messages.content,
  status: messages.status,
  source: messages.source,
  createdAt: messages.createdAt,
};

export function listMessages(
  userId: string,
  projectId: string | null,
): Promise<Message[]> {
  return db
    .select(shown)
    .from(messages)
    .where(thread(userId, projectId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

/** The latest finished messages, oldest first, for a reply's context. */
export async function recentMessages(
  userId: string,
  projectId: string | null,
  limit = 20,
): Promise<Message[]> {
  const rows = await db
    .select(shown)
    .from(messages)
    .where(and(thread(userId, projectId), eq(messages.status, "done")))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  return rows.reverse();
}

let lastStamp = 0;
/** Strictly increasing timestamps keep a thread's order within one Worker. */
export function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

export async function addMessage(
  userId: string,
  projectId: string | null,
  message: {
    role: "user" | "assistant";
    content: string;
    status?: "done" | "pending" | "error";
    source?: string;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = stamp();
  await db.batch([
    db.insert(messages).values({
      id,
      userId,
      projectId,
      role: message.role,
      content: message.content,
      status: message.status ?? "done",
      source: message.source ?? null,
      createdAt: now,
    }),
    ...(projectId
      ? [
          db
            .update(projects)
            .set({ lastActivityAt: now })
            .where(and(eq(projects.id, projectId), eq(projects.userId, userId))),
        ]
      : []),
  ]);
  return id;
}

export async function finishMessage(
  userId: string,
  id: string,
  content: string,
  status: "done" | "error",
): Promise<void> {
  await db
    .update(messages)
    .set({ content, status })
    .where(and(eq(messages.id, id), eq(messages.userId, userId)));
}

export async function getMessage(userId: string, id: string) {
  const [row] = await db
    .select({ ...shown, projectId: messages.projectId })
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.userId, userId)));
  return row ?? null;
}

export async function deleteMessage(userId: string, id: string): Promise<void> {
  await db
    .delete(messages)
    .where(and(eq(messages.id, id), eq(messages.userId, userId)));
}

export async function clearMainThread(userId: string): Promise<void> {
  await db.delete(messages).where(thread(userId, null));
}
