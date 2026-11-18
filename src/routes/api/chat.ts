import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env, waitUntil } from "cloudflare:workers";
import { startTurn, turnInput } from "@/server/chatTurn";
import { ensureUser } from "@/server/users";

// One chat turn: the reply streams back as newline-delimited JSON events.
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const parsed = turnInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
        await ensureUser(user);
        const turn = await startTurn(user, parsed.data);
        if (!turn.ok) return Response.json({ error: turn.error }, { status: turn.status });

        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        let open = true;
        const emit = async (event: object) => {
          if (!open) return;
          try {
            await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            open = false; // The page went away; the turn still finishes.
          }
        };
        // The turn finishes even if the person leaves the page.
        const work = turn
          .run(emit)
          .catch(async (error: unknown) => {
            console.error(error);
            await emit({ type: "error", message: "The reply failed." });
          })
          .finally(async () => {
            await emit({ type: "done" });
            if (open) await writer.close().catch(() => undefined);
          });
        waitUntil(work);
        return new Response(readable, {
          headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
        });
      },
    },
  },
});
