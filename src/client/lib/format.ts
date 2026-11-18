export function formatDateTime(ms: number | null): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(ms);
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(ms);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "That didn't work.";
}
