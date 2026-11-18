import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ChatThread } from "@/client/components/ChatThread";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { ProjectDialog } from "@/client/components/ProjectDialog";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { formatBytes } from "@/client/lib/format";
import { deleteProject, getProjectPage, updateProject } from "@/serverFunctions/app";

export const Route = createFileRoute("/projects/$projectId")({
  loader: ({ params }) => getProjectPage({ data: { id: params.projectId } }),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.project.name }] : [] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { project, messages, files } = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/projects/${project.id}/files`, { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? `${file.name} couldn't be uploaded.`);
      }
    }
    if (input.current) input.current.value = "";
    setUploading(false);
    await router.invalidate();
  }

  async function removeFile(id: string) {
    const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (!response.ok) toast.error("The file couldn't be deleted.");
    await router.invalidate();
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        backLink={
          <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            ‹ Projects
          </Link>
        }
        title={project.name}
        description={project.description || undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="outline" size="sm" aria-label="Delete project" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
            </Button>
          </>
        }
      />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Files</h2>
          <Button variant="outline" size="sm" pending={uploading} onClick={() => input.current?.click()}>
            <Upload aria-hidden />
            Upload
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            data-testid="file-input"
            onChange={(event) => void upload(event.target.files)}
          />
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Text files (.txt, .md, .csv, .json) up to 100 KB are read into this project's replies.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {files.map((file) => (
              <li key={file.id} data-testid="file-row" className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a href={`/api/files/${file.id}`} className="truncate hover:underline" download={file.name}>
                    {file.name}
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  {file.inContext ? <Badge variant="secondary">Read by the assistant</Badge> : null}
                </div>
                <Button variant="ghost" size="icon" aria-label="Delete file" onClick={() => void removeFile(file.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ChatThread
        key={project.id}
        projectId={project.id}
        messages={messages}
        emptyText="No messages yet. Ask about this project."
      />
      {editing ? (
        <ProjectDialog
          title="Edit project"
          submitLabel="Save"
          initial={{ name: project.name, description: project.description }}
          onClose={() => setEditing(false)}
          onSave={async (value) => {
            await updateProject({ data: { id: project.id, ...value } });
            await router.invalidate();
            setEditing(false);
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${project.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            setPending(true);
            await deleteProject({ data: { id: project.id } });
            await router.navigate({ to: "/projects" });
          }}
        >
          Its conversation and files are deleted.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
