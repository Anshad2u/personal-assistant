/** Reading web pages for a handoff: fetch over HTTP and keep a text snapshot. */

const MAX_BYTES = 1_000_000;
const SNAPSHOT_CHARS = 6000;

export function safeWebUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

const decode = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Title, readable text, links and forms of an HTML page, as plain text. */
export function snapshotOf(html: string, base: URL): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const body = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const links: string[] = [];
  for (const match of body.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (links.length >= 30) break;
    const text = decode(match[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    try {
      links.push(`${text || "(link)"} -> ${new URL(match[1]!, base).toString()}`);
    } catch {
      // Not a URL.
    }
  }
  const forms: string[] = [];
  for (const match of body.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    if (forms.length >= 5) break;
    const action = /action=["']([^"']*)["']/i.exec(match[1]!)?.[1] ?? "";
    const method = /method=["']([^"']*)["']/i.exec(match[1]!)?.[1] ?? "get";
    const names = [...match[2]!.matchAll(/<(?:input|select|textarea)\b[^>]*name=["']([^"']+)["']/gi)].map((m) => m[1]);
    let target = base.toString();
    try {
      target = new URL(action || base.toString(), base).toString();
    } catch {
      // Keep the page itself.
    }
    forms.push(`${method.toUpperCase()} ${target} fields: ${names.join(", ")}`);
  }
  const text = decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return [
    `Title: ${decode(title)}`,
    `Text: ${text.slice(0, SNAPSHOT_CHARS)}`,
    links.length ? `Links:\n${links.join("\n")}` : "",
    forms.length ? `Forms:\n${forms.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type PageResult = { ok: true; url: string; snapshot: string } | { ok: false; error: string };

export async function openPage(
  url: URL,
  init: { method?: string; fields?: Record<string, string> } = {},
): Promise<PageResult> {
  const method = (init.method ?? "GET").toUpperCase() === "GET" ? "GET" : "POST";
  const target = new URL(url);
  let body: URLSearchParams | undefined;
  if (init.fields) {
    if (method === "GET") for (const [k, v] of Object.entries(init.fields)) target.searchParams.set(k, v);
    else body = new URLSearchParams(init.fields);
  }
  try {
    const response = await fetch(target, {
      method,
      body,
      redirect: "follow",
      headers: { accept: "text/html,text/plain;q=0.9,*/*;q=0.5", "user-agent": "Mozilla/5.0 (compatible; web-handoff)" },
      signal: AbortSignal.timeout(15000),
    });
    const reader = response.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (received > MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    const text = new TextDecoder().decode(
      chunks.reduce((all, c) => {
        const next = new Uint8Array(all.length + c.length);
        next.set(all);
        next.set(c, all.length);
        return next;
      }, new Uint8Array()),
    );
    const finalUrl = new URL(response.url || target.toString());
    const type = response.headers.get("content-type") ?? "";
    const snapshot = /html/i.test(type) ? snapshotOf(text, finalUrl) : `Text: ${text.slice(0, SNAPSHOT_CHARS)}`;
    if (!response.ok) return { ok: false, error: `The site answered ${response.status}.` };
    return { ok: true, url: finalUrl.toString(), snapshot };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `Couldn't load the page: ${error.message}` : "Couldn't load the page." };
  }
}
