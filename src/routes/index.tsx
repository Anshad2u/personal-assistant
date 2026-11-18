import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { errorMessage, formatDateTime } from "@/client/lib/format";
import { dismissCard, getHome, refreshCards } from "@/serverFunctions/app";

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  head: () => ({ meta: [{ title: "Home" }] }),
  component: Home,
});

const PRIORITY = { 3: "High", 2: "Medium", 1: "Low" } as Record<number, string>;

function Home() {
  const { cards, upcoming } = Route.useLoaderData();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [setup, setSetup] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setSetup(null);
    try {
      const result = await refreshCards();
      if (!result.ok) {
        if (result.setup) setSetup(result.setup);
        else toast.error(result.error);
      }
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
    setRefreshing(false);
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Home"
        description="Suggested next steps from your chats, memories and tasks."
        actions={
          <Button variant="outline" pending={refreshing} onClick={() => void refresh()}>
            {refreshing ? null : <RefreshCw aria-hidden />}
            Refresh
          </Button>
        }
      />
      {setup ? (
        <Alert data-testid="ai-setup">
          <AlertTitle>The assistant isn't set up yet</AlertTitle>
          <AlertDescription>{setup}</AlertDescription>
        </Alert>
      ) : null}
      {cards.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No suggestions right now"
          description="Chat with the assistant, then refresh."
          action={<Button render={<Link to="/chat" />}>Open chat</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li
              key={card.id}
              data-testid="action-card"
              className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{card.title}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mt-1 -mr-2 size-7 shrink-0"
                    aria-label="Dismiss"
                    onClick={async () => {
                      await dismissCard({ data: { id: card.id } });
                      await router.invalidate();
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{card.reason}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={card.priority === 3 ? "default" : "secondary"}>{PRIORITY[card.priority]}</Badge>
                <Button size="sm" onClick={() => void router.navigate({ to: "/chat", search: { card: card.id } })}>
                  {card.actionLabel}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {upcoming.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Coming up</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {upcoming.map((task) => (
              <li key={task.id} className="flex justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate">{task.instruction}</span>
                <span className="shrink-0 text-muted-foreground">{formatDateTime(task.nextRunAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
