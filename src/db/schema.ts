import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Every table carries the Gateway's user id (`user_id`); every query filters by it.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  orgId: text("org_id").notNull(),
  // When the action cards were last generated (ms).
  cardsAt: integer("cards_at"),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    lastActivityAt: integer("last_activity_at").notNull(),
  },
  (t) => [index("projects_user").on(t.userId, t.lastActivityAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    // Null for the main thread.
    projectId: text("project_id"),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    status: text("status", { enum: ["done", "pending", "error"] })
      .notNull()
      .default("done"),
    // What posted it when not a chat turn: "task" or "handoff".
    source: text("source"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("messages_thread").on(t.userId, t.projectId, t.createdAt)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("files_project").on(t.userId, t.projectId)],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    content: text("content").notNull(),
    source: text("source", { enum: ["chat", "manual"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("memories_user").on(t.userId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
    projectId: text("project_id"),
    instruction: text("instruction").notNull(),
    schedule: text("schedule", { enum: ["once", "daily", "weekly"] }).notNull(),
    // "YYYY-MM-DD" for one-time tasks.
    date: text("date"),
    // "HH:MM" in the task's time zone.
    time: text("time").notNull(),
    // 0 (Sunday) to 6, for weekly tasks.
    weekday: integer("weekday"),
    timeZone: text("time_zone").notNull(),
    status: text("status", { enum: ["active", "paused", "completed"] })
      .notNull()
      .default("active"),
    nextRunAt: integer("next_run_at"),
    lastRunAt: integer("last_run_at"),
    lastRunStatus: text("last_run_status", { enum: ["ok", "error"] }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("tasks_user").on(t.userId),
    index("tasks_due").on(t.status, t.nextRunAt),
  ],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    actionLabel: text("action_label").notNull(),
    instruction: text("instruction").notNull(),
    // 1 (low) to 3 (high).
    priority: integer("priority").notNull(),
    status: text("status", { enum: ["open", "done", "dismissed"] })
      .notNull()
      .default("open"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("cards_user").on(t.userId, t.status)],
);

export const handoffs = sqliteTable(
  "handoffs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
    projectId: text("project_id"),
    goal: text("goal").notNull(),
    status: text("status", {
      enum: ["queued", "running", "needs_approval", "done", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    summary: text("summary"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("handoffs_user").on(t.userId, t.createdAt)],
);

export const handoffSteps = sqliteTable(
  "handoff_steps",
  {
    id: text("id").primaryKey(),
    handoffId: text("handoff_id").notNull(),
    userId: text("user_id").notNull(),
    position: integer("position").notNull(),
    action: text("action", { enum: ["visit", "submit"] }).notNull(),
    url: text("url").notNull(),
    note: text("note").notNull(),
    // JSON form fields for a submit step.
    fields: text("fields"),
    snapshot: text("snapshot"),
    status: text("status", {
      enum: ["done", "failed", "needs_approval", "approved", "rejected"],
    }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("steps_handoff").on(t.handoffId, t.position)],
);
