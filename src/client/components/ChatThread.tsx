import { useRouter } from "@tanstack/react-router";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Markdown } from "@/client/components/Markdown";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";
import { formatDateTime } from "@/client/lib/format";

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "done" | "pending" | "error";
  source: string | null;
  createdAt: number;
};

type TurnRequest = { content?: string; retryId?: string; cardId?: string };

/** A conversation with the assistant: the main chat or one project's. */
export function ChatThread({
  projectId,
  messages: initial,
  emptyText,
  cardId,
}: {
  projectId: string | null;
  messages: ThreadMessage[];
  emptyText: string;
  cardId?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentCard = useRef<string | null>(null);

  useEffect(() => {
    if (!busy) setMessages(initial);
  }, [initial]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (cardId && sentCard.current !== cardId) {
      sentCard.current = cardId;
      void run({ cardId }, null);
      void router.navigate({ to: "/chat", search: {}, replace: true });
    }
  }, [cardId]);

  async function run(request: TurnRequest, shownText: string | null) {
    setBusy(true);
    setSetup(null);
    const tempUser = `local-user-${Date.now()}`;
    const tempAssistant = `local-assistant-${Date.now()}`;
    const now = Date.now();
    setMessages((list) => [
      ...list.filter((m) => m.id !== request.retryId),
      ...(shownText !== null
        ? [{ id: tempUser, role: "user" as const, content: shownText, status: "done" as const, source: null, createdAt: now }]
        : []),
      { id: tempAssistant, role: "assistant" as const, content: "", status: "pending" as const, source: null, createdAt: now },
    ]);
    let assistantId = tempAssistant;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, ...request }),
      });
      if (!response.ok || !response.body) throw new Error("The message couldn't be sent.");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "start"; userMessageId: string | null; assistantMessageId: string }
            | { type: "delta"; text: string }
            | { type: "setup"; message: string }
            | { type: "error"; message: string }
            | { type: "actions"; remembered: number; forgot: number; taskId: string | null; handoffId: string | null }
            | { type: "done" };
          if (event.type === "start") {
            const previous = assistantId;
            assistantId = event.assistantMessageId;
            const userId = event.userMessageId;
            setMessages((list) =>
              list.map((m) =>
                m.id === previous ? { ...m, id: event.assistantMessageId } : userId && m.id === tempUser ? { ...m, id: userId } : m,
              ),
            );
          } else if (event.type === "delta") {
            setMessages((list) => list.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.text } : m)));
          } else if (event.type === "setup") {
            setSetup(event.message);
            setMessages((list) => list.filter((m) => m.id !== tempUser && m.id !== tempAssistant));
            if (shownText) setDraft(shownText);
          } else if (event.type === "error") {
            setMessages((list) => list.map((m) => (m.id === assistantId ? { ...m, content: event.message, status: "error" } : m)));
          } else if (event.type === "actions") {
            if (event.remembered) toast(event.remembered === 1 ? "Remembered 1 thing" : `Remembered ${event.remembered} things`);
            if (event.forgot) toast(event.forgot === 1 ? "Forgot 1 memory" : `Forgot ${event.forgot} memories`);
            if (event.taskId) toast("Scheduled a task", { action: { label: "View", onClick: () => void router.navigate({ to: "/tasks" }) } });
            if (event.handoffId) {
              const id = event.handoffId;
              toast("Started a web handoff", {
                action: { label: "Watch", onClick: () => void router.navigate({ to: "/handoffs/$handoffId", params: { handoffId: id } }) },
              });
            }
          }
        }
      }
      setMessages((list) =>
        list.map((m) => (m.id === assistantId && m.status === "pending" ? { ...m, status: m.content ? "done" : "error", content: m.content || "The reply failed." } : m)),
      );
    } catch (cause) {
      setMessages((list) =>
        list.map((m) => (m.id === assistantId ? { ...m, status: "error", content: cause instanceof Error ? cause.message : "The reply failed." } : m)),
      );
    } finally {
      setBusy(false);
      void router.invalidate();
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void run({ content: text }, text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="space-y-6" data-testid="thread" data-busy={busy ? "true" : "false"}>
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="space-y-4">
          {messages.map((message) => (
            <li
              key={message.id}
              data-testid="message"
              data-role={message.role}
              data-status={message.status}
              className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  message.role === "user"
                    ? "max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground"
                    : "w-full max-w-[95%] space-y-2 text-sm"
                }
              >
                {message.role === "user" ? (
                  message.content
                ) : message.status === "error" ? (
                  <Alert variant="destructive">
                    <AlertTitle>No reply</AlertTitle>
                    <AlertDescription>
                      <p>{message.content}</p>
                      {message.source === null ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          data-testid="retry-reply"
                          disabled={busy}
                          onClick={() => void run({ retryId: message.id }, null)}
                        >
                          <RotateCcw aria-hidden />
                          Try again
                        </Button>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ) : message.status === "pending" && !message.content ? (
                  <Spinner aria-label="Writing" />
                ) : (
                  <>
                    <Markdown>{message.content}</Markdown>
                    <p className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />
      {setup ? (
        <Alert data-testid="ai-setup">
          <AlertTitle>The assistant isn't set up yet</AlertTitle>
          <AlertDescription>{setup}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={submit} className="sticky bottom-0 flex items-end gap-2 bg-background pt-2 pb-4">
        <Textarea
          data-testid="composer-input"
          aria-label="Message"
          placeholder="Message the assistant"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          className="min-h-11 resize-none"
        />
        <Button type="submit" data-testid="composer-send" aria-label="Send" disabled={busy || !draft.trim()}>
          {busy ? <Spinner /> : <SendHorizontal aria-hidden />}
        </Button>
      </form>
    </div>
  );
}
