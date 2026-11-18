import { Link } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { AppNav } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";

export function NotFound() {
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Not found" />
      <div data-testid="not-found">
        <EmptyState
          kind="filtered"
          title="Nothing here"
          description="It was deleted, or it isn't yours."
          action={<Button render={<Link to="/" />}>Go home</Button>}
        />
      </div>
    </AppShell>
  );
}
