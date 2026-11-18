import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { ProjectDialog } from "@/client/components/ProjectDialog";
import { Button } from "@/client/components/ui/button";
import { formatDateTime } from "@/client/lib/format";
import { createProject, getProjects } from "@/serverFunctions/app";

export const Route = createFileRoute("/projects/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "Projects" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = Route.useLoaderData();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Projects"
        description="A separate conversation and files for each topic."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New project
          </Button>
        }
      />
      {projects.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No projects yet" description="Create one and it will appear here." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {projects.map((project) => (
            <li key={project.id} data-testid="project-row">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="block space-y-1 px-4 py-3 transition-colors hover:bg-muted"
              >
                <p className="font-medium">{project.name}</p>
                {project.description ? (
                  <p className="line-clamp-1 text-sm text-muted-foreground">{project.description}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">Active {formatDateTime(project.lastActivityAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <ProjectDialog
          title="New project"
          submitLabel="Create"
          initial={{ name: "", description: "" }}
          onClose={() => setCreating(false)}
          onSave={async (value) => {
            const project = await createProject({ data: value });
            await router.navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
          }}
        />
      ) : null}
    </AppShell>
  );
}
