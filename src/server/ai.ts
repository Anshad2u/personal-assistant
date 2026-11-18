import { env } from "cloudflare:workers";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
  refusalFromError,
  type GatewayCallFor,
} from "@every-app/sdk/server";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** A model call that didn't answer. `setup` is set when no provider is configured. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly setup: string | null,
  ) {
    super(message);
  }
}

function setupFrom(code: string, setup: string | null): string | null {
  if (!code.endsWith("_not_configured")) return null;
  return setup ?? "An admin needs to set up an AI provider in the Gateway.";
}

/**
 * One chat completion through the Gateway's default model. `background`
 * names the organization for work no request started (crons, queues).
 */
export async function callModel(
  messages: ChatMessage[],
  options: { stream?: boolean; background?: string } = {},
): Promise<Response> {
  const target: GatewayCallFor | undefined = options.background
    ? { background: true, organizationId: options.background }
    : undefined;
  let response: Response;
  try {
    const gatewayFetch = createGatewayFetch({ env, for: target });
    response = await gatewayFetch(`${aiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "default",
        messages,
        stream: options.stream ?? false,
      }),
    });
  } catch (error) {
    const refusal = refusalFromError(error);
    if (refusal) {
      throw new ModelError(
        refusal.message,
        setupFrom(refusal.code, refusal.setup),
      );
    }
    throw new ModelError(
      error instanceof Error ? error.message : "The model call failed.",
      null,
    );
  }
  if (!response.ok) {
    const refusal = await gatewayRefusal(response.clone());
    if (refusal) {
      throw new ModelError(
        refusal.message,
        setupFrom(refusal.code, refusal.setup),
      );
    }
    throw new ModelError(`The model answered ${response.status}.`, null);
  }
  return response;
}

/** The text of a non-streamed completion. */
export async function complete(
  messages: ChatMessage[],
  options: { background?: string } = {},
): Promise<string> {
  const response = await callModel(messages, options);
  const body: { choices?: { message?: { content?: string } }[] } =
    await response.json();
  return body.choices?.[0]?.message?.content ?? "";
}

/** The first JSON object in a model's answer, or null. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The text deltas of a streamed (SSE) completion. */
export async function* streamDeltas(
  response: Response,
): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const chunk: { choices?: { delta?: { content?: string } }[] } =
          JSON.parse(data);
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // A keep-alive line.
      }
    }
  }
}
