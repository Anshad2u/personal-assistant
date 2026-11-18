import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { HandoffStatusBadge } from "@/client/components/HandoffStatusBadge";
import { Markdown } from "@/client/components/Markdown";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { errorMessage } from "@/client/lib/format";
import { cancelHandoff, decideHandoffStep, getHandoff } from "@/serverFunctions/app";

export const Route = createFileRoute("/handoffs/$handoffId")({
  loader: ({ params }) => getHandoff({ data: { id: params.handoffId } }),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.goal }] : [] }),
  component: HandoffPage,
});

const STEP_STATUS = {
  done: "Done",
  failed: "Failed",
  needs_approval: "Waiting for you",
  approved: "Approved",
  rejected: "Rejected",
} as const;

function HandoffPage() {
  const handoff = Route.useLoaderData();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const live = handoff.status === "queued" || handoff.status === "running";

  // Shown live: read again every two seconds while it works.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void router.invalidate(), 2000);
    return () => clearInterval(timer);
  }, [live, router]);

  async function act(name: string, work: () => Promise<unknown>) {
    setPending(name);
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
    setPending(null);
  }

  const finished = ["done", "failed", "cancelled"].includes(handoff.status);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        backLink={
          <Link to="/handoffs" className="text-sm text-muted-foreground hover:text-foreground">
            ‹ Handoffs
          </Link>
        }
        title={handoff.goal}
        description={<HandoffStatusBadge status={handoff.status} testId="handoff-status" />}
        actions={
          finished ? null : (
            <Button
              variant="outline"
              size="sm"
              pending={pending === "cancel"}
              onClick={() => void act("cancel", () => cancelHandoff({ data: { id: handoff.id } }))}
            >
              Cancel handoff
            </Button>
          )
        }
      />
      {handoff.summary ? (
        <Alert variant={handoff.status === "failed" ? "destructive" : "default"}>
          <AlertTitle>{handoff.status === "failed" ? "Stopped" : "Result"}</AlertTitle>
          <AlertDescription>
            <Markdown>{handoff.summary}</Markdown>
          </AlertDescription>
        </Alert>
      ) : null}
      <ol className="space-y-3">
        {handoff.steps.map((step) => {
          const form = step.fields ? (JSON.parse(step.fields) as { method: string; fields: Record<string, string> }) : null;
          return (
            <li key={step.id} data-testid="handoff-step" className="space-y-2 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {step.position + 1}. {step.action === "visit" ? "Visit" : `Send form (${form?.method ?? "POST"})`}
                </p>
                <Badge variant={step.status === "needs_approval" ? "default" : step.status === "failed" ? "destructive" : "secondary"}>
                  {STEP_STATUS[step.status]}
                </Badge>
              </div>
              <p className="text-xs break-all text-muted-foreground">{step.url}</p>
              {step.note ? <p className="text-sm">{step.note}</p> : null}
              {form && Object.keys(form.fields).length ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  {Object.entries(form.fields).map(([name, value]) => (
                    <div key={name} className="contents">
                      <dt className="text-muted-foreground">{name}</dt>
                      <dd className="break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {step.snapshot ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Page snapshot</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">{step.snapshot}</pre>
                </details>
              ) : null}
              {step.status === "needs_approval" && handoff.status === "needs_approval" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    pending={pending === "approve"}
                    disabled={pending !== null}
                    onClick={() => void act("approve", () => decideHandoffStep({ data: { id: handoff.id, approve: true } }))}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    pending={pending === "reject"}
                    disabled={pending !== null}
                    onClick={() => void act("reject", () => decideHandoffStep({ data: { id: handoff.id, approve: false } }))}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {live ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Working…
        </p>
      ) : null}
    </AppShell>
  );
}
