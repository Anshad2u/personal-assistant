import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cards, users } from "@/db/schema";

export const cardIdInput = z.object({ id: z.string().uuid() }).strict();

export type Card = {
  id: string;
  title: string;
  reason: string;
  actionLabel: string;
  priority: number;
};

export function listOpenCards(userId: string): Promise<Card[]> {
  return db
    .select({
      id: cards.id,
      title: cards.title,
      reason: cards.reason,
      actionLabel: cards.actionLabel,
      priority: cards.priority,
    })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.status, "open")))
    .orderBy(desc(cards.priority), desc(cards.createdAt));
}

/** Titles of cards already acted on or dismissed, which aren't suggested again. */
export async function closedTitles(userId: string): Promise<string[]> {
  const rows = await db
    .select({ title: cards.title })
    .from(cards)
    .where(and(eq(cards.userId, userId), inArray(cards.status, ["done", "dismissed"])))
    .orderBy(desc(cards.createdAt))
    .limit(50);
  return rows.map((r) => r.title);
}

export type NewCard = Omit<Card, "id"> & { instruction: string };

/** Replaces the open cards with a fresh set. */
export async function replaceCards(userId: string, fresh: NewCard[]): Promise<void> {
  const closed = new Set((await closedTitles(userId)).map((t) => t.toLowerCase()));
  const now = Date.now();
  const rows = fresh
    .filter((card) => !closed.has(card.title.toLowerCase()))
    .map((card) => ({ ...card, id: crypto.randomUUID(), userId, status: "open" as const, createdAt: now }));
  await db.batch([
    db.delete(cards).where(and(eq(cards.userId, userId), eq(cards.status, "open"))),
    ...(rows.length ? [db.insert(cards).values(rows)] : []),
    db.update(users).set({ cardsAt: now }).where(eq(users.id, userId)),
  ]);
}

export async function lastGeneratedAt(userId: string): Promise<number | null> {
  const [row] = await db.select({ cardsAt: users.cardsAt }).from(users).where(eq(users.id, userId));
  return row?.cardsAt ?? null;
}

export async function dismissCard(userId: string, id: string): Promise<void> {
  await db
    .update(cards)
    .set({ status: "dismissed" })
    .where(and(eq(cards.id, id), eq(cards.userId, userId), eq(cards.status, "open")));
}

/** Marks an open card done and returns its instruction, or null. */
export async function takeCard(userId: string, id: string): Promise<string | null> {
  const [row] = await db
    .update(cards)
    .set({ status: "done" })
    .where(and(eq(cards.id, id), eq(cards.userId, userId), eq(cards.status, "open")))
    .returning({ instruction: cards.instruction });
  return row?.instruction ?? null;
}
