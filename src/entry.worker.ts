import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { runDueTasks, runHandoffStep } from "@/server/runner";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401).
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request));

export default {
  fetch: app.fetch,
  // The minute cron runs the scheduled tasks that are due.
  async scheduled(controller: ScheduledController) {
    await runDueTasks(controller.scheduledTime);
  },
  // Each message is one step of a web handoff.
  async queue(batch: MessageBatch<{ handoffId: string }>) {
    for (const message of batch.messages) {
      try {
        await runHandoffStep(message.body.handoffId);
        message.ack();
      } catch (error) {
        console.error(error);
        message.retry();
      }
    }
  },
};
