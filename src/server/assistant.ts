import { type ChatMessage, complete, ModelError, parseJsonObject } from "@/server/ai";
import { closedTitles, lastGeneratedAt, replaceCards, type NewCard } from "@/server/cards";
import { projectFileContext } from "@/server/files";
import { addMemories, deleteMemories, listMemories } from "@/server/memories";
import { getProject } from "@/server/projects";
import { isTimeZone } from "@/server/schedule";
import { createTask, upcomingTasks } from "@/server/tasks";
import { createHandoff } from "@/server/handoffs";
import { recentMessages } from "@/server/threads";

type Owner = { id: string; orgId: string };

async function memoryBlock(userId: string, withIds = false): Promise<string> {
  const list = await listMemories(userId);
  if (!list.length) return "(none yet)";
  return list.map((m) => (withIds ? `[${m.id}] ${m.content}` : `- ${m.content}`)).join("\n");
}

/** The messages a reply is made from: instructions, memories, files and recent history. */
export async function replyContext(
  userId: string,
  projectId: string | null,
): Promise<ChatMessage[]> {
  const today = new Date().toISOString().slice(0, 16).replace("T", " ");
  let system =
    "Job: reply\n" +
    "You are a personal assistant for one person. Be concise and practical, and format with Markdown when it helps.\n" +
    "You can remember facts about the person, forget facts when asked, schedule tasks (once, daily or weekly) and start a web handoff that browses sites for them; " +
    "these happen automatically after your reply when the person asks, so confirm them in plain words.\n" +
    `Current time (UTC): ${today}\n\nWhat you remember about the person:\n${await memoryBlock(userId)}`;
  if (projectId) {
    const project = await getProject(userId, projectId);
    if (project) {
      system += `\n\nThis conversation is the project "${project.name}".${project.description ? ` ${project.description}` : ""}`;
      const files = await projectFileContext(userId, projectId);
      if (files) system += `\n\nThe project's files:\n${files}`;
    }
  }
  const history = await recentMessages(userId, projectId);
  return [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
}

export type TurnActions = { remembered: number; forgot: number; taskId: string | null; handoffId: string | null };

const str = (value: unknown, max = 2000) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/**
 * After a reply: learn new memories, forget what was asked, and create the
 * scheduled task or web handoff the person asked for.
 */
export async function afterTurn(
  user: Owner,
  projectId: string | null,
  said: string,
  replied: string,
): Promise<TurnActions> {
  const actions: TurnActions = { remembered: 0, forgot: 0, taskId: null, handoffId: null };
  const known = await listMemories(user.id);
  const answer = await complete([
    {
      role: "system",
      content:
        "Job: extract\n" +
        "Read the person's latest message and the reply. Answer with one JSON object only:\n" +
        '{"memories": [short durable facts about the person worth remembering, written in third person, only new ones],\n' +
        ' "forget": [ids of remembered facts the person asked to forget],\n' +
        ' "task": null or {"instruction": what to do, "schedule": "once"|"daily"|"weekly", "date": "YYYY-MM-DD" for once, "time": "HH:MM" 24h, "weekday": 0-6 (0 Sunday) for weekly, "timeZone": IANA zone} when the person asked to schedule something,\n' +
        ' "handoff": null or {"goal": what to do on the web} when the person asked to browse or act on a website}\n\n' +
        `Remembered facts:\n${known.map((m) => `[${m.id}] ${m.content}`).join("\n") || "(none)"}`,
    },
    { role: "user", content: `Person: ${said}\n\nReply: ${replied}` },
  ]);
  const parsed = parseJsonObject(answer);
  if (!parsed) return actions;

  const forget = Array.isArray(parsed.forget)
    ? parsed.forget.filter((id): id is string => typeof id === "string" && known.some((m) => m.id === id))
    : [];
  if (forget.length) {
    await deleteMemories(user.id, forget);
    actions.forgot = forget.length;
  }
  const facts = Array.isArray(parsed.memories)
    ? parsed.memories.map((m) => str(m, 300)).filter((m): m is string => !!m).slice(0, 5)
    : [];
  if (facts.length) actions.remembered = await addMemories(user.id, facts, "chat");

  const task = parsed.task as Record<string, unknown> | null | undefined;
  if (task && typeof task === "object") {
    const schedule = ["once", "daily", "weekly"].includes(String(task.schedule)) ? (task.schedule as "once" | "daily" | "weekly") : null;
    const instruction = str(task.instruction);
    const time = str(task.time, 5);
    const zone = str(task.timeZone, 64) ?? "UTC";
    if (schedule && instruction && time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      const saved = await createTask(user, {
        instruction,
        schedule,
        date: str(task.date, 10),
        time,
        weekday: typeof task.weekday === "number" ? task.weekday : null,
        timeZone: isTimeZone(zone) ? zone : "UTC",
        projectId,
      });
      if (saved.ok) actions.taskId = saved.id;
    }
  }
  const handoff = parsed.handoff as Record<string, unknown> | null | undefined;
  const goal = handoff && typeof handoff === "object" ? str(handoff.goal, 1000) : null;
  if (goal) actions.handoffId = await createHandoff(user, { goal, projectId });
  return actions;
}

const CARD_THROTTLE_MS = 5 * 60 * 1000;

/** Fresh action cards from recent conversation, memories and upcoming tasks. */
export async function generateCards(user: Owner): Promise<void> {
  const [history, memories, upcoming, closed] = await Promise.all([
    recentMessages(user.id, null, 30),
    memoryBlock(user.id),
    upcomingTasks(user.id),
    closedTitles(user.id),
  ]);
  const answer = await complete([
    {
      role: "system",
      content:
        "Job: cards\n" +
        "Suggest up to 5 concrete next actions the assistant could take for this person. Answer with one JSON object only:\n" +
        '{"cards": [{"title": short, "reason": one short sentence, "actionLabel": 1-3 words, "instruction": the message to send the assistant, "priority": 1 low, 2 medium or 3 high}]}\n' +
        `Don't repeat these: ${closed.join("; ") || "(none)"}`,
    },
    {
      role: "user",
      content:
        `Memories:\n${memories}\n\nUpcoming tasks:\n${upcoming.map((t) => `- ${t.instruction} (${t.label})`).join("\n") || "(none)"}\n\n` +
        `Recent conversation:\n${history.map((m) => `${m.role}: ${m.content.slice(0, 500)}`).join("\n") || "(none)"}`,
    },
  ]);
  const parsed = parseJsonObject(answer);
  const list = Array.isArray(parsed?.cards) ? parsed.cards : [];
  const fresh: NewCard[] = [];
  for (const raw of list.slice(0, 5)) {
    if (!raw || typeof raw !== "object") continue;
    const card = raw as Record<string, unknown>;
    const title = str(card.title, 120);
    const instruction = str(card.instruction);
    if (!title || !instruction) continue;
    const priority = Math.min(3, Math.max(1, Math.round(Number(card.priority) || 2)));
    fresh.push({
      title,
      reason: str(card.reason, 300) ?? "",
      actionLabel: str(card.actionLabel, 40) ?? "Do it",
      instruction,
      priority,
    });
  }
  await replaceCards(user.id, fresh);
}

/** After a chat turn: new cards unless they were made in the last few minutes. */
export async function maybeGenerateCards(user: Owner): Promise<void> {
  const last = await lastGeneratedAt(user.id);
  if (last && Date.now() - last < CARD_THROTTLE_MS) return;
  try {
    await generateCards(user);
  } catch (error) {
    if (!(error instanceof ModelError)) throw error;
  }
}
