import Anthropic from "@anthropic-ai/sdk";
import { env, optEnv } from "./config";

let client: Anthropic | null = null;
function anthropic() {
  const workspace = optEnv("ANTHROPIC_WORKSPACE_ID");
  client ??= new Anthropic({
    apiKey: env("ANTHROPIC_API_KEY"),
    // Needed only for API keys that aren't scoped to a workspace
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
  });
  return client;
}

export const MODEL = () => optEnv("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";

/**
 * Ask Claude for structured output. A forced tool call guarantees the response
 * comes back as JSON that matches `schema`.
 */
export async function structured<T>(opts: {
  system: string;
  prompt: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const msg = await anthropic().messages.create({
    model: MODEL(),
    max_tokens: opts.maxTokens ?? 2500,
    system: opts.system,
    tools: [{ name: opts.name, description: opts.description, input_schema: { type: "object", ...opts.schema } as any }],
    tool_choice: { type: "tool", name: opts.name },
    messages: [{ role: "user", content: opts.prompt }],
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("AI returned no structured output");
  return block.input as T;
}

// small schema helpers
export const str = (description: string) => ({ type: "string", description });
export const num = (description: string) => ({ type: "number", description });
export const strArr = (description: string) => ({ type: "array", items: { type: "string" }, description });
export const oneOf = (values: string[], description: string) => ({ type: "string", enum: values, description });
