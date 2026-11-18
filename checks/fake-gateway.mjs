// A local stand-in for the Gateway's default AI route, so suites can drive
// replies, memory extraction, action cards, scheduled runs and handoff steps
// deterministically. It answers OpenAI-style chat completions only; every
// other Gateway call is refused the way an unconfigured Gateway refuses.
const SCRIPT = `
const failedOnce = new Set();
const calls = [];
function sse(text) {
  const enc = new TextEncoder();
  const parts = text.match(/.{1,12}/gs) ?? [""];
  return new Response(new ReadableStream({ start(c) {
    for (const p of parts) c.enqueue(enc.encode("data: " + JSON.stringify({ choices: [{ delta: { content: p } }] }) + "\\n\\n"));
    c.enqueue(enc.encode("data: [DONE]\\n\\n")); c.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}
const json = (content) => Response.json({ choices: [{ message: { role: "assistant", content } }] });
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__calls") return Response.json(calls);
  if (!url.pathname.endsWith("/chat/completions")) {
    return Response.json({ code: "integration_not_configured" }, { status: 503, headers: { "x-everyapp-error": "integration_not_configured" } });
  }
  const body = await request.json();
  const system = body.messages.filter(m => m.role === "system").map(m => m.content).join("\\n");
  const users = body.messages.filter(m => m.role === "user");
  const last = String(users.at(-1)?.content ?? "");
  const job = /Job: ([a-z-]+)/.exec(system)?.[1] ?? "reply";
  calls.push({ job, background: request.headers.get("x-everyapp-background") });
  if (job === "reply") {
    if (/please fail once/i.test(last) && !failedOnce.has(last)) { failedOnce.add(last); return new Response("upstream error", { status: 500 }); }
    let text = "**Sure.** " + last.replace(/[.?!]$/, "") + ".";
    const mem = /Prefers oat milk[^\\n]*/.exec(system);
    if (mem && /drink/i.test(last)) text = "You prefer **oat milk** in your coffee.";
    if (/Budget 2027: 4,200/.test(system) && /budget/i.test(last)) text = "Your files say the budget is **4,200**.";
    return body.stream ? sse(text) : json(text);
  }
  if (job === "extract") {
    const out = { memories: [], forget: [], task: null, handoff: null };
    const pref = /I prefer ([^.]+)/i.exec(last);
    if (pref) out.memories.push("Prefers " + pref[1].trim());
    const forget = /forget (?:that I like |about )?([a-z ]+)/i.exec(last);
    if (forget) {
      const word = forget[1].trim().toLowerCase();
      for (const m of system.matchAll(/\\[(m_[^\\]]+)\\] ([^\\n]+)/g)) if (m[2].toLowerCase().includes(word)) out.forget.push(m[1]);
    }
    const daily = /every day at (\\d\\d:\\d\\d),? (.+)/i.exec(last);
    if (daily) out.task = { instruction: daily[2].replace(/[.]$/, ""), schedule: "daily", time: daily[1], timeZone: "Europe/Lisbon" };
    const look = /look up (.+) on the web/i.exec(last);
    if (look) out.handoff = { goal: "Find " + look[1] };
    return json(JSON.stringify(out));
  }
  if (job === "cards") {
    return json(JSON.stringify({ cards: [
      { title: "Plan the tile order", reason: "The renovation budget is set and tiles take weeks to arrive.", actionLabel: "Draft order", instruction: "Draft a tile order for the kitchen renovation.", priority: 2 },
      { title: "Book a dentist check-up", reason: "You mentioned it is overdue.", actionLabel: "Find times", instruction: "Suggest three times next week for a dentist check-up.", priority: 3 },
      { title: "Try a new coffee", reason: "You like oat milk.", actionLabel: "Suggest one", instruction: "Suggest an oat milk coffee recipe.", priority: 1 },
    ] }));
  }
  if (job === "task-run") return json("Weekly summary: three meetings, one deadline on Friday.");
  if (job === "handoff-step") {
    const n = Number(/Steps so far: (\\d+)/.exec(system + "\\n" + last)?.[1] ?? 0);
    if (n === 0) return json(JSON.stringify({ action: "visit", url: "https://example.com/", note: "Open the library site." }));
    if (n === 1) return json(JSON.stringify({ action: "submit", url: "https://example.com/search", method: "POST", fields: { q: "opening hours" }, note: "Search the catalogue for opening hours." }));
    return json(JSON.stringify({ action: "finish", summary: "The library opens at 09:00 and closes at 18:00 on weekdays." }));
  }
  return json("{}");
} };`;

export const fakeGateway = {
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-ai-gateway" } },
  workers: [{ config: { name: "fake-ai-gateway", compatibilityDate: "2025-09-01",
    manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: SCRIPT } } } } }],
};
