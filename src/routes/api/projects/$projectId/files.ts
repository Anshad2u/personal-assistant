import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { uploadFile } from "@/server/files";

// Uploads one file (multipart field "file") to a project the caller owns.
export const Route = createFileRoute("/api/projects/$projectId/files")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { projectId: string } }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) return Response.json({ error: "Choose a file." }, { status: 400 });
        const result = await uploadFile(user.id, params.projectId, file);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json(result.file, { status: 201 });
      },
    },
  },
});
