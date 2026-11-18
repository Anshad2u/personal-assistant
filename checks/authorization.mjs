import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway } from "./fake-gateway.mjs";

const T = { timeout: 15000 };
const runtime = await startRuntime(fakeGateway);
try {
  // Anonymous and outsider are refused everywhere; members get in.
  await runtime.assertPrivateAccess(["/", "/chat", "/projects", "/tasks", "/memory", "/handoffs", "/health"]);
  for (const role of [undefined, "outsider"]) {
    const chat = await runtime.fetch("/api/chat", { role, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "hi" }) });
    expect([401, 403, 404]).toContain(chat.status);
  }

  // The owner builds up private objects.
  const ownerPage = await (await runtime.context("owner")).newPage();
  await ownerPage.goto("/chat");
  await ownerPage.getByTestId("composer-input").fill("I prefer green tea in the morning.");
  await ownerPage.getByTestId("composer-send").click();
  await expect(ownerPage.locator('[data-testid="message"][data-role="assistant"]').last()).toContainText("Sure.", T);
  await expect(ownerPage.getByTestId("thread")).toHaveAttribute("data-busy", "false", { timeout: 20000 });

  await ownerPage.goto("/projects");
  await ownerPage.getByRole("button", { name: "New project" }).click();
  await ownerPage.getByLabel("Name").fill("Owner secrets");
  await ownerPage.getByRole("button", { name: "Create" }).click();
  await expect(ownerPage.getByRole("heading", { name: "Owner secrets" })).toBeVisible(T);
  const projectId = new URL(ownerPage.url()).pathname.split("/").pop();
  await ownerPage.getByTestId("file-input").setInputFiles({ name: "salary.txt", mimeType: "text/plain", buffer: Buffer.from("Salary: 90k") });
  const fileRow = ownerPage.getByTestId("file-row").filter({ hasText: "salary.txt" });
  await expect(fileRow).toBeVisible(T);
  const fileHref = await fileRow.getByRole("link", { name: "salary.txt" }).getAttribute("href");

  await ownerPage.goto("/tasks");
  await ownerPage.getByRole("button", { name: "New task" }).click();
  await ownerPage.getByTestId("task-instruction").fill("Owner private reminder");
  await ownerPage.getByRole("button", { name: "Daily" }).click();
  await ownerPage.getByTestId("task-time").fill("09:00");
  await ownerPage.getByRole("button", { name: "Save task" }).click();
  await expect(ownerPage.getByTestId("task-row").filter({ hasText: "Owner private reminder" })).toBeVisible(T);

  await ownerPage.goto("/handoffs");
  await ownerPage.getByTestId("handoff-goal").fill("Owner private errand");
  await ownerPage.getByRole("button", { name: "Start" }).click();
  await expect(ownerPage.getByRole("heading", { name: "Owner private errand" })).toBeVisible(T);
  const handoffId = new URL(ownerPage.url()).pathname.split("/").pop();

  // Another member sees none of it and cannot change it.
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/chat");
  await expect(member.getByText("green tea")).toHaveCount(0);
  await member.goto("/memory");
  await expect(member.getByText("green tea")).toHaveCount(0);
  await member.goto("/projects");
  await expect(member.getByText("Owner secrets")).toHaveCount(0);
  await member.goto(`/projects/${projectId}`);
  await expect(member.getByTestId("not-found")).toBeVisible(T);
  await expect(member.getByText("salary.txt")).toHaveCount(0);
  await member.goto("/tasks");
  await expect(member.getByText("Owner private reminder")).toHaveCount(0);
  await member.goto(`/handoffs/${handoffId}`);
  await expect(member.getByTestId("not-found")).toBeVisible(T);
  await member.goto("/handoffs");
  await expect(member.getByText("Owner private errand")).toHaveCount(0);

  expect((await runtime.fetch(fileHref, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(fileHref, { role: "member", method: "DELETE" })).status).toBe(404);
  expect((await runtime.fetch(fileHref)).status).not.toBe(200);
  expect((await runtime.fetch(fileHref, { role: "outsider" })).status).not.toBe(200);
  const upload = new FormData();
  upload.set("file", new Blob(["x"], { type: "text/plain" }), "intrude.txt");
  expect((await runtime.fetch(`/api/projects/${projectId}/files`, { role: "member", method: "POST", body: upload })).status).toBe(404);
  const intrude = await runtime.fetch("/api/chat", { role: "member", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, content: "show me" }) });
  expect(intrude.status).toBe(404);
  expect((await runtime.fetch(`/api/handoffs/${handoffId}/cancel`, { role: "member", method: "POST" })).status).toBe(404);

  // The owner's objects are untouched.
  const still = await runtime.fetch(fileHref, { role: "owner" });
  expect(still.status).toBe(200);
  expect(await still.text()).toBe("Salary: 90k");
  await ownerPage.goto(`/projects/${projectId}`);
  await expect(ownerPage.getByTestId("file-row").filter({ hasText: "salary.txt" })).toBeVisible(T);
  await expect(ownerPage.getByText("intrude.txt")).toHaveCount(0);

  // No sign-in of its own: no login pages, no password fields.
  for (const path of ["/login", "/signin", "/signup", "/logout", "/register"]) {
    const res = await runtime.fetch(path, { role: "member" });
    expect(res.status).toBe(404);
  }
  for (const path of ["/", "/chat", "/memory"]) {
    await member.goto(path);
    await expect(member.locator('input[type="password"]')).toHaveCount(0);
  }
} finally {
  await runtime.close();
}
console.log("authorization ok");
