import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, formatDate } from "@/client/lib/format";
import { addMemory, deleteAllMemories, deleteMemory, getMemories, updateMemory } from "@/serverFunctions/app";

export const Route = createFileRoute("/memory")({
  loader: () => getMemories(),
  head: () => ({ meta: [{ title: "Memory" }] }),
  component: MemoryPage,
});

function MemoryPage() {
  const memories = Route.useLoaderData();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function change(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setAdding(true);
    await change(() => addMemory({ data: { content: draft } }));
    setDraft("");
    setAdding(false);
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Memory"
        description="The assistant uses these in every reply."
        actions={
          memories.length ? (
            <Button variant="outline" size="sm" onClick={() => setClearing(true)}>
              Delete all
            </Button>
          ) : null
        }
      />
      <form onSubmit={add} className="flex gap-2">
        <Input
          data-testid="memory-new"
          aria-label="New memory"
          placeholder="Something to remember, like “Vegetarian”"
          value={draft}
          maxLength={500}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" pending={adding} disabled={!draft.trim()}>
          Add
        </Button>
      </form>
      {memories.length === 0 ? (
        <EmptyState title="No memories yet" description="Chat with the assistant, or add one above." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {memories.map((memory) => (
            <li key={memory.id} data-testid="memory-item" className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm">{memory.content}</p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{memory.source === "chat" ? "From chat" : "Added by you"}</Badge>
                  {formatDate(memory.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit memory"
                  onClick={() => setEditing({ id: memory.id, content: memory.content })}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete memory"
                  onClick={() => void change(() => deleteMemory({ data: { id: memory.id } }))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editing?.content.trim()) return;
              setSaving(true);
              await change(() => updateMemory({ data: editing }));
              setSaving(false);
              setEditing(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit memory</DialogTitle>
            </DialogHeader>
            <Textarea
              data-testid="memory-edit-input"
              aria-label="Memory"
              value={editing?.content ?? ""}
              maxLength={500}
              onChange={(event) => setEditing((current) => current && { ...current, content: event.target.value })}
            />
            <DialogFooter>
              <Button type="submit" pending={saving}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {clearing ? (
        <ConfirmDialog
          title="Delete every memory?"
          confirmLabel="Delete all"
          destructive
          onClose={() => setClearing(false)}
          onConfirm={async () => {
            await change(() => deleteAllMemories());
            setClearing(false);
          }}
        >
          The assistant forgets everything it learned about you.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
