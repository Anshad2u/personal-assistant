import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ChatThread } from "@/client/components/ChatThread";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { clearMainThread, getMainThread } from "@/serverFunctions/app";

export const Route = createFileRoute("/chat")({
  validateSearch: z.object({ card: z.string().uuid().optional() }),
  loader: () => getMainThread(),
  head: () => ({ meta: [{ title: "Chat" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { messages } = Route.useLoaderData();
  const { card } = Route.useSearch();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Chat"
        actions={
          messages.length ? (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Clear chat
            </Button>
          ) : null
        }
      />
      <ChatThread
        projectId={null}
        messages={messages}
        cardId={card}
        emptyText="No messages yet. Ask the assistant anything."
      />
      {confirming ? (
        <ConfirmDialog
          title="Clear the chat?"
          confirmLabel="Clear"
          destructive
          pending={pending}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            setPending(true);
            await clearMainThread();
            await router.invalidate();
            setPending(false);
            setConfirming(false);
          }}
        >
          Every message in this chat is deleted. Memories stay.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
