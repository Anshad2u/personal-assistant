import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { cancelHandoff } from "@/server/handoffs";

// Stops a handoff the caller owns.
export const Route = createFileRoute("/api/handoffs/$handoffId/cancel")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { handoffId: string } }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        if (!/^[0-9a-f-]{36}$/.test(params.handoffId) || !(await cancelHandoff(user.id, params.handoffId)))
          return new Response("Not found", { status: 404 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
