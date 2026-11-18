import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CalendarClock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { browserTimeZone, TaskDialog, type TaskForm } from "@/client/components/TaskDialog";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { errorMessage, formatDateTime } from "@/client/lib/format";
import { createTask, deleteTask, getTasks, pauseTask, updateTask } from "@/serverFunctions/app";

export const Route = createFileRoute("/tasks")({
  loader: () => getTasks(),
  head: () => ({ meta: [{ title: "Tasks" }] }),
  component: TasksPage,
});

const STATUS = { active: "Active", paused: "Paused", completed: "Completed" } as const;

function TasksPage() {
  const { tasks, projects } = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; form: TaskForm } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function change(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Tasks"
        description="The assistant runs these on schedule and posts the results to your chat."
        actions={
          <Button
            onClick={() =>
              setEditing({
                id: null,
                form: { instruction: "", schedule: "daily", date: null, time: "08:00", weekday: 1, timeZone: browserTimeZone(), projectId: null },
              })
            }
          >
            <Plus aria-hidden />
            New task
          </Button>
        }
      />
      {tasks.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No tasks yet"
          description="Create one here, or ask in chat, like “every morning at 8, give me the weather”."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {tasks.map((task) => (
            <li key={task.id} data-testid="task-row" className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{task.instruction}</p>
                <Badge variant={task.status === "active" ? "default" : "secondary"}>{STATUS[task.status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {task.label} ({task.timeZone})
                {task.projectId && projectName(task.projectId) ? ` · ${projectName(task.projectId)}` : ""}
                {task.status === "active" && task.nextRunAt ? ` · Next ${formatDateTime(task.nextRunAt)}` : ""}
                {task.lastRunAt
                  ? ` · Last ran ${formatDateTime(task.lastRunAt)}: ${task.lastRunStatus === "ok" ? "Succeeded" : "Failed"}`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {task.status !== "completed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void change(() => pauseTask({ data: { id: task.id, paused: task.status === "active" } }))}
                  >
                    {task.status === "active" ? "Pause" : "Resume"}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditing({
                      id: task.id,
                      form: {
                        instruction: task.instruction,
                        schedule: task.schedule,
                        date: task.date,
                        time: task.time,
                        weekday: task.weekday,
                        timeZone: task.timeZone,
                        projectId: task.projectId,
                      },
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(task.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <TaskDialog
          title={editing.id ? "Edit task" : "New task"}
          initial={editing.form}
          projects={projects}
          onClose={() => setEditing(null)}
          onSave={async (form) => {
            const result = editing.id
              ? await updateTask({ data: { id: editing.id, task: form } })
              : await createTask({ data: form });
            if (!result.ok) return result.error;
            setEditing(null);
            await router.invalidate();
            return null;
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this task?"
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await change(() => deleteTask({ data: { id: deleting } }));
            setDeleting(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}
