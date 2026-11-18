import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { HandoffStatusBadge } from "@/client/components/HandoffStatusBadge";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, formatDateTime } from "@/client/lib/format";
import { getHandoffs, startHandoff } from "@/serverFunctions/app";

export const Route = createFileRoute("/handoffs/")({
  loader: () => getHandoffs(),
  head: () => ({ meta: [{ title: "Handoffs" }] }),
  component: HandoffsPage,
});

function HandoffsPage() {
  const { handoffs } = Route.useLoaderData();
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [pending, setPending] = useState(false);
  const [setup, setSetup] = useState<string | null>(null);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!goal.trim()) return;
    setPending(true);
    setSetup(null);
    try {
      const result = await startHandoff({ data: { goal, projectId: null } });
      if (!result.ok) setSetup(result.setup);
      else await router.navigate({ to: "/handoffs/$handoffId", params: { handoffId: result.id } });
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
    setPending(false);
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Handoffs" description="The assistant browses the web for you and asks before sending any form." />
      <form onSubmit={start} className="space-y-3">
        <Textarea
          data-testid="handoff-goal"
          aria-label="Goal"
          placeholder="Find the opening hours of the nearest public library"
          value={goal}
          maxLength={1000}
          onChange={(event) => setGoal(event.target.value)}
        />
        <Button type="submit" pending={pending} disabled={!goal.trim()}>
          Start
        </Button>
      </form>
      {setup ? (
        <Alert data-testid="ai-setup">
          <AlertTitle>The assistant isn't set up yet</AlertTitle>
          <AlertDescription>{setup}</AlertDescription>
        </Alert>
      ) : null}
      {handoffs.length === 0 ? (
        <EmptyState icon={Globe} title="No handoffs yet" description="Start one above, or ask in chat." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {handoffs.map((handoff) => (
            <li key={handoff.id} data-testid="handoff-row">
              <Link
                to="/handoffs/$handoffId"
                params={{ handoffId: handoff.id }}
                className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{handoff.goal}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(handoff.createdAt)}</p>
                </div>
                <HandoffStatusBadge status={handoff.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
