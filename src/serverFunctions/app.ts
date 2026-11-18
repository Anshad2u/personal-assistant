import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { generateCards } from "@/server/assistant";
import { ModelError } from "@/server/ai";
import * as cards from "@/server/cards";
import * as files from "@/server/files";
import * as handoffs from "@/server/handoffs";
import * as memories from "@/server/memories";
import * as projects from "@/server/projects";
import { decideStep } from "@/server/runner";
import * as tasks from "@/server/tasks";
import * as threads from "@/server/threads";
import { ensureUser } from "@/server/users";

// Every server function runs behind ensureUserMiddleware: `context.user` is
// the member the Gateway signed in, and every query takes their id.
const member = createServerFn().middleware([ensureUserMiddleware]);
const memberPost = createServerFn({ method: "POST" }).middleware([ensureUserMiddleware]);

// Chat

export const getMainThread = member.handler(async ({ context }) => {
  await ensureUser(context.user);
  return { messages: await threads.listMessages(context.user.id, null) };
});

export const clearMainThread = memberPost.handler(({ context }) =>
  threads.clearMainThread(context.user.id),
);

// Projects

export const getProjects = member.handler(async ({ context }) => {
  await ensureUser(context.user);
  return projects.listProjects(context.user.id);
});

export const getProjectPage = member
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const project = await projects.getProject(context.user.id, data.id);
    if (!project) throw notFound();
    const [messages, fileList] = await Promise.all([
      threads.listMessages(context.user.id, data.id),
      files.listFiles(context.user.id, data.id),
    ]);
    return {
      project,
      messages,
      files: fileList.map((f) => ({ ...f, inContext: files.isTextFile(f.name) && f.size <= 100 * 1024 })),
    };
  });

export const createProject = memberPost
  .validator((data: unknown) => projects.projectInput.parse(data))
  .handler(async ({ data, context }) => {
    await ensureUser(context.user);
    return projects.createProject(context.user.id, data);
  });

export const updateProject = memberPost
  .validator((data: unknown) => projects.updateProjectInput.parse(data))
  .handler(async ({ data, context }) => {
    const project = await projects.updateProject(context.user.id, data);
    if (!project) throw notFound();
    return project;
  });

export const deleteProject = memberPost
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) => projects.deleteProject(context.user.id, data.id));

// Memory

export const getMemories = member.handler(async ({ context }) => {
  await ensureUser(context.user);
  return memories.listMemories(context.user.id);
});

export const addMemory = memberPost
  .validator((data: unknown) => memories.memoryInput.parse(data))
  .handler(({ data, context }) => memories.addMemories(context.user.id, [data.content], "manual"));

export const updateMemory = memberPost
  .validator((data: unknown) => memories.updateMemoryInput.parse(data))
  .handler(({ data, context }) => memories.updateMemory(context.user.id, data));

export const deleteMemory = memberPost
  .validator((data: unknown) => memories.memoryIdInput.parse(data))
  .handler(({ data, context }) => memories.deleteMemories(context.user.id, [data.id]));

export const deleteAllMemories = memberPost.handler(({ context }) =>
  memories.deleteAllMemories(context.user.id),
);

// Scheduled tasks

export const getTasks = member.handler(async ({ context }) => {
  await ensureUser(context.user);
  const [list, projectList] = await Promise.all([
    tasks.listTasks(context.user.id),
    projects.listProjects(context.user.id),
  ]);
  return { tasks: list, projects: projectList.map((p) => ({ id: p.id, name: p.name })) };
});

export const createTask = memberPost
  .validator((data: unknown) => tasks.taskInput.parse(data))
  .handler(async ({ data, context }) => {
    await ensureUser(context.user);
    return tasks.createTask(context.user, data);
  });

export const updateTask = memberPost
  .validator((data: unknown) => tasks.updateTaskInput.parse(data))
  .handler(({ data, context }) => tasks.updateTask(context.user.id, data.id, data.task));

export const pauseTask = memberPost
  .validator((data: unknown) => tasks.pauseTaskInput.parse(data))
  .handler(({ data, context }) => tasks.setPaused(context.user.id, data.id, data.paused));

export const deleteTask = memberPost
  .validator((data: unknown) => tasks.taskIdInput.parse(data))
  .handler(({ data, context }) => tasks.deleteTask(context.user.id, data.id));

// Home: action cards

export const getHome = member.handler(async ({ context }) => {
  await ensureUser(context.user);
  const [cardList, upcoming] = await Promise.all([
    cards.listOpenCards(context.user.id),
    tasks.upcomingTasks(context.user.id, 3),
  ]);
  return { cards: cardList, upcoming };
});

export const refreshCards = memberPost.handler(async ({ context }) => {
  await ensureUser(context.user);
  try {
    await generateCards(context.user);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ModelError) return { ok: false as const, setup: error.setup, error: error.message };
    throw error;
  }
});

export const dismissCard = memberPost
  .validator((data: unknown) => cards.cardIdInput.parse(data))
  .handler(({ data, context }) => cards.dismissCard(context.user.id, data.id));

// Web handoffs

export const getHandoffs = member.handler(async ({ context }) => {
  await ensureUser(context.user);
  const [list, projectList] = await Promise.all([
    handoffs.listHandoffs(context.user.id),
    projects.listProjects(context.user.id),
  ]);
  return { handoffs: list, projects: projectList.map((p) => ({ id: p.id, name: p.name })) };
});

export const getHandoff = member
  .validator((data: unknown) => handoffs.handoffIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const handoff = await handoffs.getHandoff(context.user.id, data.id);
    if (!handoff) throw notFound();
    return handoff;
  });

export const startHandoff = memberPost
  .validator((data: unknown) => handoffs.handoffInput.parse(data))
  .handler(async ({ data, context }) => {
    await ensureUser(context.user);
    // Handoffs need the model: check it answers before queueing one.
    try {
      const { complete } = await import("@/server/ai");
      await complete([{ role: "user", content: "Reply with OK." }]);
    } catch (error) {
      if (error instanceof ModelError && error.setup) return { ok: false as const, setup: error.setup };
      throw error;
    }
    const id = await handoffs.createHandoff(context.user, data);
    if (!id) throw notFound();
    return { ok: true as const, id };
  });

export const decideHandoffStep = memberPost
  .validator((data: unknown) => handoffs.decisionInput.parse(data))
  .handler(({ data, context }) => decideStep(context.user.id, data.id, data.approve));

export const cancelHandoff = memberPost
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(({ data, context }) => handoffs.cancelHandoff(context.user.id, data.id));
