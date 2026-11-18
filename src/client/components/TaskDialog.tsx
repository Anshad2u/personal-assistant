import { useState, type FormEvent } from "react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/format";

export type TaskForm = {
  instruction: string;
  schedule: "once" | "daily" | "weekly";
  date: string | null;
  time: string;
  weekday: number | null;
  timeZone: string;
  projectId: string | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAIN = "main";

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function zones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

/** Create or edit a scheduled task. Render it only while open. */
export function TaskDialog({
  title,
  initial,
  projects,
  onSave,
  onClose,
}: {
  title: string;
  initial: TaskForm;
  projects: { id: string; name: string }[];
  onSave: (value: TaskForm) => Promise<string | null>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (change: Partial<TaskForm>) => setForm((current) => ({ ...current, ...change }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const problem = await onSave({
        ...form,
        date: form.schedule === "once" ? form.date : null,
        weekday: form.schedule === "weekly" ? (form.weekday ?? 1) : null,
      });
      if (problem) setError(problem);
    } catch (cause) {
      setError(errorMessage(cause));
    }
    setPending(false);
  }

  const projectItems = [{ value: MAIN, label: "Main chat" }, ...projects.map((p) => ({ value: p.id, label: p.name }))];

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-instruction">What to do</Label>
            <Textarea
              id="task-instruction"
              data-testid="task-instruction"
              placeholder="Summarize the week's news on electric cars"
              value={form.instruction}
              maxLength={2000}
              onChange={(e) => set({ instruction: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Repeats</Label>
            <SegmentedToggle
              showLabels
              value={form.schedule}
              onChange={(schedule) => set({ schedule })}
              items={[
                { value: "once", label: "Once", icon: null },
                { value: "daily", label: "Daily", icon: null },
                { value: "weekly", label: "Weekly", icon: null },
              ]}
            />
          </div>
          {form.schedule === "weekly" ? (
            <div className="space-y-2">
              <Label>Day</Label>
              <SegmentedToggle
                showLabels
                value={String(form.weekday ?? 1)}
                onChange={(day) => set({ weekday: Number(day) })}
                items={WEEKDAYS.map((label, index) => ({ value: String(index), label, icon: null }))}
              />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {form.schedule === "once" ? (
              <div className="space-y-2">
                <Label htmlFor="task-date">Date</Label>
                <Input
                  id="task-date"
                  data-testid="task-date"
                  type="date"
                  required
                  value={form.date ?? ""}
                  onChange={(e) => set({ date: e.target.value || null })}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="task-time">Time</Label>
              <Input
                id="task-time"
                data-testid="task-time"
                type="time"
                required
                value={form.time}
                onChange={(e) => set({ time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-timezone">Time zone</Label>
              <Input
                id="task-timezone"
                data-testid="task-timezone"
                list="time-zones"
                required
                value={form.timeZone}
                onChange={(e) => set({ timeZone: e.target.value })}
              />
              <datalist id="time-zones">
                {zones().map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Post results to</Label>
            <Select
              items={projectItems}
              value={form.projectId ?? MAIN}
              onValueChange={(value) => set({ projectId: !value || value === MAIN ? null : String(value) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" pending={pending} disabled={!form.instruction.trim()}>
              Save task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
