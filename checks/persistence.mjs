import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway } from "./fake-gateway.mjs";

const T = { timeout: 15000 };
const runtime = await startRuntime(fakeGateway);
try {
  let page = await (await runtime.context("owner")).newPage();
  await page.goto("/chat");
  await page.getByTestId("composer-input").fill("I prefer window seats on trains.");
  await page.getByTestId("composer-send").click();
  await expect(page.locator('[data-testid="message"][data-role="assistant"]').last()).toContainText("Sure.", T);
  await expect(page.getByTestId("thread")).toHaveAttribute("data-busy", "false", { timeout: 20000 });

  await page.goto("/memory");
  await page.getByTestId("memory-new").fill("Allergic to peanuts");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("memory-item").filter({ hasText: "Allergic to peanuts" })).toBeVisible(T);

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Garden plan");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Garden plan" })).toBeVisible(T);
  const projectPath = new URL(page.url()).pathname;
  await page.getByTestId("file-input").setInputFiles({ name: "plants.csv", mimeType: "text/csv", buffer: Buffer.from("plant,month\ntomato,May\n") });
  await expect(page.getByTestId("file-row").filter({ hasText: "plants.csv" })).toBeVisible(T);
  const href = await page.getByTestId("file-row").getByRole("link", { name: "plants.csv" }).getAttribute("href");

  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("task-instruction").fill("Water the tomatoes");
  await page.getByRole("button", { name: "Daily" }).click();
  await page.getByTestId("task-time").fill("07:30");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByTestId("task-row").filter({ hasText: "Water the tomatoes" })).toBeVisible(T);

  await runtime.restart();

  page = await (await runtime.context("owner")).newPage();
  await page.goto("/chat");
  await expect(page.locator('[data-testid="message"][data-role="user"]').first()).toContainText("window seats", T);
  await page.goto("/memory");
  await expect(page.getByTestId("memory-item").filter({ hasText: "Allergic to peanuts" })).toBeVisible(T);
  await expect(page.getByTestId("memory-item").filter({ hasText: "Prefers window seats on trains" })).toBeVisible();
  await page.goto(projectPath);
  await expect(page.getByRole("heading", { name: "Garden plan" })).toBeVisible(T);
  const file = await runtime.fetch(href, { role: "owner" });
  expect(file.status).toBe(200);
  expect(await file.text()).toContain("tomato,May");
  await page.goto("/tasks");
  await expect(page.getByTestId("task-row").filter({ hasText: "Water the tomatoes" })).toContainText("Daily at 07:30", T);
} finally {
  await runtime.close();
}
console.log("persistence ok");
