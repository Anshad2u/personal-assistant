import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists, never the file.
export default defineEveryApp({
  id: "personal-assistant",
  name: "Personal Assistant",
  description:
    "A private AI assistant that remembers you, keeps project threads with files, runs scheduled tasks, suggests next steps and browses the web with your approval.",
  icon: "/icon.svg",
  // Every member gets their own assistant; nobody sees anyone else's.
  access: "everyone",
  resources: {
    d1: ["DB"],
    // Project files.
    r2: ["files"],
    // One message per web handoff step (src/entry.worker.ts).
    queues: [{ name: "jobs", consumer: { maxBatchSize: 1, maxRetries: 2 } }],
  },
  ai: {
    chat: {
      why: "Writes replies, learns memories, suggests actions, runs scheduled tasks and steers web handoffs.",
    },
  },
});
