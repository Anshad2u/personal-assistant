import { complete, ModelError, parseJsonObject } from "@/server/ai";
import {
  addStep,
  enqueueStep,
  FINAL,
  getHandoff,
  handoffForRunner,
  listSteps,
  setStatus,
  updateStep,
} from "@/server/handoffs";
import { dueTasks, recordRun } from "@/server/tasks";
import { recentMessages, addMessage } from "@/server/threads";
import { listMemories } from "@/server/memories";
import { getProject } from "@/server/projects";
import { openPage, safeWebUrl } from "@/server/web";

const MAX_STEPS = 12;

async function report(handoff: { userId: string; projectId: string | null; goal: string }, text: string) {
  const projectId = handoff.projectId && (await getProject(handoff.userId, handoff.projectId)) ? handoff.projectId : null;
  await addMessage(handoff.userId, projectId, {
    role: "assistant",
    content: `**Web handoff:** ${handoff.goal}\n\n${text}`,
    source: "handoff",
  });
}

async function fail(handoff: { id: string; userId: string; projectId: string | null; goal: string }, why: string) {
  if (await setStatus(handoff.id, "failed", why, ["queued", "running"])) await report(handoff, `Stopped: ${why}`);
}

/** One step of a handoff: ask the model what to do next, then do it or wait for approval. */
export async function runHandoffStep(id: string): Promise<void> {
  const handoff = await handoffForRunner(id);
  if (!handoff || !["queued", "running"].includes(handoff.status)) return;
  await setStatus(id, "running", undefined, ["queued", "running"]);
  const steps = await listSteps(id);
  if (steps.length >= MAX_STEPS) return fail(handoff, "it reached the step limit without finishing.");

  const history = steps
    .map((s, i) => {
      const fields = s.fields ? ` fields ${s.fields}` : "";
      const snap = i === steps.length - 1 && s.snapshot ? `\n${s.snapshot}` : "";
      return `${i + 1}. ${s.action} ${s.url}${fields} [${s.status}] ${s.note}${snap}`;
    })
    .join("\n");
  let answer: string;
  try {
    answer = await complete(
      [
        {
          role: "system",
          content:
            "Job: handoff-step\n" +
            "You browse the web for a person, one step at a time, to reach their goal. Answer with one JSON object only, one of:\n" +
            '{"action": "visit", "url": absolute http(s) URL, "note": why}\n' +
            '{"action": "submit", "url": form action URL, "method": "GET"|"POST", "fields": {name: value}, "note": what this does} to fill in and send a form (the person approves it first)\n' +
            '{"action": "finish", "summary": what you found or did, in Markdown}\n' +
            "Never enter passwords or payment details. Finish when the goal is met or cannot be met.",
        },
        {
          role: "user",
          content: `Goal: ${handoff.goal}\nSteps so far: ${steps.length}\n${history}`,
        },
      ],
      { background: handoff.orgId },
    );
  } catch (error) {
    if (error instanceof ModelError) return fail(handoff, error.setup ?? error.message);
    throw error;
  }
  // The person may have cancelled while the model was thinking.
  const current = await handoffForRunner(id);
  if (!current || current.status !== "running") return;

  const step = parseJsonObject(answer) ?? {};
  const position = steps.length;
  const note = typeof step.note === "string" ? step.note.slice(0, 500) : "";
  if (step.action === "finish") {
    const summary = typeof step.summary === "string" && step.summary.trim() ? step.summary.trim() : "Finished.";
    if (await setStatus(id, "done", summary, ["running"])) await report(handoff, summary);
    return;
  }
  const url = typeof step.url === "string" ? safeWebUrl(step.url) : null;
  if (!url || (step.action !== "visit" && step.action !== "submit"))
    return fail(handoff, "the assistant gave a step it couldn't take.");
  if (step.action === "submit") {
    const raw = step.fields && typeof step.fields === "object" ? (step.fields as Record<string, unknown>) : {};
    const fields = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.slice(0, 100), String(v).slice(0, 1000)]));
    const method = String(step.method ?? "POST").toUpperCase() === "GET" ? "GET" : "POST";
    await addStep(handoff, {
      position,
      action: "submit",
      url: url.toString(),
      note: note || "Send a form",
      fields: JSON.stringify({ method, fields }),
      status: "needs_approval",
    });
    await setStatus(id, "needs_approval", undefined, ["running"]);
    return;
  }
  const page = await openPage(url);
  await addStep(handoff, {
    position,
    action: "visit",
    url: page.ok ? page.url : url.toString(),
    note: page.ok ? note : `${note} ${page.error}`.trim(),
    snapshot: page.ok ? page.snapshot : null,
    status: page.ok ? "done" : "failed",
  });
  await enqueueStep(id);
}

/** The person approves or rejects the step waiting on them. */
export async function decideStep(userId: string, id: string, approve: boolean): Promise<boolean> {
  const handoff = await getHandoff(userId, id);
  if (!handoff || handoff.status !== "needs_approval") return false;
  const waiting = handoff.steps.find((s) => s.status === "needs_approval");
  if (!waiting) return false;
  // Claim the decision first so two clicks can't send the form twice.
  if (!(await setStatus(id, "running", undefined, ["needs_approval"]))) return false;
  if (approve) {
    const url = safeWebUrl(waiting.url);
    const form = waiting.fields ? (JSON.parse(waiting.fields) as { method: string; fields: Record<string, string> }) : null;
    const page = url ? await openPage(url, { method: form?.method, fields: form?.fields }) : { ok: false as const, error: "Not a web address." };
    await updateStep(waiting.id, page.ok
      ? { status: "approved", snapshot: page.snapshot }
      : { status: "approved", note: `${waiting.note} ${page.error}` });
  } else {
    await updateStep(waiting.id, { status: "rejected" });
  }
  await enqueueStep(id);
  return true;
}

/** The minute cron: run every scheduled task that is due. */
export async function runDueTasks(now: number): Promise<void> {
  for (const task of await dueTasks(now)) {
    const projectId = task.projectId && (await getProject(task.userId, task.projectId)) ? task.projectId : null;
    let ok = true;
    let text: string;
    try {
      const memories = await listMemories(task.userId);
      const history = await recentMessages(task.userId, projectId, 10);
      text = await complete(
        [
          {
            role: "system",
            content:
              "Job: task-run\nYou are a personal assistant carrying out a scheduled task for one person. Answer with the result, in Markdown.\n" +
              `What you remember about the person:\n${memories.map((m) => `- ${m.content}`).join("\n") || "(none)"}`,
          },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: `Scheduled task: ${task.instruction}` },
        ],
        { background: task.orgId },
      );
    } catch (error) {
      if (!(error instanceof ModelError)) console.error(error);
      ok = false;
      text = error instanceof ModelError && error.setup ? error.setup : "The task couldn't run.";
    }
    await addMessage(task.userId, projectId, {
      role: "assistant",
      content: `**Scheduled task:** ${task.instruction}\n\n${text}`,
      status: ok ? "done" : "error",
      source: "task",
    });
    await recordRun({ ...task, label: "" }, ok, now);
  }
}

export { FINAL };
