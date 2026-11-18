import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { files } from "@/db/schema";
import { fileKey, getProject } from "@/server/projects";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Text files up to this size are read into the project's replies.
const CONTEXT_FILE_BYTES = 100 * 1024;
const CONTEXT_TOTAL_CHARS = 40_000;
const TEXT_EXTENSIONS = ["txt", "md", "markdown", "csv", "json"];

export type StoredFile = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: number;
};

const shown = {
  id: files.id,
  name: files.name,
  contentType: files.contentType,
  size: files.size,
  createdAt: files.createdAt,
};

export function listFiles(userId: string, projectId: string): Promise<StoredFile[]> {
  return db
    .select(shown)
    .from(files)
    .where(and(eq(files.userId, userId), eq(files.projectId, projectId)))
    .orderBy(desc(files.createdAt));
}

export async function getFile(userId: string, id: string) {
  const [row] = await db
    .select(shown)
    .from(files)
    .where(and(eq(files.id, id), eq(files.userId, userId)));
  return row ?? null;
}

export type UploadResult =
  | { ok: true; file: StoredFile }
  | { ok: false; status: number; error: string };

export async function uploadFile(
  userId: string,
  projectId: string,
  upload: File,
): Promise<UploadResult> {
  if (!(await getProject(userId, projectId)))
    return { ok: false, status: 404, error: "Not found" };
  if (upload.size > MAX_FILE_BYTES)
    return { ok: false, status: 413, error: "Files can be up to 10 MB." };
  const name = upload.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200) || "file";
  const row = {
    id: crypto.randomUUID(),
    userId,
    projectId,
    name,
    contentType: upload.type || "application/octet-stream",
    size: upload.size,
    createdAt: Date.now(),
  };
  await env.files.put(fileKey(userId, row.id), upload.stream(), {
    httpMetadata: { contentType: row.contentType },
  });
  await db.insert(files).values(row);
  return { ok: true, file: row };
}

export async function readFile(userId: string, id: string) {
  const file = await getFile(userId, id);
  if (!file) return null;
  const object = await env.files.get(fileKey(userId, id));
  if (!object) return null;
  return { file, body: object.body };
}

export async function deleteFile(userId: string, id: string): Promise<boolean> {
  const file = await getFile(userId, id);
  if (!file) return false;
  await env.files.delete(fileKey(userId, id));
  await db.delete(files).where(and(eq(files.id, id), eq(files.userId, userId)));
  return true;
}

export function isTextFile(name: string): boolean {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.includes(extension);
}

/** The project's small text files, as context for its replies. */
export async function projectFileContext(
  userId: string,
  projectId: string,
): Promise<string> {
  const list = await listFiles(userId, projectId);
  const parts: string[] = [];
  let total = 0;
  for (const file of list) {
    if (!isTextFile(file.name) || file.size > CONTEXT_FILE_BYTES) continue;
    const object = await env.files.get(fileKey(userId, file.id));
    if (!object) continue;
    const text = (await object.text()).slice(0, CONTEXT_TOTAL_CHARS - total);
    if (!text) break;
    total += text.length;
    parts.push(`--- ${file.name} ---\n${text}`);
  }
  return parts.join("\n\n");
}
