import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { deleteFile, readFile } from "@/server/files";

// Download or delete a project file the caller owns; anyone else gets a 404.
export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { fileId: string } }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const found = await readFile(user.id, params.fileId);
        if (!found) return new Response("Not found", { status: 404 });
        return new Response(found.body, {
          headers: {
            "content-type": found.file.contentType,
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(found.file.name)}`,
            "x-content-type-options": "nosniff",
            "cache-control": "private, no-store",
          },
        });
      },
      DELETE: async ({ request, params }: { request: Request; params: { fileId: string } }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        if (!(await deleteFile(user.id, params.fileId))) return new Response("Not found", { status: 404 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
