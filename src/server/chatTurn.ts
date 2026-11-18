import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cards, messages } from "@/db/schema";
import { callModel, ModelError, streamDeltas } from "@/server/ai";
import { afterTurn, maybeGenerateCards, replyContext } from "@/server/assistant";
import { getProject } from "@/server/projects";
import { addMessage, deleteMessage, finishMessage, getMessage } from "@/server/threads";

export const turnInput = z
  .object({
    projectId: z.string().uuid().nullable().optional(),
    content: z.string().trim().min(1).max(8000).optional(),
    retryId: z.string().uuid().optional(),
    cardId: z.string().uuid().optional(),
  })
  .strict();

type Owner = { id: string; orgId: string };
type Event =
  | { type: "start"; userMessageId: string | null; assistantMessageId: string }
  | { type: "delta"; text: string }
  | { type: "setup"; message: string }
  | { type: "error"; message: string }
  | { type: "actions"; remembered: number; forgot: number; taskId: string | null; handoffId: string | null }
  | { type: "done" };

export type TurnStart =
  | { ok: false; status: number; error: string }
  | { ok: true; run: (emit: (event: Event) => Promise<void>) => Promise<void> };

/** Checks a chat turn and returns the work that streams its reply. */
export async function startTurn(user: Owner, input: z.infer<typeof turnInput>): Promise<TurnStart> {
  const projectId = input.projectId ?? null;
  if (projectId && !(await getProject(user.id, projectId)))
    return { ok: false, status: 404, error: "Not found" };

  let content: string;
  let retry: string | null = null;
  let cardId: string | null = null;
  if (input.retryId) {
    const failed = await getMessage(user.id, input.retryId);
    if (!failed || failed.status !== "error" || failed.projectId !== projectId)
      return { ok: false, status: 404, error: "Not found" };
    const [asked] = await db
      .select({ content: messages.content })
      .from(messages)
      .where(
        and(
          eq(messages.userId, user.id),
          eq(messages.role, "user"),
          lt(messages.createdAt, failed.createdAt + 1),
          projectId ? eq(messages.projectId, projectId) : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (!asked) return { ok: false, status: 404, error: "Not found" };
    content = asked.content;
    retry = failed.id;
  } else if (input.cardId) {
    if (projectId) return { ok: false, status: 400, error: "Cards post to the main chat." };
    const [card] = await db
      .select({ instruction: cards.instruction })
      .from(cards)
      .where(and(eq(cards.id, input.cardId), eq(cards.userId, user.id), eq(cards.status, "open")));
    if (!card) return { ok: false, status: 404, error: "Not found" };
    content = card.instruction;
    cardId = input.cardId;
  } else if (input.content) {
    content = input.content;
  } else {
    return { ok: false, status: 400, error: "Write a message." };
  }

  return {
    ok: true,
    run: async (emit) => {
      const userMessageId = retry ? null : await addMessage(user.id, projectId, { role: "user", content });
      if (retry) await deleteMessage(user.id, retry);
      const context = await replyContext(user.id, projectId);
      let response: Response;
      try {
        response = await callModel(context, { stream: true });
      } catch (error) {
        if (error instanceof ModelError && error.setup) {
          if (userMessageId) await deleteMessage(user.id, userMessageId);
          await emit({ type: "setup", message: error.setup });
          return;
        }
        const message = error instanceof Error ? error.message : "The reply failed.";
        const failedId = await addMessage(user.id, projectId, { role: "assistant", content: message, status: "error" });
        await emit({ type: "start", userMessageId, assistantMessageId: failedId });
        await emit({ type: "error", message });
        return;
      }
      if (cardId) {
        await db.update(cards).set({ status: "done" }).where(and(eq(cards.id, cardId), eq(cards.userId, user.id)));
      }
      const assistantId = await addMessage(user.id, projectId, { role: "assistant", content: "", status: "pending" });
      await emit({ type: "start", userMessageId, assistantMessageId: assistantId });
      let text = "";
      try {
        for await (const delta of streamDeltas(response)) {
          text += delta;
          await emit({ type: "delta", text: delta });
        }
        if (!text.trim()) throw new Error("The model sent an empty reply.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "The reply failed.";
        await finishMessage(user.id, assistantId, message, "error");
        await emit({ type: "error", message });
        return;
      }
      await finishMessage(user.id, assistantId, text, "done");
      try {
        const actions = await afterTurn(user, projectId, content, text);
        await emit({ type: "actions", ...actions });
      } catch (error) {
        if (!(error instanceof ModelError)) console.error(error);
      }
      await maybeGenerateCards(user);
    },
  };
}
