import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway } from "./fake-gateway.mjs";

const T = { timeout: 15000 };

const ASSISTANT = '[data-testid="message"][data-role="assistant"]';
// Sends a message and waits until the turn (reply, memory and follow-ups) has finished.
async function send(page, text) {
  const before = await page.locator(ASSISTANT).count();
  await page.getByTestId("composer-input").fill(text);
  await page.getByTestId("composer-send").click();
  await expect(page.locator(ASSISTANT)).toHaveCount(before + 1, T);
  await expect(page.getByTestId("thread")).toHaveAttribute("data-busy", "false", { timeout: 20000 });
}
const lastAssistant = (page) => page.locator('[data-testid="message"][data-role="assistant"]').last();

// 1. With no AI provider set up, the composer shows a setup state and nothing breaks.
{
  const runtime = await startRuntime();
  try {
    const page = await (await runtime.context("member")).newPage();
    await page.goto("/chat");
    await page.getByTestId("composer-input").fill("Hello there");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("ai-setup")).toBeVisible(T);
    await page.goto("/handoffs");
    await page.getByTestId("handoff-goal").fill("Find a train time");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByTestId("ai-setup")).toBeVisible(T);
    await page.goto("/");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByTestId("ai-setup")).toBeVisible(T);
  } finally {
    await runtime.close();
  }
}

const runtime = await startRuntime(fakeGateway);
try {
  const owner = await runtime.context("owner");
  const page = await owner.newPage();

  // F001: main chat, streamed Markdown reply, stored in order.
  await page.goto("/chat");
  await runtime.assertBackLink(page);
  await send(page, "I prefer oat milk in my coffee.");
  await expect(lastAssistant(page)).toContainText("Sure.", T);
  await expect(lastAssistant(page).locator("strong")).toHaveText("Sure.");

  // F003: memory learned from the conversation, used in later replies.
  await page.goto("/memory");
  await expect(page.getByTestId("memory-item").filter({ hasText: "Prefers oat milk in my coffee" })).toBeVisible(T);
  await page.getByTestId("memory-new").fill("Lives in Lisbon");
  await page.getByRole("button", { name: "Add" }).click();
  const lisbon = page.getByTestId("memory-item").filter({ hasText: "Lives in Lisbon" });
  await expect(lisbon).toBeVisible(T);
  await lisbon.getByRole("button", { name: "Edit memory" }).click();
  await page.getByTestId("memory-edit-input").fill("Lives in Porto");
  await page.getByRole("button", { name: "Save" }).click();
  const porto = page.getByTestId("memory-item").filter({ hasText: "Lives in Porto" });
  await expect(porto).toBeVisible(T);
  await porto.getByRole("button", { name: "Delete memory" }).click();
  await expect(porto).toHaveCount(0, T);

  await page.goto("/chat");
  await expect(page.locator('[data-testid="message"][data-role="user"]').first()).toContainText("I prefer oat milk");
  await send(page, "What do I drink?");
  await expect(lastAssistant(page)).toContainText("You prefer oat milk", T);

  // Asking to forget removes the matching memory.
  await send(page, "Please forget oat milk.");
  await expect(lastAssistant(page)).toContainText("Sure.", T);
  await page.goto("/memory");
  await expect(page.getByText("Prefers oat milk in my coffee")).toHaveCount(0, T);

  // A failed reply is kept as an error the member can retry.
  await page.goto("/chat");
  await send(page, "Please fail once now.");
  await expect(page.getByTestId("retry-reply")).toBeVisible(T);
  await page.reload();
  await expect(page.getByTestId("retry-reply")).toBeVisible(T);
  await page.getByTestId("retry-reply").click();
  await expect(lastAssistant(page)).toContainText("Please fail once now", T);
  await expect(page.getByTestId("retry-reply")).toHaveCount(0);

  // Clearing the main thread.
  await page.getByRole("button", { name: "Clear chat" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByTestId("message")).toHaveCount(0, T);

  // F002: projects with files used as context.
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Kitchen renovation");
  await page.getByLabel("Description").fill("Cabinets, tiles and the budget");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Kitchen renovation" })).toBeVisible(T);
  const projectId = new URL(page.url()).pathname.split("/").pop();
  await page.getByTestId("file-input").setInputFiles({ name: "budget.md", mimeType: "text/markdown", buffer: Buffer.from("# Kitchen\n\nBudget 2027: 4,200 euros\n") });
  const fileRow = page.getByTestId("file-row").filter({ hasText: "budget.md" });
  await expect(fileRow).toBeVisible(T);
  await send(page, "What is the budget?");
  await expect(lastAssistant(page)).toContainText("budget is 4,200", T);
  const href = await fileRow.getByRole("link", { name: "budget.md" }).getAttribute("href");
  const download = await runtime.fetch(href, { role: "owner" });
  expect(download.status).toBe(200);
  expect(await download.text()).toContain("Budget 2027");
  // A project starts from a blank slate: the main thread's messages are not in it.
  await expect(page.getByTestId("message")).toHaveCount(2);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Kitchen remodel");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Kitchen remodel" })).toBeVisible(T);

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Spring trip");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Spring trip" })).toBeVisible(T);
  await page.getByRole("button", { name: "Delete project" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/, T);
  await expect(page.getByTestId("project-row")).toHaveCount(1, T);
  await expect(page.getByTestId("project-row").first()).toContainText("Kitchen remodel");

  // F004: scheduled tasks from the form and from chat, run by the cron.
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("task-instruction").fill("Summarize my week");
  await page.getByRole("button", { name: "Weekly" }).click();
  await page.getByRole("button", { name: "Fri" }).click();
  await page.getByTestId("task-time").fill("17:00");
  await page.getByTestId("task-timezone").fill("Europe/Lisbon");
  await page.getByRole("button", { name: "Save task" }).click();
  const weekly = page.getByTestId("task-row").filter({ hasText: "Summarize my week" });
  await expect(weekly).toContainText("Fridays at 17:00", T);
  await expect(weekly).toContainText("Active");
  await weekly.getByRole("button", { name: "Pause" }).click();
  await expect(weekly).toContainText("Paused", T);
  await weekly.getByRole("button", { name: "Resume" }).click();
  await expect(weekly).toContainText("Active", T);

  await page.goto("/chat");
  await send(page, "Every day at 08:00, send me a news digest.");
  await expect(lastAssistant(page)).toContainText("Sure.", T);
  await page.goto("/tasks");
  await expect(page.getByTestId("task-row").filter({ hasText: "send me a news digest" })).toContainText("Daily at 08:00", T);

  const db = await runtime.database();
  await db.prepare("UPDATE tasks SET next_run_at = ? WHERE instruction = ?").bind(Date.now() - 60000, "Summarize my week").run();
  await runtime.scheduled("* * * * *");
  await page.reload();
  await expect(weekly).toContainText("Succeeded", T);
  await expect(weekly).toContainText("Active");
  await page.goto("/chat");
  await expect(lastAssistant(page)).toContainText("Weekly summary: three meetings", T);

  // F005: action cards, ordered by priority; act and dismiss.
  await page.goto("/");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled(T);
  const cards = page.getByTestId("action-card");
  await expect(cards).toHaveCount(3, T);
  await expect(cards.nth(0)).toContainText("Book a dentist check-up");
  await expect(cards.nth(1)).toContainText("Plan the tile order");
  await cards.filter({ hasText: "Try a new coffee" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(cards).toHaveCount(2, T);
  await cards.filter({ hasText: "Book a dentist check-up" }).getByRole("button", { name: "Find times" }).click();
  await expect(page).toHaveURL(/\/chat/, T);
  await expect(page.locator('[data-testid="message"][data-role="user"]').last()).toContainText("Suggest three times next week", T);
  await expect(lastAssistant(page)).toContainText("Sure.", T);
  await expect(page.getByTestId("thread")).toHaveAttribute("data-busy", "false", { timeout: 20000 });
  await page.goto("/");
  await expect(page.getByTestId("action-card").filter({ hasText: "Book a dentist check-up" })).toHaveCount(0, T);

  // F006: web handoff with an approval stop.
  await page.goto("/handoffs");
  await page.getByTestId("handoff-goal").fill("Find the opening hours of the city library");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "Find the opening hours of the city library" })).toBeVisible(T);
  await expect(page.getByTestId("handoff-status")).toHaveText("Needs approval", { timeout: 30000 });
  await expect(page.getByTestId("handoff-step").first()).toContainText("https://example.com/");
  await expect(page.getByTestId("handoff-step").last()).toContainText("Search the catalogue");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("handoff-status")).toHaveText("Done", { timeout: 30000 });
  await expect(page.getByText("The library opens at 09:00")).toBeVisible();
  await page.goto("/chat");
  await expect(lastAssistant(page)).toContainText("The library opens at 09:00", T);

  // A handoff the assistant starts from chat, then cancelled.
  await send(page, "Please look up train times to Porto on the web.");
  await expect(lastAssistant(page)).toContainText("Sure.", T);
  await page.goto("/handoffs");
  const started = page.getByTestId("handoff-row").filter({ hasText: "Find train times to Porto" });
  await expect(started).toBeVisible(T);
  await started.getByRole("link").first().click();
  await expect(page.getByTestId("handoff-status")).toHaveText(/Queued|Running|Needs approval/, T);
  await page.getByRole("button", { name: "Cancel handoff" }).click();
  await expect(page.getByTestId("handoff-status")).toHaveText("Cancelled", T);

  // Health route answers for members.
  const health = await runtime.fetch("/health", { role: "member" });
  expect(health.status).toBe(200);

  // The public picture: a project conversation with its files.
  await page.goto(`/projects/${projectId}`);
  await send(page, "What is the budget?");
  await expect(lastAssistant(page)).toContainText("budget is 4,200", T);
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/chat");
  await expect(phone.getByTestId("composer-input")).toBeVisible();
  await expect(phone.getByRole("link", { name: "Projects" })).toBeVisible();
  await send(phone, "Hello from my phone");
  await expect(phone.locator('[data-testid="message"][data-role="assistant"]').last()).toContainText("Hello from my phone", T);
} finally {
  await runtime.close();
}
console.log("behavior ok");
